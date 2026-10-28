import { createNativeWorkspaceClient, nativeWorkspace } from './nativeWorkspace';

const grantId = `local-grant-${'a'.repeat(32)}`;
const grant = { grant_id: grantId, display_path: '/selected/project', read_only: true };

describe('Native workspace client', () => {
  test('main can propose and request review, without supplying a decision or authority', async () => {
    const proposalId = `local-proposal-${'c'.repeat(32)}`;
    const proposal = {
      proposal_id: proposalId, digest: 'd'.repeat(64), status: 'pending', kind: 'create_file',
      grant_id: grantId, relative_path: 'draft.txt', execution_available: false,
    };
    const invoke = jest.fn().mockResolvedValueOnce(proposal).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(proposal).mockResolvedValueOnce(null);
    const client = createNativeWorkspaceClient(invoke);
    const input = { kind: 'create_file' as const, grant_id: grantId, relative_path: 'draft.txt', content: 'exact bytes\n资料' };
    expect(await client.proposeOperation(input)).toEqual(proposal);
    await client.openReview(proposalId);
    expect(await client.proposalStatus(proposalId)).toEqual(proposal);
    await client.cancelProposal(proposalId);
    expect(invoke.mock.calls).toEqual([
      ['native_propose_operation', { input }],
      ['native_open_review', { input: { proposal_id: proposalId } }],
      ['native_proposal_status', { input: { proposal_id: proposalId } }],
      ['native_cancel_proposal', { input: { proposal_id: proposalId } }],
    ]);
  });
  test('proposals reject caller approvals, unsupported execution and oversized content before IPC', async () => {
    const invoke = jest.fn();
    const client = createNativeWorkspaceClient(invoke);
    for (const input of [
      { kind: 'create_file', grant_id: grantId, relative_path: 'draft.txt', content: 'exact', approved: true },
      { kind: 'command', grant_id: grantId, command: 'whoami' },
      { kind: 'create_file', grant_id: grantId, relative_path: 'draft.txt', content: 'x'.repeat(256 * 1024 + 1) },
    ]) {
      await expect(client.proposeOperation(input as never)).rejects.toMatchObject({ code: 'LOCAL_INPUT_INVALID' });
    }
    expect(invoke).not.toHaveBeenCalled();
  });
  test('requires the desktop runtime without a network fallback', async () => {
    await expect(nativeWorkspace.grants()).rejects.toMatchObject({ code: 'LOCAL_DESKTOP_REQUIRED' });
  });
  test('calls only typed commands and preserves hostile file content as text', async () => {
    const content = '<img src=x onerror=alert(1)>\n资料';
    const invoke = jest.fn(async (command: string) => {
      switch (command) {
        case 'native_select_folder': return grant;
        case 'native_workspace_grants': return [grant];
        case 'native_read_text': return { content, byte_count: Buffer.byteLength(content) };
        case 'native_list': return { entries: [{ name: '<script>.md', kind: 'file' }] };
        case 'native_stat': return { kind: 'file', size: 12 };
        case 'native_revoke_grant': return null;
        default: throw new Error('Unexpected native command');
      }
    });
    const client = createNativeWorkspaceClient(invoke);
    expect(await client.selectFolder()).toEqual(grant);
    expect(await client.grants()).toEqual([grant]);
    const input = { grant_id: grantId, relative_path: 'note.md' };
    expect((await client.readText(input)).content).toBe(content);
    expect((await client.list(input)).entries[0].name).toBe('<script>.md');
    expect((await client.stat(input)).size).toBe(12);
    await client.revoke(grantId);
    expect(invoke.mock.calls).toEqual([
      ['native_select_folder', { input: {} }],
      ['native_workspace_grants', { input: {} }],
      ['native_read_text', { input }],
      ['native_list', { input }],
      ['native_stat', { input }],
      ['native_revoke_grant', { input: { grant_id: grantId } }],
    ]);
  });

  test('cancelled selection returns no grant and never falls back to cloud or raw paths', async () => {
    const invoke = jest.fn().mockResolvedValue(null);
    const client = createNativeWorkspaceClient(invoke);
    expect(await client.selectFolder()).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  test('rejects identity, grant and raw path injection before invocation', async () => {
    const invoke = jest.fn();
    const client = createNativeWorkspaceClient(invoke);
    await expect(client.readText({ grant_id: grantId, relative_path: 'note.md', user_id: 'employee' } as never)).rejects.toMatchObject({ code: 'LOCAL_INPUT_INVALID' });
    await expect(client.readText({ path: '/unselected', approved: true } as never)).rejects.toMatchObject({ code: 'LOCAL_INPUT_INVALID' });
    await expect(client.revoke('foreign')).rejects.toMatchObject({ code: 'LOCAL_INPUT_INVALID' });
    expect(invoke).not.toHaveBeenCalled();
  });

  test.each([
    { content: 'text', byte_count: 100 },
    { content: 'a\0b', byte_count: 3 },
    { content: 'x'.repeat(256 * 1024 + 1), byte_count: 256 * 1024 + 1 },
    { content: 'text', byte_count: 4, authToken: 'must-not-cross' },
  ])('rejects invalid or oversized data without including its payload in errors', async payload => {
    const invoke = jest.fn().mockResolvedValue(payload);
    const client = createNativeWorkspaceClient(invoke);
    await expect(client.readText({ grant_id: grantId, relative_path: 'note.md' })).rejects.toMatchObject({ code: 'LOCAL_RESPONSE_INVALID', message: 'The local service returned an invalid workspace response.' });
  });

  test('surfaces a static native error and never retries an uncertain grant update', async () => {
    const invoke = jest.fn().mockRejectedValue({ code: 'LOCAL_WORKSPACE_BLOCKED', message: 'untrusted diagnostic with private path' });
    const client = createNativeWorkspaceClient(invoke);
    await expect(client.revoke(grantId)).rejects.toMatchObject({ code: 'LOCAL_WORKSPACE_BLOCKED' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
