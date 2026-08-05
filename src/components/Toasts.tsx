"use client";

// Operator-console toast feedback. The AR-facing PartnerPortal already confirms
// every action with a toast; this brings the same pattern to the console, where
// a sign-off previously made the row vanish on refresh with no acknowledgement.
//
// Event-bus rather than React context: ConsoleShell is a server component, so a
// provider would force a client boundary around every page. Instead any client
// component calls toast(...) — a window CustomEvent — and the single <ToastHost/>
// mounted by ConsoleShell renders the stack. Same visual language as the portal.
import { useEffect, useRef, useState } from "react";

export interface ToastPayload {
  title: string;
  sub?: string;
  tone?: "success" | "warn" | "danger";
}

const EVENT = "ccs:toast";

/** Fire-and-forget feedback from any client component under ConsoleShell. */
export function toast(t: ToastPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>(EVENT, { detail: t }));
}

interface ToastRow extends ToastPayload {
  id: number;
}

export function ToastHost() {
  const [rows, setRows] = useState<ToastRow[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    function onToast(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail?.title) return;
      const id = ++seq.current;
      setRows((cur) => [...cur, { ...detail, id }]);
      setTimeout(() => setRows((cur) => cur.filter((x) => x.id !== id)), 3800);
    }
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (rows.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2" role="status" aria-live="polite">
      {rows.map((t) => (
        <div
          key={t.id}
          className="w-72 bg-card border border-border shadow-card px-3 py-2"
          style={{
            borderLeft: `3px solid ${
              t.tone === "success" ? "#15803D" : t.tone === "warn" ? "#B45309" : "#B91C1C"
            }`,
          }}
        >
          <p className="text-sm font-semibold">{t.title}</p>
          {t.sub && <p className="text-xs text-text-secondary mt-0.5">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
