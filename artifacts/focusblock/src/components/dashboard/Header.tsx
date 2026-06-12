import { Clock } from "lucide-react";

export function Header() {
  return (
    <header className="w-full bg-card border-b border-border px-6 py-4 flex items-center gap-2 sticky top-0 z-10">
      <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground">
        <Clock className="w-5 h-5" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">FocusBlock</h1>
    </header>
  );
}
