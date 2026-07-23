// Pure CSV export of an immutable audit trail (Phase 4 verify step). No I/O —
// callers fetch the rows (network-scoped read) and stream the string out. RFC
// 4180 quoting so values containing commas, quotes or newlines round-trip.

export interface AuditRow {
  ts: Date | string;
  actor: string;
  action: string;
  entity: string;
  entityId?: string | null;
}

const HEADER = ["timestamp", "actor", "action", "entity", "entity_id"] as const;

function csvCell(value: string): string {
  // Quote if the cell contains a delimiter, quote, CR or LF; double embedded quotes.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toIso(ts: Date | string): string {
  return ts instanceof Date ? ts.toISOString() : new Date(ts).toISOString();
}

/** Render audit rows as a CSV document (header + one line per row, CRLF). */
export function auditTrailToCsv(rows: readonly AuditRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push(
      [toIso(r.ts), r.actor, r.action, r.entity, r.entityId ?? ""]
        .map((c) => csvCell(String(c)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}
