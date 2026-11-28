export default function PartnerKeysLoading() {
  return (
    <div className="p-4 sm:p-8 max-w-4xl space-y-4 sm:space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-56 rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-4 w-72 max-w-full rounded bg-slate-200 dark:bg-white/5" />
        </div>
        <div className="h-10 w-28 rounded bg-slate-200 dark:bg-white/10" />
      </div>
      <div className="space-y-3">
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
      </div>
    </div>
  );
}
