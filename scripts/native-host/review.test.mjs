import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { chromium } from 'playwright';

const assets = new URL('../../src-tauri/review-assets/', import.meta.url);
const [html, script, css, policy] = await Promise.all(['index.html','review.js','review.css','policy.json'].map(async name => readFile(new URL(name, assets), 'utf8')));
const csp = Object.entries(JSON.parse(policy)).map(([key,value]) => `${key} ${value}`).join('; ');
const makeRecord = content => ({ schema_version:2, proposal_id:`local-proposal-${'a'.repeat(32)}`,digest:'b'.repeat(64),kind:'create_file',display_root_json:JSON.stringify('/selected/project'),relative_path_json:JSON.stringify('draft.txt'),precondition:'must_be_absent',precondition_details_json:JSON.stringify({parent_identity:{volume:'000000000000001a',file:'000000000000002b'},base:null}),base_content_json:null,base_content_hex:null,base_byte_count:0,content_json:JSON.stringify(content),content_hex:Buffer.from(content).toString('hex'),byte_count:Buffer.byteLength(content),read_only:true,execution_available:false,expires_in_ms:300000 });

const fixture = async (record, run) => {
  const bootstrap = `globalThis.calls=[];globalThis.__TAURI__={core:{invoke:async(command,args)=>{calls.push({command,input:args.input});if(command==='native_review_document')return ${JSON.stringify(record)};return null;}}};`;
  const server=createServer((req,res)=>{
    res.setHeader('Content-Security-Policy',csp);
    if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(bootstrap);}
    else if(req.url==='/review.js'){res.setHeader('Content-Type','text/javascript');res.end(script);}
    else if(req.url==='/review.css'){res.setHeader('Content-Type','text/css');res.end(css);}
    else{res.setHeader('Content-Type','text/html');res.end(html.replace('<script defer src="/review.js">','<script src="/fixture.js"></script><script defer src="/review.js">'));}
  }).listen(0,'127.0.0.1');await once(server,'listening');let browser;
  try{browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await run(page);}
  finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
};

test('bundled review renders hostile content as text and submits one exact decision',async()=>{
  const content='</pre><img src="https://untrusted.invalid/leak" onerror="globalThis.executed=true">\n资料 %n';const record=makeRecord(content);
  await fixture(record,async page=>{
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_ready'));
    assert.equal(await page.locator('#content-json').textContent(),JSON.stringify(content));
    assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>globalThis.executed===true),false);
    await page.locator('#confirmed').check();await page.locator('#accept').click();
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_decide'));
    const decisions=await page.evaluate(()=>globalThis.calls.filter(c=>c.command==='native_review_decide'));
    assert.deepEqual(decisions,[{command:'native_review_decide',input:{proposal_id:record.proposal_id,digest:record.digest,decision:'accept'}}]);
    assert.equal(await page.locator('#accept').isDisabled(),true);
  });
});

test('complete byte display and explicit confirmation are required',async()=>{
  await fixture(makeRecord('full exact content\n'.repeat(4000)),async page=>{
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_ready'));
    assert.equal(await page.locator('#confirmed').isDisabled(),true);assert.equal(await page.locator('#accept').isDisabled(),true);
    await page.locator('#bytes-view').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    await page.waitForFunction(()=>!document.getElementById('confirmed').disabled);
    assert.equal(await page.locator('#accept').isDisabled(),true);
    await page.locator('#confirmed').check();assert.equal(await page.locator('#accept').isDisabled(),false);
  });
});

for(const fault of ['byte_count','content_hex','extra','digest']){
  test(`incomplete or changed ${fault} denies display without acknowledgement`,async()=>{
    const record=makeRecord('exact text');
    if(fault==='byte_count')record.byte_count++;
    if(fault==='content_hex')record.content_hex='00';
    if(fault==='extra')record.approved=true;
    if(fault==='digest')record.digest='invalid';
    await fixture(record,async page=>{
      await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_cancel'));
      assert.equal(await page.evaluate(()=>globalThis.calls.some(c=>c.command==='native_review_ready')),false);
      assert.equal(await page.locator('#accept').isDisabled(),true);
    });
  });
}

const writeRecord = (before,after) => ({...makeRecord(after),kind:'write_text',precondition:'matches_base',base_content_json:JSON.stringify(before),base_content_hex:Buffer.from(before).toString('hex'),base_byte_count:Buffer.byteLength(before),precondition_details_json:JSON.stringify({parent_identity:{volume:'000000000000001a',file:'000000000000002b'},base:{identity:{volume:'000000000000001a',file:'000000000000003c'},content_sha3:'c'.repeat(64),byte_count:Buffer.byteLength(before)}})});

