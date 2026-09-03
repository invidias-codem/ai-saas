// Chat-page skeleton rendered instantly while the server component
// resolves conversation + messages (prevents perceived navigation stall).
export default function ConversationLoading() {
  return (
    <div className="flex h-full flex-col p-4 md:p-6 gap-4 animate-pulse">
      {/* header strip */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-slate-200 dark:bg-white/10" />
        <div className="space-y-2">
          <div className="h-3.5 w-40 rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-3 w-24 rounded bg-slate-200 dark:bg-white/5" />
        </div>
      </div>

      {/* message feed lines */}
      <div className="flex-1 space-y-4 overflow-hidden pt-2">
        <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-white/10 md:ml-auto md:max-w-md" />
        <div className="h-3.5 w-1/2 rounded bg-slate-200 dark:bg-white/5" />
        <div className="h-3.5 w-3/5 rounded bg-slate-200 dark:bg-white/5" />
        <div className="h-3.5 w-1/2 rounded bg-slate-200 dark:bg-white/10 md:ml-auto md:max-w-md" />
        <div className="h-3.5 w-2/5 rounded bg-slate-200 dark:bg-white/5" />
      </div>

      {/* composer */}
      <div className="h-12 rounded-xl bg-slate-200 dark:bg-white/10" />
    </div>
  );
}
