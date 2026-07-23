// The Sign-Off Queue — the human decision surface that closes the core loop.
// Server component: reads PENDING drafts under withTenant (RLS-scoped), renders
// them, and lets an SMF sign each off (→ FINAL register row) or return it. The
// decision itself is enforced server-side by /api/signoff/:id/decide; this page
// only reveals the controls to SMF.
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { SignOffDecideForm } from "@/components/SignOffDecideForm";
import { SignOffPayloadInspect } from "@/components/SignOffPayloadInspect";
import { isMaterialisable } from "@/lib/signoff/register-schemas";
import { isArtifact } from "@/lib/signoff/artifacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueueRow {
  id: string;
  register: string;
  arId: string;
  summary: string;
  agentId: string | null;
  createdBy: string;
  createdAt: Date;
  payload: unknown;
}

function ageHours(from: Date): number {
  return Math.max(0, Math.floor((Date.now() - from.getTime()) / 3_600_000));
}

function bandColor(h: number): string {
  if (h > 48) return "text-status-danger";
  if (h > 24) return "text-status-warn";
  return "text-status-success";
}

export default async function SignOffQueuePage() {
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
        body="The sign-off queue is visible to COMPLIANCE and SMF. Appointed-representative users do not have access."
      />
    );
  }

  const rows = (await withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (tx as any).signOffItem.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  })) as QueueRow[];

  const canDecide = tenant.role === "SMF";

  return (
    <ConsoleShell role={tenant.role} active="/signoff">
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-xl">Sign-Off Queue</h2>
          <p className="text-sm text-text-secondary mt-1">
            Agents draft; humans decide. A draft becomes a FINAL register row only when an SMF
            signs it off. Target turnaround &lt; 48h.
          </p>
        </div>
        <span className="font-mono text-xs text-text-muted">{rows.length} PENDING</span>
      </div>

      {rows.length === 0 ? (
        <div className="border border-border bg-card p-8 text-center text-text-secondary">
          The queue is empty — no drafts awaiting sign-off.
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => {
            const h = ageHours(r.createdAt);
            const artifact = isArtifact(r.register);
            const materialisable = artifact || isMaterialisable(r.register);
            return (
              <li key={r.id} className="border border-border bg-card shadow-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wide px-2 py-0.5 bg-panel border border-border">
                        {r.register}
                      </span>
                      <span className="font-mono text-[10px] text-text-muted">{r.arId}</span>
                      {r.agentId && (
                        <span className="font-mono text-[10px] text-status-info">{r.agentId}</span>
                      )}
                    </div>
                    <p className="mt-2 text-sm font-body">{r.summary}</p>
                    <p className="mt-1 font-mono text-[10px] text-text-muted">
                      drafted by {r.createdBy} · {new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <span className={"font-mono text-xs whitespace-nowrap " + bandColor(h)}>
                    {h}h old
                  </span>
                </div>

                {artifact && (
                  <p className="mt-2 text-xs text-accent">
                    Approval-only pack: signing off acknowledges it as complete and writes NO FINAL
                    register row.
                  </p>
                )}
                {!materialisable && (
                  <p className="mt-2 text-xs text-status-warn">
                    Note: “{r.register}” is not materialisable via the generic queue; a sign-off
                    attempt will be refused. Route this through its dedicated channel.
                  </p>
                )}

                <SignOffPayloadInspect
                  register={r.register}
                  arId={r.arId}
                  summary={r.summary}
                  payload={r.payload}
                />

                <SignOffDecideForm draftId={r.id} canDecide={canDecide} />
              </li>
            );
          })}
        </ul>
      )}
    </ConsoleShell>
  );
}
