import { Loader2 } from "lucide-react";

export function LoadingSpinner({ className }: { className?: string }) {
  return <Loader2 className={`h-6 w-6 animate-spin text-primary ${className || ''}`} />;
}

export function PageLoader() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <LoadingSpinner className="h-8 w-8" />
    </div>
  );
}
