import { invoke, isTauri } from '@tauri-apps/api/core';
import { z } from 'zod';
import { nativeWorkspace, type NativeGrant, type NativeProposalInput } from '../lib/harness/nativeWorkspace';

declare const __LATTICE_BUILD__: { version: string; source: string };
const element = <T extends HTMLElement>(id: string) => {
  const found = document.getElementById(id);
  if (!found) throw new Error('Desktop interface is incomplete');
  return found as T;
};
const text = (id: string, value: string) => { element(id).textContent = value; };
const field = (id: string) => element<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id).value;
const button = (id: string) => element<HTMLButtonElement>(id);
text('build-info', `Lattice OS Preview ${__LATTICE_BUILD__.version}\nSource: ${__LATTICE_BUILD__.source}\nChannel: evaluation`);
const statusSchema = z.object({ status: z.enum(['ok', 'booting', 'stopping', 'stopped', 'error']),
  error: z.object({ code: z.string(), message: z.string() }).optional() }).passthrough();
let selected: NativeGrant | undefined;
let proposalId: string | undefined;
let proposalKind: NativeProposalInput['kind'] | undefined;
let attempted = false;
let accepted = false;
let busy = false;
let ready = false;
let refreshSequence = 0;
let proposalSequence = 0;

const report = (message: string) => text('activity', message);
const errorMessage = (error: unknown) => {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return `${error.code}: ${error.message}`;
  return 'The request could not complete. Check the service and operation status before trying again.';
};
const syncControls = () => {
  button('select-folder').disabled = busy || !ready;
  button('restart').disabled = busy;
  for (const id of ['list', 'stat', 'read', 'propose', 'command-propose', 'revoke', 'write-access']) button(id).disabled = busy || !ready || !selected;
  button('write-access').disabled ||= selected?.read_only === false;
  button('propose').disabled ||= selected?.read_only !== false;
  for (const id of ['proposal-refresh', 'proposal-cancel', 'operation-status', 'operation-cancel']) button(id).disabled = busy || !ready || !proposalId;
  button('apply').disabled = busy || !ready || !accepted || attempted;
};
const clearProposal = () => {
  proposalSequence += 1;
  proposalId = undefined;
  proposalKind = undefined;
  attempted = false;
  accepted = false;
  element('proposal').hidden = true;
  button('apply').disabled = true;
};
const clearLocalData = () => {
  refreshSequence += 1;
  selected = undefined;
  clearProposal();
  element('grants').replaceChildren();
  element('entries').replaceChildren();
  element<HTMLTextAreaElement>('content').value = '';
  element('folder-tools').hidden = true;
  text('file-info', '');
};
const task = async (action: () => Promise<void>) => {
  if (busy) return;
  busy = true;
  syncControls();
  try { await action(); } catch (error) { report(errorMessage(error)); }
  finally { busy = false; syncControls(); }
};
const chooseGrant = (grant: NativeGrant) => {
  refreshSequence += 1;
  selected = grant;
  clearProposal();
  element('entries').replaceChildren();
  element<HTMLTextAreaElement>('content').value = '';
  text('file-info', '');
  element('folder-tools').hidden = false;
  text('grant-scope', `${grant.display_path}\n${grant.read_only ? 'Read access' : 'Individually reviewed changes allowed'}`);
  element<HTMLInputElement>('relative-path').value = '.';
  syncControls();
};
const refreshGrants = async () => {
  const sequence = ++refreshSequence;
  const grants = await nativeWorkspace.grants();
  if (sequence !== refreshSequence) return;
  const container = element('grants');
  container.replaceChildren();
  for (const grant of grants) {
    const item = document.createElement('button');
    item.type = 'button'; item.className = 'grant';
    item.textContent = `${grant.display_path} · ${grant.read_only ? 'read only' : 'reviewed changes'}`;
    item.setAttribute('aria-pressed', String(selected?.grant_id === grant.grant_id));
    item.addEventListener('click', () => { if (!busy) { chooseGrant(grant); void task(refreshGrants); } });
    container.append(item);
  }
  if (selected && !grants.some(g => g.grant_id === selected?.grant_id)) clearLocalData();
};
const readInput = () => {
  if (!selected) throw new Error('Select a folder first');
  return { grant_id: selected.grant_id, relative_path: field('relative-path') };
};
const checkProposal = async () => {
  if (!proposalId) return;
  const id = proposalId;
  const sequence = proposalSequence;
  const summary = await nativeWorkspace.proposalStatus(id);
  if (sequence !== proposalSequence || proposalId !== id) return;
  text('proposal-info', `${summary.kind} · ${summary.relative_path}\nDecision: ${summary.status}\n${summary.proposal_id}`);
  // This is only a UI affordance. Native dispatch independently consumes exact acceptance once.
  accepted = summary.status === 'accepted';
  button('apply').disabled = !accepted || attempted || !ready;
  button('apply').textContent = proposalKind === 'execute_command' ? 'Test sandbox denial' : 'Apply accepted change';
};
const prepare = async (operation: NativeProposalInput) => {
  if (proposalId && !attempted) await nativeWorkspace.cancelProposal(proposalId);
  clearProposal();
  const summary = await nativeWorkspace.proposeOperation(operation);
  proposalId = summary.proposal_id;
  proposalKind = operation.kind;
  element('proposal').hidden = false;
  text('proposal-info', `${summary.kind} · ${summary.relative_path}\nDecision: ${summary.status}`);
  await nativeWorkspace.openReview(summary.proposal_id);
  report('Review the complete proposal in the separate native window. Return here and check the decision before applying.');
};
const bind = (id: string, action: () => Promise<void>) => button(id).addEventListener('click', () => { void task(action); });
bind('select-folder', async () => {
  const grant = await nativeWorkspace.selectFolder();
  if (grant) { chooseGrant(grant); await refreshGrants(); report('Folder read access confirmed.'); }
  else report('Folder selection cancelled.');
});
bind('write-access', async () => {
  const grant = await nativeWorkspace.requestWriteAccess(readInput().grant_id);
  chooseGrant(grant); await refreshGrants(); report(grant.read_only ? 'Folder remains read only.' : 'Write consent confirmed. Every change still requires exact review.');
});
bind('revoke', async () => {
  await nativeWorkspace.revoke(readInput().grant_id); clearLocalData(); await refreshGrants(); report('Folder access revoked.');
});
bind('list', async () => {
  const input = readInput();
  const result = await nativeWorkspace.list(input);
  element('entries').replaceChildren();
  for (const entry of result.entries) {
    const item = document.createElement('button'); item.type = 'button';
    item.textContent = `${entry.kind === 'directory' ? 'Folder' : entry.kind} · ${entry.name}`;
    item.addEventListener('click', () => {
      if (busy) return;
      element<HTMLInputElement>('relative-path').value = input.relative_path === '.' ? entry.name : `${input.relative_path}/${entry.name}`;
    });
    element('entries').append(item);
  }
  text('file-info', `${result.entries.length} entries`);
});
bind('stat', async () => { const result = await nativeWorkspace.stat(readInput()); text('file-info', `${result.kind} · ${result.size} bytes`); });
bind('read', async () => {
  const result = await nativeWorkspace.readText(readInput());
  element<HTMLTextAreaElement>('content').value = result.content;
  text('file-info', `${result.byte_count} UTF-8 bytes read`); report('Text loaded. Editing here does not change the file.');
});
bind('propose', async () => {
  const input = readInput();
  const kind = field('operation');
  if (kind === 'create_directory') await prepare({ ...input, kind });
  else if (kind === 'create_file' || kind === 'write_text') await prepare({ ...input, kind, content: field('content') });
});
bind('command-propose', async () => {
  const input = readInput();
  const shell = z.enum(['direct', 'cmd', 'powershell', 'pwsh', 'sh']).parse(field('shell'));
  const command = shell === 'direct' ? { shell, executable: field('executable'), argv: z.array(z.string()).parse(JSON.parse(field('argv'))) } : { shell, script: field('script') };
  await prepare({ ...input, kind: 'execute_command', command });
});
bind('proposal-refresh', checkProposal);
bind('proposal-cancel', async () => { if (proposalId) await nativeWorkspace.cancelProposal(proposalId); clearProposal(); report('Proposal cancelled.'); });
bind('apply', async () => {
  if (!proposalId || attempted) return;
  attempted = true;
  // Never redispatch after an ambiguous response, even when the UI receives an exception.
  const result = await nativeWorkspace.dispatchOperation(proposalId);
  report(`${result.status}${result.code ? ` · ${result.code}` : ''}\n${result.may_have_changed ? 'Files may have changed. Check the target on disk.' : 'No changes reported.'}`);
});
bind('operation-status', async () => {
  if (!proposalId) return;
  const result = await nativeWorkspace.operationStatus(proposalId);
  report(`${result.status}${result.code ? ` · ${result.code}` : ''}\n${result.may_have_changed ? 'Files may have changed.' : 'No changes reported.'}`);
});
bind('operation-cancel', async () => { if (proposalId) { const result = await nativeWorkspace.cancelOperation(proposalId); report(`${result.status} · ${result.code}`); } });
bind('restart', async () => {
  ready = false; clearLocalData(); syncControls();
  const result = statusSchema.parse(await invoke('restart_daemon'));
  if (result.status !== 'ok') throw new Error('Restart did not complete');
  report('Service restarted. Select and authorize your folder again.');
  await checkService();
});
async function checkService() {
  const result = statusSchema.parse(await invoke('ping_daemon'));
  ready = result.status === 'ok';
  element('service-status').dataset.state = result.status;
  text('service-status', ready ? 'Local service connected' : `${result.status}${result.error ? ` · ${result.error.code}` : ''}`);
  if (!ready) { clearLocalData(); }
  syncControls();
  return ready;
}
async function start() {
  syncControls();
  if (!isTauri()) { text('service-status', 'Open the installed desktop app'); element('service-status').dataset.state = 'error'; report('Native workspace controls are available inside Lattice OS Desktop.'); return; }
  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await checkService()) { await refreshGrants(); report('Local service connected. Choose a folder to begin.'); return; }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    report('Startup is taking longer than expected. Close and reopen the application.');
  } catch (error) { ready = false; syncControls(); text('service-status', 'Local service unavailable'); report(errorMessage(error)); }
}
void start();
for (const id of ['relative-path', 'content', 'operation', 'shell', 'executable', 'argv', 'script']) {
  element(id).addEventListener('input', () => {
    if (!proposalId || attempted || busy) return;
    const retired = proposalId;
    clearProposal();
    void nativeWorkspace.cancelProposal(retired).catch(() => {});
    report('Draft changed. Prepare a fresh proposal for native review.');
  });
}
window.addEventListener('focus', () => { if (!busy && ready) void checkProposal().catch(error => { button('apply').disabled = true; report(errorMessage(error)); }); });
