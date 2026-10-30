import assert from 'node:assert/strict';
import { readFile, writeFile, access, realpath } from 'node:fs/promises';
import path from 'node:path';
import { withWebdriver, until } from './qualification-webdriver.mjs';
import { nativeDialog } from './native-dialog.mjs';

export async function nativeUiFlow(application, fixture, evidence, record) {
  const seed = 'Native workspace fixture\n资料 <script>literal</script>\n';
  await writeFile(path.join(fixture, 'seed.txt'), seed);
  await withWebdriver(application, async client => {
    record.webview = client.capabilities;
    const measured = name => record.measured.push(name);
    const captured = name => path.join(evidence, `${String(record.measured.length).padStart(2, '0')}-${name}.png`);
    const grants = async () => {
      const result = await client.invoke('native_workspace_grants', {});
      assert.equal(result.ok, true); return result.value;
    };
    const choose = async ({ folder = 'accept', read = 'accept' } = {}) => {
      // A real native modal can hold the WebDriver click response. Respond via
      // OS UI automation while it is open, never by replacing native adapters.
      const clicked = client.click('#select-folder').then(() => null, error => error);
      await nativeDialog('folder', folder, fixture, captured(`folder-${folder}`));
      if (folder === 'accept') await nativeDialog('read', read, undefined, captured(`read-${read}`));
      const error = await clicked; if (error) throw error;
      return until(grants, values => folder === 'accept' && read === 'accept' ? values.length === 1 : values.length === 0);
    };
    const writeConsent = async action => {
      const clicked = client.click('#write-access').then(() => null, error => error);
      await nativeDialog('write', action, undefined, captured(`write-${action}`));
      const error = await clicked; if (error) throw error;
      return until(grants, values => values.length === 1 && values[0].read_only === (action === 'cancel'));
    };
    const select = (selector, value) => client.script(`
      const element = document.querySelector(arguments[0]); element.value = arguments[1];
      element.dispatchEvent(new Event('input', {bubbles:true}));
    `, [selector, value]);
    const openReview = async button => {
      await client.click(button);
      const handles = await until(() => client.handles(), values => values.some(v => v !== client.mainWindow));
      const review = handles.filter(v => v !== client.mainWindow);
      assert.equal(review.length, 1);
      await client.switchTo(review[0]);
      const id = await until(() => client.text('#proposal-id'), value => /^local-proposal-[a-f0-9]{32}$/.test(value ?? ''));
      assert.equal(await client.disabled('#accept'), true);
      return id;
    };
    const decide = async (id, decision, { content, base, command = false } = {}) => {
      if (content !== undefined) assert.equal(JSON.parse(await client.text('#content-json')), content);
      if (base !== undefined) assert.equal(JSON.parse(await client.text('#base-content-json')), base);
      if (command) {
        const scope = JSON.parse(await client.text('#precondition-details'));
        assert.equal(scope.requires_sandbox, true); assert.equal(scope.provider.id, 'unavailable');
      }
      await client.capture(captured(`review-${decision}`));
      if (decision === 'accept') {
        await client.script(`for (const id of ['bytes-view','base-bytes-view']) {
          const view = document.getElementById(id); if (view) view.scrollTop = view.scrollHeight;
        }`);
        await until(() => client.disabled('#confirmed'), value => value === false);
        await client.click('#confirmed');
        await until(() => client.disabled('#accept'), value => value === false);
      }
      // Clicking once can close the native window before WebDriver replies.
      // Reconcile its recorded decision; never repeat the acceptance click.
      const receipt = await client.click(decision === 'accept' ? '#accept' : '#deny').then(() => null, error => error);
      await client.switchTo(client.mainWindow);
      const result = await until(() => client.invoke('native_proposal_status', { proposal_id: id }), value => decision === 'accept'
        ? value.ok && value.value.status === 'accepted'
        : !value.ok || ['denied', 'stale', 'expired'].includes(value.value.status));
      if (decision === 'accept') assert.equal(result.value.status, 'accepted');
      else assert.equal(await client.disabled('#apply'), true);
      if (receipt && decision === 'accept') assert.equal(result.value.status, 'accepted');
    };
    const apply = async (id, status, code = '') => {
      await client.click('#proposal-refresh');
      await until(() => client.disabled('#apply'), value => value === false);
      await client.click('#apply');
      const outcome = await until(() => client.invoke('native_operation_status', { proposal_id: id }), value => value.ok && value.value.status !== 'running');
      assert.equal(outcome.value.status, status); assert.equal(outcome.value.code, code);
      return outcome.value;
    };
    const proposeFile = async (kind, filename, content) => {
      await client.fill('#relative-path', filename); await select('#operation', kind);
      await client.fill('#content', content); return openReview('#propose');
    };

    await until(() => client.invoke('ping_daemon'), v => v.ok && v.value?.status === 'ok');
    measured('installed-app-authenticated-readiness');
    assert.ok((await client.text('#build-info')).includes(record.sourceCommit), 'Installed frontend source must match the package manifest');
    measured('installed-frontend-source-identity');
    await choose({ folder: 'cancel' }); measured('native-picker-cancel-no-grant');
    await choose({ read: 'cancel' }); measured('native-read-consent-denial-no-grant');
    const [grant] = await choose(); assert.equal(grant.read_only, true);
    assert.equal(await realpath(grant.display_path), await realpath(fixture)); measured('native-picker-and-read-consent');
    await client.fill('#relative-path', 'seed.txt'); await client.click('#read');
    await until(() => client.value('#content'), value => value === seed);
    await client.click('#stat'); await until(() => client.text('#file-info'), text => text?.includes(`${Buffer.byteLength(seed)} bytes`));
    await client.fill('#relative-path', '.'); await client.click('#list');
    await until(() => client.text('#entries'), text => text?.includes('seed.txt')); measured('installed-list-stat-exact-utf8-preview');
    await client.fill('#relative-path', '../outside.txt'); await client.click('#read');
    await until(() => client.text('#activity'), text => text?.includes('LOCAL_PATH_INVALID')); measured('installed-traversal-denied');
    await writeConsent('cancel'); measured('native-write-consent-denial');
    await writeConsent('accept'); measured('separate-native-write-consent');

    const created = 'Reviewed content\n资料 <script>literal</script>\n'.repeat(100);
    const filename = 'reviewed.txt';
    let id = await proposeFile('create_file', filename, created);
    await decide(id, 'deny', { content: created });
    await assert.rejects(access(path.join(fixture, filename)), e => e.code === 'ENOENT'); measured('native-review-denial-no-file');
    id = await proposeFile('create_file', filename, created);
    await decide(id, 'accept', { content: created }); await apply(id, 'succeeded');
    assert.equal(await readFile(path.join(fixture, filename), 'utf8'), created); measured('native-reviewed-create-exact-disk-bytes');
    const replay = await client.invoke('native_dispatch_operation', { proposal_id: id });
    assert.equal(replay.ok, false); assert.equal(replay.code, 'LOCAL_OPERATION_REPLAYED'); measured('installed-dispatch-replay-denied');

    const replacement = 'Approved replacement\n资料\n';
    id = await proposeFile('write_text', filename, replacement);
    await decide(id, 'accept', { content: replacement, base: created });
    const external = 'External edit preserved\n'; await writeFile(path.join(fixture, filename), external);
    await apply(id, 'conflict', 'LOCAL_FILE_CONFLICT');
    assert.equal(await readFile(path.join(fixture, filename), 'utf8'), external); measured('external-edit-conflict-preserves-bytes');
    id = await proposeFile('write_text', filename, replacement);
    await decide(id, 'accept', { content: replacement, base: external }); await apply(id, 'succeeded');
    assert.equal(await readFile(path.join(fixture, filename), 'utf8'), replacement); measured('fresh-review-after-conflict-succeeds');
    await client.click('#revoke'); await until(grants, values => values.length === 0);
    const revoked = await client.invoke('native_read_text', { grant_id: grant.grant_id, relative_path: 'seed.txt' });
    assert.equal(revoked.ok, false); assert.equal(revoked.code, 'LOCAL_GRANT_DENIED');
    assert.equal(await client.value('#content'), ''); measured('native-revocation-clears-preview-and-access');

    const [beforeRestart] = await choose();
    // Keep a real review window open across restart and require its authority to retire.
    await client.click('.commands summary');
    await client.fill('#relative-path', '.'); await select('#shell', process.platform === 'win32' ? 'cmd' : 'sh');
    await client.fill('#script', 'echo never-start > command-marker.txt');
    const retired = await openReview('#command-propose'); await client.switchTo(client.mainWindow);
    await client.click('#restart'); await until(() => client.invoke('ping_daemon'), v => v.ok && v.value?.status === 'ok');
    await until(grants, values => values.length === 0);
    const stale = await client.invoke('native_proposal_status', { proposal_id: retired }); assert.equal(stale.ok, false);
    const oldRead = await client.invoke('native_read_text', { grant_id: beforeRestart.grant_id, relative_path: 'seed.txt' }); assert.equal(oldRead.ok, false);
    await until(() => client.handles(), values => values.length === 1); measured('restart-retires-grants-proposals-and-open-review');

    await choose();
    for (const shell of ['direct', 'cmd', 'powershell', 'pwsh', 'sh']) {
      await client.fill('#relative-path', '.'); await select('#shell', shell);
      await client.fill('#executable', process.platform === 'win32' ? 'cmd.exe' : 'sh');
      await client.fill('#argv', JSON.stringify(process.platform === 'win32' ? ['/d','/s','/c','echo never-start > command-marker.txt'] : ['-c','printf never-start > command-marker.txt']));
      await client.fill('#script', shell === 'powershell' || shell === 'pwsh' ? "Set-Content command-marker.txt 'never-start'" : 'echo never-start > command-marker.txt');
      await client.click('#command-propose');
      await until(() => client.disabled('#command-propose'), value => value === false);
      const outcome = await until(async () => ({ handles: await client.handles(), activity: await client.text('#activity') }), v =>
        v.handles.length > 1 || v.activity?.includes('LOCAL_SHELL_UNAVAILABLE'));
      if (outcome.handles.length === 1) {
        assert.notEqual(shell, 'direct'); record.commandModes[shell] = 'unavailable-before-review';
      } else {
        await client.switchTo(outcome.handles.find(h => h !== client.mainWindow));
        const commandId = await until(() => client.text('#proposal-id'), text => /^local-proposal-[a-f0-9]{32}$/.test(text ?? ''));
        await decide(commandId, 'accept', { command: true });
        await apply(commandId, 'denied', 'LOCAL_SANDBOX_REQUIRED');
        const output = await client.invoke('native_command_output', { proposal_id: commandId }); assert.equal(output.ok, false);
        record.commandModes[shell] = 'sandbox-required-no-output';
      }
      await assert.rejects(access(path.join(fixture, 'command-marker.txt')), e => e.code === 'ENOENT');
    }
    measured('all-command-modes-unavailable-or-sandbox-denied-no-marker');
    assert.equal(await readFile(path.join(fixture, 'seed.txt'), 'utf8'), seed);
    await client.capture(captured('installed-main-final'));
  });
}
