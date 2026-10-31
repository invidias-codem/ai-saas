'use strict';
(() => {
  const node = id => document.getElementById(id);
  const invoke = (command, input = {}) => globalThis.__TAURI__.core.invoke(command, { input });
  let record;
  let ready = false;
  let complete = false;
  let submitted = false;
  const update = () => {
    node('confirmed').disabled = !ready || !complete || submitted;
    node('accept').disabled = !ready || !complete || !node('confirmed').checked || submitted;
  };
  const cancel = async () => {
    if (submitted) return;
    submitted = true; update();
    try { await invoke('native_review_cancel'); } catch { node('status').textContent = 'Review unavailable. Close this window to deny it.'; }
  };
  node('deny').addEventListener('click', event => { if (event.isTrusted) void cancel(); });
  node('confirmed').addEventListener('change', update);
  node('bytes-view').addEventListener('scroll', () => {
    const view = node('bytes-view');
    if (view.scrollTop + view.clientHeight >= view.scrollHeight - 2) { complete = true; node('scroll-note').textContent = 'The complete byte view has been displayed.'; update(); }
  });
  node('accept').addEventListener('click', async event => {
    if (!event.isTrusted || node('accept').disabled || !record || submitted) return;
    submitted = true; update();
    try { await invoke('native_review_decide', { proposal_id: record.proposal_id, digest: record.digest, decision: 'accept' }); node('status').textContent = 'Exact proposal accepted. No file operation was executed.'; }
    catch { node('status').textContent = 'The native review was denied or is no longer current. Close this window.'; }
  });
  const initialize = async () => {
    try {
      const value = await invoke('native_review_document');
      const keys = ['schema_version','proposal_id','digest','kind','display_root_json','relative_path_json','precondition','content_json','content_hex','byte_count','read_only','execution_available','expires_in_ms'];
      if (!value || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value,key)) || value.schema_version !== 1 || !/^local-proposal-[a-f0-9]{32}$/.test(value.proposal_id) || !/^[a-f0-9]{64}$/.test(value.digest) || !['create_file','create_directory'].includes(value.kind) || value.precondition !== 'must_be_absent' || typeof value.read_only !== 'boolean' || value.execution_available !== false || !Number.isSafeInteger(value.expires_in_ms) || value.expires_in_ms <= 0 || value.expires_in_ms > 300000 || !Number.isSafeInteger(value.byte_count) || value.byte_count < 0 || value.byte_count > 256*1024) throw new Error('Invalid native record');
      for (const key of ['display_root_json','relative_path_json']) if (typeof value[key] !== 'string' || typeof JSON.parse(value[key]) !== 'string') throw new Error('Invalid native path');
      if (value.kind === 'create_file') {
        if (typeof value.content_json !== 'string' || typeof value.content_hex !== 'string' || !/^(?:[a-f0-9]{2})*$/.test(value.content_hex)) throw new Error('Invalid native content');
        const content = JSON.parse(value.content_json);
        if (typeof content !== 'string' || content.includes('\0')) throw new Error('Invalid native text');
        const bytes = new TextEncoder().encode(content);
        if (bytes.length !== value.byte_count || Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('') !== value.content_hex) throw new Error('Incomplete native content');
      } else if (value.byte_count !== 0 || value.content_json !== null || value.content_hex !== null) throw new Error('Unexpected native content');
      record = Object.freeze(value);
      node('kind').textContent = value.kind === 'create_file' ? 'Create a UTF-8 file' : 'Create a directory';
      node('root').textContent = value.display_root_json;
      node('path').textContent = value.relative_path_json;
      node('proposal-id').textContent = value.proposal_id;
      node('digest').textContent = value.digest;
      node('byte-count').textContent = `${value.byte_count} bytes`;
      node('content-json').textContent = value.content_json ?? '';
      node('content-hex').textContent = value.content_hex ?? '';
      node('content-panel').hidden = value.kind !== 'create_file';
      node('document').hidden = false;
      // Acknowledge only the complete immutable record, after every DOM write.
      if (node('content-hex').textContent !== (value.content_hex ?? '') || node('content-json').textContent !== (value.content_json ?? '')) throw new Error('Incomplete native display');
      await invoke('native_review_ready', { proposal_id: value.proposal_id, digest: value.digest });
      ready = true;
      const view = node('bytes-view');
      complete = value.kind === 'create_directory' || view.scrollHeight <= view.clientHeight + 2;
      node('status').textContent = value.read_only ? 'Current folder permission: read only. This decision cannot grant write access.' : 'Review only. No execution endpoint is enabled in this build.';
      update();
      setTimeout(() => { ready = false; update(); node('status').textContent = 'This review has expired. Close it and request a new proposal.'; void cancel(); }, value.expires_in_ms);
    } catch { ready = false; update(); node('status').textContent = 'The complete native proposal could not be displayed. This review is denied.'; void cancel(); }
  };
  void initialize();
})();
