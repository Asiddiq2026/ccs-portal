"use client";

// "Inspect payload" on a queued draft. An SMF should never sign a draft into a
// FINAL register row without seeing the exact row it will materialise. The
// server already loads the payload under withTenant (RLS-scoped); this just
// reveals it — a read-only modal with the proposed row pretty-printed as JSON
// and a flat field table. No writes; the decision itself stays in
// SignOffDecideForm.
import { useState } from "react";

type Props = {
  register: string;
  arId: string;
  summary: string;
  payload: unknown;
};

/** Flatten the top level of the payload into label/value rows for quick scan. */
function topLevelFields(payload: unknown): { key: string; value: string }[] {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload as Record<string, unknown>).map(([key, v]) => ({
    key,
    value:
      v === null || v === undefined
        ? "—"
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v),
  }));
}

export function SignOffPayloadInspect({ register, arId, summary, payload }: Props) {
  const [open, setOpen] = useState(false);
  const fields = topLevelFields(payload);
  const json = JSON.stringify(payload, null, 2);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 font-mono text-[10px] uppercase tracking-wide text-accent border border-[rgba(8,145,178,0.35)] bg-[rgba(8,145,178,0.06)] px-2 py-1 hover:bg-[rgba(8,145,178,0.12)]"
      >
        Inspect payload
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(16,24,40,0.55)]"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-card border border-border shadow-card max-w-2xl w-full max-h-[86vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-border">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[1.3px] text-text-muted mb-1">
                  Proposed {register} row · {arId}
                </p>
                <h4 className="font-heading font-bold text-lg">Draft payload</h4>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="font-mono text-xs text-text-muted hover:text-text border border-border px-2 py-1"
              >
                close
              </button>
            </div>

            <div className="p-5 space-y-5">
              <p className="text-sm text-text-secondary">{summary}</p>

              {fields.length > 0 && (
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-2">
                    Fields (materialise as-is on sign-off)
                  </p>
                  <div className="border border-border">
                    {fields.map((f, i) => (
                      <div
                        key={f.key}
                        className={
                          "flex gap-3 px-3 py-1.5 text-sm " +
                          (i % 2 === 0 ? "bg-panel" : "bg-card")
                        }
                      >
                        <span className="font-mono text-[11px] text-text-muted w-40 shrink-0">{f.key}</span>
                        <span className="font-mono text-[12px] text-text break-all">{f.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-2">
                  Raw payload (JSON)
                </p>
                <pre className="bg-[#0F172A] text-[#A3E635] text-[11px] leading-relaxed font-mono p-4 overflow-x-auto whitespace-pre-wrap">
                  {json}
                </pre>
              </div>

              <p className="font-mono text-[9px] text-text-muted">
                Read-only. Signing off materialises this exact payload into {register} as FINAL
                (Invariants 1 &amp; 3); returning it sends the draft back with your rationale.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
