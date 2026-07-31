// Role-aware landing. Routes each signed-in principal to the surface they can
// actually use: an AR to the submission screen (its only surface); COMPLIANCE /
// SMF to the operator console. Unauthenticated visitors see the sign-in card.
// Server component — reads the session directly; no client JS.
import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { PRINCIPAL } from "@/lib/principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Dest {
  href: string;
  label: string;
  primary?: boolean;
}

function destsFor(role: string): Dest[] {
  if (role === "AR") {
    return [
      { href: "/portal", label: `Open the ${PRINCIPAL.shortName} Partner Portal`, primary: true },
      { href: "/fp/submit", label: "Submit a Financial Promotion" },
    ];
  }
  // COMPLIANCE / SMF operators.
  return [
    { href: "/signoff", label: "Sign-Off Queue", primary: true },
    { href: "/fp", label: "Financial Promotions" },
    { href: "/agents", label: "Agents" },
    { href: "/monitoring", label: "Go-Live Monitoring" },
  ];
}

export default async function Home() {
  let tenant: { role: string; arId: string } | null = null;
  try {
    tenant = await requireTenant();
  } catch {
    tenant = null;
  }

  const dests = tenant ? destsFor(tenant.role) : [];

  return (
    <main className="min-h-screen bg-bg text-text flex items-center justify-center p-8">
      <div className="bg-card border border-border shadow-card max-w-lg w-full p-8">
        <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted mb-2">
          Comprehensive Compliance Solutions
        </p>
        <h1 className="font-heading font-bold text-2xl text-text mb-3">
          CCS AR Oversight Platform
        </h1>
        <p className="font-body text-sm text-text-secondary leading-relaxed">
          Compliance operator console. Agents draft; humans decide; nothing leaves unsigned.
        </p>

        {tenant ? (
          <>
            <p className="font-mono text-[10px] text-text-muted mt-4">
              Signed in as {tenant.role}
              {tenant.arId ? ` · ${tenant.arId}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {dests.map((d) => (
                <Link
                  key={d.href}
                  href={d.href}
                  className={
                    "px-4 py-2 text-sm font-semibold " +
                    (d.primary
                      ? "text-white bg-accent hover:bg-accent-hover"
                      : "text-accent border border-accent hover:bg-accent hover:text-white")
                  }
                >
                  {d.label}
                </Link>
              ))}
            </div>
          </>
        ) : (
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
        )}

        <div className="mt-6 h-[2px] w-full bg-accent" />
      </div>
    </main>
  );
}
