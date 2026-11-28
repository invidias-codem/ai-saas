# Lattice OS CLI

**0.3.1-rc.1 — release candidate; stable distribution is not yet approved.**

The CLI manages Lattice OS Docker appliance deployments on your existing operating system. The downloads page is `/downloads` in the Lattice OS app. It lists artifacts only after build provenance and release evidence have been reviewed.

## Install

Choose the executable for your OS and processor. Download `SHA256SUMS` and compare the artifact checksum. Verify GitHub build provenance against the full source commit shown on the downloads page before executing anything:

```sh
gh attestation verify lattice-linux-amd64 --repo invidias-codem/ai-saas --signer-workflow invidias-codem/ai-saas/.github/workflows/build-lattice-cli.yml --source-ref refs/heads/main --source-digest <40-character-source-commit>
```

Alternatively, download and inspect the versioned `install.sh` or `install.ps1` release asset, verify its checksum and provenance, and execute it with an explicit version and source commit:

```sh
bash install.sh cli-v0.3.1-rc.1 <40-character-source-commit>
```

```powershell
.\install.ps1 -Version cli-v0.3.1-rc.1 -SourceCommit <40-character-source-commit>
```

Installers require the GitHub CLI and install to a user-owned directory without requesting administrator privileges. Add that directory to PATH if needed. No source fallback is performed. Until a candidate is built and published, these assets are unavailable.

## Check the installation

```sh
lattice --version
lattice doctor --offline --json
lattice doctor
```

Native binaries bundle Python and cryptography. Docker Engine with Compose v2 (or Docker Desktop with Linux containers) is needed for deployment commands. Offline doctor verifies the CLI runtime; it does not certify appliance deployment.

## Commands

Run `lattice <group> --help` and `lattice <group> <command> --help` for arguments.

| Group | Commands |
| --- | --- |
| auth | login, logout, status; legacy token generation is not a secure entitlement authority |
| deploy | init, start, stop, restart, status, shell |
| license | activate, deactivate, show |
| health | check, logs |
| upgrade | upgrade, rollback |
| backup | create, restore, list |
| org | status, members; remote authentication wiring remains a stable-release blocker |
| task | run; requires a local API/partner credential |
| doctor | --offline, --json |

This candidate is for disposable development evaluation. Known license, organization authentication, credential handling, and backup findings are tracked in [release readiness](../../docs/releases/cli-release-readiness.md). Do not rely on it for production recovery or commercial entitlement enforcement.

## Build and test from source

Use Python 3.12 in a virtual environment:

```sh
python -m pip install --require-hashes -r scripts/lattice-cli/requirements-build.lock
python -m unittest discover -s scripts/lattice-cli/tests -v
python scripts/lattice-cli/build.py --pyinstaller
python scripts/lattice-cli/smoke_binary.py dist/cli/lattice-linux-amd64
```

Build natively on each OS/architecture. The GitHub Actions matrix handles five targets and stages a draft prerelease only. PyInstaller bundles Python bytecode; it is not an IP secrecy boundary. Source installs need Python 3.11+ and the dependency in requirements.txt.
