import { Clock } from "lucide-react";
import { Link } from "wouter";

export function Header() {
  return (
    <header className="w-full bg-background/80 backdrop-blur-sm border-b border-border px-8 py-5 flex items-center justify-between sticky top-0 z-10">
      <Link
        href="/"
        className="flex items-center gap-2.5 group"
      >
        <Clock className="w-[18px] h-[18px] text-primary" strokeWidth={1.5} />
        <span className="text-base font-medium tracking-[0.16em] text-foreground/90 group-hover:text-foreground transition-colors">
          FocusBlock
        </span>
      </Link>
      <Link
        href="/about"
        className="rounded-full bg-accent/50 px-3.5 py-1.5 text-xs tracking-[0.12em] uppercase text-accent-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        About
      </Link>
    </header>
  );
}
