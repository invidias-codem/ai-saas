import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';

const grantIdSchema = z.string().regex(/^local-grant-[a-f0-9]{32}$/);
const grantSchema = z.object({
  grant_id: grantIdSchema,
  display_path: z.string().min(1).max(32768),
  read_only: z.literal(true),
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

const errorCodes = [
  'LOCAL_WORKSPACE_BLOCKED', 'LOCAL_SELECTION_INVALID', 'LOCAL_PATH_INVALID',
  'LOCAL_GRANT_DENIED', 'LOCAL_FILE_NOT_FOUND', 'LOCAL_FILE_TOO_LARGE',
  'LOCAL_DIRECTORY_TOO_LARGE', 'LOCAL_TEXT_UNSUPPORTED', 'LOCAL_READ_FAILED',
  'LOCAL_SERVICE_BUSY', 'LOCAL_SERVICE_STOPPED', 'LOCAL_SERVICE_EXITED',
  'LOCAL_SERVICE_UNAVAILABLE', 'LOCAL_REQUEST_TIMEOUT', 'LOCAL_CLEANUP_UNCONFIRMED',
  'LOCAL_STATE_UNAVAILABLE', 'LOCAL_STORAGE_UNAVAILABLE', 'LOCAL_PROTOCOL_INCOMPATIBLE',
  'LOCAL_DESKTOP_REQUIRED',
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
