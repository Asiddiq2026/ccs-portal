"use client";

// AR-facing submission form for a financial promotion. Posts multipart/form-data
// to POST /api/fp: promotion metadata, the COBS 4 self-certification checklist,
// and the document files (WORM-stored server-side). An AR is always scoped to
// its own firm; COMPLIANCE/SMF may submit on behalf of a named firm.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COBS_CHECKLIST, FP_TYPES } from "@/lib/fp/cobs";

export function FpSubmitForm({ role, arId }: { role: string; arId: string }) {
  const router = useRouter();
  const isAr = role === "AR";

  const [type, setType] = useState<string>("TEASER");
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState("");
  const [targetArId, setTargetArId] = useState(isAr ? arId : "");
  const [checked, setChecked] = useState<boolean[]>(() => COBS_CHECKLIST.map(() => false));
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<{ ref: string; documents: number } | null>(null);

  function toggle(i: number) {
    setChecked((c) => c.map((v, j) => (j === i ? !v : v)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!title.trim()) return setError("Title is required.");
    if (!audience.trim()) return setError("Audience is required.");
    if (!isAr && !targetArId.trim()) return setError("AR firm (arId) is required.");

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("title", title.trim());
      fd.set("audience", audience.trim());
      if (!isAr) fd.set("arId", targetArId.trim());
      fd.set(
        "cobs",
        JSON.stringify(COBS_CHECKLIST.map((label, i) => ({ label, checked: checked[i] }))),
      );
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/fp", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as {
        ref?: string;
        documents?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Submission failed (${res.status}).`);
        return;
      }
      setOk({ ref: body.ref ?? "(ref)", documents: body.documents ?? 0 });
      // Reset for a fresh submission.
      setTitle("");
      setAudience("");
      setChecked(COBS_CHECKLIST.map(() => false));
      setFiles([]);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full border border-border bg-card px-2 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent";
  const labelCls = "font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1 block";

  return (
    <form onSubmit={submit} className="space-y-4">
      {ok && (
        <div className="border border-status-success bg-panel p-3 text-sm text-status-success">
          Submitted <span className="font-mono font-semibold">{ok.ref}</span> — PENDING SMF review
          {ok.documents > 0 ? ` · ${ok.documents} document(s) stored (WORM)` : ""}.
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
            {FP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Audience</label>
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. Professional clients only"
            className={inputCls}
          />
        </div>
      </div>

      {!isAr && (
        <div>
          <label className={labelCls}>AR firm (arId) — submitting on behalf</label>
          <input
            value={targetArId}
            onChange={(e) => setTargetArId(e.target.value)}
            placeholder="e.g. six / drake-star / codrington"
            className={inputCls}
          />
        </div>
      )}

      <div>
        <label className={labelCls}>Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Promotion title"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>COBS 4 self-certification</label>
        <ul className="space-y-1.5">
          {COBS_CHECKLIST.map((label, i) => (
            <li key={label}>
              <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked[i]}
                  onChange={() => toggle(i)}
                  className="mt-0.5 accent-accent"
                />
                <span>{label}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="font-mono text-[10px] text-text-muted mt-1">
          Self-certification is advisory; an SMF Adopt/Reject remains the sole authority.
        </p>
      </div>

      <div>
        <label className={labelCls}>Documents (stored WORM · SHA-256)</label>
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])}
          className="block w-full text-sm text-text-secondary file:mr-3 file:border file:border-border file:bg-panel file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-text hover:file:bg-card"
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="font-mono text-[10px] text-text-secondary flex gap-2">
                <span className="truncate max-w-[18rem]">{f.name}</span>
                <span className="text-text-muted">{(f.size / 1024).toFixed(1)}kB</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-status-danger">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit for review"}
      </button>
    </form>
  );
}
