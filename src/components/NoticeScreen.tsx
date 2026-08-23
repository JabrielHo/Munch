import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/** A full-screen dead end — hangout not found, or access denied. */
export function NoticeScreen({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="space-y-2">
        <div className="font-display text-3xl font-semibold">Munch 🎉</div>
        <p className="text-muted-foreground">{message}</p>
      </div>
      <Button asChild variant="outline" size="lg" className="w-full">
        <Link to="/">What is Munch?</Link>
      </Button>
    </div>
  );
}
