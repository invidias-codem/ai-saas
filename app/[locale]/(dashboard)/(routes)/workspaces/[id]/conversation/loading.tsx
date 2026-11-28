// Minimal spinner for the workspace conversation resolver route.
// This page is a pure server redirect; the spinner only shows on slow DB.
export default function WorkspaceConversationLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary motion-safe:animate-spin" />
    </div>
  );
}
