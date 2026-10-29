'use strict';
(() => {
  const node = id => document.getElementById(id);
  const invoke = (command, input = {}) => globalThis.__TAURI__.core.invoke(command, { input });
  let record;
  let ready = false;
  let submitted = false;
  const viewed = { after: false, before: false };
  const update = () => {
    const complete = viewed.after && viewed.before;
    node('confirmed').disabled = !ready || !complete || submitted;
    node('accept').disabled = !ready || !complete || !node('confirmed').checked || submitted;
  };
  const cancel = async () => {
    if (submitted) return;
    submitted = true; update();
    try { await invoke('native_review_cancel'); }
    catch { node('status').textContent = 'Review unavailable. Close this window to deny it.'; }
  };
  node('deny').addEventListener('click', event => { if (event.isTrusted) void cancel(); });
  node('confirmed').addEventListener('change', update);
  for (const [key, id] of [['after', 'bytes-view'], ['before', 'base-bytes-view']]) {
    node(id).addEventListener('scroll', () => {
      const view = node(id);
      if (view.scrollTop + view.clientHeight >= view.scrollHeight - 2) {
        viewed[key] = true; update();
        if (viewed.after && viewed.before) node('scroll-note').textContent = 'The complete byte views have been displayed.';
      }
    });
  }
  node('accept').addEventListener('click', async event => {
    if (!event.isTrusted || node('accept').disabled || !record || submitted) return;
    submitted = true; update();
    try { await invoke('native_review_decide', { proposal_id: record.proposal_id, digest: record.digest, decision: 'accept' }); node('status').textContent = 'Exact proposal accepted. No file operation was executed.'; }
    catch { node('status').textContent = 'The native review was denied or is no longer current. Close this window.'; }
  });
  const keysMatch = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
  const identity = value => keysMatch(value, ['volume', 'file']) && typeof value.volume === 'string' && /^[a-f0-9]{16}$/.test(value.volume) && typeof value.file === 'string' && /^(?:[a-f0-9]{16}|[a-f0-9]{32})$/.test(value.file) && /[1-9a-f]/.test(value.file);
  const verifyBytes = (json, hex, count) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > 256 * 1024 || typeof json !== 'string' || typeof hex !== 'string' || !/^(?:[a-f0-9]{2})*$/.test(hex)) throw new Error('Invalid complete bytes');
    const text = JSON.parse(json);
    if (typeof text !== 'string' || text.includes('\0')) throw new Error('Invalid text');
    const bytes = new TextEncoder().encode(text);
    if (bytes.length !== count || Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') !== hex) throw new Error('Incomplete bytes');
  };
  const initialize = async () => {
    try {
      const value = await invoke('native_review_document');
      const keys = ['schema_version', 'proposal_id', 'digest', 'kind', 'display_root_json', 'relative_path_json', 'precondition', 'precondition_details_json', 'base_content_json', 'base_content_hex', 'base_byte_count', 'content_json', 'content_hex', 'byte_count', 'read_only', 'execution_available', 'expires_in_ms'];
      if (!keysMatch(value, keys) || value.schema_version !== 2 || typeof value.proposal_id !== 'string' || !/^local-proposal-[a-f0-9]{32}$/.test(value.proposal_id) || typeof value.digest !== 'string' || !/^[a-f0-9]{64}$/.test(value.digest) || !['create_file', 'create_directory', 'write_text'].includes(value.kind) || typeof value.read_only !== 'boolean' || value.execution_available !== false || !Number.isSafeInteger(value.expires_in_ms) || value.expires_in_ms <= 0 || value.expires_in_ms > 300000) throw new Error('Invalid native record');
      for (const key of ['display_root_json', 'relative_path_json']) if (typeof value[key] !== 'string' || typeof JSON.parse(value[key]) !== 'string') throw new Error('Invalid path');
      if (typeof value.precondition_details_json !== 'string') throw new Error('Invalid precondition');
      const pre = JSON.parse(value.precondition_details_json);
      if (!keysMatch(pre, ['parent_identity', 'base']) || !identity(pre.parent_identity)) throw new Error('Invalid parent');
      if (value.kind === 'write_text') {
        if (value.precondition !== 'matches_base' || !keysMatch(pre.base, ['identity', 'content_sha3', 'byte_count']) || !identity(pre.base.identity) || typeof pre.base.content_sha3 !== 'string' || !/^[a-f0-9]{64}$/.test(pre.base.content_sha3) || pre.base.byte_count !== value.base_byte_count) throw new Error('Invalid base');
        verifyBytes(value.base_content_json, value.base_content_hex, value.base_byte_count);
      } else if (value.precondition !== 'must_be_absent' || pre.base !== null || value.base_content_json !== null || value.base_content_hex !== null || value.base_byte_count !== 0) throw new Error('Unexpected base');
      if (value.kind !== 'create_directory') verifyBytes(value.content_json, value.content_hex, value.byte_count);
      else if (value.byte_count !== 0 || value.content_json !== null || value.content_hex !== null) throw new Error('Unexpected content');
      record = Object.freeze(value);
      node('kind').textContent = { create_file: 'Create a UTF-8 file', create_directory: 'Create a directory', write_text: 'Replace UTF-8 text' }[value.kind];
      for (const [id, text] of Object.entries({ root: value.display_root_json, path: value.relative_path_json, 'proposal-id': value.proposal_id, digest: value.digest, 'byte-count': `${value.byte_count} new bytes`, 'content-json': value.content_json ?? '', 'content-hex': value.content_hex ?? '', 'base-content-json': value.base_content_json ?? '', 'base-content-hex': value.base_content_hex ?? '', 'precondition-details': value.precondition_details_json })) node(id).textContent = text;
      node('precondition').textContent = value.kind === 'write_text' ? 'The pinned target identity and complete base content must still match.' : 'The target must not already exist.';
      node('content-panel').hidden = value.kind === 'create_directory';
      node('base-panel').hidden = value.kind !== 'write_text';
      node('document').hidden = false;
      for (const [id, field] of [['content-hex', 'content_hex'], ['content-json', 'content_json'], ['base-content-hex', 'base_content_hex'], ['base-content-json', 'base_content_json']]) if (node(id).textContent !== (value[field] ?? '')) throw new Error('Incomplete native display');
      await invoke('native_review_ready', { proposal_id: value.proposal_id, digest: value.digest });
      ready = true;
      viewed.after = value.kind === 'create_directory' || node('bytes-view').scrollHeight <= node('bytes-view').clientHeight + 2;
      viewed.before = value.kind !== 'write_text' || node('base-bytes-view').scrollHeight <= node('base-bytes-view').clientHeight + 2;
      node('status').textContent = value.read_only ? 'Current folder permission: read only. This decision cannot grant write access.' : 'Current folder permission: reviewed changes allowed. This desktop build records decisions without applying them.';
      update();
      setTimeout(() => { ready = false; update(); node('status').textContent = 'This review has expired. Close it and request a new proposal.'; void cancel(); }, value.expires_in_ms);
    } catch { ready = false; update(); node('status').textContent = 'The complete native proposal could not be displayed. This review is denied.'; void cancel(); }
  };
  void initialize();
})();
