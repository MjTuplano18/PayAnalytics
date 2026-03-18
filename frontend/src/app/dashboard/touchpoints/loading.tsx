import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="px-4 sm:px-8 py-8 min-h-screen">
      <Skeleton className="h-8 w-64 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-6 bg-card border-border">
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-8 w-24" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-[350px] w-full rounded-xl mb-6" />
      <Skeleton className="h-[300px] w-full rounded-xl" />
    </div>
  );
}
