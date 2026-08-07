"use client";

// Record an operator's disposition of a fail-closed run. Posts to
// /api/monitoring/fail-closed/:runId/review (operator-only, server-enforced). A
// rationale is required — an empty disposition is not a disposition. On success
// the row drops out of the open list on refresh, and a toast confirms it.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./Toasts";

export function FailClosedReviewForm({ runId }: { runId: string }) {
  const router = useRouter();
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!rationale.trim()) {
      setError("A rationale is required to record a review.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/monitoring/fail-closed/${runId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rationale: rationale.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status}).`);
        setBusy(false);
        return;
      }
      toast({ title: "Fail-closed review recorded", sub: "Disposition is on the audit trail.", tone: "success" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <textarea
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
        placeholder="What was reviewed and what action was taken (required)…"
        rows={2}
        className="w-full border border-border bg-panel px-2 py-1 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
      <button
        onClick={submit}
        disabled={busy}
        className="mt-2 px-3 py-1.5 text-sm font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Recording…" : "Record review"}
      </button>
    </div>
  );
}
