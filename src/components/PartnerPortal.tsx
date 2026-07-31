"use client";

// Principal-branded Appointed-Representative portal (branding comes from the
// principal profile — golden rule 4: AR-facing output carries the principal's
// marks only; CCS marks are internal). This is the AR's surface, not the CCS
// operator console — different chrome, but the same invariants: an AR
// *submits*, nothing is published, nothing becomes FINAL without the
// principal's SMF sign-off. Financial promotions post multipart to POST /api/fp
// (documents hashed server-side into WORM); a NIL quarterly return posts to
// POST /api/cf30/nil, which creates a PENDING sign-off draft — the "FILED" chip
// means "filed for adoption", never FINAL.
import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { COBS_CHECKLIST, FP_TYPES } from "@/lib/fp/cobs";
import { NIL_SECTIONS } from "@/lib/cf30/service";
import { PRINCIPAL, principalFooterLine } from "@/lib/principal";

export interface PortalSubmission {
  id: string;
  ref: string;
  type: string;
  title: string;
  status: "PENDING" | "ADOPTED" | "REJECTED";
  submittedAt: string; // ISO
  reviewerNotes: string | null;
}

export interface PortalProps {
  firmName: string; // e.g. "Codrington Associates"
  arId: string;
  personName: string; // e.g. "Rachel Bailey"
  personInitials: string; // e.g. "RB"
  role: string;
  quarterLabel: string; // e.g. "Q2 2026"
  cf30Due: string; // formatted, e.g. "14 Jul 2026"
  cf30Filed: boolean; // whether a return already exists for the quarter
  cpdHours: number;
  cpdRequired: number;
  cpdPerson: string;
  submissions: PortalSubmission[];
}

const AUDIENCES = ["Professional", "Eligible counterparty", "Retail"] as const;
const TYPE_LABEL: Record<string, string> = {
  RESEARCH: "Research",
  TEASER: "Teaser",
  DECK: "Deck",
  MARKETING: "Marketing",
  ADVISORY: "Advisory",
};

const STATUS_TONE: Record<string, string> = {
  PENDING: "text-status-warn border-[rgba(180,83,9,0.4)] bg-[rgba(180,83,9,0.1)]",
  ADOPTED: "text-status-success border-[rgba(21,128,61,0.4)] bg-[rgba(21,128,61,0.1)]",
  REJECTED: "text-status-danger border-[rgba(185,28,28,0.4)] bg-[rgba(185,28,28,0.1)]",
};

async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface Toast {
  id: number;
  title: string;
  sub: string;
  tone: "success" | "warn" | "danger";
}

const NAV = [
  { label: "Overview", active: true },
  { label: "Submit for adoption", active: false },
  { label: "Your submissions", active: false },
  { label: "Quarterly returns (CF30)", active: false },
  { label: "Your documents", active: false },
  { label: "Training & CPD", active: false },
];

