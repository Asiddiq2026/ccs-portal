"use client";

// Backend & Data Infrastructure — a read-only architecture inspection for
// operators (COMPLIANCE/SMF). It renders REAL platform facts: the actual API
// tool surface (callable vs withheld vs reserved, straight from TOOL_REGISTRY /
// WITHHELD_TOOLS / RESERVED_TOOLS), the Postgres register tables with their
// live row counts and the verbatim RLS policy from prisma/rls.sql, the WORM
// document manifest, and the append-only audit trail. Nothing here writes; the
// server page loaded every count under withTenant so RLS scoped the reads.
import { useState } from "react";

export type ToolKind = "READ" | "WRITE" | "EGRESS" | "COMPUTE";
export type CallableTool = { name: string; kind: ToolKind; desc: string };
export type TableInfo = {
  table: string;
  model: string;
  scope: "per-AR" | "network";
  rows: number;
  retention: string;
  policyName: string;
  policy: string;
  columns: string[];
  appendOnly: boolean;
};
export type AuditRow = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  ts: string;
};
export type WormDoc = { name: string; size: number; sha256: string; uploadedAt: string };

export type InfraProps = {
  role: string;
  tables: TableInfo[];
  callable: CallableTool[];
  withheld: string[];
  reserved: string[];
  stats: {
    totalRows: number;
    pendingSignoff: number;
    toolDenied: number;
    auditRows: number;
    agentRuns: number;
    wormDocs: number;
  };
  recentAudit: AuditRow[];
  wormDocs: WormDoc[];
};

const KIND_TONE: Record<ToolKind, { fg: string; bg: string }> = {
  READ: { fg: "#1D4ED8", bg: "rgba(29,78,216,0.09)" },
  WRITE: { fg: "#B45309", bg: "rgba(180,83,9,0.10)" },
  EGRESS: { fg: "#7E22CE", bg: "rgba(126,34,206,0.10)" },
  COMPUTE: { fg: "#0E7490", bg: "rgba(14,116,144,0.09)" },
};

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
}

function Stat({ label, value, sub, tone = "text-text" }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="border border-border bg-card shadow-card p-4">
      <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className={"font-heading font-bold text-2xl mt-1 " + tone}>{value}</p>
      <p className="text-xs text-text-secondary mt-1">{sub}</p>
    </div>
  );
}

/** The 5-tier request path — matches the design handoff. Presentational only. */
const TIERS = [
  { n: "1", label: "Next.js route / server action", note: "requireTenant() resolves session → role + arId; fail-closed on no session." },
  { n: "2", label: "API tool gateway", note: "Single choke point (Invariant 1). Withheld → 403 · whitelist → reserved 501 · dispatch." },
  { n: "3", label: "Tool (Zod in / Zod out)", note: "Pure services on injected deps. Writes only ever create PENDING sign-off drafts." },
  { n: "4", label: "withTenant() transaction", note: "SET LOCAL app.role / app.ar_id per transaction — carries RLS context as bind params." },
  { n: "5", label: "Postgres as ccs_app (NOBYPASSRLS)", note: "FORCE ROW LEVEL SECURITY; context-less connection matches zero rows." },
];

