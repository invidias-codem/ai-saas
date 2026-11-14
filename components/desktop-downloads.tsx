import Link from 'next/link';
import { DESKTOP_BUILDS_URL, DESKTOP_PACKAGES, DESKTOP_PLATFORMS, desktopAssetUrl, getDesktopRelease } from '@/lib/releases/desktop';

export function DesktopDownloads({ platform, compact = false, asPage = false }: {
  platform?: string;
  compact?: boolean;
  asPage?: boolean;
}) {
  const release = getDesktopRelease();
  const platforms = DESKTOP_PLATFORMS.filter(p => !platform || p.id === platform);
  const headingId = compact ? `install-desktop-${platform}` : 'desktop-downloads';
  const Heading = asPage ? 'h1' : 'h2';
  const PlatformHeading = asPage ? 'h2' : 'h3';
  return <section aria-labelledby={headingId} className={compact ? 'rounded-2xl border border-border bg-card p-4 sm:p-5' : 'mb-16 rounded-2xl border border-border bg-card p-6 sm:p-9'}>
    <p className="font-mono text-xs uppercase tracking-widest text-primary">Lattice OS Desktop</p>
    <Heading id={headingId} className={compact ? 'mt-3 text-2xl font-semibold' : 'mt-3 text-3xl font-semibold'}>
      {asPage ? `Download Lattice OS for ${platforms[0]?.name ?? 'desktop'}` : 'Your local workspace'}
    </Heading>
    <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{compact ? 'Install the desktop app for local folder access and individually reviewed file changes.' : 'A desktop application for native folder access, text previews and individually reviewed file changes. The interface and local service are bundled together. Command execution remains unavailable until a sandbox is qualified.'}</p>
    <p role="status" className="mt-5 text-sm text-warning">{release ? `${release.channel === 'stable' ? 'Stable release' : 'Release candidate for testing'} · ${release.version}` : 'Test packages are being qualified. No public desktop release is available yet.'}</p>
    <div className={`mt-6 grid gap-4 ${platform ? '' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
      {platforms.map(p => <article key={p.id} className="flex flex-col rounded-xl border border-border bg-background/45 p-4 sm:p-5">
        <PlatformHeading className="text-xl font-semibold">{p.name}</PlatformHeading><p className="mt-1 text-sm text-muted-foreground">{p.architecture}</p>
        <p className="mb-5 mt-3 text-xs leading-6 text-muted-foreground">{p.minimum}</p>
        <div className="mt-auto space-y-3">
          {DESKTOP_PACKAGES.filter(a => a.platform === p.id).map(asset => {
            const evidence = release?.artifacts.find(a => a.target === asset.id);
            return release && evidence ? <div key={asset.id}>
              <a href={desktopAssetUrl(release, asset.id)} className="block rounded-lg bg-action px-3 py-3 text-center text-sm font-semibold text-action-foreground hover:bg-action-hover">{asset.label} · {(evidence.size / 1024 ** 2).toFixed(1)} MB</a>
              <details className="mt-2 text-xs text-muted-foreground"><summary>Verify SHA-256</summary><p className="mt-2 break-all font-mono">{evidence.sha256}</p><p className="mt-2">{evidence.nativeSigned ? 'Platform signature verified.' : 'Evaluation build; platform signature not provided.'}</p><p className="mt-2 break-all">Source: {release.sourceCommit}</p></details>
            </div> : <p key={asset.id} className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">{asset.label} · pending qualification</p>;
          })}
          {!p.available && <p className="text-xs leading-6 text-warning">Not available for testing yet.</p>}
          {!platform && <Link href={`/downloads/${p.id}`} className="inline-block text-sm text-primary">{p.name} installation details →</Link>}
        </div>
      </article>)}
    </div>
    <details className="mt-6 text-xs leading-6 text-muted-foreground" open={compact ? undefined : true}>
      <summary className="min-h-11 cursor-pointer">Developer test packages</summary>
      <p>Developers with repository access can retrieve evaluation packages from <a className="text-primary underline" href={DESKTOP_BUILDS_URL} rel="noreferrer">desktop package builds</a> after a successful run. GitHub sign-in is required. These artifacts are not stable releases; compare the included SHA256SUMS before installation.</p>
    </details>
    {!compact && <p className="mt-3 text-xs leading-6 text-muted-foreground">Project memory and interrupted-task recovery are still in development. Folder authorization expires when the local service restarts.</p>}
  </section>;
}
