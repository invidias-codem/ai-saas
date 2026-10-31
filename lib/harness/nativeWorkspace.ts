import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';

const grantIdSchema = z.string().regex(/^local-grant-[a-f0-9]{32}$/);
const grantSchema = z.object({
  grant_id: grantIdSchema,
  display_path: z.string().min(1).max(32768),
  read_only: z.boolean(),
}).strict();
const readInputSchema = z.object({
  grant_id: grantIdSchema,
  relative_path: z.string().min(1).max(4096),
}).strict();
const kindSchema = z.enum(['file', 'directory', 'symlink', 'other']);
const byteLength = (text: string) => new TextEncoder().encode(text).byteLength;
const textSchema = z.object({
  content: z.string(), byte_count: z.number().int().min(0).max(256 * 1024),
}).strict().refine(({ content, byte_count }) => byteLength(content) === byte_count && !content.includes('\0'));
const listSchema = z.object({
  entries: z.array(z.object({ name: z.string(), kind: kindSchema }).strict()).max(10000),
}).strict().refine(list => byteLength(JSON.stringify(list)) <= 1024 * 1024);
const statSchema = z.object({ kind: kindSchema, size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const proposalIdSchema = z.string().regex(/^local-proposal-[a-f0-9]{32}$/);
const proposalReferenceSchema = z.object({ proposal_id: proposalIdSchema }).strict();
const proposalPath = z.string().min(1).max(4096).refine(path => path !== '.');
const commandScriptSchema = z.string().refine(script => byteLength(script) <= 64 * 1024 && script.trim().length > 0 && !script.includes('\0'));
const commandSchema = z.discriminatedUnion('shell', [
  z.object({ shell: z.literal('direct'), executable: z.string().min(1).max(255).regex(/^[A-Za-z0-9_.-]+$/).refine(name => name !== '.' && name !== '..'), argv: z.array(z.string().refine(arg => !arg.includes('\0'))).max(256) }).strict(),
  z.object({ shell: z.literal('cmd'), script: commandScriptSchema }).strict(),
  z.object({ shell: z.literal('powershell'), script: commandScriptSchema }).strict(),
  z.object({ shell: z.literal('pwsh'), script: commandScriptSchema }).strict(),
  z.object({ shell: z.literal('sh'), script: commandScriptSchema }).strict(),
]).refine(command => command.shell !== 'direct' || byteLength(command.executable) + command.argv.reduce((total, arg) => total + byteLength(arg) + 1, 0) <= 64 * 1024);
const proposalInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('execute_command'), grant_id: grantIdSchema, relative_path: z.string().min(1).max(4096), command: commandSchema, timeout_seconds: z.number().int().min(0).max(4294967295).optional() }).strict(),
  z.object({
    kind: z.literal('create_file'), grant_id: grantIdSchema, relative_path: proposalPath,
    content: z.string().refine(content => byteLength(content) <= 256 * 1024 && !content.includes('\0')),
  }).strict(),
  z.object({
    kind: z.literal('write_text'), grant_id: grantIdSchema, relative_path: proposalPath,
    content: z.string().refine(content => byteLength(content) <= 256 * 1024 && !content.includes('\0')),
  }).strict(),
  z.object({
    kind: z.literal('create_directory'), grant_id: grantIdSchema, relative_path: proposalPath,
  }).strict(),
]);
const proposalSummarySchema = z.object({
  proposal_id: proposalIdSchema, digest: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pending', 'reviewing', 'accepted', 'denied', 'expired', 'stale', 'consumed']),
  kind: z.enum(['create_file', 'create_directory', 'write_text', 'execute_command']), grant_id: grantIdSchema,
  relative_path: z.string().min(1).max(4096), execution_available: z.literal(false),
}).strict().refine(value => value.kind === 'execute_command' || value.relative_path !== '.');
export type NativeProposalInput = z.infer<typeof proposalInputSchema>;

const errorCodes = [
  'LOCAL_WORKSPACE_BLOCKED', 'LOCAL_SELECTION_INVALID', 'LOCAL_PATH_INVALID',
  'LOCAL_GRANT_DENIED', 'LOCAL_FILE_NOT_FOUND', 'LOCAL_FILE_TOO_LARGE',
  'LOCAL_DIRECTORY_TOO_LARGE', 'LOCAL_TEXT_UNSUPPORTED', 'LOCAL_READ_FAILED',
  'LOCAL_SERVICE_BUSY', 'LOCAL_SERVICE_STOPPED', 'LOCAL_SERVICE_EXITED',
  'LOCAL_SERVICE_UNAVAILABLE', 'LOCAL_REQUEST_TIMEOUT', 'LOCAL_CLEANUP_UNCONFIRMED',
  'LOCAL_STATE_UNAVAILABLE', 'LOCAL_STORAGE_UNAVAILABLE', 'LOCAL_PROTOCOL_INCOMPATIBLE',
  'LOCAL_SANDBOX_REQUIRED', 'LOCAL_COMMAND_INVALID', 'LOCAL_SHELL_UNAVAILABLE',
  'LOCAL_DESKTOP_REQUIRED', 'LOCAL_FILE_CONFLICT', 'LOCAL_OPERATION_UNAVAILABLE',
  'LOCAL_OPERATION_REPLAYED', 'LOCAL_OUTCOME_UNKNOWN',
  'LOCAL_PROPOSAL_INVALID', 'LOCAL_PROPOSAL_TOO_LARGE', 'LOCAL_PROPOSAL_CAPACITY',
  'LOCAL_PROPOSAL_UNAVAILABLE', 'LOCAL_REVIEW_DENIED', 'LOCAL_WRITE_GRANT_REQUIRED',
] as const;
const rejectionSchema = z.object({ code: z.enum(errorCodes), message: z.string() }).strict();