export function PartnerPortal(props: PortalProps) {
  const router = useRouter();

  const [submissions, setSubmissions] = useState<PortalSubmission[]>(props.submissions);
  const [cf30Filed, setCf30Filed] = useState(props.cf30Filed);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);

  const pendingCount = useMemo(
    () => submissions.filter((s) => s.status === "PENDING").length,
    [submissions],
  );
  const adoptedCount = useMemo(
    () => submissions.filter((s) => s.status === "ADOPTED").length,
    [submissions],
  );

  function pushToast(t: Omit<Toast, "id">) {
    const id = ++toastSeq.current;
    setToasts((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setToasts((cur) => cur.filter((x) => x.id !== id)), 3800);
  }

  // ---- Submit-for-adoption form ------------------------------------------
  const [type, setType] = useState<string>("RESEARCH");
  const [title, setTitle] = useState("");
  const [audience, setAudience] = useState<string>(AUDIENCES[0]);
  const [cobs, setCobs] = useState<boolean[]>(() => COBS_CHECKLIST.map(() => false));
  const [attached, setAttached] = useState<{ name: string; size: number; sha256: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function onAttach(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list);
    setFiles(arr);
    const hashed = await Promise.all(
      arr.map(async (f) => ({ name: f.name, size: f.size, sha256: await sha256Hex(f) })),
    );
    setAttached(hashed);
  }

  async function submitPromotion(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      pushToast({ title: "Title required", sub: "Give the promotion a title before submitting.", tone: "warn" });
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("type", type);
      fd.set("title", title.trim());
      fd.set("audience", audience);
      fd.set(
        "cobs",
        JSON.stringify(COBS_CHECKLIST.map((label, i) => ({ label, checked: cobs[i] }))),
      );
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/fp", { method: "POST", body: fd });
      const body = (await res.json().catch(() => ({}))) as {
        id?: string;
        ref?: string;
        status?: string;
        error?: string;
      };
      if (!res.ok) {
        pushToast({ title: "Submission failed", sub: body.error ?? `Error ${res.status}.`, tone: "danger" });
        return;
      }
      setSubmissions((cur) => [
        {
          id: body.id ?? `tmp_${Date.now()}`,
          ref: body.ref ?? "FP-????",
          type,
          title: title.trim(),
          status: "PENDING",
          submittedAt: new Date().toISOString(),
          reviewerNotes: null,
        },
        ...cur,
      ]);
      pushToast({
        title: `Submitted to ${PRINCIPAL.shortName}`,
        sub: `${body.ref ?? "Promotion"} is PENDING sign-off — nothing is published.`,
        tone: "success",
      });
      setTitle("");
      setCobs(COBS_CHECKLIST.map(() => false));
      setAttached([]);
      setFiles([]);
      router.refresh();
    } catch (err) {
      pushToast({ title: "Submission failed", sub: (err as Error).message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  }

  // ---- NIL return modal ---------------------------------------------------
  const [nilOpen, setNilOpen] = useState(false);
  const [nilStep, setNilStep] = useState<1 | 2>(1);
  const [nilBusy, setNilBusy] = useState(false);

  function openNil() {
    setNilStep(1);
    setNilOpen(true);
  }

  async function submitNil() {
    setNilBusy(true);
    try {
      const res = await fetch("/api/cf30/nil", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ declaredBy: `${props.personName} · Director` }),
      });
      const body = (await res.json().catch(() => ({}))) as { quarter?: string; error?: string };
      if (!res.ok) {
        pushToast({ title: "Filing failed", sub: body.error ?? `Error ${res.status}.`, tone: "danger" });
        return;
      }
      setCf30Filed(true);
      setNilOpen(false);
      pushToast({
        title: "NIL return filed",
        sub: `${body.quarter ?? props.quarterLabel} filed for ${PRINCIPAL.shortName} adoption — awaiting sign-off.`,
        tone: "success",
      });
      router.refresh();
    } catch (err) {
      pushToast({ title: "Filing failed", sub: (err as Error).message, tone: "danger" });
    } finally {
      setNilBusy(false);
    }
  }

  const chip = (selected: boolean) =>
    "font-mono text-[10px] uppercase tracking-wide px-2.5 py-1 border cursor-pointer transition-colors " +
    (selected
      ? "border-razlin-accent text-razlin-accent bg-[rgba(14,116,144,0.08)]"
      : "border-border text-text-secondary hover:border-[rgba(14,116,144,0.5)]");

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* Header */}
      <header
        className="sticky top-0 z-40 bg-razlin-header"
        style={{ borderBottom: "3px solid var(--razlin-accent)" }}
      >
        <div className="flex items-center justify-between h-[62px] px-[26px]">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5 pr-4 border-r border-white/15">
              <span
                className="flex items-center justify-center w-[30px] h-[30px] font-heading font-bold text-[15px] text-white"
                style={{ background: "linear-gradient(135deg,#0E7490,#155E75)" }}
              >
                R
              </span>
              <span className="font-heading font-bold text-[17px] tracking-[3px] text-white">
                {PRINCIPAL.shortName.toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-[12.5px] font-semibold text-white leading-tight">Partner Portal</p>
              <p className="font-mono text-[8px] tracking-[1.3px] uppercase text-white/55">
                Appointed Representative Services
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[9px] tracking-wide px-2 py-1 bg-white/10 text-white/90">
              {props.firmName.toUpperCase()} · {props.role}
            </span>
            <span className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-razlin-accent text-white font-heading font-bold text-[11px]">
              {props.personInitials}
            </span>
          </div>
        </div>
      </header>

      <div className="grid" style={{ gridTemplateColumns: "222px 1fr", minHeight: "calc(100vh - 62px)" }}>
        {/* Sidebar */}
        <aside className="bg-card border-r border-border py-[22px]">
          <nav>
            {NAV.map((n) => (
              <div
                key={n.label}
                className={
                  "flex items-center gap-2 px-6 py-2 text-sm " +
                  (n.active
                    ? "text-razlin-accent font-semibold"
                    : "text-text-secondary hover:text-text cursor-pointer")
                }
                style={
                  n.active
                    ? {
                        borderLeft: "2px solid var(--razlin-accent)",
                        background:
                          "linear-gradient(90deg,rgba(14,116,144,.08),transparent)",
                      }
                    : { borderLeft: "2px solid transparent" }
                }
              >
                {n.active && <span className="w-1.5 h-1.5 rounded-full bg-razlin-accent" />}
                <span>{n.label}</span>
              </div>
            ))}
          </nav>
          <div className="mx-5 mt-8 border border-border bg-panel p-3">
            <p className="font-mono text-[8px] uppercase tracking-wide text-text-muted">
              Your compliance contact
            </p>
            <p className="text-sm font-semibold mt-1">{PRINCIPAL.complianceTeam}</p>
            <p className="font-mono text-[10px] text-text-secondary">{PRINCIPAL.complianceEmail}</p>
          </div>
        </aside>

        {/* Main */}
        <main className="px-8 py-7">
          <h1 className="font-heading font-semibold text-[25px]">Good morning, {props.personName.split(" ")[0]}</h1>
          <p className="text-sm text-text-secondary mt-1">
            {props.firmName} · appointed representative of {PRINCIPAL.legalName}
          </p>

          {/* Stats */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <StatCard
              label={`Awaiting ${PRINCIPAL.shortName}`}
              value={String(pendingCount)}
              sub="promotions pending sign-off"
              bar="#B45309"
            />
            <StatCard
              label="Adopted this quarter"
              value={String(adoptedCount)}
              sub={`cleared by ${PRINCIPAL.shortName} SMF`}
              bar="#15803D"
            />
            <StatCard
              label={`${props.quarterLabel} return`}
              value={cf30Filed ? "FILED" : "DUE"}
              sub={cf30Filed ? `awaiting ${PRINCIPAL.shortName} adoption` : `due ${props.cf30Due}`}
              bar="#0E7490"
            />
            <StatCard
              label={`CPD · ${props.cpdPerson}`}
              value={`${props.cpdHours}/${props.cpdRequired}h`}
              sub="certification year"
              bar="#65A30D"
            />
          </section>

          {/* CF30 banner */}
          {!cf30Filed && (
            <div
              className="mt-5 border border-border p-4 flex items-center justify-between"
              style={{
                borderLeft: "3px solid var(--razlin-accent)",
                background: "linear-gradient(100deg,rgba(14,116,144,.07),transparent)",
              }}
            >
              <div>
                <p className="text-sm font-semibold">
                  {props.quarterLabel} quarterly return due {props.cf30Due}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Nothing to report this quarter? File a NIL return across all {NIL_SECTIONS.length} SUP 12
                  sections — it is held for {PRINCIPAL.shortName} sign-off, never auto-filed.
                </p>
              </div>
              <button
                onClick={openNil}
                className="whitespace-nowrap px-3 py-2 text-sm font-semibold text-white bg-razlin-accent hover:bg-razlin-header"
              >
                File NIL return
              </button>
            </div>
          )}

          {/* Two-column: submit + submissions */}
          <section className="grid lg:grid-cols-2 gap-5 mt-6">
            {/* Submit for adoption */}
            <form onSubmit={submitPromotion} className="border border-border bg-card shadow-card p-5">
              <h2 className="font-heading font-semibold text-sm mb-4">Submit for adoption</h2>

              <label className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1.5 block">
                Type
              </label>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {FP_TYPES.map((t) => (
                  <button type="button" key={t} onClick={() => setType(t)} className={chip(type === t)}>
                    {TYPE_LABEL[t] ?? t}
                  </button>
                ))}
              </div>

              <label className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1 block">
                Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Promotion title"
                className="w-full border border-border bg-card px-2 py-1.5 text-sm focus:outline-none focus:border-razlin-accent mb-4"
              />

              <label className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1.5 block">
                Intended audience
              </label>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {AUDIENCES.map((a) => (
                  <button type="button" key={a} onClick={() => setAudience(a)} className={chip(audience === a)}>
                    {a}
                  </button>
                ))}
              </div>

              <label className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1.5 block">
                COBS 4 self-certification
              </label>
              <ul className="space-y-1.5 mb-4">
                {COBS_CHECKLIST.map((label, i) => (
                  <li key={label}>
                    <label className="flex items-start gap-2 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cobs[i]}
                        onChange={() => setCobs((c) => c.map((v, j) => (j === i ? !v : v)))}
                        className="mt-0.5 w-4 h-4 accent-razlin-accent"
                      />
                      <span>{label}</span>
                    </label>
                  </li>
                ))}
              </ul>

              <label className="font-mono text-[9px] uppercase tracking-wide text-text-muted mb-1.5 block">
                Documents · hashed on attach
              </label>
              <label className="block border border-dashed border-border bg-panel p-4 text-center cursor-pointer hover:border-[rgba(14,116,144,0.5)]">
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => onAttach(e.target.files)}
                />
                <span className="text-xs text-text-secondary">
                  Drop files or click to attach — SHA-256 computed in your browser
                </span>
              </label>
              {attached.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attached.map((f, i) => (
                    <li key={i} className="font-mono text-[10px] text-text-secondary flex justify-between gap-2">
                      <span className="truncate max-w-[14rem]">{f.name}</span>
                      <span className="text-text-muted">
                        sha256 {f.sha256.slice(0, 4)}…{f.sha256.slice(-4)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="mt-4 w-full px-4 py-2 text-sm font-semibold text-white bg-razlin-accent hover:bg-razlin-header disabled:opacity-50"
              >
                {busy ? "Submitting…" : `Submit to ${PRINCIPAL.shortName} for sign-off`}
              </button>
            </form>

            {/* Your submissions */}
            <div className="border border-border bg-card shadow-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading font-semibold text-sm">Your submissions</h2>
                <span className="font-mono text-[8px] uppercase tracking-wide px-1.5 py-0.5 border border-border text-text-muted">
                  {props.firmName.split(" ")[0]} only · isolated
                </span>
              </div>
              {submissions.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  No submissions yet. Once you submit, its status appears here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {submissions.map((s) => (
                    <li
                      key={s.id}
                      className="border border-border p-3 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-body truncate">{s.title}</p>
                        <p className="font-mono text-[10px] text-text-muted mt-0.5">
                          {s.ref} · {TYPE_LABEL[s.type] ?? s.type} ·{" "}
                          {new Date(s.submittedAt).toISOString().slice(0, 10)}
                        </p>
                        {s.status === "REJECTED" && s.reviewerNotes && (
                          <p className="mt-1 text-xs text-status-danger">Notes: {s.reviewerNotes}</p>
                        )}
                      </div>
                      <span
                        className={
                          "font-mono text-[9px] uppercase tracking-wide px-2 py-1 border whitespace-nowrap " +
                          (STATUS_TONE[s.status] ?? "text-text border-border")
                        }
                      >
                        {s.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* FCA footer */}
          <footer className="mt-10 pt-4 border-t border-border">
            <p className="font-mono text-[9px] text-text-muted">
              {principalFooterLine()}
            </p>
            <p className="font-mono text-[9px] text-text-muted mt-0.5">
              {props.firmName} is an appointed representative of {PRINCIPAL.legalName}.
            </p>
          </footer>
        </main>
      </div>

      {/* NIL return modal */}
      {nilOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(16,24,40,.42)" }}
          onClick={() => !nilBusy && setNilOpen(false)}
        >
          <div
            className="w-full max-w-[480px] bg-card border border-border shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 bg-panel border-b border-border">
              <p className="font-heading font-semibold text-sm">{props.quarterLabel} NIL return</p>
              <p className="font-mono text-[10px] text-text-muted mt-0.5">
                {props.firmName} · due {props.cf30Due}
              </p>
            </div>

            <div className="p-5">
              {nilStep === 1 ? (
                <>
                  <p className="text-sm text-text-secondary mb-3">
                    You are declaring <strong>nothing to report</strong> across all {NIL_SECTIONS.length} SUP
                    12 reporting sections for {props.quarterLabel}.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {NIL_SECTIONS.map((s) => (
                      <span
                        key={s}
                        className="font-mono text-[9px] px-1.5 py-0.5 border border-border bg-panel text-text-secondary"
                      >
                        {s} · NIL
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="border border-border bg-panel p-4">
                  <p className="text-sm text-text">
                    I confirm on behalf of {props.firmName} that there is nothing to report for{" "}
                    {props.quarterLabel} across all listed sections, under SUP 12.
                  </p>
                  <p className="font-mono text-[10px] text-text-muted mt-3">
                    Declared by: {props.personName} · Director
                  </p>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-panel border-t border-border flex justify-end gap-2">
              <button
                onClick={() => (nilStep === 1 ? setNilOpen(false) : setNilStep(1))}
                disabled={nilBusy}
                className="px-3 py-1.5 text-sm text-text-secondary border border-border hover:bg-card disabled:opacity-50"
              >
                {nilStep === 1 ? "Cancel" : "Back"}
              </button>
              <button
                onClick={() => (nilStep === 1 ? setNilStep(2) : submitNil())}
                disabled={nilBusy}
                className="px-3 py-1.5 text-sm font-semibold text-white bg-razlin-accent hover:bg-razlin-header disabled:opacity-50"
              >
                {nilStep === 1
                  ? "Confirm — all sections NIL"
                  : nilBusy
                    ? "Filing…"
                    : "Declare & submit"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2">
        {toasts.map((t) => (
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
            <p className="text-xs text-text-secondary mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  bar,
}: {
  label: string;
  value: string;
  sub: string;
  bar: string;
}) {
  return (
    <div className="border border-border bg-card shadow-card p-4" style={{ borderBottom: `2px solid ${bar}` }}>
      <p className="font-mono text-[9px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="font-heading font-bold text-2xl mt-1">{value}</p>
      <p className="text-xs text-text-secondary mt-1">{sub}</p>
    </div>
  );
}
