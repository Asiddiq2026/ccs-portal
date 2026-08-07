import { describe, it, expect } from "vitest";
import {
  ageHours,
  ageBand,
  median,
  openQueueAges,
  openFailClosedCount,
  buildSnapshot,
  type QueueItem,
  type AgentRunSummary,
} from "./metrics";

const NOW = new Date("2026-07-20T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("monitoring metrics", () => {
  it("computes whole-hour ages, floored and never negative", () => {
    expect(ageHours(hoursAgo(9), NOW)).toBe(9);
    expect(ageHours(new Date(NOW.getTime() - 90 * 60_000), NOW)).toBe(1); // 1.5h → 1
    expect(ageHours(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(0); // future → 0
  });

  it("bands queue age green <24h, amber 24–48h, red >48h", () => {
    expect(ageBand(9)).toBe("green");
    expect(ageBand(24)).toBe("green");
    expect(ageBand(25)).toBe("amber");
    expect(ageBand(48)).toBe("amber");
    expect(ageBand(52)).toBe("red");
  });

  it("median handles empty, odd, and even lengths", () => {
    expect(median([])).toBe(0);
    expect(median([17])).toBe(17);
    expect(median([9, 17, 38])).toBe(17);
    expect(median([9, 17, 31, 38])).toBe((17 + 31) / 2);
  });

  it("openQueueAges ignores decided items and sorts oldest first", () => {
    const items: QueueItem[] = [
      { ref: "a", enqueuedAt: hoursAgo(9) },
      { ref: "b", enqueuedAt: hoursAgo(52) },
      { ref: "c", enqueuedAt: hoursAgo(31), decidedAt: NOW }, // decided → excluded
    ];
    const rows = openQueueAges(items, NOW);
    expect(rows.map((r) => r.ref)).toEqual(["b", "a"]);
    expect(rows[0].band).toBe("red");
  });

  it("counts fail-closed OPERATOR REVIEW runs", () => {
    const runs: AgentRunSummary[] = [
      { id: "1", verdict: "DRAFT READY", ts: NOW },
      { id: "2", verdict: "OPERATOR REVIEW", ts: NOW },
      { id: "3", verdict: "OPERATOR REVIEW", ts: NOW },
    ];
    expect(openFailClosedCount(runs)).toBe(2);
  });

  it("a reviewed halt is no longer open — the count reaches zero", () => {
    const runs: AgentRunSummary[] = [
      { id: "1", verdict: "OPERATOR REVIEW", ts: NOW, summary: "budget exhausted" },
      { id: "2", verdict: "OPERATOR REVIEW", ts: NOW },
    ];
    // One reviewed → one open; the open item carries its halt summary for the UI.
    const snap = buildSnapshot({
      now: NOW,
      autonomous: false,
      gatesCleared: 4,
      queue: [],
      runs,
      reviewedRunIds: new Set(["2"]),
    });
    expect(snap.failClosed.open).toBe(1);
    expect(snap.failClosed.items.map((i) => i.id)).toEqual(["1"]);
    expect(snap.failClosed.items[0].summary).toBe("budget exhausted");
    // Total halts (agentRuns.operatorReview) still counts both — review ≠ un-happened.
    expect(snap.agentRuns.operatorReview).toBe(2);

    // Both reviewed → none open.
    const cleared = buildSnapshot({
      now: NOW,
      autonomous: false,
      gatesCleared: 4,
      queue: [],
      runs,
      reviewedRunIds: new Set(["1", "2"]),
    });
    expect(cleared.failClosed.open).toBe(0);
    expect(cleared.failClosed.items).toEqual([]);
  });

  it("builds a full snapshot matching the dashboard signals", () => {
    // Mirrors the reference queue-age fixture (38, 9, 31, 52, 17).
    const queue: QueueItem[] = [38, 9, 31, 52, 17].map((h, i) => ({
      ref: `q${i}`,
      enqueuedAt: hoursAgo(h),
    }));
    const runs: AgentRunSummary[] = [
      { id: "1", verdict: "DRAFT READY", ts: NOW },
      { id: "2", verdict: "DRAFT READY", ts: NOW },
      { id: "3", verdict: "OPERATOR REVIEW", ts: NOW },
    ];

    const snap = buildSnapshot({
      now: NOW,
      autonomous: false,
      gatesCleared: 4,
      queue,
      runs,
    });

    expect(snap.generatedAt).toBe(NOW.toISOString());
    expect(snap.autonomous).toBe(false);
    expect(snap.gates).toEqual({ cleared: 4, total: 5 });
    expect(snap.queue.open).toBe(5);
    expect(snap.queue.medianAgeHours).toBe(31); // median of 9,17,31,38,52
    expect(snap.queue.breaching).toBe(1); // only 52h > 48h
    expect(snap.failClosed.open).toBe(1);
    expect(snap.agentRuns).toEqual({ total: 3, draftReady: 2, operatorReview: 1 });
    // Invariant 3 — agents have no egress beyond the sign-off queue.
    expect(snap.agentEgress).toBe(0);
  });
});
