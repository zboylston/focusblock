import { useId } from "react";
import { Link } from "wouter";

function LogoMark() {
  const rawId = useId();
  const maskId = `focusblock-mark-${rawId.replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 32 26"
      aria-hidden="true"
      className="h-5 w-[25px] shrink-0 text-primary"
    >
      <mask id={maskId}>
        <rect width="32" height="26" fill="white" />
        <rect x="2.75" y="2.75" width="26.5" height="6.5" rx="1.35" fill="black" />
      </mask>
      <rect width="32" height="12" rx="4" fill="currentColor" mask={`url(#${maskId})`} />
      <rect y="15" width="14.5" height="11" rx="3.25" fill="currentColor" />
      <rect x="17.5" y="15" width="14.5" height="11" rx="3.25" fill="currentColor" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="w-full bg-background/80 backdrop-blur-sm border-b border-border px-8 py-5 flex items-center justify-between sticky top-0 z-10">
      <Link
        href="/"
        className="flex items-center gap-2 group"
      >
        <LogoMark />
        <span className="text-base font-medium tracking-[0.16em] text-foreground/90 group-hover:text-foreground transition-colors">
          FocusBlock
        </span>
      </Link>
      <Link
        href="/about"
        className="text-xs tracking-[0.12em] text-muted-foreground hover:text-foreground transition-colors"
      >
        about
      </Link>
    </header>
  );
}
