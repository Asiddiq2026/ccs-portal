"use client";

// CPD & certification standing. Two numbers sit side by side for each person:
// the SIGNED-OFF register position, and what the training evidence currently
// supports. Where they disagree the register is stale — an operator proposes an
// update, which lands in the sign-off queue as a PENDING draft. Nothing here
// writes the register; only an SMF sign-off does.
import { useState } from "react";
import { toast } from "./Toasts";
import { useRouter } from "next/navigation";

export interface CpdRow {
  arId: string;
  person: string;
  required: number;
  certExpiry: string;
  monthsLeft: number;
  recordedHours: number;
  recordedStrikes: number;
  creditedHours: number;
  derivedStrikes: number;
  drift: boolean;
  modulesPassed: number;
}

export interface CertPack {
  arId: string;
  docs: { name: string; sha256: string; blobUrl: string; size: number }[];
}

export interface CpdConsoleProps {
  role: "AR" | "COMPLIANCE" | "SMF";
  rows: CpdRow[];
  /** Stored certificate manifests per firm (operators only). */
  certPacks?: CertPack[];
}

const STRIKE_TONE = ["text-status-success", "text-status-warn", "text-status-warn", "text-status-danger"];

function strikeLabel(n: number): string {
  return n === 0 ? "None" : `${n} of 3`;
}

