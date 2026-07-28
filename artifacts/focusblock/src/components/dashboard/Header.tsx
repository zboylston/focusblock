import { Link } from "wouter";

const logoMark = `${import.meta.env.BASE_URL}logo-mark.png`;

export function Header() {
  return (
    <header className="w-full bg-background/80 backdrop-blur-sm border-b border-border px-8 py-5 flex items-center justify-between sticky top-0 z-10">
      <Link
        href="/"
        className="flex items-center gap-2.5 group"
      >
        <img src={logoMark} alt="FocusBlock logo" className="w-[20px] h-[20px]" />
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
