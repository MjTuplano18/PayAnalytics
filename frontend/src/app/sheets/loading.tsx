export default function SheetsLoading() {
  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-40 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-72 rounded bg-gray-200 dark:bg-white/10" />
        <div className="h-[60vh] rounded-lg border border-border bg-gray-100 dark:bg-white/5" />
      </div>
    </div>
  );
}
