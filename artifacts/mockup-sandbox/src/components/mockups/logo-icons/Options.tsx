const sage = {
  bg: "hsl(160 20% 98%)",
  card: "hsl(0 0% 100%)",
  fg: "hsl(160 40% 15%)",
  primary: "hsl(180 30% 35%)",
  border: "hsl(160 15% 88%)",
  muted: "hsl(160 20% 45%)",
};

type IconProps = { size?: number };

function Stacked({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: sage.primary }}>
      <rect x="3" y="3" width="8" height="8" rx="2" fill="currentColor" />
      <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function Grid({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: sage.primary }}>
      <rect x="3" y="3" width="8" height="8" rx="1.6" fill="currentColor" />
      <rect x="13" y="3" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="13" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13" y="13" width="8" height="8" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function TimerBlock({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: sage.primary }}>
      <rect x="3" y="3" width="18" height="18" rx="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12 L12 6.5 A5.5 5.5 0 0 1 17.5 12 Z" fill="currentColor" />
    </svg>
  );
}

function Depth({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: sage.primary }}>
      <rect x="7" y="3" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
      <rect x="3" y="7" width="14" height="14" rx="3.5" fill="currentColor" />
    </svg>
  );
}

function Progress({ size = 40 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ color: sage.primary }}>
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 13 H20 V16 C20 18.2 18.2 20 16 20 H8 C5.8 20 4 18.2 4 16 Z" fill="currentColor" />
    </svg>
  );
}

const OPTIONS = [
  {
    id: "A",
    name: "Stacked",
    Icon: Stacked,
    blurb: "The L-tromino from your sketch — one block over two. Literally \u201CFocusBlock\u201D built from blocks.",
  },
  {
    id: "B",
    name: "Grid",
    Icon: Grid,
    blurb: "Four chunks of the day; one is the active focus block. Nods to the chunk-counting idea.",
  },
  {
    id: "C",
    name: "Timer Block",
    Icon: TimerBlock,
    blurb: "A rounded block with a timer sweep inside — keeps the clock meaning, adds the block shape.",
  },
  {
    id: "D",
    name: "Depth",
    Icon: Depth,
    blurb: "Two offset blocks stacking up — quiet sense of building focus session by session.",
  },
  {
    id: "E",
    name: "Filling",
    Icon: Progress,
    blurb: "A single block filling up as the session progresses. Calm, minimal, one mark.",
  },
];

function HeaderLockup({ Icon }: { Icon: (p: IconProps) => JSX.Element }) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-2"
      style={{ background: "hsla(160,20%,98%,0.7)", border: `1px solid ${sage.border}` }}
    >
      <Icon size={18} />
      <span
        className="text-[15px]"
        style={{ color: sage.fg, letterSpacing: "0.06em", fontWeight: 500 }}
      >
        FocusBlock
      </span>
    </div>
  );
}

export function Options() {
  return (
    <div
      className="min-h-screen w-full px-8 py-10"
      style={{ background: sage.bg, fontFamily: "Inter, system-ui, sans-serif" }}
    >
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <p
          className="mb-1 text-[11px] uppercase"
          style={{ color: sage.muted, letterSpacing: "0.18em" }}
        >
          Logo icon ideas
        </p>
        <h1 className="mb-8 text-2xl" style={{ color: sage.fg, fontWeight: 600 }}>
          Block-themed marks for FocusBlock
        </h1>

        <div className="flex flex-col gap-4">
          {OPTIONS.map(({ id, name, Icon, blurb }) => (
            <div
              key={id}
              className="flex items-center gap-5 rounded-2xl p-5"
              style={{ background: sage.card, border: `1px solid ${sage.border}` }}
            >
              <div
                className="flex h-16 w-16 flex-none items-center justify-center rounded-xl"
                style={{ background: sage.bg, border: `1px solid ${sage.border}` }}
              >
                <Icon size={36} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px]" style={{ color: sage.muted }}>
                    {id}
                  </span>
                  <span className="text-base" style={{ color: sage.fg, fontWeight: 600 }}>
                    {name}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-snug" style={{ color: sage.muted }}>
                  {blurb}
                </p>
              </div>

              <div className="flex-none">
                <HeaderLockup Icon={Icon} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
