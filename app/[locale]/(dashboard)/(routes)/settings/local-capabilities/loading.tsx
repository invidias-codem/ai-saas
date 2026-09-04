export default function LocalCapabilitiesLoading() {
  return (
    <div className="min-h-screen px-3 sm:px-4 md:px-10 lg:px-16 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-6 w-32 rounded-full bg-slate-200 dark:bg-white/10" />
        <div className="h-9 w-96 max-w-full rounded bg-slate-200 dark:bg-white/10" />
        <div className="h-4 w-2/3 max-w-md rounded bg-slate-200 dark:bg-white/5" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        <div className="h-32 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-32 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-32 rounded-xl bg-slate-200 dark:bg-white/5" />
      </div>
      <div className="h-64 rounded-xl bg-slate-200 dark:bg-white/5" />
    </div>
  );
}