export function InfraConsole(props: InfraProps) {
  const { role, tables, callable, withheld, reserved, stats, recentAudit, wormDocs } = props;
  const [selected, setSelected] = useState<TableInfo | null>(null);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6">
        <div>
          <h2 className="font-heading font-bold text-xl">Backend &amp; Data Infrastructure</h2>
          <p className="text-sm text-text-secondary mt-1">
            The single writeable path, the RLS-isolated registers, and the append-only audit trail —
            read-only, live from the same database the runtime uses.
          </p>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[1.3px] text-accent px-2.5 py-1 border border-[rgba(8,145,178,0.35)] bg-[rgba(8,145,178,0.07)]">
          {role} · read-only
        </span>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Register rows" value={String(stats.totalRows)} sub="across 8 tenant tables" tone="text-accent" />
        <Stat
          label="Pending sign-off"
          value={String(stats.pendingSignoff)}
          sub="drafts awaiting SMF"
          tone={stats.pendingSignoff > 0 ? "text-status-warn" : "text-text"}
        />
        <Stat
          label="Tool denied"
          value={String(stats.toolDenied)}
          sub="403 · withheld / off-whitelist"
          tone={stats.toolDenied > 0 ? "text-status-danger" : "text-status-success"}
        />
        <Stat label="Audit rows" value={String(stats.auditRows)} sub="append-only · 6yr" tone="text-text" />
      </section>

      {/* Request path */}
      <section className="border border-border bg-card shadow-card p-5 mb-8">
        <h3 className="font-heading font-semibold text-sm mb-1">Request path</h3>
        <p className="text-xs text-text-secondary mb-4">
          Every mutation descends these five tiers. There is no side door: agents draft, humans decide,
          nothing leaves unsigned.
        </p>
        <ol className="space-y-2">
          {TIERS.map((t) => (
            <li key={t.n} className="flex gap-3 items-start">
              <span className="font-mono text-[11px] font-bold text-accent bg-[rgba(8,145,178,0.08)] border border-[rgba(8,145,178,0.25)] w-6 h-6 flex items-center justify-center shrink-0">
                {t.n}
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">{t.label}</p>
                <p className="text-xs text-text-secondary mt-0.5">{t.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Tool surface */}
      <section className="border border-border bg-card shadow-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm">API tool surface</h3>
          <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">
            {callable.length} callable · {withheld.length} withheld · {reserved.length} reserved
          </span>
        </div>

        <div className="grid gap-2 mb-5">
          {callable.map((t) => {
            const tone = KIND_TONE[t.kind];
            return (
              <div key={t.name} className="flex items-center gap-3 border border-border bg-panel px-3 py-2">
                <span
                  className="font-mono text-[9px] font-semibold px-1.5 py-0.5 w-[62px] text-center shrink-0"
                  style={{ color: tone.fg, background: tone.bg }}
                >
                  {t.kind}
                </span>
                <span className="font-mono text-[12px] text-text w-[190px] shrink-0">{t.name}</span>
                <span className="text-xs text-text-secondary">{t.desc}</span>
              </div>
            );
          })}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.05)] p-3">
            <p className="font-mono text-[9px] uppercase tracking-wide text-status-danger mb-2">
              Withheld · 403 · no implementation anywhere
            </p>
            <ul className="space-y-1.5">
              {withheld.map((n) => (
                <li key={n} className="flex items-center gap-2 font-mono text-[12px] text-text">
                  <span className="font-mono text-[9px] font-bold text-status-danger">DENIED</span>
                  <span className="line-through decoration-[rgba(185,28,28,0.6)]">{n}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-text-secondary mt-2 leading-relaxed">
              Invariant 2: these have no entry in TOOL_REGISTRY, so they are genuinely unreachable. The
              gateway also refuses them by name and writes a TOOL DENIED audit row.
            </p>
          </div>
          <div className="border border-[rgba(180,83,9,0.35)] bg-[rgba(180,83,9,0.05)] p-3">
            <p className="font-mono text-[9px] uppercase tracking-wide text-status-warn mb-2">
              Reserved · 501 · declared, unimplemented
            </p>
            {reserved.length === 0 ? (
              <p className="font-mono text-[12px] text-text-secondary">
                None — every declared tool is implemented.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {reserved.map((n) => (
                  <li key={n} className="flex items-center gap-2 font-mono text-[12px] text-text">
                    <span className="font-mono text-[9px] font-bold text-status-warn">501</span>
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-text-secondary mt-2 leading-relaxed">
              A capability gap, not a denial: the gateway’s 501 path fails closed on any reserved
              tool. Retained for future gaps — currently none.
            </p>
          </div>
        </div>
      </section>

      {/* Postgres register tables */}
      <section className="border border-border bg-card shadow-card p-5 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-semibold text-sm">Postgres register tables</h3>
          <span className="font-mono text-[9px] text-text-muted uppercase tracking-wide">
            click a row to inspect RLS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left font-mono text-[9px] uppercase tracking-wide text-text-muted border-b border-border">
                <th className="py-2 pr-3">Table</th>
                <th className="py-2 pr-3">Scope</th>
                <th className="py-2 pr-3 text-right">Rows</th>
                <th className="py-2 pr-3">Retention</th>
                <th className="py-2 pr-3">Access</th>
              </tr>
            </thead>
            <tbody>
              {tables.map((t) => (
                <tr
                  key={t.table}
                  onClick={() => setSelected(t)}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-panel"
                >
                  <td className="py-2 pr-3 font-mono text-[12px] text-text">{t.table}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={
                        "font-mono text-[9px] px-1.5 py-0.5 " +
                        (t.scope === "network"
                          ? "text-status-ai bg-[rgba(126,34,206,0.09)]"
                          : "text-accent bg-[rgba(8,145,178,0.08)]")
                      }
                    >
                      {t.scope}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-[12px] text-text-secondary">{t.rows}</td>
                  <td className="py-2 pr-3 text-xs text-text-secondary">{t.retention}</td>
                  <td className="py-2 pr-3 text-xs text-text-secondary">
                    {t.appendOnly ? "INSERT only (no UPDATE/DELETE)" : "SELECT + draft (PENDING)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* WORM docs + audit trail */}
      <section className="grid lg:grid-cols-2 gap-6 mb-4">
        <div className="border border-border bg-card shadow-card p-5">
          <h3 className="font-heading font-semibold text-sm mb-1">WORM document store</h3>
          <p className="text-xs text-text-secondary mb-3">
            Content-addressed by SHA-256, immutability policy ON. The DB holds only the manifest, never
            the bytes ({stats.wormDocs} objects).
          </p>
          {wormDocs.length === 0 ? (
            <p className="text-sm text-text-secondary">No documents stored yet.</p>
          ) : (
            <ul className="space-y-2">
              {wormDocs.map((d) => (
                <li key={d.sha256} className="border border-border bg-panel px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{d.name}</span>
                    <span className="font-mono text-[10px] text-text-muted shrink-0">{fmtBytes(d.size)}</span>
                  </div>
                  <p className="font-mono text-[10px] text-text-muted mt-1 truncate">
                    sha256:{d.sha256.slice(0, 24)}… · {fmtTs(d.uploadedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-border bg-card shadow-card p-5">
          <h3 className="font-heading font-semibold text-sm mb-1">Audit trail</h3>
          <p className="text-xs text-text-secondary mb-3">
            Append-only (Invariant 4). No UPDATE/DELETE grant; rows chain via hash_prev for tamper
            evidence. Newest {recentAudit.length} shown.
          </p>
          {recentAudit.length === 0 ? (
            <p className="text-sm text-text-secondary">No audit events yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentAudit.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-text-muted w-[104px] shrink-0">{fmtTs(a.ts)}</span>
                  <span
                    className={
                      "font-mono text-[10px] px-1.5 py-0.5 shrink-0 " +
                      (a.action === "TOOL DENIED"
                        ? "text-status-danger bg-[rgba(185,28,28,0.07)]"
                        : "text-text-secondary bg-panel")
                    }
                  >
                    {a.action}
                  </span>
                  <span className="text-text-secondary truncate">
                    {a.actor} → {a.entity}
                    {a.entityId ? `:${a.entityId}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <p className="font-mono text-[9px] text-text-muted">
        counts read live under withTenant() · role {role} sees the network · policies verbatim from
        prisma/rls.sql
      </p>

      {/* Table-detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(16,24,40,0.55)]"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-card border border-border shadow-card max-w-2xl w-full max-h-[86vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[1.3px] text-text-muted mb-1">
                  {selected.scope} register · {selected.model}
                </p>
                <h4 className="font-heading font-bold text-lg font-mono">{selected.table}</h4>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="font-mono text-xs text-text-muted hover:text-text border border-border px-2 py-1"
              >
                close
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-border bg-panel p-3">
                  <p className="font-mono text-[9px] uppercase text-text-muted">Live rows</p>
                  <p className="font-heading font-bold text-xl mt-0.5 text-accent">{selected.rows}</p>
                </div>
                <div className="border border-border bg-panel p-3">
                  <p className="font-mono text-[9px] uppercase text-text-muted">Retention</p>
                  <p className="text-sm mt-1">{selected.retention}</p>
                </div>
                <div className="border border-border bg-panel p-3">
                  <p className="font-mono text-[9px] uppercase text-text-muted">Access</p>
                  <p className="text-sm mt-1">{selected.appendOnly ? "INSERT only" : "SELECT + draft"}</p>
                </div>
              </div>

              <div>
                <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-2">Columns</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.columns.map((c) => (
                    <span key={c} className="font-mono text-[11px] text-text-secondary border border-border bg-panel px-1.5 py-0.5">
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-2">
                  RLS policy · {selected.policyName} (prisma/rls.sql)
                </p>
                <pre className="bg-[#0F172A] text-[#A3E635] text-[11px] leading-relaxed font-mono p-4 overflow-x-auto whitespace-pre-wrap">
                  {selected.policy}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
