<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CCS AR Oversight Platform — Go-Live Checklist</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  doc-page:not(:defined){visibility:hidden}
  :root{--ink:#101828;--ink2:#4E576A;--mut:#8A93A6;--teal:#0E7490;--tealbg:#E6F3F6;--line:#E3E7EE;--amber:#B45309;--green:#15803D;--bg3:#F5F7FA}
  *{box-sizing:border-box}
  doc-page{font-family:'DM Sans',sans-serif;color:var(--ink);font-size:13px;line-height:1.55}
  h1{font-family:'EB Garamond',serif;font-size:27px;font-weight:600;margin:0 0 3px;letter-spacing:-.2px}
  .sub{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:1.2px;color:var(--mut);text-transform:uppercase;margin-bottom:10px}
  .lede{color:var(--ink2);font-size:13px;line-height:1.6;margin:6px 0 4px}
  h2{font-size:12px;font-weight:700;letter-spacing:1.1px;text-transform:uppercase;color:var(--teal);margin:20px 0 4px;padding-bottom:5px;border-bottom:1px solid var(--line);break-after:avoid}
  .phase-meta{font-family:'DM Mono',monospace;font-size:9px;color:var(--mut);letter-spacing:.6px;margin:-2px 0 8px}
  .item{break-inside:avoid;display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);align-items:flex-start}
  .item:last-child{border-bottom:none}
  .chk{flex:0 0 15px;width:15px;height:15px;border:1.5px solid var(--teal);border-radius:4px;margin-top:1px}
  .it{flex:1}
  .it .t{font-weight:600;font-size:12.5px}
  .it .d{font-size:11px;color:var(--ink2);margin-top:1px;line-height:1.45}
  .owner{flex:0 0 96px;text-align:right;font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.4px;color:var(--teal);text-transform:uppercase;margin-top:2px}
  b{font-weight:600}
  .mono{font-family:'DM Mono',monospace}
  .gate{break-inside:avoid;border-left:3px solid var(--amber);background:#FBF3E7;border-radius:0 8px 8px 0;padding:9px 12px;margin:8px 0 2px;font-size:11.5px;color:var(--ink2)}
  .gate b{color:var(--amber)}
  .foot{margin-top:16px;padding-top:8px;border-top:1px solid var(--line);font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.6px;color:var(--mut);display:flex;justify-content:space-between}
</style>
</head>
<body>
<doc-page size="letter" margin="0.6in">
  <h1>Go-Live Checklist</h1>
  <div class="sub">CCS AR Oversight Platform &middot; Razlin Limited FRN 730805 &middot; sequenced build &rarr; live</div>
  <p class="lede">Six phases from the current prototype to autonomous live operation. Each phase ends at a gate that the SMF16/17 must clear before the next begins. Owner tags: <span class="mono">CCS</span> platform build, <span class="mono">RAZ</span> Razlin, <span class="mono">DEV</span> engineering.</p>

  <h2>Phase 1 — Internal sign-off of the prototype</h2>
  <div class="phase-meta">NOW &middot; no build &middot; validates workflows before spend</div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Walk the prototype end-to-end with SMF16/17</div><div class="d">Dashboard, AR register, CF30 returns, risk scoring, FP submission &rarr; adopt &rarr; audit, training &amp; assessment.</div></div><div class="owner">RAZ</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Confirm the roster &amp; roles</div><div class="d">SIX, Drake Star, Codrington as ARs; introducer + pipeline as-is; three access roles agreed.</div></div><div class="owner">RAZ</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Sign off the seven agent scopes &amp; escalation timings</div><div class="d">Confirm the draft-only guardrail and the T-5BD&hellip;T+20BD cycle are acceptable.</div></div><div class="owner">RAZ</div></div>
  <div class="gate"><b>Gate 1:</b> SMF16/17 approves workflows, roster and agent scopes in writing.</div>

  <h2>Phase 2 — Backend, data &amp; API</h2>
  <div class="phase-meta">Build &middot; the largest phase</div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Provision hosting &amp; secrets vault</div><div class="d">Cloud tenancy (Azure recommended, fits the agent runtime); AI key in Key Vault, never client-side.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Model the database</div><div class="d">One table per register from the prototype datasets; foreign keys to AR + person; status enums.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Build the API</div><div class="d"><span class="mono">query_database</span> (read), <span class="mono">write_register_entry</span> (pending sign-off), <span class="mono">enqueue_for_signoff</span>, plus CRUD for the UI.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Port the UI to the codebase</div><div class="d">Recreate the portal in the chosen framework; swap in-file <span class="mono">const</span> data for API calls. Preserve look &amp; interactions.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Move the AI review server-side</div><div class="d">FP AI-review endpoint runs on the server; UI calls the API, not Anthropic directly.</div></div><div class="owner">DEV</div></div>
  <div class="gate"><b>Gate 2:</b> UI runs on live data in a staging environment; no secrets in the browser.</div>

  <h2>Phase 3 — Identity, storage &amp; audit</h2>
  <div class="phase-meta">Build &middot; the compliance-critical controls</div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">SSO + role-based access</div><div class="d">Entra/Okta; AR / Compliance / SMF roles; row-level security so ARs see only their own firm.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">WORM document storage</div><div class="d">Object storage with immutability on; SHA-256 recorded server-side on every upload.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Append-only audit trail</div><div class="d">Every submission, upload, decision and agent run written immutably; export to CSV/PDF.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Retention policy enforced</div><div class="d">Docs &amp; audit 6 yrs; agent run logs 7 yrs; AR/approved-person records kept indefinitely.</div></div><div class="owner">CCS</div></div>
  <div class="gate"><b>Gate 3:</b> Access, integrity and retention independently verified.</div>

  <h2>Phase 4 — Agent runtime (manual trigger first)</h2>
  <div class="phase-meta">Build &middot; agents run, but a human presses go</div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Deploy the seven agents headless</div><div class="d">Claude Agent SDK workers; per-agent prompt, tool whitelist and typed output schema.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Enforce the tool whitelist</div><div class="d">Withhold <span class="mono">send-email</span> / <span class="mono">file-regulatory</span> / <span class="mono">persist-final</span>; only <span class="mono">enqueue_for_signoff</span> permitted. Fail-closed.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Run agents in manual/dry-run mode</div><div class="d">Operator triggers each agent; SMF16/17 reviews every draft in the queue for accuracy.</div></div><div class="owner">RAZ</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Deterministic date/threshold engine</div><div class="d">Deadlines, retention and escalation steps computed by rules — not by the model.</div></div><div class="owner">DEV</div></div>
  <div class="gate"><b>Gate 4:</b> Agent drafts trusted across a full dry-run quarter cycle.</div>

  <h2>Phase 5 — Controlled AR pilot</h2>
  <div class="phase-meta">One AR live</div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Onboard Codrington as pilot</div><div class="d">Real users, real submissions and uploads; Compliance + SMF working the live queue.</div></div><div class="owner">RAZ</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Data-processing agreement + pen test</div><div class="d">CCS&harr;Razlin DPA (CCS is processor); independent security test signed off.</div></div><div class="owner">CCS</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Run one real quarterly cycle</div><div class="d">Agents still manual-trigger; confirm chase, consolidation and sign-off behave against real data.</div></div><div class="owner">RAZ</div></div>
  <div class="gate"><b>Gate 5:</b> Pilot quarter closes clean; SMF16/17 authorises autonomy + rollout.</div>

  <h2>Phase 6 — Autonomy &amp; full rollout</h2>
  <div class="phase-meta">Live</div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Switch agents to scheduled</div><div class="d">CRON + webhook triggers enabled; agents work the queue autonomously, humans still sign off.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Onboard SIX and Drake Star</div><div class="d">Extend tenancy; per-firm data isolation confirmed for each.</div></div><div class="owner">RAZ</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Monitoring &amp; alerting live</div><div class="d">Agent failures fail-closed to an OPERATOR REVIEW flag; uptime + queue-age dashboards on.</div></div><div class="owner">DEV</div></div>
  <div class="item"><div class="chk"></div><div class="it"><div class="t">Quarterly platform review</div><div class="d">SMF16/17 reviews agent output quality, audit completeness and access rights each quarter.</div></div><div class="owner">RAZ</div></div>

  <div class="foot"><span>CCS &mdash; Comprehensive Compliance Solutions &middot; processor</span><span>Go-live checklist &middot; v1.0</span></div>
</doc-page>
<script src="doc-page.js"></script>
</body>
</html>
