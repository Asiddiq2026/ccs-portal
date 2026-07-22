/* CCS Deterministic Engine — all date/threshold arithmetic in code, never the model.
Portable reference implementation (no deps). Port to TS + unit tests in Phase 6.
Timezone: dates are calendar dates (UTC internally). Bank holidays: England & Wales. */
(function (root) {
'use strict';
const BANK_HOLIDAYS = new Set([
'2025-01-01','2025-04-18','2025-04-21','2025-05-05','2025-05-26','2025-08-25','2025-12-25','2025-12-26',
'2026-01-01','2026-04-03','2026-04-06','2026-05-04','2026-05-25','2026-08-31','2026-12-25','2026-12-28',
'2027-01-01','2027-03-26','2027-03-29','2027-05-03','2027-05-31','2027-08-30','2027-12-27','2027-12-28',
]);
const D = (s) => new Date(s + 'T00:00:00Z');
const iso = (d) => d.toISOString().slice(0, 10);
const fmt = (s) => { const d = D(s); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); };

function isBusinessDay(dateStr) {
const d = D(dateStr), wd = d.getUTCDay();
return wd !== 0 && wd !== 6 && !BANK_HOLIDAYS.has(dateStr);
}
function addBusinessDays(dateStr, n) {
let d = D(dateStr), step = n >= 0 ? 1 : -1, left = Math.abs(n);
while (left > 0) {
d.setUTCDate(d.getUTCDate() + step);
if (isBusinessDay(iso(d))) left--;
}
return iso(d);
}
function quarterEnd(dateStr) {
const d = D(dateStr), q = Math.floor(d.getUTCMonth() / 3);
return iso(new Date(Date.UTC(d.getUTCFullYear(), q * 3 + 3, 0)));
}
// CF30 quarterly return: due = quarter-end + 10 business days
function cf30DueDate(quarterEndStr) { return addBusinessDays(quarterEndStr, 10); }
// Escalation ladder around the due date T
function escalationLadder(dueDateStr) {
return [
{ step: 'T-5BD', date: addBusinessDays(dueDateStr, -5), action: 'Reminder to AR · escalate to Razlin Compliance if unacknowledged' },
{ step: 'T', date: dueDateStr, action: 'Return due · submission window closes' },
{ step: 'T+5BD', date: addBusinessDays(dueDateStr, 5), action: 'Second chase · Compliance flag raised on the AR' },
{ step: 'T+10BD', date: addBusinessDays(dueDateStr, 10), action: 'Escalation to SMF16/17 · oversight meeting agenda item' },
{ step: 'T+20BD', date: addBusinessDays(dueDateStr, 20), action: 'Formal breach consideration · SUP 12 remediation review' },
];
}
// 5-factor risk banding: each factor scored 1-3, total 5-15
function riskBand(factors) {
const total = factors.reduce((a, b) => a + b, 0);
if (total <= 7) return { total, band: 'GREEN', cadence: 'Bi-annual monitoring' };
if (total <= 11) return { total, band: 'AMBER', cadence: 'Quarterly monitoring' };
return { total, band: 'RED', cadence: 'Quarterly + ad-hoc monitoring' };
}
// CPD 35h/yr, three-strike rule (coded thresholds — confirm with RAZ at Gate 1)
function cpdStrike({ hours, required = 35, monthsLeft }) {
if (monthsLeft <= 0 && hours < required) return 3;
if (monthsLeft <= 1 && hours < required * 0.9) return 2;
if (monthsLeft <= 3 && hours < required * 0.75) return 1;
return 0;
}
// Retention clocks
function retentionEnd(dateStr, kind) {
const years = { doc: 6, audit: 6, agent_run: 7 }[kind];
if (years == null) return 'indefinite'; // AR / approved-person records
const d = D(dateStr); d.setUTCFullYear(d.getUTCFullYear() + years);
return iso(d);
}
// UK GDPR Art 33: ICO notification within 72 hours of awareness
function art33Deadline(detectedIso) {
return new Date(new Date(detectedIso).getTime() + 72 * 3600 * 1000).toISOString();
}

function runTests() {
const t = [], eq = (name, got, want) => t.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
eq('Good Friday 2026 is not a business day', isBusinessDay('2026-04-03'), false);
eq('Tue 07 Apr 2026 is a business day', isBusinessDay('2026-04-07'), true);
eq('Quarter end of 14 Feb 2026 → 31 Mar 2026', quarterEnd('2026-02-14'), '2026-03-31');
eq('Q1-2026 due date spans Easter → 16 Apr 2026', cf30DueDate('2026-03-31'), '2026-04-16');
eq('Q4-2026 due date spans New Year → 15 Jan 2027', cf30DueDate('2026-12-31'), '2027-01-15');
eq('T-5BD before 16 Apr 2026 → 09 Apr', addBusinessDays('2026-04-16', -5), '2026-04-09');
eq('T+20BD after 16 Apr skips May Day → 15 May', addBusinessDays('2026-04-16', 20), '2026-05-15');
eq('Risk 5 → GREEN', riskBand([1,1,1,1,1]).band, 'GREEN');
eq('Risk 8 → AMBER', riskBand([2,2,2,1,1]).band, 'AMBER');
eq('Risk 11 → AMBER (upper bound)', riskBand([3,3,2,2,1]).band, 'AMBER');
eq('Risk 12 → RED (lower bound)', riskBand([3,3,2,2,2]).band, 'RED');
eq('CPD 22/35h, 3 months left → strike 1', cpdStrike({ hours: 22, monthsLeft: 3 }), 1);
eq('CPD 34/35h, 1 month left → no strike', cpdStrike({ hours: 34, monthsLeft: 1 }), 0);
eq('CPD 20/35h past deadline → strike 3', cpdStrike({ hours: 20, monthsLeft: 0 }), 3);
eq('Audit retention 6 yr', retentionEnd('2026-04-16', 'audit'), '2032-04-16');
eq('Agent-run retention 7 yr', retentionEnd('2026-04-16', 'agent_run'), '2033-04-16');
eq('AR records retained indefinitely', retentionEnd('2026-04-16', 'ar_record'), 'indefinite');
eq('Art 33: 72h clock', art33Deadline('2026-04-11T08:30:00Z'), '2026-04-14T08:30:00.000Z');
return t;
}

const api = { isBusinessDay, addBusinessDays, quarterEnd, cf30DueDate, escalationLadder, riskBand, cpdStrike, retentionEnd, art33Deadline, runTests, fmt };
root.CCSEngine = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);