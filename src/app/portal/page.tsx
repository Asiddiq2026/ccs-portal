// Razlin AR Portal — the appointed representative's home. Server component:
// resolves the tenant, loads the firm's own data under withTenant (RLS scopes
// every read to the caller's arId), computes the quarter/due-date via the
// deterministic engine, and hands a plain snapshot to the client portal. An AR
// sees ONLY its own firm; an operator previewing must pass ?arId=… (still
// RLS-visible to them network-wide).
import { auth } from "@/auth";
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { AccessPanel } from "@/components/ConsoleShell";
import { RazlinPortal, type PortalSubmission } from "@/components/RazlinPortal";
import { quarterEnd, cf30DueDate, fmt } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Last calendar day of the quarter immediately before `now` (UTC). */
function previousQuarterEndRef(now: Date = new Date()): string {
  const qStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), qStartMonth, 0)).toISOString().slice(0, 10);
}

function quarterLabel(quarterEndIso: string): string {
  const d = new Date(quarterEndIso + "T00:00:00Z");
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `Q${q} ${d.getUTCFullYear()}`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "AR";
  return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

/** "Rachel Bailey" -> "R. Bailey" (design's CPD label style). */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams?: { arId?: string };
}) {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="The Razlin partner portal is restricted to signed-in appointed representatives."
      />
    );
  }

  const session = await auth();
  const displayName = session?.user?.name?.trim() || "Representative";

  // An AR is pinned to its own firm; an operator may preview a named firm.
  const arId = tenant.role === "AR" ? tenant.arId : (searchParams?.arId ?? "").trim();
  if (!arId) {
    return (
      <AccessPanel
        title="Choose a firm"
        body="Operators can preview the portal for a named firm with ?arId=…; an AR is scoped automatically."
      />
    );
  }

  const qEnd = quarterEnd(previousQuarterEndRef());
  const qLabel = quarterLabel(qEnd);
  const qDbLabel = `${qEnd.slice(0, 4)}-Q${Math.floor(new Date(qEnd + "T00:00:00Z").getUTCMonth() / 3) + 1}`;
  const cf30Due = fmt(cf30DueDate(qEnd));

  const data = await withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTx = tx as any;
    const promotions = await anyTx.financialPromotion.findMany({
      where: { arId },
      select: {
        id: true,
        ref: true,
        type: true,
        title: true,
        status: true,
        submittedAt: true,
        reviewerNotes: true,
      },
      orderBy: { submittedAt: "desc" },
      take: 25,
    });
    const firm = await anyTx.appointedRep.findFirst({
      where: { arId },
      select: { legalName: true },
    });
    const cpd = await anyTx.personCpd.findFirst({
      where: { arId },
      select: { person: true, cpdHours: true, required: true },
    });
    const cf30 = await anyTx.cf30Return.findFirst({
      where: { arId, quarter: qDbLabel },
      select: { id: true },
    });
    return { promotions, firm, cpd, cf30 };
  });

  const submissions: PortalSubmission[] = (
    data.promotions as Array<{
      id: string;
      ref: string;
      type: string;
      title: string;
      status: PortalSubmission["status"];
      submittedAt: Date;
      reviewerNotes: string | null;
    }>
  ).map((p) => ({
    id: p.id,
    ref: p.ref,
    type: p.type,
    title: p.title,
    status: p.status,
    submittedAt: p.submittedAt.toISOString(),
    reviewerNotes: p.reviewerNotes,
  }));

  const firmName = (data.firm?.legalName as string | undefined) ?? arId;
  const cpdPerson = (data.cpd?.person as string | undefined) ?? displayName;

  return (
    <RazlinPortal
      firmName={firmName}
      arId={arId}
      personName={displayName}
      personInitials={initialsOf(displayName)}
      role={tenant.role}
      quarterLabel={qLabel}
      cf30Due={cf30Due}
      cf30Filed={Boolean(data.cf30)}
      cpdHours={(data.cpd?.cpdHours as number | undefined) ?? 0}
      cpdRequired={(data.cpd?.required as number | undefined) ?? 35}
      cpdPerson={shortName(cpdPerson)}
      submissions={submissions}
    />
  );
}
