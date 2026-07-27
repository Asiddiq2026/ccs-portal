// Shared chrome for the internal CCS operator console (COMPLIANCE / SMF). Pure
// presentational server component — the pages pass the signed-in role and which
// tab is active. Matches the design handoff: a sticky 62px blurred header with
// the CCS Shard mark, a 238px white left sidebar with a 2px accent left-border
// active state, on the CCS light theme tokens from tailwind.config.ts.
import Link from "next/link";

const NAV_SECTIONS = [
  {
    label: "Oversight",
    items: [
      { href: "/ars", label: "AR Register" },
      { href: "/signoff", label: "Sign-Off Queue" },
      { href: "/fp", label: "Financial Promotions" },
      { href: "/breaches", label: "Data Breaches" },
      { href: "/cpd", label: "CPD & Certification" },
      { href: "/risk", label: "AR Risk Scoring" },
      { href: "/agents", label: "Agents" },
      { href: "/monitoring", label: "Go-Live Monitoring" },
    ],
  },
  {
    label: "Diagnostics",
    items: [
      { href: "/engine", label: "Deterministic Engine" },
      { href: "/infra", label: "Backend & Data" },
    ],
  },
] as const;

type TabHref = (typeof NAV_SECTIONS)[number]["items"][number]["href"];

/** The CCS Shard mark (from the design handoff). Inline SVG so gradients ship. */
function ShardMark() {
  return (
    <svg
      width="24"
      height="31"
      viewBox="0 0 64 84"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="CCS Shard"
      style={{ filter: "drop-shadow(0 0 3px rgba(101,163,13,.35))" }}
    >
      <defs>
        <linearGradient id="sFaceL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#155E75" />
          <stop offset="1" stopColor="#06B6D4" stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id="sFaceR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0891B2" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id="sApex" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A3E635" />
          <stop offset="1" stopColor="#84CC16" />
        </linearGradient>
      </defs>
      <polygon points="32,12 32,74 15,74" fill="url(#sFaceL)" />
      <polygon points="32,12 49,74 32,74" fill="url(#sFaceR)" />
      <polygon points="32,2 35,15 29,15" fill="url(#sApex)" />
      <polygon points="27,9 30,20 23,20" fill="#0891B2" />
      <polygon points="37,7 40,22 34,22" fill="#155E75" />
      <line x1="32" y1="12" x2="32" y2="74" stroke="#22D3EE" strokeWidth="0.9" opacity="0.85" />
      <g stroke="#22D3EE" strokeWidth="0.6" opacity="0.45">
        <line x1="24" y1="34" x2="32" y2="34" />
        <line x1="22" y1="44" x2="32" y2="44" />
        <line x1="20" y1="54" x2="32" y2="54" />
        <line x1="18" y1="64" x2="32" y2="64" />
      </g>
      <circle cx="32" cy="4" r="2.4" fill="#A3E635" opacity="0.9" />
    </svg>
  );
}

export function ConsoleShell({
  role,
  active,
  children,
}: {
  role: string;
  active: TabHref;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-40 h-[62px] px-[26px] flex items-center justify-between border-b border-border bg-[rgba(255,255,255,0.94)] backdrop-blur-[14px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 pr-[18px] border-r border-border">
            <ShardMark />
            <span className="font-heading font-bold text-[20px] tracking-[5px] text-text pl-0.5">
              CCS
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[12.5px] font-semibold leading-none">AR Oversight Platform</span>
            <span className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mt-[3px]">
              Razlin Ltd · FRN 730805
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-mono text-[8px] tracking-[1.3px] uppercase text-accent px-2.5 py-1 border border-[rgba(8,145,178,0.35)] bg-[rgba(8,145,178,0.07)]">
            <span className="w-[5px] h-[5px] rounded-full bg-status-live" />
            Fail-closed
          </span>
          <span
            className="font-mono text-[9.5px] tracking-wide text-white px-3 py-1.5"
            style={{ background: "linear-gradient(180deg,#0E7490,#155E75)" }}
          >
            {role}
          </span>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: "238px 1fr", minHeight: "calc(100vh - 62px)" }}>
        <aside className="bg-card border-r border-border py-[22px] sticky top-[62px] self-start">
          <nav>
            {NAV_SECTIONS.map((sec) => (
              <div key={sec.label} className="mb-4">
                <div className="font-mono text-[8px] tracking-[2px] uppercase text-text-muted px-[22px] mb-1.5">
                  {sec.label}
                </div>
                {sec.items.map((t) => {
                  const on = t.href === active;
                  return (
                    <Link
                      key={t.href}
                      href={t.href}
                      className={
                        "flex items-center gap-2 px-[22px] py-2 text-sm " +
                        (on
                          ? "text-accent font-semibold bg-[rgba(8,145,178,0.08)] border-l-2 border-accent"
                          : "text-text-secondary hover:text-text border-l-2 border-transparent")
                      }
                    >
                      {on && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
                      <span>{t.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <main className="px-8 py-7 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}

/** Full-page access panel for unauthenticated / non-operator visitors. */
export function AccessPanel({ title, body }: { title: string; body: string }) {
  return (
    <main className="min-h-screen bg-bg text-text flex items-center justify-center p-8">
      <div className="bg-card border border-border shadow-card max-w-lg w-full p-8">
        <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mb-2">
          Comprehensive Compliance Solutions
        </p>
        <h1 className="font-heading font-bold text-xl mb-3">{title}</h1>
        <p className="font-body text-sm text-text-secondary leading-relaxed">{body}</p>
        <div className="mt-6 h-[2px] w-full bg-status-danger" />
      </div>
    </main>
  );
}
