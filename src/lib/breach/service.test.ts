import { describe, it, expect } from "vitest";
import {
  logBreach,
  listBreaches,
  decideBreach,
  withClock,
  BreachError,
  type BreachDeps,
  type BreachRecord,
} from "./service";
import { art33Remaining } from "../engine";
import type { Tenant } from "../tools/types";

// In-memory stubs — no DB, no network.
function makeDeps(seed: BreachRecord[] = []) {
  const rows: BreachRecord[] = [...seed];
  const audits: Array<{ actor: string; action: string; entity: string; entityId?: string }> = [];
  const deps: BreachDeps = {
    store: {
      async createBreach(input) {
        const rec: BreachRecord = {
          id: `b${rows.length + 1}`,
          arId: input.arId,
          ref: `BR-${1000 + rows.length + 1}`,
          detectedAt: input.detectedAt.toISOString(),
          art33Clock: input.art33Clock.toISOString(),
          status: "PENDING",
          severity: input.severity,
        };
        rows.push(rec);
        return rec;
      },
      async getBreach(id) {
        return rows.find((r) => r.id === id) ?? null;
      },
      async listBreaches(filter) {
        return rows.filter((r) => !filter.arId || r.arId === filter.arId);
      },
      async setStatus(id, status) {
        const r = rows.find((x) => x.id === id)!;
        r.status = status;
        return r;
      },
    },
    audit: {
      async append(e) {
        audits.push(e);
        return { id: `a${audits.length}` };
      },
    },
  };
  return { deps, rows, audits };
}

const AR: Tenant = { role: "AR", arId: "ar_codrington" };
const SMF: Tenant = { role: "SMF", arId: "" };
const COMPLIANCE: Tenant = { role: "COMPLIANCE", arId: "" };

const NOW = "2026-07-01T12:00:00.000Z";

