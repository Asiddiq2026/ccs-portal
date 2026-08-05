// Role-aware landing. An AR goes to its two surfaces (portal + FP submission).
// Operators get a real overview INSIDE the console shell: live counts of the
// things that need a human today plus every channel — previously this page
// predated the breach/CPD/risk/AR-register consoles and dead-ended at four
// links. Unauthenticated visitors see the sign-in card.
import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { PRINCIPAL } from "@/lib/principal";
import { ConsoleShell } from "@/components/ConsoleShell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = [
  { href: "/signoff", label: "Sign-Off Queue", desc: "Decide pending drafts — the only path to a FINAL register row." },
  { href: "/ars", label: "AR Register", desc: "Status, permissions and lifecycle of the appointed representatives." },
  { href: "/fp", label: "Financial Promotions", desc: "COBS 4 review — AI verdict advisory, SMF Adopt/Reject decides." },
  { href: "/breaches", label: "Data Breaches", desc: "72-hour ICO clock, deterministic severity, notification drafts." },
  { href: "/cpd", label: "CPD & Certification", desc: "Signed-off hours vs training evidence; propose updates from drift." },
  { href: "/risk", label: "AR Risk Scoring", desc: "Coded factor model; assessments become FINAL only on sign-off." },
  { href: "/agents", label: "Agents", desc: "Manual runs; every draft routes to the sign-off queue." },
  { href: "/monitoring", label: "Go-Live Monitoring", desc: "Gates, queue age, fail-closed alerts and model spend." },
] as const;

export default async function Home() {
  let tenant: Awaited<ReturnType<typeof requireTenant>> | null = null;
  try {
    tenant = await requireTenant();
  } catch {
    tenant = null;
  }

  // ---- Unauthenticated: sign-in card --------------------------------------
  if (!tenant) {
    return (
      <main className="min-h-screen bg-bg text-text flex items-center justify-center p-8">
        <div className="bg-card border border-border shadow-card max-w-lg w-full p-8">
          <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mb-2">
            Comprehensive Compliance Solutions
          </p>
          <h1 className="font-heading font-bold text-2xl text-text mb-3">CCS AR Oversight Platform</h1>
          <p className="font-body text-sm text-text-secondary leading-relaxed">
            Compliance operator console. Agents draft; humans decide; nothing leaves unsigned.
          </p>
          <div className="mt-6">
            <Link
              href="/api/auth/signin"
              className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover"
            >
              Sign in
            </Link>
            <p className="font-mono text-[10px] text-text-muted mt-3">
              Access is restricted to appointed representatives and CCS compliance operators.
            </p>
          </div>
          <div className="mt-6 h-[2px] w-full bg-accent" />
        </div>
      </main>
    );
  }

  // ---- AR: partner surfaces only -------------------------------------------
  if (tenant.role === "AR") {
    return (
      <main className="min-h-screen bg-bg text-text flex items-center justify-center p-8">
        <div className="bg-card border border-border shadow-card max-w-lg w-full p-8">
          <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mb-2">
            {PRINCIPAL.legalName}
          </p>
          <h1 className="font-heading font-bold text-2xl text-text mb-3">Partner access</h1>
          <p className="font-mono text-[10px] text-text-muted">
            Signed in as {tenant.role}
            {tenant.arId ? ` · ${tenant.arId}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/portal"
              className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover"
            >
              Open the {PRINCIPAL.shortName} Partner Portal
            </Link>
            <Link
              href="/fp/submit"
              className="px-4 py-2 text-sm font-semibold text-accent border border-accent hover:bg-accent hover:text-white"
            >
              Submit a Financial Promotion
            </Link>
          </div>
          <div className="mt-6 h-[2px] w-full bg-accent" />
        </div>
      </main>
    );
  }

  // ---- Operators: live overview in the shell -------------------------------
  const counts = await withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTx = tx as any;
    const [pendingSignoffs, pendingFp, runs] = await Promise.all([
      anyTx.signOffItem.count({ where: { decidedAt: null } }),
      anyTx.financialPromotion.count({ where: { status: "PENDING" } }),
      anyTx.agentRun.findMany({ select: { output: true }, orderBy: { ts: "desc" }, take: 500 }),
    ]);
    const failClosed = runs.filter(
      (r: { output: unknown }) =>
        (r.output as { verdict?: unknown } | null)?.verdict !== "DRAFT READY",
    ).length;
    return { pendingSignoffs, pendingFp, failClosed };
  });

  const today = [
    {
      href: "/signoff",
      label: "Sign-offs pending",
      value: counts.pendingSignoffs,
      sub: "drafts awaiting a human decision",
      urgent: counts.pendingSignoffs > 0,
    },
    {
      href: "/fp",
      label: "Promotions pending",
      value: counts.pendingFp,
      sub: "COBS 4 reviews open",
      urgent: counts.pendingFp > 0,
    },
    {
      href: "/monitoring",
      label: "Open fail-closed",
      value: counts.failClosed,
      sub: "operator review pending (last 500 runs)",
      urgent: counts.failClosed > 0,
    },
  ];

  return (
    <ConsoleShell role={tenant.role} active={null}>
      <div className="mb-6">
        <h2 className="font-heading font-bold text-xl">Oversight overview</h2>
        <p className="text-sm text-text-secondary mt-1">
          Agents draft; humans decide; nothing leaves unsigned. Start with whatever is waiting on a
          human below.
        </p>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {today.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="border border-border bg-card shadow-card p-4 hover:border-accent"
          >
            <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{t.label}</p>
            <p
              className={
                "font-heading font-bold text-2xl mt-1 " +
                (t.urgent ? "text-status-warn" : "text-status-success")
              }
            >
              {t.value}
            </p>
            <p className="text-xs text-text-secondary mt-1">{t.sub}</p>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {CHANNELS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="border border-border bg-card shadow-card p-4 hover:border-accent"
          >
            <p className="font-heading font-semibold text-sm">{c.label}</p>
            <p className="text-xs text-text-secondary mt-1 leading-relaxed">{c.desc}</p>
          </Link>
        ))}
      </section>

      <p className="font-mono text-[9px] text-text-muted mt-8">
        Diagnostics: <Link href="/engine" className="text-accent">deterministic engine</Link> ·{" "}
        <Link href="/infra" className="text-accent">backend &amp; data</Link>
      </p>
    </ConsoleShell>
  );
}
