import { Clock } from "lucide-react";

export function Header() {
  return (
    <header className="w-full bg-background/80 backdrop-blur-sm border-b border-border px-8 py-5 flex items-center gap-2.5 sticky top-0 z-10">
      <Clock className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
      <h1 className="text-base font-medium tracking-[0.16em] text-foreground/90">
        FocusBlock
      </h1>
    </header>
  );
}
