import { LandingNavbar } from "@/components/landing/navbar";
import { LandingFooter } from "@/components/landing/footer";
import { DesktopDownloads } from "@/components/desktop-downloads";
import { InstallProvider } from "@/components/install/install-provider";
import { TerminalInstall } from "@/components/install/terminal-install";

export default function MarketingLayout({
    children
}: {
    children: React.ReactNode;
}) {
  return (
    <InstallProvider
      desktopPanels={{ windows: <DesktopDownloads platform="windows" compact />, macos: <DesktopDownloads platform="macos" compact />, linux: <DesktopDownloads platform="linux" compact /> }}
      terminalPanels={{ windows: <TerminalInstall platform="windows" />, macos: <TerminalInstall platform="macos" />, linux: <TerminalInstall platform="linux" /> }}
    >
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <a href="#main-content" className="sr-only z-[60] rounded-lg bg-card p-3 text-primary focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
          Skip to content
        </a>
        <LandingNavbar />
        <div id="main-content" tabIndex={-1} className="min-w-0 flex-1 scroll-mt-16">{children}</div>
        <LandingFooter />
      </div>
    </InstallProvider>
  );
}
