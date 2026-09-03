export default function VaultLoading() {
  return (
    <div className="px-4 lg:px-8 space-y-3 sm:space-y-4 pt-4 animate-pulse">
      <div className="h-9 w-36 rounded bg-slate-200 dark:bg-white/10" />
      <div className="h-10 w-full rounded-lg bg-slate-200 dark:bg-white/5" />
      <div className="flex gap-2 border-b pb-2">
        <div className="h-9 w-16 rounded-lg bg-slate-200 dark:bg-white/10" />
        <div className="h-9 w-20 rounded-lg bg-slate-200 dark:bg-white/10" />
        <div className="h-9 w-24 rounded-lg bg-slate-200 dark:bg-white/10" />
        <div className="h-9 w-20 rounded-lg bg-slate-200 dark:bg-white/10" />
      </div>
      <div className="space-y-3 pt-2">
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-white/5" />
      </div>
    </div>
  );
}
