import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Past this, something is wrong rather than slow, and a wall of grey blocks
 *  with no explanation is indistinguishable from a broken app. */
const SLOW_AFTER_MS = 8000;

export function LoadingScreen() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timeoutId = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-safe">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      {slow && (
        <p className="text-center text-sm text-muted-foreground">
          Still loading… if this doesn't clear, close Munch and reopen it from the chat.
        </p>
      )}
    </div>
  );
}
