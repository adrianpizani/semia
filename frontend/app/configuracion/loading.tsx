import { Skeleton } from "@/components/ui/skeleton"

export default function ConfiguracionLoading() {
  return (
    <div className="flex h-screen flex-col">
      <div className="border-b border-primary/15 bg-primary/[0.07] px-6 py-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <div className="flex-1 overflow-auto bg-amber-50/70 p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-[480px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
