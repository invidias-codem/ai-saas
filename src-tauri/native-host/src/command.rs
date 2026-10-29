//! Exact command descriptions. Production has no qualified sandbox provider;
//! these types cannot accept environment, approval or isolation claims.
use crate::{
    mutation::ObjectIdentity,
    review::{field, ProposalInput, ReviewScope},
    HostError,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};

pub(crate) const MAX_COMMAND_BYTES: usize = 64 * 1024;
pub(crate) const MAX_OUTPUT_BYTES: usize = 10 * 1024;
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "shell", rename_all = "snake_case", deny_unknown_fields)]
pub enum CommandInput {
    Direct {
        executable: String,
        argv: Vec<String>,
    },
    Cmd {
        script: String,
    },
    Powershell {
        script: String,
    },
    Pwsh {
        script: String,
    },
    Sh {
        script: String,
    },
}
impl CommandInput {
    pub(crate) fn shell(&self) -> &'static str {
        match self {
            Self::Direct { .. } => "direct",
            Self::Cmd { .. } => "cmd",
            Self::Powershell { .. } => "powershell",
            Self::Pwsh { .. } => "pwsh",
            Self::Sh { .. } => "sh",
        }
    }
    pub(crate) fn script(&self) -> Option<&str> {
        match self {
            Self::Direct { .. } => None,
            Self::Cmd { script }
            | Self::Powershell { script }
            | Self::Pwsh { script }
            | Self::Sh { script } => Some(script),
        }
    }
    pub(crate) fn valid(&self) -> bool {
        match self {
            Self::Direct { executable, argv } => {
                !executable.is_empty()
                    && executable.len() <= 255
                    && !matches!(executable.as_str(), "." | "..")
                    && executable
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
                    && argv.len() <= 256
                    && argv.iter().all(|a| !a.contains('\0'))
                    && executable.len() + argv.iter().map(|a| a.len() + 1).sum::<usize>()
                        <= MAX_COMMAND_BYTES
            }
            _ => self.script().is_some_and(|s| {
                !s.trim().is_empty() && !s.contains('\0') && s.len() <= MAX_COMMAND_BYTES
            }),
        }
    }
    pub(crate) fn args(&self, platform: &str) -> Option<Vec<String>> {
        if !self.valid() || !matches!(platform, "windows" | "linux") {
            return None;
        }
        let args = match self {
            Self::Direct { argv, .. } => argv.clone(),
            Self::Sh { script } if platform == "linux" => vec!["-c".into(), script.clone()],
            Self::Cmd { script } if platform == "windows" => {
                vec!["/d".into(), "/s".into(), "/c".into(), script.clone()]
            }
            Self::Powershell { script } | Self::Pwsh { script } if platform == "windows" => {
                let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
                vec![
                    "-NoLogo".into(),
                    "-NoProfile".into(),
                    "-NonInteractive".into(),
                    "-EncodedCommand".into(),
                    STANDARD.encode(bytes),
                ]
            }
            _ => return None,
        };
        Some(args)
    }
    pub(crate) fn review_content(&self) -> Result<String, HostError> {
        match self {
            Self::Direct { argv, .. } => {
                serde_json::to_string(argv).map_err(|_| HostError::InvalidResponse)
            }
            _ => Ok(self.script().unwrap_or_default().into()),
        }
    }
}
pub(crate) fn timeout_ms(seconds: Option<u32>) -> u32 {
    match seconds {
        None | Some(0) => 30000,
        Some(s) => s.min(120) * 1000,
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ProviderBinding {
    pub(crate) id: String,
    pub(crate) revision: u64,
    pub(crate) qualification: String,
}
impl ProviderBinding {
    fn valid(&self) -> bool {
        if self.id == "unavailable" {
            return self.revision == 0 && self.qualification.is_empty();
        };
        !self.id.is_empty()
            && self.id.len() <= 64
            && self
                .id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            && self.revision > 0
            && crate::mutation::hex(&self.qualification, 64)
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ExecutableIdentity {
    pub(crate) path: String,
    pub(crate) identity: ObjectIdentity,
    pub(crate) content_sha3: String,
    pub(crate) byte_count: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct CommandPrecondition {
    pub(crate) platform: String,
    pub(crate) shell: String,
    pub(crate) cwd_identity: ObjectIdentity,
    pub(crate) executable: ExecutableIdentity,
    pub(crate) argv: Vec<String>,
    pub(crate) timeout_ms: u32,
    pub(crate) output_limit: u32,
    pub(crate) environment_policy: String,
    pub(crate) requirements: String,
    pub(crate) provider: ProviderBinding,
    pub(crate) requires_sandbox: bool,
}
impl CommandPrecondition {
    pub(crate) fn valid_for(&self, input: &ProposalInput) -> bool {
        let ProposalInput::ExecuteCommand {
            command,
            timeout_seconds,
            ..
        } = input
        else {
            return false;
        };
        self.shell == command.shell()
            && self.cwd_identity.valid()
            && self.executable.identity.valid()
            && !self.executable.path.is_empty()
            && self.executable.path.len() <= 32768
            && !self.executable.path.contains('\0')
            && crate::mutation::hex(&self.executable.content_sha3, 64)
            && (4..=64 * 1024 * 1024).contains(&self.executable.byte_count)
            && command.args(&self.platform).is_some_and(|a| a == self.argv)
            && self.timeout_ms == timeout_ms(*timeout_seconds)
            && self.output_limit == MAX_OUTPUT_BYTES as u32
            && self.environment_policy == "native-clean-v1"
            && self.requirements == "native-local-sandbox-v1"
            && self.requires_sandbox
            && self.provider.valid()
    }
}
pub(crate) fn canonical_command(
    id: &str,
    scope: &ReviewScope,
    input: &ProposalInput,
    pre: &CommandPrecondition,
) -> Vec<u8> {
    let mut bytes = b"LATTICE_NATIVE_PROPOSAL\0\x03".to_vec();
    for v in [
        id,
        &scope.authority.principal_id,
        &scope.authority.workspace_id,
        &scope.authority.generation,
    ] {
        field(&mut bytes, v)
    }
    bytes.extend_from_slice(&scope.authority.policy_revision.to_be_bytes());
    bytes.extend_from_slice(&scope.authority.grant_revision.to_be_bytes());
    field(&mut bytes, &scope.grant_id);
    field(&mut bytes, &scope.display_root);
    bytes.push(u8::from(scope.read_only));
    bytes.extend_from_slice(&300000u32.to_be_bytes());
    bytes.push(4);
    let ProposalInput::ExecuteCommand {
        relative_path,
        command,
        ..
    } = input
    else {
        return bytes;
    };
    field(&mut bytes, relative_path);
    field(&mut bytes, command.shell());
    match command {
        CommandInput::Direct { executable, argv } => {
            field(&mut bytes, executable);
            fields(&mut bytes, argv)
        }
        _ => field(&mut bytes, command.script().unwrap_or_default()),
    }
    for v in [
        &pre.platform,
        &pre.cwd_identity.volume,
        &pre.cwd_identity.file,
        &pre.executable.path,
        &pre.executable.identity.volume,
        &pre.executable.identity.file,
        &pre.executable.content_sha3,
    ] {
        field(&mut bytes, v)
    }
    bytes.extend_from_slice(&pre.executable.byte_count.to_be_bytes());
    fields(&mut bytes, &pre.argv);
    bytes.extend_from_slice(&pre.timeout_ms.to_be_bytes());
    bytes.extend_from_slice(&pre.output_limit.to_be_bytes());
    field(&mut bytes, &pre.environment_policy);
    field(&mut bytes, &pre.requirements);
    field(&mut bytes, &pre.provider.id);
    bytes.extend_from_slice(&pre.provider.revision.to_be_bytes());
    field(&mut bytes, &pre.provider.qualification);
    bytes.push(1);
    bytes
}
fn fields(bytes: &mut Vec<u8>, values: &[String]) {
    bytes.extend_from_slice(&(values.len() as u32).to_be_bytes());
    for v in values {
        field(bytes, v)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommandOutput {
    pub output: String,
    pub exit_code: i64,
    pub timed_out: bool,
    pub cancelled: bool,
    pub truncated: bool,
}
impl CommandOutput {
    pub(crate) fn valid(&self) -> bool {
        self.output.len() <= MAX_OUTPUT_BYTES && (-1..=u32::MAX as i64).contains(&self.exit_code)
    }
}
