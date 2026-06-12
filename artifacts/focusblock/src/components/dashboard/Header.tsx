import { Clock } from "lucide-react";
import { useChunksLeft } from "@/hooks/use-chunks-left";

export function Header() {
  const chunksLeft = useChunksLeft();

  return (
    <header className="w-full bg-card border-b border-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
          <Clock className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">FocusBlock</h1>
      </div>
      <div className="text-sm font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-full flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-primary/80 animate-pulse"></div>
        {chunksLeft} work blocks left until 5 PM EST
      </div>
    </header>
  );
}
