<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CCS AR Oversight Platform — Architecture</title>
<link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;600&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  doc-page:not(:defined){visibility:hidden}
  :root{--ink:#101828;--ink2:#4E576A;--mut:#8A93A6;--teal:#0E7490;--tealbg:#E6F3F6;--line:#E3E7EE;--amber:#B45309;--green:#15803D;--red:#B91C1C;--bg3:#F5F7FA}
  *{box-sizing:border-box}
  doc-page{font-family:'DM Sans',sans-serif;color:var(--ink);font-size:13px;line-height:1.55}
  h1{font-family:'EB Garamond',serif;font-size:27px;font-weight:600;margin:0 0 3px;letter-spacing:-.2px}
  h2{font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:var(--teal);margin:22px 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line)}
  .sub{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:1.2px;color:var(--mut);text-transform:uppercase}
  p{margin:0 0 9px}
  .lede{color:var(--ink2);font-size:13.5px;line-height:1.6;margin:8px 0 4px}
  b{font-weight:600}
  .mono{font-family:'DM Mono',monospace}
  /* diagram */
  .diagram{display:flex;flex-direction:column;gap:9px;margin:4px 0 6px}
  .tier{border:1px solid var(--line);border-radius:9px;padding:11px 13px;background:#fff}
  .tier.hl{border-color:var(--teal);background:var(--tealbg)}
  .tier-h{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--teal);margin-bottom:8px}
  .boxes{display:flex;gap:8px;flex-wrap:wrap}
  .box{flex:1;min-width:120px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:#fff}
  .box .bt{font-weight:700;font-size:12px}
  .box .bd{font-size:10.5px;color:var(--ink2);margin-top:2px;line-height:1.4}
  .flow{text-align:center;color:var(--mut);font-size:16px;line-height:.4;margin:-3px 0}
  .pill{display:inline-block;font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.5px;padding:2px 7px;border-radius:5px;background:var(--bg3);color:var(--ink2);border:1px solid var(--line);margin:1px 2px 1px 0}
  .pill.t{background:var(--tealbg);color:var(--teal);border-color:rgba(14,116,144,.3)}
  /* two-col */
  .cols{column-count:2;column-gap:22px}
  .card{break-inside:avoid;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:0 0 9px;background:#fff}
  .card h3{font-size:12.5px;margin:0 0 5px;font-weight:700}
  .card .role{font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.8px;text-transform:uppercase;color:var(--teal);margin-bottom:5px}
  ul{margin:4px 0 0;padding-left:16px}
  li{margin:0 0 3px;color:var(--ink2)}
  .agent{break-inside:avoid;display:flex;gap:9px;padding:6px 0;border-bottom:1px solid var(--line)}
  .agent:last-child{border-bottom:none}
  .agent .an{font-family:'DM Mono',monospace;font-size:11px;font-weight:500;color:var(--ink);flex:0 0 200px}
  .agent .at{flex:0 0 74px}
  .agent .ad{flex:1;font-size:11px;color:var(--ink2)}
  .tag{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:.5px;padding:2px 6px;border-radius:4px;font-weight:500}
  .tag.cron{background:var(--tealbg);color:var(--teal)}
  .tag.hook{background:#EEF2FF;color:#1D4ED8}
  .tag.dem{background:var(--bg3);color:var(--ink2)}
  .guard{border-left:3px solid var(--teal);background:var(--tealbg);border-radius:0 8px 8px 0;padding:10px 13px;margin:6px 0 0;font-size:12px;color:var(--ink2)}
  .foot{margin-top:16px;padding-top:8px;border-top:1px solid var(--line);font-family:'DM Mono',monospace;font-size:8.5px;letter-spacing:.6px;color:var(--mut);display:flex;justify-content:space-between}
</style>
</head>
<body>
<doc-page size="letter" margin="0.6in">
  <h1>CCS AR Oversight Platform</h1>
  <div class="sub">Implementation architecture &middot; CCS (processor) for Razlin Limited &middot; FRN 730805 &middot; SUP 12 principal-firm oversight</div>
  <p class="lede">CCS is licensed to Razlin as the compliance operating platform for its appointed-representative network (SIX, Drake Star, Codrington). Agents draft; the SMF16/17 decides. The system below turns today's front-end prototype into a live, multi-tenant service with an immutable audit trail and autonomous agent operations.</p>

  <h2>System architecture</h2>
  <div class="diagram">
    <div class="tier">
      <div class="tier-h">1 &middot; Users &amp; access — portal.razlin.co.uk, SSO (Entra / Okta)</div>
      <div class="boxes">
        <div class="box"><div class="bt">AR users</div><div class="bd">Submit FPs, teasers, decks, research + upload docs. See own firm only.</div></div>
        <div class="box"><div class="bt">Razlin Compliance</div><div class="bd">Consolidation, registers, chase, drafting. Network-wide read.</div></div>
        <div class="box hl" style="border-color:var(--teal);background:var(--tealbg)"><div class="bt">SMF16/17 — A. Siddiq</div><div class="bd">Sign-Off Queue. Adopt / reject authority. Only egress point.</div></div>
      </div>
    </div>
    <div class="flow">&#9660;</div>
    <div class="tier">
      <div class="tier-h">2 &middot; Application &amp; API (server-side)</div>
      <div class="boxes">
        <div class="box"><div class="bt">Web app</div><div class="bd">The portal UI, served per-role. React/Next recommended.</div></div>
        <div class="box"><div class="bt">API</div><div class="bd"><span class="mono">query_database</span> &middot; <span class="mono">write_register_entry</span> (pending) &middot; <span class="mono">enqueue_for_signoff</span></div></div>
        <div class="box"><div class="bt">Server-side AI</div><div class="bd">Claude review runs here with a vaulted key — never in the browser.</div></div>
      </div>
    </div>
    <div class="flow">&#9660;</div>
    <div class="tier hl">
      <div class="tier-h">3 &middot; Data, documents &amp; audit</div>
      <div class="boxes">
        <div class="box"><div class="bt">Postgres</div><div class="bd">One table per register — ARs, CF30 returns, FP, breaches, risk, T&amp;A.</div></div>
        <div class="box"><div class="bt">Object storage (WORM)</div><div class="bd">Uploaded docs, immutable. SHA-256 recorded server-side.</div></div>
        <div class="box"><div class="bt">Audit trail</div><div class="bd">Append-only. Every submission, upload, decision. 6-yr retention.</div></div>
      </div>
    </div>
    <div class="flow">&#9650;&nbsp;&nbsp;triggers / writes-back&nbsp;&nbsp;&#9650;</div>
    <div class="tier">
      <div class="tier-h">4 &middot; Autonomous agent runtime (Claude Agent SDK, headless)</div>
      <div class="boxes">
        <div class="box"><div class="bt">Scheduler + workers</div><div class="bd">Azure Functions / equivalent. CRON, webhook and on-demand invocations.</div></div>
        <div class="box"><div class="bt">Tool whitelist</div><div class="bd">Per-agent allow-list enforced at the API. No send / file / persist-final.</div></div>
        <div class="box"><div class="bt">Immutable run log</div><div class="bd">Agent id, version, prompt + input hash, tokens, output. 7-yr.</div></div>
      </div>
    </div>
  </div>

  <h2>The seven agents at go-live</h2>
  <div class="agent"><div class="an">agent-quarterly-cycle</div><div class="at"><span class="tag cron">CRON</span></div><div class="ad">Daily 06:00 — drives the CF30 return cycle: send, monitor, chase, escalate.</div></div>
  <div class="agent"><div class="an">agent-consolidator</div><div class="at"><span class="tag hook">WEBHOOK</span></div><div class="ad">On a submitted return — parse, transcribe to registers, cross-check, summarise.</div></div>
  <div class="agent"><div class="an">agent-anomaly</div><div class="at"><span class="tag cron">CRON</span></div><div class="ad">Nightly 02:00 — cross-check registers; surface inconsistencies and late actions.</div></div>
  <div class="agent"><div class="an">agent-notification-drafter</div><div class="at"><span class="tag hook">WEBHOOK</span></div><div class="ad">On a flagged event — draft FCA / ICO / STOR / SAR notifications to the queue.</div></div>
  <div class="agent"><div class="an">agent-cpd-tracker</div><div class="at"><span class="tag cron">CRON</span></div><div class="ad">Daily 06:00 — track per-person CPD toward 35h; draft chase batches.</div></div>
  <div class="agent"><div class="an">agent-pre-meeting-prep</div><div class="at"><span class="tag dem">ON-DEMAND</span></div><div class="ad">Assemble pre-audit prep packs (Companies House, FCA Register, registers, prior records).</div></div>
  <div class="agent"><div class="an">agent-evidence-packer</div><div class="at"><span class="tag dem">ON-DEMAND</span></div><div class="ad">Assemble evidence packs for FCA / s.166 / internal use.</div></div>
  <div class="guard"><b>Guardrail — this is what makes autonomy defensible.</b> Agents can only call <span class="mono">enqueue_for_signoff</span>. The <span class="mono">send-email</span>, <span class="mono">file-regulatory</span> and <span class="mono">persist-final</span> tools are withheld from every agent. Nothing reaches an AR, the FCA or the ICO without SMF16/17 sign-off. "Autonomous" means the agents work the queue and chase continuously — the human still signs.</div>

  <h2>Access model &amp; branding rule</h2>
  <div class="cols">
    <div class="card"><div class="role">Tenant isolation</div><h3>AR users see Razlin only</h3><ul><li>Row-level security scopes every AR to its own firm's data.</li><li>AR-facing outputs carry <b>Razlin branding only</b>; CCS marks are internal.</li><li>Enforced at the auth layer, not by convention.</li></ul></div>
    <div class="card"><div class="role">Integrity</div><h3>Provable document chain</h3><ul><li>SHA-256 on upload, stored beside the file in WORM storage.</li><li>Audit trail append-only — no edit, no delete.</li><li>Retention: docs &amp; audit 6 yrs; agent run logs 7 yrs.</li></ul></div>
  </div>

  <div class="foot"><span>CCS &mdash; Comprehensive Compliance Solutions &middot; processor</span><span>Prepared for SMF16/17 approval &middot; v1.0</span></div>
</doc-page>
<script src="doc-page.js"></script>
</body>
</html>
