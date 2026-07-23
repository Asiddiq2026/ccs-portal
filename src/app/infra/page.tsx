// Backend & Data Infrastructure diagnostics — operator-only (COMPLIANCE/SMF)
// read-only inspection of the platform's data plane. Loads live row counts and
// recent append-only rows under withTenant() (RLS scopes the reads; operators
// see the network), and hands the InfraConsole the REAL tool surface straight
// from TOOL_REGISTRY / WITHHELD_TOOLS / RESERVED_TOOLS and the verbatim RLS
// policies from prisma/rls.sql. No writes.
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { ConsoleShell, AccessPanel } from "@/components/ConsoleShell";
import { InfraConsole, type TableInfo, type CallableTool, type AuditRow, type WormDoc } from "@/components/InfraConsole";
import { TOOL_REGISTRY, WITHHELD_TOOLS, RESERVED_TOOLS } from "@/lib/tools/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-line descriptions for the callable tools (the runtime source of truth for
// name + kind is TOOL_REGISTRY; this map only supplies human copy).
const TOOL_DESC: Record<string, string> = {
  query_database: "Scoped register read; RLS applies the caller's arId automatically.",
  write_register_entry: "Proposes a row — always as a PENDING sign-off draft, never a FINAL write.",
  enqueue_for_signoff: "The sole egress. Routes a draft to human sign-off; FINAL only on SMF adoption.",
  compute_dates: "Deterministic date arithmetic from the pure engine (Invariant 7).",
  compute_thresholds: "Deterministic risk / CPD banding from the pure engine.",
  draft_template: "Generates a regulatory draft (SUP15 / ICO Art33 / Principle 11) for review.",
  compile_pack: "Compiles an oversight prep pack as a PENDING sign-off artifact (review_pack).",
  gather_docs: "Assembles a WORM-document evidence pack as a PENDING artifact (evidence_pack).",
  screen_feeds: "Adverse-media / sanctions screening; coded threshold, fail-closed to review.",
};

// Verbatim policy text, mirrored from prisma/rls.sql, parameterised by table.
function perArPolicy(table: string): string {
  return `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "${table}"
  USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  )
  WITH CHECK (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
    OR "arId" = current_setting('app.ar_id', true)
  );`;
}

function networkPolicy(table: string): string {
  return `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;
REVOKE UPDATE, DELETE, TRUNCATE ON "${table}" FROM ccs_app;
CREATE POLICY append_only ON "${table}"
  FOR INSERT WITH CHECK (true);
CREATE POLICY network_read ON "${table}"
  FOR SELECT USING (
    coalesce(current_setting('app.role', true), '') IN ('COMPLIANCE', 'SMF')
  );`;
}

const REG_6YR = "6 yr · SYSC 9";

// Static table metadata (schema-derived). Row counts are filled in at request
// time from the live database under withTenant().
const TABLE_META: Omit<TableInfo, "rows">[] = [
  { table: "appointed_rep", model: "AppointedRep", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("appointed_rep"), appendOnly: false, columns: ["id", "frn", "legal_name", "status", "onboarded_at", "risk_band", "arId"] },
  { table: "cf30_return", model: "Cf30Return", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("cf30_return"), appendOnly: false, columns: ["id", "arId", "quarter", "received_at", "status", "due_date", "exceptions"] },
  { table: "financial_promotion", model: "FinancialPromotion", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("financial_promotion"), appendOnly: false, columns: ["id", "arId", "ref", "type", "title", "audience", "cobs", "status", "submitted_by", "submitted_at", "reviewed_by", "reviewer_notes", "decided_at"] },
  { table: "promotion_document", model: "PromotionDocument", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("promotion_document"), appendOnly: false, columns: ["id", "arId", "promotion_id", "name", "size", "sha256", "blob_url", "uploaded_at"] },
  { table: "risk_score", model: "RiskScore", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("risk_score"), appendOnly: false, columns: ["id", "arId", "factors", "total", "band", "cadence", "computed_at"] },
  { table: "data_breach", model: "DataBreach", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("data_breach"), appendOnly: false, columns: ["id", "arId", "ref", "detected_at", "art33_clock", "status", "severity"] },
  { table: "person_cpd", model: "PersonCpd", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("person_cpd"), appendOnly: false, columns: ["id", "arId", "person", "cpd_hours", "required", "strikes", "cert_expiry"] },
  { table: "sign_off_item", model: "SignOffItem", scope: "per-AR", retention: REG_6YR, policyName: "tenant_isolation", policy: perArPolicy("sign_off_item"), appendOnly: false, columns: ["id", "arId", "register", "payload", "summary", "status", "agent_id", "created_by", "created_at", "decided_by", "decided_at", "register_id", "notes"] },
  { table: "audit_event", model: "AuditEvent", scope: "network", retention: "6 yr · append-only", policyName: "append_only + network_read", policy: networkPolicy("audit_event"), appendOnly: true, columns: ["id", "actor", "action", "entity", "entity_id", "ts", "hash_prev"] },
  { table: "agent_run", model: "AgentRun", scope: "network", retention: "7 yr · append-only", policyName: "append_only + network_read", policy: networkPolicy("agent_run"), appendOnly: true, columns: ["id", "agent_id", "version", "prompt_hash", "input_hash", "tokens", "output", "ts"] },
];