describe("logBreach — the Art 33 clock starts at awareness", () => {
  it("computes the 72h deadline in code from detectedAt", async () => {
    const { deps, audits } = makeDeps();
    const b = await logBreach(
      deps,
      AR,
      { arId: "ar_codrington", detectedAt: "2026-07-01T09:00:00.000Z", severity: "HIGH" },
      NOW,
    );
    // 72h after 09:00 on the 1st = 09:00 on the 4th.
    expect(b.art33Clock).toBe("2026-07-04T09:00:00.000Z");
    expect(b.status).toBe("PENDING");
    expect(b.ref).toMatch(/^BR-\d+$/);
    // 3h elapsed → 69h left.
    expect(b.hoursRemaining).toBe(69);
    expect(b.state).toBe("ON_TRACK");
    expect(audits[0]).toMatchObject({ action: "BREACH LOGGED", entity: "data_breach" });
  });

  it("defaults awareness to now when detectedAt is omitted", async () => {
    const { deps } = makeDeps();
    const b = await logBreach(deps, AR, { arId: "ar_codrington", severity: "LOW" }, NOW);
    expect(b.detectedAt).toBe(NOW);
    expect(b.hoursRemaining).toBe(72);
  });

  it("refuses a future awareness time (it would extend the statutory runway)", async () => {
    const { deps, rows } = makeDeps();
    await expect(
      logBreach(
        deps,
        AR,
        { arId: "ar_codrington", detectedAt: "2026-07-02T00:00:00.000Z", severity: "LOW" },
        NOW,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(rows).toHaveLength(0);
  });

  it("rejects an unparseable date and an invalid severity", async () => {
    const { deps } = makeDeps();
    await expect(
      logBreach(deps, AR, { arId: "ar_codrington", detectedAt: "nonsense", severity: "LOW" }, NOW),
    ).rejects.toBeInstanceOf(BreachError);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logBreach(deps, AR, { arId: "ar_codrington", severity: "SEVERE" as any }, NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("forbids an AR logging for another firm; an operator may log on behalf", async () => {
    const { deps, rows } = makeDeps();
    await expect(
      logBreach(deps, AR, { arId: "ar_six", severity: "LOW" }, NOW),
    ).rejects.toMatchObject({ status: 403 });
    expect(rows).toHaveLength(0);

    await logBreach(deps, COMPLIANCE, { arId: "ar_six", severity: "LOW" }, NOW);
    expect(rows).toHaveLength(1);
  });
});

describe("art33 clock banding", () => {
  it("bands by time remaining (coded, not judged)", () => {
    expect(art33Remaining("2026-07-01T11:00:00.000Z", NOW).state).toBe("OVERDUE");
    expect(art33Remaining("2026-07-01T20:00:00.000Z", NOW).state).toBe("CRITICAL");
    expect(art33Remaining("2026-07-02T06:00:00.000Z", NOW).state).toBe("DUE");
    expect(art33Remaining("2026-07-04T09:00:00.000Z", NOW).state).toBe("ON_TRACK");
  });

  it("goes negative once the deadline passes", () => {
    const r = art33Remaining("2026-07-01T06:00:00.000Z", NOW);
    expect(r.hoursRemaining).toBe(-6);
    expect(r.state).toBe("OVERDUE");
  });

  it("stops the clock on a settled breach", () => {
    const settled: BreachRecord = {
      id: "b1", arId: "ar_six", ref: "BR-1001",
      detectedAt: "2026-06-01T00:00:00.000Z", art33Clock: "2026-06-04T00:00:00.000Z",
      status: "REPORTED", severity: "HIGH",
    };
    expect(withClock(settled, NOW).state).toBe("ON_TRACK");
  });
});

describe("listBreaches", () => {
  it("puts open items first, most urgent first", async () => {
    const { deps } = makeDeps();
    await logBreach(deps, COMPLIANCE, { arId: "ar_six", detectedAt: "2026-06-30T18:00:00.000Z", severity: "HIGH" }, NOW);
    await logBreach(deps, COMPLIANCE, { arId: "ar_six", detectedAt: "2026-07-01T11:00:00.000Z", severity: "LOW" }, NOW);
    const list = await listBreaches(deps, COMPLIANCE, {}, NOW);
    expect(list[0].hoursRemaining).toBeLessThan(list[1].hoursRemaining);
  });

  it("forbids an AR asking for another firm's breaches", async () => {
    const { deps } = makeDeps();
    await expect(listBreaches(deps, AR, { arId: "ar_six" }, NOW)).rejects.toMatchObject({ status: 403 });
  });
});

describe("decideBreach — SMF is the sole authority", () => {
  async function seeded() {
    const { deps, audits } = makeDeps();
    const b = await logBreach(deps, COMPLIANCE, { arId: "ar_six", severity: "HIGH" }, NOW);
    return { deps, audits, id: b.id };
  }

  it("records an SMF report to the ICO", async () => {
    const { deps, audits, id } = await seeded();
    const out = await decideBreach(deps, SMF, { id, decision: "REPORT", actor: "N. Okafor · SMF16" }, NOW);
    expect(out.status).toBe("REPORTED");
    expect(audits.some((a) => a.action === "BREACH REPORTED (ICO)")).toBe(true);
  });

  it("requires a rationale to close without notifying", async () => {
    const { deps, id } = await seeded();
    await expect(
      decideBreach(deps, SMF, { id, decision: "CLOSE", actor: "smf" }, NOW),
    ).rejects.toMatchObject({ status: 400 });

    const out = await decideBreach(
      deps, SMF,
      { id, decision: "CLOSE", actor: "smf", notes: "No risk to rights and freedoms — encrypted at rest." },
      NOW,
    );
    expect(out.status).toBe("CLOSED");
  });

  it("refuses a non-SMF caller and a double decision", async () => {
    const { deps, id } = await seeded();
    await expect(
      decideBreach(deps, COMPLIANCE, { id, decision: "REPORT", actor: "compliance" }, NOW),
    ).rejects.toMatchObject({ status: 403 });

    await decideBreach(deps, SMF, { id, decision: "REPORT", actor: "smf" }, NOW);
    await expect(
      decideBreach(deps, SMF, { id, decision: "REPORT", actor: "smf" }, NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s an unknown breach", async () => {
    const { deps } = makeDeps();
    await expect(
      decideBreach(deps, SMF, { id: "nope", decision: "REPORT", actor: "smf" }, NOW),
    ).rejects.toMatchObject({ status: 404 });
  });
});
