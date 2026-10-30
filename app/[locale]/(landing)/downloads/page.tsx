import type { Metadata } from 'next';
import Link from 'next/link';
import { DesktopDownloads } from '@/components/desktop-downloads';
import { CLI_TARGETS, CLI_REPOSITORY, getCliRelease, cliAssetUrl, verificationCommand } from '@/lib/releases/cli';

export const metadata: Metadata = {
  title: 'Download Lattice OS',
  description: 'Lattice OS desktop packages and command-line tools for Windows, Linux and macOS, with release status and verification instructions.',
};

export default function DownloadsPage() {
  const release = getCliRelease();
  return (
    <main className="min-h-screen bg-[#080a0d] px-6 pb-24 pt-32 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-8 text-5xl font-semibold tracking-tight">Download Lattice OS</h1>
        <DesktopDownloads />
        <div className="mb-7 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-300" aria-hidden="true" /> Lattice OS / Developer tools
        </div>
        <h2 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Your infrastructure.<br /><span className="text-slate-500">One command line.</span></h2>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-slate-400">Install the Lattice OS CLI to manage your Docker appliance, inspect deployment health, and prepare your development environment. Choose your operating system and processor below.</p>
        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <span className="rounded-full border border-slate-700 px-4 py-2">{release ? `${release.channel === 'stable' ? 'Stable' : 'Release candidate'} · ${release.version}` : 'First verified release in preparation'}</span>
          <a className="rounded-full border border-slate-700 px-4 py-2 hover:border-emerald-300" href={`https://github.com/${CLI_REPOSITORY}/releases`} rel="noreferrer">Release history ↗</a>
        </div>
        {!release && <div role="status" className="mt-10 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-6 text-sm leading-7 text-amber-100">Downloads will open after all five platform builds pass verification. No stable CLI release is available here yet.</div>}
        {release?.channel === 'candidate' && <div role="status" className="mt-10 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-6 text-sm leading-7 text-amber-100">This release candidate is for evaluation in a development environment. Production deployment validation and platform signing are still required before a stable release.</div>}
        <section aria-labelledby="platforms" className="mt-14">
          <h2 id="platforms" className="text-2xl font-semibold">Choose your platform</h2>
          <p className="mt-2 text-sm text-slate-400">Standalone executables. Python is bundled; Docker Engine with Compose v2 is required for deployment commands.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CLI_TARGETS.map(target => {
              const artifact = release?.artifacts.find(a => a.target === target.id);
              return <article key={target.id} className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                <div className="mb-8 font-mono text-xs text-emerald-300">{target.id.toUpperCase()}</div>
                <h3 className="text-2xl font-semibold">{target.os}</h3>
                <p className="mt-1 text-slate-300">{target.architecture}</p>
                <p className="mb-6 mt-3 min-h-10 text-xs leading-5 text-slate-500">{target.minimum}</p>
                {release && artifact ? <>
                  <a href={cliAssetUrl(release, target.filename)} className="mt-auto rounded-lg bg-emerald-300 px-4 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-emerald-200" rel="noreferrer">Download · {(artifact.size / 1024 / 1024).toFixed(1)} MB</a>
                  <details className="mt-4 text-xs text-slate-400"><summary className="cursor-pointer">SHA-256 &amp; provenance</summary><p className="mt-3 break-all font-mono">{artifact.sha256}</p><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3">{verificationCommand(release, target.filename)}</pre><p className="mt-3">{artifact.nativeSigned ? 'Platform signature verified.' : 'Platform signature not yet provided. GitHub build provenance is available.'}</p></details>
                </> : <button disabled className="mt-auto rounded-lg border border-slate-700 px-4 py-3 text-sm text-slate-500">Not released yet</button>}
              </article>;
            })}
          </div>
        </section>
        <section aria-labelledby="verify" className="mt-16 grid gap-8 border-t border-slate-800 pt-12 md:grid-cols-2">
          <div><h2 id="verify" className="text-2xl font-semibold">Verify before you run</h2><p className="mt-4 text-sm leading-7 text-slate-400">Compare the SHA-256 checksum and verify build provenance with the GitHub CLI. The installers stop if either check fails. Download and inspect the installer before running it; administrator access is not required.</p>
            {release && <div className="mt-5 flex flex-wrap gap-5 text-sm text-emerald-300">{['SHA256SUMS', 'install.sh', 'install.ps1'].map(name => <a key={name} href={cliAssetUrl(release, name)} rel="noreferrer">{name} ↗</a>)}</div>}
          </div>
          <div><h2 className="text-2xl font-semibold">Check your installation</h2><pre className="mt-4 overflow-auto rounded-xl border border-slate-800 bg-black/30 p-5 font-mono text-sm leading-8 text-emerald-200">{'lattice --version\nlattice doctor --offline --json\nlattice doctor'}</pre><p className="mt-3 text-xs leading-6 text-slate-500">The offline check validates the bundled runtime. The full check also contacts your local Docker daemon.</p></div>
        </section>
        <div className="mt-14 flex flex-wrap gap-6 text-sm text-slate-400"><Link href="/docs" className="hover:text-white">Documentation →</Link><a href={`https://github.com/${CLI_REPOSITORY}/blob/main/scripts/lattice-cli/README.md`} rel="noreferrer" className="hover:text-white">CLI reference ↗</a><Link href="/support" className="hover:text-white">Get support →</Link></div>
        <p className="mt-8 max-w-2xl text-xs leading-6 text-slate-600">This download installs the command-line application on your existing OS. Desktop applications and bootable images have separate release requirements.</p>
      </div>
    </main>
  );
}