export default async function InfraPage() {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return (
      <AccessPanel
        title="Sign in required"
        body="Backend & data diagnostics are restricted to CCS compliance operators. Sign in to continue."
      />
    );
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return (
      <AccessPanel
        title="Operators only"
        body="The backend & data infrastructure inspection is visible to COMPLIANCE and SMF only."
      />
    );
  }

  const data = await withTenant(tenant, async (tx) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyTx = tx as any;
    const [
      appointedRep,
      cf30Return,
      financialPromotion,
      promotionDocument,
      riskScore,
      dataBreach,
      personCpd,
      signOffItem,
      auditEvent,
      agentRun,
    ] = await Promise.all([
      anyTx.appointedRep.count(),
      anyTx.cf30Return.count(),
      anyTx.financialPromotion.count(),
      anyTx.promotionDocument.count(),
      anyTx.riskScore.count(),
      anyTx.dataBreach.count(),
      anyTx.personCpd.count(),
      anyTx.signOffItem.count(),
      anyTx.auditEvent.count(),
      anyTx.agentRun.count(),
    ]);
    const pendingSignoff = await anyTx.signOffItem.count({ where: { status: "PENDING" } });
    const toolDenied = await anyTx.auditEvent.count({ where: { action: "TOOL DENIED" } });
    const recentAuditRows = await anyTx.auditEvent.findMany({
      select: { id: true, actor: true, action: true, entity: true, entityId: true, ts: true },
      orderBy: { ts: "desc" },
      take: 12,
    });
    const wormRows = await anyTx.promotionDocument.findMany({
      select: { name: true, size: true, sha256: true, uploadedAt: true },
      orderBy: { uploadedAt: "desc" },
      take: 8,
    });
    return {
      counts: {
        appointed_rep: appointedRep,
        cf30_return: cf30Return,
        financial_promotion: financialPromotion,
        promotion_document: promotionDocument,
        risk_score: riskScore,
        data_breach: dataBreach,
        person_cpd: personCpd,
        sign_off_item: signOffItem,
        audit_event: auditEvent,
        agent_run: agentRun,
      } as Record<string, number>,
      pendingSignoff,
      toolDenied,
      recentAuditRows,
      wormRows,
    };
  });

  const tables: TableInfo[] = TABLE_META.map((m) => ({ ...m, rows: data.counts[m.table] ?? 0 }));
  // Register rows = the 8 tenant-isolated tables (excludes the network logs).
  const totalRows = tables
    .filter((t) => t.scope === "per-AR")
    .reduce((sum, t) => sum + t.rows, 0);

  const callable: CallableTool[] = Object.values(TOOL_REGISTRY).map((t) => ({
    name: t.name,
    kind: t.kind,
    desc: TOOL_DESC[t.name] ?? "",
  }));

  const recentAudit: AuditRow[] = (
    data.recentAuditRows as Array<{
      id: string;
      actor: string;
      action: string;
      entity: string;
      entityId: string | null;
      ts: Date;
    }>
  ).map((a) => ({
    id: a.id,
    actor: a.actor,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    ts: a.ts.toISOString(),
  }));

  const wormDocs: WormDoc[] = (
    data.wormRows as Array<{ name: string; size: number; sha256: string; uploadedAt: Date }>
  ).map((d) => ({ name: d.name, size: d.size, sha256: d.sha256, uploadedAt: d.uploadedAt.toISOString() }));

  return (
    <ConsoleShell role={tenant.role} active="/infra">
      <InfraConsole
        role={tenant.role}
        tables={tables}
        callable={callable}
        withheld={[...WITHHELD_TOOLS]}
        reserved={[...RESERVED_TOOLS]}
        stats={{
          totalRows,
          pendingSignoff: data.pendingSignoff,
          toolDenied: data.toolDenied,
          auditRows: data.counts.audit_event ?? 0,
          agentRuns: data.counts.agent_run ?? 0,
          wormDocs: data.counts.promotion_document ?? 0,
        }}
        recentAudit={recentAudit}
        wormDocs={wormDocs}
      />
    </ConsoleShell>
  );
}
