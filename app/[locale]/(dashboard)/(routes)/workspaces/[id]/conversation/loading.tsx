// Minimal spinner for the workspace conversation resolver route.
// This page is a pure server redirect; the spinner only shows on slow DB.
export default function WorkspaceConversationLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 dark:border-white/20 dark:border-t-white" />
    </div>
  );
}
