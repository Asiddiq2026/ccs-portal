// AR submission screen for the Financial Promotions channel. Standalone chrome
// (not the operator ConsoleShell) because an AR is the submitter, not an
// operator. Any authenticated role may submit: an AR for its own firm;
// COMPLIANCE/SMF on behalf of a named firm. The heavy lifting (multipart parse,
// WORM storage, PENDING create + audit) lives behind POST /api/fp.
import Link from "next/link";
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { AccessPanel } from "@/components/ConsoleShell";
import { FpSubmitForm } from "@/components/FpSubmitForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MinePromotion {
  id: string;
  ref: string;
  type: string;
  title: string;
  status: "PENDING" | "ADOPTED" | "REJECTED";
  submittedAt: Date;
  reviewerNotes: string | null;
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-status-warn border-status-warn",
  ADOPTED: "text-status-success border-status-success",
  REJECTED: "text-status-danger border-status-danger",
};

export default async function FpSubmitPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="Financial-promotion submission is restricted to signed-in appointed representatives and CCS operators."
      />
    );
  }

  const isOperator = tenant.role === "COMPLIANCE" || tenant.role === "SMF";

  // An AR sees the status of their own submissions (RLS scopes the read to their
  // firm). Operators use the /fp review queue, so we skip the list for them.
  const mine: MinePromotion[] = isOperator
    ? []
    : ((await withTenant(tenant, async (tx) =>
        tx.financialPromotion.findMany({
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
        }),
      )) as unknown as MinePromotion[]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-text-muted">
              Comprehensive Compliance Solutions
            </p>
            <h1 className="font-heading font-bold text-lg leading-tight">
              Submit a Financial Promotion
            </h1>
          </div>
          <span className="font-mono text-[10px] tracking-wide px-2 py-1 border border-border text-text-secondary">
            {tenant.role}
            {tenant.arId ? ` · ${tenant.arId}` : ""}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        <p className="text-sm text-text-secondary mb-6">
          Submit a promotion for COBS 4 review. It is held <strong>PENDING</strong> until an SMF
          adopts or rejects it — nothing is published on submission. Documents are stored
          write-once (WORM) and addressed by SHA-256.
          {isOperator && (
            <>
              {" "}
              <Link href="/fp" className="text-accent underline">
                Back to the review queue
              </Link>
              .
            </>
          )}
        </p>

        <div className="border border-border bg-card shadow-card p-6">
          <FpSubmitForm role={tenant.role} arId={tenant.arId} />
        </div>

        {!isOperator && (
          <section className="mt-8">
            <h2 className="font-heading font-semibold text-sm mb-3">Your submissions</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No submissions yet. Once you submit, its review status appears here.
              </p>
            ) : (
              <ul className="space-y-2">
                {mine.map((p) => (
                  <li
                    key={p.id}
                    className="border border-border bg-card shadow-card p-3 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{p.ref}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wide px-1.5 py-0.5 bg-panel border border-border">
                          {p.type}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-body">{p.title}</p>
                      <p className="font-mono text-[10px] text-text-muted mt-0.5">
                        submitted {new Date(p.submittedAt).toISOString().slice(0, 10)}
                      </p>
                      {p.status === "REJECTED" && p.reviewerNotes && (
                        <p className="mt-1 text-xs text-status-danger">
                          Reviewer notes: {p.reviewerNotes}
                        </p>
                      )}
                    </div>
                    <span
                      className={
                        "font-mono text-[10px] px-2 py-1 border whitespace-nowrap " +
                        (STATUS_TONE[p.status] ?? "text-text border-border")
                      }
                    >
                      {p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
