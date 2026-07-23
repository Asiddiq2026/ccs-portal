import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/session";
import { fpPrismaDeps } from "@/lib/fp/prisma-adapter";
import { resolveBlobStore } from "@/lib/fp/blob";
import { submitPromotion, FpError, type FpType } from "@/lib/fp/service";
import { FP_TYPES, isFpType, parseCobs } from "@/lib/fp/cobs";

// Multipart parsing + Prisma + (prod) Azure Blob all need the Node runtime.
export const runtime = "nodejs";

const MAX_FILES = 10;
const MAX_FILE_MB = 15;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

/**
 * POST /api/fp — AR submission of a financial promotion. Multipart form:
 *   type, title, audience, cobs (JSON [{label,checked}]), files[] (documents),
 *   arId (operators only — an AR is always scoped to its own firm).
 * Every file is content-hashed into WORM storage; the promotion is created
 * PENDING and awaits an SMF Adopt/Reject. In production the FP channel fails
 * closed if WORM storage is unconfigured (see resolveBlobStore).
 * Errors: 401 · 400 (bad fields) · 403 (AR cross-firm) · 413 (file too big) ·
 * 500. Success: 201 with { id, ref, status, documents }.
 */
export async function POST(req: Request): Promise<Response> {
  let tenant;
  try {
    tenant = await requireTenant();
  } catch {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const type = String(form.get("type") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const audience = String(form.get("audience") ?? "").trim();
  const cobsRaw = form.get("cobs");

  if (!isFpType(type)) {
    return NextResponse.json(
      { error: `type must be one of ${FP_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!audience) return NextResponse.json({ error: "audience is required" }, { status: 400 });

  const cobs = parseCobs(typeof cobsRaw === "string" ? cobsRaw : null);
  if (!cobs) {
    return NextResponse.json(
      { error: "cobs must be a non-empty JSON array of {label, checked}" },
      { status: 400 },
    );
  }

  // Firm scoping: an AR is forced to its own firm; COMPLIANCE/SMF submit on
  // behalf of a named firm. (The service also re-checks AR cross-firm → 403.)
  let arId: string;
  if (tenant.role === "AR") {
    arId = tenant.arId;
  } else {
    const field = String(form.get("arId") ?? "").trim();
    if (!field) {
      return NextResponse.json({ error: "arId is required for operator submissions" }, { status: 400 });
    }
    arId = field;
  }

  // Collect non-empty uploaded files.
  const entries = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (entries.length > MAX_FILES) {
    return NextResponse.json({ error: `at most ${MAX_FILES} files per submission` }, { status: 400 });
  }
  const files: { name: string; contentType?: string; bytes: Uint8Array }[] = [];
  for (const f of entries) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `"${f.name}" exceeds ${MAX_FILE_MB}MB` }, { status: 413 });
    }
    files.push({
      name: f.name,
      contentType: f.type || undefined,
      bytes: new Uint8Array(await f.arrayBuffer()),
    });
  }

  const submittedBy = `${tenant.role}:${tenant.arId || "network"}`;

  try {
    const blob = await resolveBlobStore();
    const { promotion, documents } = await submitPromotion(fpPrismaDeps(blob), tenant, {
      arId,
      type: type as FpType,
      title,
      audience,
      cobs,
      submittedBy,
      files,
    });
    return NextResponse.json(
      { id: promotion.id, ref: promotion.ref, status: promotion.status, documents: documents.length },
      { status: 201 },
    );
  } catch (err) {
    const status = err instanceof FpError ? err.status : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
