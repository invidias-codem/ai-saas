// Frontend behavior with mock IPC, not native UI qualification.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import './build.mjs';

const bundle = await readFile(new URL('../../desktop/dist/workspace.js', import.meta.url), 'utf8');
class Element {
  constructor() { this.value = ''; this.textContent = ''; this.disabled = false; this.hidden = false; this.children = []; this.dataset = {}; this.listeners = {}; this.attributes = {}; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  setAttribute(key, value) { this.attributes[key] = value; }
  replaceChildren() { this.children = []; }
  append(child) { this.children.push(child); }
  click() { if (!this.disabled) this.listeners.click?.(); }
}
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };
const fixture = async ({ loseDispatch = false } = {}) => {
  const elements = new Map();
  const node = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  node('relative-path').value = '.'; node('operation').value = 'create_file';
  let grant; let proposal; let decision = 'pending'; let dispatches = 0;
  const id = `local-proposal-${'c'.repeat(32)}`;
  const invoke = async (command, { input } = {}) => {
    switch (command) {
      case 'ping_daemon': return { status: 'ok', recent_events: [] };
      case 'native_workspace_grants': return grant ? [grant] : [];
      case 'native_select_folder': grant = { grant_id: `local-grant-${'a'.repeat(32)}`, display_path: '/project/<img src=x>', read_only: true }; return grant;
      case 'native_request_write_access': grant = { ...grant, read_only: false }; return grant;
      case 'native_revoke_grant': grant = undefined; return null;
      case 'native_read_text': return { content: '<script>literal</script>\n资料', byte_count: 31 };
      case 'native_propose_operation': proposal = { ...input }; return { proposal_id: id, digest: 'b'.repeat(64), status: 'pending', kind: input.kind, grant_id: input.grant_id, relative_path: input.relative_path, execution_available: false };
      case 'native_open_review': return null;
      case 'native_proposal_status': return { proposal_id: id, digest: 'b'.repeat(64), status: decision, kind: proposal.kind, grant_id: proposal.grant_id, relative_path: proposal.relative_path, execution_available: false };
      case 'native_dispatch_operation': dispatches += 1; if (loseDispatch) throw { code: 'LOCAL_REQUEST_TIMEOUT', message: 'private diagnostics' }; return { proposal_id: id, digest: 'b'.repeat(64), status: 'succeeded', code: '', may_have_changed: true };
      case 'restart_daemon': grant = undefined; return { status: 'ok' };
      default: throw new Error(`Unexpected mock command ${command}`);
    }
  };
  const context = { document: { getElementById: node, createElement: () => new Element() }, TextEncoder,
    console, setTimeout, clearTimeout, isTauri: true, addEventListener() {}, __TAURI_INTERNALS__: { invoke } };
  context.window = context;
  vm.runInNewContext(bundle, context);
  await flush();
  const click = async id => { node(id).click(); await flush(); };
  return { node, click, accept: () => { decision = 'accepted'; }, dispatches: () => dispatches };
};

test('folder access starts read only, and write controls need separate native consent', async () => {
  const ui = await fixture(); assert.equal(ui.node('read').disabled, true);
  assert.match(ui.node('build-info').textContent, /Source: [a-f0-9]{40}/);
  await ui.click('select-folder');
  assert.equal(ui.node('read').disabled, false); assert.equal(ui.node('propose').disabled, true);
  assert.match(ui.node('grants').children[0].textContent, /<img src=x>/);
  assert.equal(ui.node('grants').children[0].children.length, 0);
  await ui.click('write-access'); assert.equal(ui.node('propose').disabled, false);
});
test('exact acceptance enables one dispatch and the workspace never accepts proposals', async () => {
  const ui = await fixture(); await ui.click('select-folder'); await ui.click('write-access');
  ui.node('relative-path').value = 'note.md'; ui.node('content').value = 'hello';
  await ui.click('propose'); await ui.click('proposal-refresh'); assert.equal(ui.node('apply').disabled, true);
  ui.accept(); await ui.click('proposal-refresh'); assert.equal(ui.node('apply').disabled, false);
  await ui.click('apply'); await ui.click('apply'); assert.equal(ui.dispatches(), 1);
});
test('a lost dispatch response never enables a second write attempt', async () => {
  const ui = await fixture({ loseDispatch: true }); await ui.click('select-folder'); await ui.click('write-access');
  ui.node('relative-path').value = 'note.md'; await ui.click('propose'); ui.accept(); await ui.click('proposal-refresh');
  await ui.click('apply'); await ui.click('proposal-refresh'); await ui.click('apply');
  assert.equal(ui.dispatches(), 1); assert.equal(ui.node('apply').disabled, true);
  assert.equal(ui.node('activity').textContent.includes('private diagnostics'), false);
});
test('revocation and restart clear displayed file bodies and proposal controls', async () => {
  const ui = await fixture(); await ui.click('select-folder'); ui.node('content').value = 'private preview';
  await ui.click('revoke'); assert.equal(ui.node('content').value, ''); assert.equal(ui.node('read').disabled, true);
  await ui.click('select-folder'); ui.node('content').value = 'private preview';
  await ui.click('restart'); assert.equal(ui.node('content').value, ''); assert.equal(ui.node('read').disabled, true);
});
