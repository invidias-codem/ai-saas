'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { detectInstallDevice, isDesktopPlatform, recommendedInstallMode, type BrowserIdentity, type DesktopPlatform, type InstallDevice, type InstallMode } from '@/lib/install/platform';
import { createWebInstallController } from '@/lib/install/web-install';

type PlatformPanels = Record<DesktopPlatform, ReactNode>;
type InstallContextValue = {
  device: InstallDevice | null;
  installed: boolean;
  openInstall: () => void;
  promptMobile: () => void;
};
const InstallContext = createContext<InstallContextValue | null>(null);
const platformNames = { windows: 'Windows', macos: 'macOS', linux: 'Linux' } as const;
const mobileNames = { ios: 'iPhone & iPad', android: 'Android' } as const;
const promptSessionKey = 'lattice:install-prompt:v1';
const subscribeHydration = () => () => {};
const choiceClass = 'min-h-11 rounded-xl border px-4 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300';

export function InstallProvider({ children, desktopPanels, terminalPanels }: {
  children: ReactNode;
  desktopPanels: PlatformPanels;
  terminalPanels: PlatformPanels;
}) {
  const [controller] = useState(createWebInstallController);
  const web = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const device = useMemo(() => hydrated ? detectInstallDevice(navigator as BrowserIdentity) : null, [hydrated]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<InstallMode>('desktop');
  const [desktop, setDesktop] = useState<DesktopPlatform | null>(null);
  const [mobile, setMobile] = useState<'ios' | 'android' | null>(null);
  const prompted = useRef(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone), (display-mode: minimal-ui)');
    const checkStandalone = () => {
      if (display.matches || (navigator as Navigator & { standalone?: boolean }).standalone) controller.markInstalled();
    };
    window.addEventListener('beforeinstallprompt', controller.capture);
    window.addEventListener('appinstalled', controller.markInstalled);
    display.addEventListener('change', checkStandalone);
    checkStandalone();
    return () => {
      window.removeEventListener('beforeinstallprompt', controller.capture);
      window.removeEventListener('appinstalled', controller.markInstalled);
      display.removeEventListener('change', checkStandalone);
    };
  }, [controller]);

  const openInstall = useCallback(() => {
    const current = device ?? detectInstallDevice(navigator as BrowserIdentity);
    setMode(recommendedInstallMode(current));
    setDesktop(isDesktopPlatform(current.os) ? current.os : null);
    setMobile(current.os === 'ios' || current.os === 'android' ? current.os : null);
    opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement : document.querySelector<HTMLElement>('[data-install-primary]');
    setOpen(true);
  }, [device]);

  const promptMobile = useCallback(() => {
    if (!device?.mobile || web.installed || prompted.current) return;
    prompted.current = true;
    // Storage may be disabled in private browsing. The ref still limits this visit.
    try {
      if (sessionStorage.getItem(promptSessionKey) === '1') return;
      sessionStorage.setItem(promptSessionKey, '1');
    } catch { /* Installation remains usable without storage. */ }
    openInstall();
  }, [device, web.installed, openInstall]);

  return <InstallContext.Provider value={{ device, installed: web.installed, openInstall, promptMobile }}>
    {children}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border-slate-700 bg-[#0b0e15] p-5 text-slate-100 [&_h2]:text-slate-100 [&_h3]:text-slate-100 sm:p-8" onCloseAutoFocus={event => {
        if (opener.current?.isConnected) { event.preventDefault(); opener.current.focus(); }
      }}>
        <DialogHeader className="pr-5 text-left">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Your workspace. Your device.</p>
          <DialogTitle className="text-3xl font-semibold tracking-tight">Install Lattice OS</DialogTitle>
          <DialogDescription className="pt-2 leading-6 text-slate-400">Choose a home-screen app, a desktop application, or the command line.</DialogDescription>
        </DialogHeader>
        {web.installed && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-3 text-sm text-emerald-200">Lattice is installed on this device. You can still explore other installation options.</p>}
        {device?.os === 'chromeos' && <p className="text-sm leading-6 text-slate-400">On ChromeOS, continue in your browser. Desktop packages below are for other operating systems.</p>}
        <div role="group" aria-label="Installation method" className="grid grid-cols-3 gap-1 rounded-xl bg-slate-800/70 p-1">
          {(['mobile', 'desktop', 'terminal'] as const).map(option => <button key={option} type="button" aria-pressed={mode === option} onClick={() => setMode(option)} className={`min-h-11 rounded-lg px-2 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${mode === option ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'}`}>
            {{ mobile: 'Mobile', desktop: 'Desktop', terminal: 'CLI' }[option]}
          </button>)}
        </div>
        {mode === 'mobile' ? <>
          <div role="group" aria-label="Mobile platform" className="grid grid-cols-2 gap-3">
            {(['ios', 'android'] as const).map(os => <button key={os} type="button" aria-pressed={mobile === os} onClick={() => setMobile(os)} className={`${choiceClass} ${mobile === os ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>{mobileNames[os]}</button>)}
          </div>
          {mobile ? <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-emerald-300">Home-screen app</p>
            <h3 className="mt-3 text-2xl font-semibold">Lattice on {mobileNames[mobile]}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">Open your workspace from your home screen in its own app window. Cloud features need an internet connection.</p>
            {web.installed && mobile === device?.os ? <a href="/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950">Open Lattice</a> : <>
              {mobile === 'android' && device?.os === 'android' && (web.status === 'ready' || web.status === 'prompting') && <button type="button" disabled={web.status === 'prompting'} onClick={() => { void controller.install(); }} className="mt-5 min-h-11 w-full rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60">{web.status === 'prompting' ? 'Follow the browser prompt…' : 'Install on this device'}</button>}
              <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-6 text-slate-300">
                {(mobile === 'ios' ? [
                  'Open Lattice in Safari on your iPhone or iPad.',
                  'Open Share (from the Page Menu if needed), then choose Add to Home Screen.',
                  'Enable Open as Web App if shown, then tap Add.',
                ] : [
                  'Open Lattice in Chrome or another browser that supports app installation. Leave any in-app browser first.',
                  'Open the browser menu and choose Install app or Add to Home screen.',
                  'Confirm, then open Lattice from your home screen.',
                ]).map(step => <li key={step}>{step}</li>)}
              </ol>
              {mobile === 'ios' && <p className="mt-4 text-xs leading-6 text-slate-400">iPhone and iPad installation uses the browser’s Share menu.</p>}
            </>}
            <p role="status" className="mt-3 text-sm leading-6 text-emerald-200">{web.status === 'accepted' ? 'Installation requested. Follow any remaining browser instructions.' : web.status === 'dismissed' ? 'Installation was dismissed. You can use the browser menu when you are ready.' : web.status === 'failed' ? 'The browser could not open installation. Use the menu steps above.' : ''}</p>
          </section> : <p className="py-5 text-sm text-slate-400">Choose iPhone &amp; iPad or Android for installation instructions.</p>}
        </> : <>
          <div role="group" aria-label="Computer operating system" className="grid grid-cols-3 gap-2">
            {(['windows', 'macos', 'linux'] as const).map(os => <button key={os} type="button" aria-pressed={desktop === os} onClick={() => setDesktop(os)} className={`${choiceClass} px-2 ${desktop === os ? 'border-emerald-300/60 bg-emerald-300/10 text-emerald-200' : 'border-slate-700 text-slate-300 hover:border-slate-500'}`}>
              {platformNames[os]}{device?.os === os && <span className="mt-1 block text-[10px] font-normal text-emerald-300">Detected</span>}
            </button>)}
          </div>
          {desktop ? mode === 'desktop' ? desktopPanels[desktop] : terminalPanels[desktop] : <p className="py-5 text-sm leading-6 text-slate-400">Choose an operating system above. You can download for another computer.</p>}
        </>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4 text-sm">
          <a href="/dashboard" className="inline-flex min-h-11 items-center text-emerald-300 hover:underline">Continue in browser →</a>
          <a href="/downloads" className="inline-flex min-h-11 items-center text-slate-400 hover:text-white">All downloads &amp; requirements</a>
        </div>
      </DialogContent>
    </Dialog>
  </InstallContext.Provider>;
}

/** A link remains usable before hydration and when rendered outside the provider. */
export function InstallButton({ children = 'Install Lattice OS', className = '', primary = false }: { children?: ReactNode; className?: string; primary?: boolean }) {
  const install = useContext(InstallContext);
  return <a href="/downloads" data-install-primary={primary ? '' : undefined} aria-haspopup={install ? 'dialog' : undefined} className={className} onClick={event => {
    if (install && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); install.openInstall();
    }
  }}>{children}</a>;
}

export function InstallEntry() {
  const install = useContext(InstallContext);
  const promptMobile = install?.promptMobile;
  useEffect(() => { promptMobile?.(); }, [promptMobile]);
  const device = install?.device;
  const label = install?.installed ? 'View installation options' : device?.mobile ? 'Install on your phone or tablet' : device && isDesktopPlatform(device.os) ? `Get Lattice for ${platformNames[device.os]}` : 'Choose an installation';
  return <section aria-label="Recommended installation" className="mb-10 rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/10 to-slate-900/30 p-6 sm:p-8">
    <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">Lattice, wherever you work</p>
    <h2 className="mt-3 text-3xl font-semibold text-slate-100">{device?.mobile ? 'Your workspace, in your pocket.' : 'Make room for your workspace.'}</h2>
    <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">Choose a home-screen app for your phone or tablet, a desktop package, or developer tools for your terminal.</p>
    <div className="mt-6 flex flex-wrap items-center gap-5">
      <InstallButton primary className="inline-flex min-h-12 items-center rounded-xl bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200">{label}</InstallButton>
      <a href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-slate-300 hover:text-white">Use in browser →</a>
    </div>
  </section>;
}
