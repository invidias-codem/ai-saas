// Read-only Hosting metadata inventory. Never deletes releases or changes billing.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { applicationDefault } from 'firebase-admin/app';

const output = process.argv[2];
if (!output) throw new Error('Usage: hosting-storage-inventory.mjs <evidence-directory>');
const root = 'https://firebasehosting.googleapis.com/v1beta1/sites/genie-ai-1ca85';
const token = await applicationDefault().getAccessToken();
async function list(collection) {
  if (!['channels', 'versions'].includes(collection)) throw new Error('Unsupported read-only collection');
  const values = [];
  const seen = new Set();
  let pageToken = '';
  for (let page = 0; page < 50; page += 1) {
    const url = new URL(`${root}/${collection}`);
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { method: 'GET', headers: { authorization: `Bearer ${token.access_token}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Hosting metadata read failed (${response.status})`);
    const data = await response.json();
    values.push(...(data[collection] ?? []));
    if (!data.nextPageToken) return values;
    if (typeof data.nextPageToken !== 'string' || data.nextPageToken.length > 4096 || seen.has(data.nextPageToken)) throw new Error('Invalid Hosting pagination');
    pageToken = data.nextPageToken; seen.add(pageToken);
  }
  throw new Error('Hosting inventory exceeded its page limit');
}
const [channels, versions] = await Promise.all([list('channels'), list('versions')]);
const report = {
  project: 'genie-ai-1ca85', readOnly: true, createdAt: new Date().toISOString(),
  channels: channels.map(c => ({ name: c.name, expireTime: c.expireTime, retainedReleaseCount: c.retainedReleaseCount,
    currentVersion: c.release?.version?.name ?? null, currentRelease: c.release?.name ?? null })),
  versions: versions.map(v => ({ name: v.name, status: v.status, createTime: v.createTime, finalizeTime: v.finalizeTime,
    fileCount: v.fileCount, logicalVersionBytes: v.versionBytes })),
  note: 'Version sizes can share stored content. These are metadata sizes, not a claim of reclaimable quota. No resources were changed.',
};
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'hosting-storage-inventory.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Read-only Hosting inventory: ${channels.length} channels, ${versions.length} versions. No resources changed.`);