// Preserve a machine-readable static code without retaining native diagnostics,
// rejected payloads, paths or file bodies in an Error/cause/logging object.
const workspaceError = (code: string, message: string) => Object.assign(new Error(message), { code });
type NativeInvoke = (command: string, args: { input: unknown }) => Promise<unknown>;
export type NativeReadInput = z.infer<typeof readInputSchema>;
export type NativeGrant = z.infer<typeof grantSchema>;

/** A closed local client: no generic RPC, identity, grant setter or cloud fallback. */
export function createNativeWorkspaceClient(invokeNative: NativeInvoke) {
  const request = async <Input, Output>(command: string, inputSchema: z.ZodType<Input>, outputSchema: z.ZodType<Output>, input: Input): Promise<Output> => {
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success) throw workspaceError('LOCAL_INPUT_INVALID', 'The workspace request is invalid.');
    let raw: unknown;
    try {
      raw = await invokeNative(command, { input: parsedInput.data });
    } catch (error) {
      const rejection = rejectionSchema.safeParse(error);
      const code = rejection.success ? rejection.data.code : 'LOCAL_SERVICE_UNAVAILABLE';
      const messages: Record<string, string> = {
        LOCAL_WORKSPACE_BLOCKED: 'Folder permissions could not be confirmed. Restart the local service.',
        LOCAL_DESKTOP_REQUIRED: 'Open the desktop app to access a local workspace.',
        LOCAL_PATH_INVALID: 'Use a relative path within the selected folder.',
        LOCAL_GRANT_DENIED: 'This folder is not currently permitted. Select and confirm it again.',
        LOCAL_FILE_NOT_FOUND: 'The selected path no longer exists.',
        LOCAL_FILE_TOO_LARGE: 'Text previews are limited to 256 KiB.',
        LOCAL_DIRECTORY_TOO_LARGE: 'This directory exceeds the entry or preview size limit.',
        LOCAL_TEXT_UNSUPPORTED: 'Only UTF-8 text without NUL bytes can be previewed.',
        LOCAL_REVIEW_DENIED: 'The review was denied, expired or is no longer current.',
        LOCAL_PROPOSAL_CAPACITY: 'The native proposal or attempt limit has been reached.',
        LOCAL_WRITE_GRANT_REQUIRED: 'A separately authorized writable grant is required. Folder access remains read only.',
      };
      const message = messages[code] ?? 'The local workspace request could not complete.';
      throw workspaceError(code, message);
    }
    const result = outputSchema.safeParse(raw);
    if (!result.success) throw workspaceError('LOCAL_RESPONSE_INVALID', 'The local service returned an invalid workspace response.');
    return result.data;
  };
  const empty = z.object({}).strict();
  return {
    proposeOperation: (input: NativeProposalInput) => request('native_propose_operation', proposalInputSchema, proposalSummarySchema, input),
    proposalStatus: (proposalId: string) => request('native_proposal_status', proposalReferenceSchema, proposalSummarySchema, { proposal_id: proposalId }),
    openReview: async (proposalId: string) => {
      await request('native_open_review', proposalReferenceSchema, z.null(), { proposal_id: proposalId });
    },
    cancelProposal: async (proposalId: string) => {
      await request('native_cancel_proposal', proposalReferenceSchema, z.null(), { proposal_id: proposalId });
    },
    selectFolder: () => request('native_select_folder', empty, grantSchema.nullable(), {}),
    grants: () => request('native_workspace_grants', empty, z.array(grantSchema).max(32), {}),
    readText: (input: NativeReadInput) => request('native_read_text', readInputSchema, textSchema, input),
    list: (input: NativeReadInput) => request('native_list', readInputSchema, listSchema, input),
    stat: (input: NativeReadInput) => request('native_stat', readInputSchema, statSchema, input),
    revoke: async (grantId: string) => {
      await request('native_revoke_grant', z.object({ grant_id: grantIdSchema }).strict(), z.null(), { grant_id: grantId });
    },
  };
}

export const nativeWorkspace = createNativeWorkspaceClient(async (command, args) => {
  if (!isTauri()) throw workspaceError('LOCAL_DESKTOP_REQUIRED', 'Open the desktop app to access a local workspace.');
  return invoke(command, args);
});
