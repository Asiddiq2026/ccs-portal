"use client";

// The decide control on each queued draft. Posts to /api/signoff/:id/decide
// (SMF-only; the server enforces it). RETURN requires a rationale. On success we
// refresh the server component so the item drops out of the PENDING list.
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOffDecideForm({ draftId, canDecide }: { draftId: string; canDecide: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<null | "SIGN_OFF" | "RETURN">(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "SIGN_OFF" | "RETURN") {
    setError(null);
    if (decision === "RETURN" && !notes.trim()) {
      setError("A rationale is required to return a draft.");
      return;
    }
    setBusy(decision);
    try {
      const res = await fetch(`/api/signoff/${draftId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `Request failed (${res.status}).`);
        setBusy(null);
        return;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (!canDecide) {
    return (
      <p className="font-mono text-[10px] text-text-muted">
        Sign-off is SMF-only. You have read visibility of the queue.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Rationale (required to return; optional on sign-off)…"
        rows={2}
        className="w-full border border-border bg-panel px-2 py-1 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
      />
      {error && <p className="mt-1 text-xs text-status-danger">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => decide("SIGN_OFF")}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm font-semibold text-white bg-status-success disabled:opacity-50"
        >
          {busy === "SIGN_OFF" ? "Signing off…" : "Sign off → FINAL"}
        </button>
        <button
          onClick={() => decide("RETURN")}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm font-semibold text-status-danger border border-status-danger disabled:opacity-50"
        >
          {busy === "RETURN" ? "Returning…" : "Return"}
        </button>
      </div>
    </div>
  );
}
