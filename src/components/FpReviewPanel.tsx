"use client";

// Operator controls on a PENDING financial promotion: run the advisory COBS 4 /
// MAR AI review (server-side; verdict is advisory only), then — SMF only — adopt
// or reject. REJECT requires reviewer notes, surfaced to the AR to revise.
import { useState } from "react";
import { useRouter } from "next/navigation";

interface AiReview {
  ref: string;
  verdict: string;
  analysis: string;
  advisory: string;
}

const VERDICT_TONE: Record<string, string> = {
  APPROVE: "text-status-success",
  "APPROVE WITH CONDITIONS": "text-status-warn",
  "REFER FOR FURTHER REVIEW": "text-status-info",
  REJECT: "text-status-danger",
};

export function FpReviewPanel({ id, canDecide }: { id: string; canDecide: boolean }) {
  const router = useRouter();
  const [review, setReview] = useState<AiReview | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "AI" | "ADOPT" | "REJECT">(null);
  const [error, setError] = useState<string | null>(null);

  async function runReview() {
    setBusy("AI");
    setError(null);
    try {
      const res = await fetch(`/api/fp/${id}/ai-review`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? `AI review failed (${res.status}).`);
      else setReview(body as AiReview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function decide(decision: "ADOPT" | "REJECT") {
    setError(null);
    if (decision === "REJECT" && !notes.trim()) {
      setError("Reviewer notes are required to reject.");
      return;
    }
    setBusy(decision);
    try {
      const res = await fetch(`/api/fp/${id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Decision failed (${res.status}).`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        onClick={runReview}
        disabled={busy !== null}
        className="px-3 py-1.5 text-sm font-semibold text-status-ai border border-status-ai disabled:opacity-50"
      >
        {busy === "AI" ? "Reviewing…" : "Run AI review (advisory)"}
      </button>

      {review && (
        <div className="mt-3 bg-panel border border-border p-3">
          <p className="font-mono text-[10px] uppercase tracking-wide text-text-muted">
            AI verdict — advisory only
          </p>
          <p className={"font-heading font-bold text-sm mt-1 " + (VERDICT_TONE[review.verdict] ?? "text-text")}>
            {review.verdict}
          </p>
          <p className="text-sm text-text-secondary mt-2 whitespace-pre-wrap">{review.analysis}</p>
          <p className="text-[10px] text-text-muted mt-2 italic">{review.advisory}</p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-status-danger">{error}</p>}

      {canDecide ? (
        <div className="mt-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reviewer notes (required to reject)…"
            rows={2}
            className="w-full border border-border bg-card px-2 py-1 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => decide("ADOPT")}
              disabled={busy !== null}
              className="px-3 py-1.5 text-sm font-semibold text-white bg-status-success disabled:opacity-50"
            >
              {busy === "ADOPT" ? "Adopting…" : "Adopt"}
            </button>
            <button
              onClick={() => decide("REJECT")}
              disabled={busy !== null}
              className="px-3 py-1.5 text-sm font-semibold text-status-danger border border-status-danger disabled:opacity-50"
            >
              {busy === "REJECT" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 font-mono text-[10px] text-text-muted">
          Adopt/Reject is SMF-only. You may run the advisory AI review.
        </p>
      )}
    </div>
  );
}
