export default function SettingsLoading() {
  return (
    <div>
      {/* heading */}
      <div className="px-4 lg:px-8 pt-6 pb-4 space-y-2 animate-pulse">
        <div className="h-8 w-40 rounded bg-slate-200 dark:bg-white/10" />
        <div className="h-4 w-96 max-w-full rounded bg-slate-200 dark:bg-white/5" />
      </div>

      <div className="px-4 lg:px-8 space-y-6 pb-20 md:pb-0 animate-pulse">
        {/* credits tile */}
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        {/* membership tile */}
        <div className="h-44 rounded-xl bg-slate-200 dark:bg-white/5" />
        {/* slack tile */}
        <div className="h-20 rounded-xl bg-slate-200 dark:bg-white/5" />
        {/* vault + data nav tiles */}
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        {/* digest tile */}
        <div className="h-20 rounded-xl bg-slate-200 dark:bg-white/5" />
        {/* provider keys grid */}
        <div className="rounded-xl bg-slate-200 dark:bg-white/5 p-6 space-y-4">
          <div className="h-5 w-44 rounded bg-slate-300 dark:bg-white/10" />
          <div className="grid gap-4">
            <div className="h-28 rounded-lg bg-slate-300/60 dark:bg-white/5" />
            <div className="h-28 rounded-lg bg-slate-300/60 dark:bg-white/5" />
            <div className="h-28 rounded-lg bg-slate-300/60 dark:bg-white/5" />
          </div>
        </div>
        {/* integrations grid */}
        <div className="rounded-xl bg-slate-200 dark:bg-white/5 p-4 space-y-3">
          <div className="h-5 w-40 rounded bg-slate-300 dark:bg-white/10" />
          <div className="h-16 rounded-lg bg-slate-300/60 dark:bg-white/5" />
          <div className="h-16 rounded-lg bg-slate-300/60 dark:bg-white/5" />
        </div>
      </div>
    </div>
  );
}
