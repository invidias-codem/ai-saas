
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
      <div className="bg-background min-h-screen flex flex-col">
        <LandingNavbar />
        <div className="flex-grow">{children}</div>
        <LandingFooter />
      </div>
    </InstallProvider>
  );
}
