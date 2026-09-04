export default function DataSettingsLoading() {
  return (
    <div className="px-4 lg:px-8 space-y-6 pt-6 animate-pulse">
      {/* heading */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded bg-slate-200 dark:bg-white/10" />
        <div className="h-4 w-80 max-w-full rounded bg-slate-200 dark:bg-white/5" />
      </div>
      <div className="h-px w-full bg-slate-200 dark:bg-white/10" />
      {/* import wizard block */}
      <div className="h-40 rounded-xl bg-slate-200 dark:bg-white/5" />
      {/* memory panel block */}
      <div className="h-64 rounded-xl bg-slate-200 dark:bg-white/5" />
      {/* export card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <div className="h-36 rounded-xl bg-slate-200 dark:bg-white/5" />
      </div>
    </div>
  );
}
