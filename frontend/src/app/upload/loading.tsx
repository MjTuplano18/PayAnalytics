import { Skeleton } from "@/components/ui/skeleton";

export default function UploadLoading() {
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <Skeleton className="h-8 w-40" />

      {/* Upload area skeleton */}
      <div className="rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 p-12 flex flex-col items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}
