import { InstallProvider } from "@/components/install/install-provider";
import { DesktopDownloads } from "@/components/desktop-downloads";
import { TerminalInstall } from "@/components/install/terminal-install";

export default function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <InstallProvider
      desktopPanels={{
        windows: <DesktopDownloads platform="windows" compact />,
        macos: <DesktopDownloads platform="macos" compact />,
        linux: <DesktopDownloads platform="linux" compact />,
      }}
      terminalPanels={{
        windows: <TerminalInstall platform="windows" />,
        macos: <TerminalInstall platform="macos" />,
        linux: <TerminalInstall platform="linux" />,
      }}
    >
      <div className="min-h-screen">{children}</div>
    </InstallProvider>
  );
}