export function CpdConsole({ role, rows, certPacks = [] }: CpdConsoleProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOperator = role === "COMPLIANCE" || role === "SMF";
  const drifted = rows.filter((r) => r.drift).length;
  const atRisk = rows.filter((r) => r.derivedStrikes > 0).length;

  async function gatherPack(pack: CertPack) {
    setBusy(`pack:${pack.arId}`);
    setError(null);
    try {
      // Deterministic path through the SAME single writeable surface the agents
      // use: gather_docs via the tool gateway (whitelisted for
      // agent-evidence-packer). No LLM run — the docs are already established
      // WORM manifests. The pack lands PENDING in the sign-off queue as an
      // approve-only artifact (never a register row).
      const res = await fetch("/api/tools/invoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agentId: "agent-evidence-packer",
          tool: "gather_docs",
          input: {
            arId: pack.arId,
            purpose: `CPD training certificates · ${pack.arId} · ${pack.docs.length} document${pack.docs.length === 1 ? "" : "s"}`,
            docs: pack.docs,
          },
        }),
      });
      const data = (await res.json()) as { error?: string; result?: { id: string } };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      toast({
        title: "Evidence pack enqueued",
        sub: `${pack.arId} · ${pack.docs.length} certificate${pack.docs.length === 1 ? "" : "s"} — PENDING in the sign-off queue, approve-only.`,
        tone: "success",
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function propose(r: CpdRow) {
    setBusy(`${r.arId}:${r.person}`);
    setError(null);
    try {
      const res = await fetch("/api/cpd/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arId: r.arId, person: r.person }),
      });
      const data = (await res.json()) as { error?: string; creditedHours?: number };
      if (!res.ok) {
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      toast({
        title: `Proposed ${data.creditedHours}h for ${r.person}`,
        sub: "Now PENDING in the sign-off queue awaiting an SMF.",
        tone: "success",
      });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-heading font-bold text-xl">CPD &amp; Certification</h2>
        <p className="text-sm text-text-secondary mt-1">
          35 hours a certification year, three-strike escalation. Credited hours come from
          training-completion evidence via the deterministic engine — the register only moves on an
          SMF sign-off.
        </p>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Stat label="People tracked" value={String(rows.length)} sub="with a CPD record" tone="text-text" />
        <Stat
          label="Register stale"
          value={String(drifted)}
          sub="evidence differs from sign-off"
          tone={drifted > 0 ? "text-status-warn" : "text-status-success"}
        />
        <Stat
          label="On a strike"
          value={String(atRisk)}
          sub="behind the coded ladder"
          tone={atRisk > 0 ? "text-status-danger" : "text-status-success"}
        />
      </section>

      {error && (
        <div className="mb-4 border border-[rgba(185,28,28,0.35)] bg-[rgba(185,28,28,0.06)] px-4 py-3 text-sm text-status-danger">
          {error}
        </div>
      )}
      <div className="bg-card border border-border shadow-card">
        <div className="px-5 py-3 border-b border-border">
          <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
            Signed-off position vs training evidence
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-8 text-sm text-text-secondary">No CPD records for this firm.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted bg-panel">
                  <th className="px-5 py-2.5 font-normal">Person</th>
                  <th className="px-3 py-2.5 font-normal">Firm</th>
                  <th className="px-3 py-2.5 font-normal">Recorded</th>
                  <th className="px-3 py-2.5 font-normal">Evidence</th>
                  <th className="px-3 py-2.5 font-normal">Modules</th>
                  <th className="px-3 py-2.5 font-normal">Strike</th>
                  <th className="px-3 py-2.5 font-normal">Cert year</th>
                  {isOperator && <th className="px-5 py-2.5 font-normal text-right">Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = `${r.arId}:${r.person}`;
                  return (
                    <tr key={key} className="border-t border-border align-middle">
                      <td className="px-5 py-3">{r.person}</td>
                      <td className="px-3 py-3 font-mono text-[11px] text-text-secondary">{r.arId}</td>
                      <td className="px-3 py-3 font-mono text-[12px] tabular-nums text-text-secondary">
                        {r.recordedHours}/{r.required}h
                      </td>
                      <td className="px-3 py-3 font-mono text-[12px] tabular-nums">
                        <span className={r.drift ? "text-status-warn font-semibold" : ""}>
                          {r.creditedHours}/{r.required}h
                        </span>
                        {r.drift && (
                          <span className="ml-2 font-mono text-[9px] uppercase tracking-[1px] text-status-warn">
                            stale
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-text-secondary tabular-nums">
                        {r.modulesPassed} passed
                      </td>
                      <td className={`px-3 py-3 font-mono text-[11px] ${STRIKE_TONE[Math.min(r.derivedStrikes, 3)]}`}>
                        {strikeLabel(r.derivedStrikes)}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px] text-text-secondary tabular-nums">
                        {r.monthsLeft}mo left
                      </td>
                      {isOperator && (
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {r.drift ? (
                            <button
                              disabled={busy === key}
                              onClick={() => propose(r)}
                              className="font-mono text-[9px] uppercase tracking-[1px] px-2.5 py-1.5 border border-accent text-accent hover:bg-[rgba(8,145,178,0.07)] disabled:opacity-50 transition-colors"
                            >
                              {busy === key ? "Proposing…" : "Propose update"}
                            </button>
                          ) : (
                            <span className="font-mono text-[9px] text-text-muted">in step</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-text-muted">
        Proposing does not update the register — it creates a PENDING draft in the sign-off queue.
        Hours are credited once per distinct passed module from the coded module map, never
        self-asserted by the training platform.
      </p>

      {isOperator && certPacks.length > 0 && (
        <div className="mt-6 bg-card border border-border shadow-card">
          <div className="px-5 py-3 border-b border-border">
            <span className="font-mono text-[9px] uppercase tracking-[1.4px] text-text-muted">
              Certificate evidence · gather for sign-off
            </span>
          </div>
          <ul>
            {certPacks.map((p) => (
              <li
                key={p.arId}
                className="px-5 py-3 border-t border-border first:border-t-0 flex items-center justify-between gap-4"
              >
                <div className="text-sm">
                  <span className="font-mono text-[11px]">{p.arId}</span>
                  <span className="text-text-secondary">
                    {" "}
                    · {p.docs.length} stored certificate{p.docs.length === 1 ? "" : "s"} (WORM,
                    SHA-256 addressed)
                  </span>
                </div>
                <button
                  disabled={busy === `pack:${p.arId}`}
                  onClick={() => gatherPack(p)}
                  className="font-mono text-[9px] uppercase tracking-[1px] px-2.5 py-1.5 border border-accent text-accent hover:bg-[rgba(8,145,178,0.07)] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {busy === `pack:${p.arId}` ? "Gathering…" : "Gather evidence pack"}
                </button>
              </li>
            ))}
          </ul>
          <p className="px-5 py-3 border-t border-border text-xs text-text-muted">
            Runs <span className="font-mono text-[10px]">gather_docs</span> through the tool
            gateway deterministically — no agent model involved. The pack is an approve-only
            sign-off artifact referencing existing WORM manifests; nothing is uploaded or written
            to a register.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="bg-card border border-border shadow-card p-4">
      <div className="font-mono text-[9px] uppercase tracking-[1.2px] text-text-muted">{label}</div>
      <div className={`font-heading font-bold text-2xl mt-1 tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-text-secondary mt-1">{sub}</div>
    </div>
  );
}
