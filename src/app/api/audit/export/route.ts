// GET /api/audit/export — stream the immutable audit trail as CSV for the SMF
// quarterly review and regulator evidence (audit_event is append-only, 6/7-year
// retention). COMPLIANCE / SMF only; the read is network-scoped through
// withTenant so RLS still binds. Optional filters: entity, entityId, from, to
// (ISO timestamps). Rows are emitted oldest-first for a chronological trail.
import { requireTenant } from "@/lib/session";
import { withTenant } from "@/lib/db";
import { auditTrailToCsv, type AuditRow } from "@/lib/fp/audit-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 100_000; // bound the export; a wider window is a paged/offline job.

function parseDate(v: string | null): Date | undefined {
  if (!v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t);
}

export async function GET(req: Request): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  if (tenant.role !== "COMPLIANCE" && tenant.role !== "SMF") {
    return new Response(JSON.stringify({ error: "operators only" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const entity = url.searchParams.get("entity")?.trim() || undefined;
  const entityId = url.searchParams.get("entityId")?.trim() || undefined;
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));

  const tsFilter: Record<string, Date> = {};
  if (from) tsFilter.gte = from;
  if (to) tsFilter.lte = to;

  const where: Record<string, unknown> = {};
  if (entity) where.entity = entity;
  if (entityId) where.entityId = entityId;
  if (from || to) where.ts = tsFilter;

  const rows = (await withTenant(tenant, async (tx) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tx as any).auditEvent.findMany({
      where,
      select: { ts: true, actor: true, action: true, entity: true, entityId: true },
      orderBy: { ts: "asc" },
      take: MAX_ROWS,
    }),
  )) as AuditRow[];

  const csv = auditTrailToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ccs-audit-trail-${stamp}.csv"`,
      // Evidence export: never cache a regulated artifact at an intermediary.
      "cache-control": "no-store",
    },
  });
}
