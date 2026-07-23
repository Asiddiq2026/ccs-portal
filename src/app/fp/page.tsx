// Financial Promotions review — the operator surface over the FP channel
// (Phase 4 submission + Phase 5 AI review). Server component: lists promotions
// (PENDING first) under withTenant with their COBS 4 checklist and WORM document
// manifest. An SMF adopts/rejects; COMPLIANCE may run the advisory AI review.
import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { FpReviewPanel } from "@/components/FpReviewPanel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CobsItem {
  label: string;
  checked: boolean;
}
interface DocRow {
  id: string;
  name: string;
  size: number;
  sha256: string;
}
interface FpRow {
  id: string;
  ref: string;
  arId: string;
  type: string;
  title: string;
  audience: string;
  cobs: CobsItem[];
  status: "PENDING" | "ADOPTED" | "REJECTED";
  submittedBy: string;
  submittedAt: Date;
  reviewerNotes: string | null;
  documents: DocRow[];
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-status-warn border-status-warn",
  ADOPTED: "text-status-success border-status-success",
  REJECTED: "text-status-danger border-status-danger",
};

export default async function FpReviewPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="This console is restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="Financial-promotion review is visible to COMPLIANCE and SMF. Appointed representatives submit through the AR portal."
      />
    );
  }

  const rows = (await withTenant(tenant, async (tx) => {
    return tx.financialPromotion.findMany({
      include: { documents: { select: { id: true, name: true, size: true, sha256: true } } },
      orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    });
  })) as unknown as FpRow[];

  const canDecide = tenant.role === "SMF";
  const pending = rows.filter((r) => r.status === "PENDING").length;

  return (
    <ConsoleShell role={tenant.role} active="/fp">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-xl">Financial Promotions</h2>
          <p className="text-sm text-text-secondary mt-1">
            COBS 4 review. The AI verdict is advisory; an SMF Adopt/Reject is the sole authority.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/fp/submit"
            className="text-sm font-semibold text-accent border border-accent px-3 py-1.5 hover:bg-accent hover:text-white"
          >
            Submit on behalf
          </Link>
          <span className="font-mono text-xs text-text-muted">{pending} PENDING</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-border bg-card p-8 text-center text-text-secondary">
          No promotions submitted yet.
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="border border-border bg-card shadow-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-semibold">{r.ref}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 bg-panel border border-border">
                      {r.type}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">{r.arId}</span>
                  </div>
                  <p className="mt-2 text-sm font-body font-semibold">{r.title}</p>
                  <p className="font-mono text-[10px] text-text-muted mt-0.5">
                    audience: {r.audience} · submitted by {r.submittedBy} ·{" "}
                    {new Date(r.submittedAt).toISOString().slice(0, 10)}
                  </p>
                </div>
                <span
                  className={
                    "font-mono text-[10px] px-2 py-1 border whitespace-nowrap " +
                    (STATUS_TONE[r.status] ?? "text-text border-border")
                  }
                >
                  {r.status}
                </span>
              </div>

              {/* COBS 4 checklist */}
              <div className="mt-3">
                <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1">
                  COBS 4 checklist
                </p>
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                  {r.cobs.map((c, i) => (
                    <li key={i} className="text-xs flex items-start gap-2">
                      <span className={c.checked ? "text-status-success" : "text-text-muted"}>
                        {c.checked ? "[x]" : "[ ]"}
                      </span>
                      <span className={c.checked ? "text-text-secondary" : "text-text-muted"}>
                        {c.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* WORM document manifest */}
              {r.documents.length > 0 && (
                <div className="mt-3">
                  <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1">
                    Documents (WORM · SHA-256)
                  </p>
                  <ul className="space-y-1">
                    {r.documents.map((d) => (
                      <li key={d.id} className="font-mono text-[10px] text-text-secondary flex gap-2">
                        <span className="truncate max-w-[16rem]">{d.name}</span>
                        <span className="text-text-muted">{(d.size / 1024).toFixed(1)}kB</span>
                        <span className="text-text-muted truncate">{d.sha256.slice(0, 16)}…</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {r.reviewerNotes && (
                <p className="mt-2 text-xs text-status-danger">
                  Reviewer notes: {r.reviewerNotes}
                </p>
              )}

              {r.status === "PENDING" && <FpReviewPanel id={r.id} canDecide={canDecide} />}
            </li>
          ))}
        </ul>
      )}
    </ConsoleShell>
  );
}