test('overwrite review displays the complete before and after as literal text',async()=>{
  const before='<img src=x onerror=execute()> before';const after='<script>after</script>资料';const record=writeRecord(before,after);
  await fixture(record,async page=>{
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_ready'));
    assert.equal(await page.locator('#base-content-json').textContent(),JSON.stringify(before));
    assert.equal(await page.locator('#content-json').textContent(),JSON.stringify(after));
    assert.equal(await page.locator('img').count(),0);
    await page.locator('#confirmed').check();await page.locator('#accept').click();
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_decide'));
    assert.equal(await page.evaluate(()=>globalThis.calls.filter(c=>c.command==='native_review_decide').length),1);
  });
});

test('overwrite review requires scrolling the entire base as well as new content',async()=>{
  await fixture(writeRecord('complete base bytes\n'.repeat(4000),'after'),async page=>{
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_ready'));
    assert.equal(await page.locator('#confirmed').isDisabled(),true);
    await page.locator('#base-bytes-view').evaluate(element=>{element.scrollTop=element.scrollHeight;});
    await page.waitForFunction(()=>!document.getElementById('confirmed').disabled);
    assert.equal(await page.locator('#accept').isDisabled(),true);
  });
});

test('incomplete base bytes cancel without acknowledging display',async()=>{
  const record=writeRecord('before','after');record.base_content_hex='00';
  await fixture(record,async page=>{
    await page.waitForFunction(()=>globalThis.calls.some(c=>c.command==='native_review_cancel'));
    assert.equal(await page.evaluate(()=>globalThis.calls.some(c=>c.command==='native_review_ready')),false);
    assert.equal(await page.locator('#accept').isDisabled(),true);
  });
});

const commandRecord = (script, direct = false) => {
  const args = direct ? ['literal;not-shell', '', '资料'] : ['-c', script];
  const record = makeRecord(direct ? JSON.stringify(args) : script);
  return { ...record, kind: 'execute_command', relative_path_json: JSON.stringify('.'), precondition: 'matches_command_scope', precondition_details_json: JSON.stringify({ platform: 'linux', shell: direct ? 'direct' : 'sh', cwd_identity: { volume: '000000000000001a', file: '000000000000002b' }, executable: { path: '/usr/bin/tool', identity: { volume: '000000000000001a', file: '000000000000003c' }, content_sha3: 'd'.repeat(64), byte_count: 4096 }, argv: args, timeout_ms: 30000, output_limit: 10240, environment_policy: 'native-clean-v1', requirements: 'native-local-sandbox-v1', provider: { id: 'unavailable', revision: 0, qualification: '' }, requires_sandbox: true }) };
};

test('command review displays literal script and exact sandbox scope without dispatch authority', async () => {
  const script = '<img src=x onerror=execute()> literal; data';
  await fixture(commandRecord(script), async page => {
    await page.waitForFunction(() => globalThis.calls.some(c => c.command === 'native_review_ready'));
    assert.equal(await page.locator('#content-json').textContent(), JSON.stringify(script));
    assert.equal(await page.locator('img').count(), 0);
    assert.match(await page.locator('#precondition-details').textContent(), /native-clean-v1/);
    await page.locator('#confirmed').check(); await page.locator('#accept').click();
    await page.waitForFunction(() => globalThis.calls.some(c => c.command === 'native_review_decide'));
    assert.equal(await page.evaluate(() => globalThis.calls.some(c => /dispatch|execute/.test(c.command))), false);
  });
});

test('direct command review preserves structured argument boundaries', async () => {
  const record = commandRecord('', true);
  await fixture(record, async page => {
    await page.waitForFunction(() => globalThis.calls.some(c => c.command === 'native_review_ready'));
    const shown = JSON.parse(await page.locator('#content-json').textContent());
    assert.deepEqual(JSON.parse(shown), ['literal;not-shell', '', '资料']);
    assert.match(await page.locator('#content-note').textContent(), /Structured argv/);
  });
});

for (const fault of ['requires_sandbox', 'timeout_ms', 'environment_policy', 'executable']) {
  test(`changed command ${fault} refuses acknowledgement`, async () => {
    const record = commandRecord('printf data'); const scope = JSON.parse(record.precondition_details_json);
    if (fault === 'requires_sandbox') scope.requires_sandbox = false;
    if (fault === 'timeout_ms') scope.timeout_ms = 120001;
    if (fault === 'environment_policy') scope.environment_policy = 'inherit-host';
    if (fault === 'executable') scope.executable.identity.file = 'invalid';
    record.precondition_details_json = JSON.stringify(scope);
    await fixture(record, async page => {
      await page.waitForFunction(() => globalThis.calls.some(c => c.command === 'native_review_cancel'));
      assert.equal(await page.evaluate(() => globalThis.calls.some(c => c.command === 'native_review_ready')), false);
      assert.equal(await page.locator('#accept').isDisabled(), true);
    });
  });
}
