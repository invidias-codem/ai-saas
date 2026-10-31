import Link from 'next/link';
import { DESKTOP_BUILDS_URL, DESKTOP_PACKAGES, DESKTOP_PLATFORMS, desktopAssetUrl, getDesktopRelease } from '@/lib/releases/desktop';

export function DesktopDownloads({ platform }: { platform?: string }) {
  const release = getDesktopRelease();
  const platforms = DESKTOP_PLATFORMS.filter(p => !platform || p.id === platform);
  return <section aria-labelledby="desktop-downloads" className="mb-16 rounded-2xl border border-emerald-300/20 bg-slate-900/50 p-6 sm:p-9">
    <p className="font-mono text-xs uppercase tracking-widest text-emerald-300">Lattice OS Desktop</p>
    <h2 id="desktop-downloads" className="mt-3 text-3xl font-semibold">Your local workspace</h2>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">A desktop application for native folder access, text previews and individually reviewed file changes. The interface and local service are bundled together. Command execution remains unavailable until a sandbox is qualified.</p>
    <p role="status" className="mt-5 text-sm text-amber-200">{release ? `${release.channel === 'stable' ? 'Stable release' : 'Release candidate for testing'} · ${release.version}` : 'Test packages are being qualified. No public desktop release is available yet.'}</p>
    <div className={`mt-6 grid gap-4 ${platform ? '' : 'md:grid-cols-3'}`}>
      {platforms.map(p => <article key={p.id} className="flex flex-col rounded-xl border border-slate-700 p-5">
        <h3 className="text-xl font-semibold">{p.name}</h3><p className="mt-1 text-sm text-slate-300">{p.architecture}</p>
        <p className="mb-5 mt-3 text-xs leading-6 text-slate-400">{p.minimum}</p>
        <div className="mt-auto space-y-3">
          {DESKTOP_PACKAGES.filter(a => a.platform === p.id).map(asset => {
            const evidence = release?.artifacts.find(a => a.target === asset.id);
            return release && evidence ? <div key={asset.id}>
              <a href={desktopAssetUrl(release, asset.id)} className="block rounded-lg bg-emerald-300 px-3 py-3 text-center text-sm font-semibold text-slate-950">{asset.label} · {(evidence.size / 1024 ** 2).toFixed(1)} MB</a>
              <details className="mt-2 text-xs text-slate-400"><summary>Verify SHA-256</summary><p className="mt-2 break-all font-mono">{evidence.sha256}</p><p className="mt-2">{evidence.nativeSigned ? 'Platform signature verified.' : 'Evaluation build; platform signature not provided.'}</p><p className="mt-2 break-all">Source: {release.sourceCommit}</p></details>
            </div> : <p key={asset.id} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-400">{asset.label} · pending qualification</p>;
          })}
          {!p.available && <p className="text-xs leading-6 text-amber-200">Not available for testing yet.</p>}
          {!platform && <Link href={`/downloads/${p.id}`} className="inline-block text-sm text-emerald-300">{p.name} installation details →</Link>}
        </div>
      </article>)}
    </div>
    <p className="mt-6 text-xs leading-6 text-slate-400">Developers with repository access can retrieve evaluation packages from <a className="text-emerald-300 underline" href={DESKTOP_BUILDS_URL} rel="noreferrer">desktop package builds</a> after a successful run. GitHub sign-in is required. These artifacts are not stable releases; compare the included SHA256SUMS before installation.</p>
    <p className="mt-3 text-xs leading-6 text-slate-500">Project memory and interrupted-task recovery are still in development. Folder authorization expires when the local service restarts.</p>
  </section>;
}
