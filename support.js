<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Manrope',sans-serif;background:#F3F5F8;color:#101828}
  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-thumb{background:#D3D9E4;border-radius:4px}
  a{color:#0891B2;text-decoration:none}
  a:hover{color:#0E7490}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.78)}}
  @keyframes fadeDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
</style>
</helmet>
<div style="min-height:100vh;background:#F3F5F8;color:#101828;font-family:'Manrope',sans-serif;font-size:14px">

  <header style="position:sticky;top:0;z-index:100;background:rgba(255,255,255,.94);backdrop-filter:blur(14px);border-bottom:1px solid #E3E7EE;padding:0 26px;display:flex;align-items:center;justify-content:space-between;height:62px">
    <div style="display:flex;align-items:center;gap:13px">
      <div style="display:flex;align-items:center;gap:11px;border-right:1px solid #E3E7EE;padding-right:18px;margin-right:4px">
        <svg width="26" height="33" viewBox="0 0 64 84" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CCS Shard" style="filter:drop-shadow(0 0 3px rgba(101,163,13,.35))">
          <defs>
            <linearGradient id="gFaceL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#155E75"/><stop offset="1" stop-color="#06B6D4" stop-opacity="0.92"/></linearGradient>
            <linearGradient id="gFaceR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0891B2"/><stop offset="1" stop-color="#0F172A"/></linearGradient>
            <linearGradient id="gApex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A3E635"/><stop offset="1" stop-color="#84CC16"/></linearGradient>
          </defs>
          <polygon points="32,12 32,74 15,74" fill="url(#gFaceL)"/>
          <polygon points="32,12 49,74 32,74" fill="url(#gFaceR)"/>
          <polygon points="32,2 35,15 29,15" fill="url(#gApex)"/>
          <polygon points="27,9 30,20 23,20" fill="#0891B2"/>
          <polygon points="37,7 40,22 34,22" fill="#155E75"/>
          <line x1="32" y1="12" x2="32" y2="74" stroke="#22D3EE" stroke-width="0.9" opacity="0.85"/>
          <g stroke="#22D3EE" stroke-width="0.6" opacity="0.45"><line x1="24" y1="34" x2="32" y2="34"/><line x1="22" y1="44" x2="32" y2="44"/><line x1="20" y1="54" x2="32" y2="54"/><line x1="18" y1="64" x2="32" y2="64"/></g>
          <circle cx="32" cy="4" r="2.4" fill="#A3E635" opacity="0.9"/>
        </svg>
        <span style="font-family:'Sora',sans-serif;font-weight:700;font-size:20px;letter-spacing:5px;color:#101828;padding-left:2px">CCS</span>
      </div>
      <div style="display:flex;flex-direction:column">
        <span style="font-size:12.5px;font-weight:600;color:#101828;line-height:1">AR Oversight Platform</span>
        <span style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:1.3px;color:#8A93A6;text-transform:uppercase;margin-top:3px">Razlin Ltd · FRN 730805</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:13px">
      <div style="display:flex;align-items:center;gap:6px;background:rgba(8,145,178,.07);border:1px solid rgba(8,145,178,.35);padding:5px 11px;font-family:'JetBrains Mono',monospace;font-size:8px;color:#0891B2;letter-spacing:1.3px;text-transform:uppercase">
        <span style="width:5px;height:5px;border-radius:50%;background:#65A30D;box-shadow:0 0 6px #84CC16;animation:pulse 2s ease-in-out infinite"></span>
        {{ phaseBadge }}
      </div>
      <div style="background:linear-gradient(180deg,#0E7490,#155E75);color:#fff;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;padding:6px 12px">SMF16/17 · {{ operator }}</div>
    </div>
  </header>

  <div style="display:grid;grid-template-columns:238px 1fr;min-height:calc(100vh - 62px)">
    <aside style="background:#FFFFFF;border-right:1px solid #E3E7EE;padding:22px 0;position:sticky;top:62px;max-height:calc(100vh - 62px);overflow-y:auto">
      <sc-for list="{{ navSections }}" as="sec" hint-placeholder-count="3">
        <div style="margin-bottom:16px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:2px;color:#8A93A6;text-transform:uppercase;padding:0 22px;margin-bottom:6px">{{ sec.label }}</div>
          <sc-for list="{{ sec.items }}" as="it" hint-placeholder-count="4">
            <div onClick="{{ it.go }}" style="{{ it.style }}">
              <span style="{{ it.dot }}"></span>
              {{ it.name }}
            </div>
          </sc-for>
        </div>
      </sc-for>
    </aside>

    <main style="padding:28px 32px;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:22px;animation:fadeDown .4s ease both">
        <div>
          <h1 style="font-family:'Sora',sans-serif;font-size:27px;font-weight:600;color:#101828;line-height:1.05;margin-bottom:7px;letter-spacing:-.3px">Go-Live Monitoring</h1>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#8A93A6;letter-spacing:1px">SIX PHASES · FIVE SMF GATES · UPTIME · QUEUE AGE · FAIL-CLOSED ALERTS · AGENTS_AUTONOMOUS={{ flagValue }}</div>
        </div>
        <button onClick="{{ toggleFlag }}" style="{{ flagBtnStyle }}">{{ flagBtnLabel }}</button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;background:linear-gradient(100deg,rgba(180,83,9,.06),transparent);border:1px solid #E3E7EE;border-left:3px solid #B45309;padding:13px 18px;margin-bottom:20px">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#B45309" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <div style="font-size:12.5px;color:#4E576A;line-height:1.45"><strong style="color:#101828">Autonomy is gated, not assumed.</strong> The <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#B45309">AGENTS_AUTONOMOUS</span> flag stays false until Gate 5 — a clean pilot quarter with Codrington, the DPA in place and the pen test signed off. Until then every agent run is operator-triggered.</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:22px;animation:fadeDown .4s .05s ease both">
        <sc-for list="{{ stats }}" as="s" hint-placeholder-count="5">
          <div style="background:#FFFFFF;border:1px solid #E3E7EE;padding:16px 18px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.05)">
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:{{ s.bar }}"></div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:1.3px;color:#8A93A6;text-transform:uppercase;margin-bottom:8px">{{ s.label }}</div>
            <div style="font-family:'Sora',sans-serif;font-size:30px;font-weight:700;color:#101828;line-height:1;margin-bottom:4px;letter-spacing:-.5px">{{ s.value }}</div>
            <div style="font-size:10.5px;color:{{ s.subColor }}">{{ s.sub }}</div>
          </div>
        </sc-for>
      </div>

      <div style="background:#FFFFFF;border:1px solid #E3E7EE;margin-bottom:18px;box-shadow:0 1px 3px rgba(16,24,40,.05);animation:fadeDown .4s .1s ease both">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
          <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">Build → live gates</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6;letter-spacing:.8px">EACH GATE CLEARED IN WRITING BY SMF16/17</div>
        </div>
        <div style="padding:16px 20px;display:flex;flex-direction:column;gap:0">
          <sc-for list="{{ gates }}" as="g" hint-placeholder-count="6">
            <div style="display:flex;gap:14px;align-items:flex-start;padding:11px 0;border-bottom:1px solid rgba(148,163,184,.12)">
              <span style="{{ g.dot }}"></span>
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">
                  <span style="font-family:'Sora',sans-serif;font-size:13.5px;font-weight:600;color:#101828">{{ g.name }}</span>
                  <span style="{{ g.pill }}">{{ g.state }}</span>
                </div>
                <div style="font-size:11.5px;color:#4E576A;line-height:1.45">{{ g.desc }}</div>
              </div>
              <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#8A93A6;white-space:nowrap;padding-top:3px">{{ g.when }}</span>
            </div>
          </sc-for>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">
        <div style="background:#FFFFFF;border:1px solid #E3E7EE;box-shadow:0 1px 3px rgba(16,24,40,.05)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
            <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">Sign-off queue age</div>
            <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6">TARGET &lt; 48H · OLDEST FIRST</span>
          </div>
          <div style="padding:16px 20px;display:flex;flex-direction:column;gap:11px">
            <sc-for list="{{ queueAge }}" as="q" hint-placeholder-count="5">
              <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#0891B2">{{ q.ref }}</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:{{ q.color }}">{{ q.age }}</span>
                </div>
                <div style="height:6px;background:#EDF0F5;position:relative;overflow:hidden">
                  <div style="position:absolute;top:0;left:0;bottom:0;width:{{ q.w }};background:{{ q.color }}"></div>
                </div>
              </div>
            </sc-for>
            <div style="font-size:11px;color:#8A93A6;line-height:1.5;padding-top:4px">Queue age is the primary human-bottleneck metric: agents can only move as fast as {{ operator }} signs.</div>
          </div>
        </div>

        <div style="background:#FFFFFF;border:1px solid #E3E7EE;box-shadow:0 1px 3px rgba(16,24,40,.05)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
            <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">Fail-closed alerts</div>
            <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6">AGENT FAILURES → OPERATOR REVIEW</span>
          </div>
          <div style="padding:6px 0">
            <sc-for list="{{ alerts }}" as="a" hint-placeholder-count="4">
              <div style="display:flex;align-items:baseline;gap:11px;padding:10px 20px;border-bottom:1px solid rgba(148,163,184,.1)">
                <span style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#8A93A6;min-width:78px;white-space:nowrap">{{ a.t }}</span>
                <span style="{{ a.pill }}">{{ a.sev }}</span>
                <span style="font-size:11.5px;color:#4E576A;line-height:1.45">{{ a.d }}</span>
              </div>
            </sc-for>
          </div>
          <div style="padding:12px 20px;border-top:1px solid #E3E7EE;font-size:11px;color:#8A93A6;line-height:1.5">No alert is auto-resolved. Every fail-closed event stays open until an operator clears it.</div>
        </div>
      </div>

      <div style="background:#FFFFFF;border:1px solid #E3E7EE;margin-bottom:24px;box-shadow:0 1px 3px rgba(16,24,40,.05)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
          <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">Definition of done — regulated tool</div>
          <span style="{{ dodPill }}">{{ dodLabel }}</span>
        </div>
        <div style="padding:10px 20px 16px;display:grid;grid-template-columns:1fr 1fr;gap:2px 26px">
          <sc-for list="{{ dod }}" as="d" hint-placeholder-count="6">
            <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.1)">
              <span style="{{ d.box }}">{{ d.tick }}</span>
              <div>
                <div style="font-size:12.5px;color:#101828;font-weight:600">{{ d.t }}</div>
                <div style="font-size:11px;color:#4E576A;line-height:1.4;margin-top:1px">{{ d.d }}</div>
              </div>
            </div>
          </sc-for>
        </div>
      </div>

      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6;letter-spacing:.6px;padding-bottom:20px">CCS — Comprehensive Compliance Solutions · Gates cleared in writing by SMF16/17 · Quarterly platform review: agent output quality, audit completeness, access rights</div>
    </main>
  </div>

  <sc-if value="{{ toast }}" hint-placeholder-val="{{ false }}">
    <div style="position:fixed;bottom:24px;right:24px;z-index:300;background:#FFFFFF;border:1px solid #E3E7EE;border-left:3px solid {{ toast.accent }};box-shadow:0 12px 40px rgba(16,24,40,.18);padding:14px 18px;max-width:380px;animation:toastIn .25s ease both">
      <div style="font-family:'Sora',sans-serif;font-size:13px;font-weight:600;color:#101828;margin-bottom:3px">{{ toast.title }}</div>
      <div style="font-size:12px;color:#4E576A;line-height:1.45">{{ toast.sub }}</div>
    </div>
  </sc-if>

</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:1280,&quot;height&quot;:900},&quot;gate5Cleared&quot;:{&quot;editor&quot;:&quot;boolean&quot;,&quot;default&quot;:false,&quot;tsType&quot;:&quot;boolean&quot;,&quot;section&quot;:&quot;Gates&quot;,&quot;label&quot;:&quot;Gate 5 cleared (pilot + DPA + pen test)&quot;},&quot;agentsAutonomous&quot;:{&quot;editor&quot;:&quot;boolean&quot;,&quot;default&quot;:false,&quot;tsType&quot;:&quot;boolean&quot;,&quot;section&quot;:&quot;Gates&quot;,&quot;label&quot;:&quot;AGENTS_AUTONOMOUS flag&quot;},&quot;operatorName&quot;:{&quot;editor&quot;:&quot;text&quot;,&quot;default&quot;:&quot;A. Siddiq&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;Runtime&quot;,&quot;label&quot;:&quot;Sign-off authority (SMF16/17)&quot;}}">
class Component extends DCLogic {
  state = { toast:null };
  chip(bg,fg,bd){ return "font-family:'JetBrains Mono',monospace;font-size:9.5px;padding:2px 8px;background:"+bg+";color:"+fg+";border:1px solid "+bd+";white-space:nowrap"; }
  flash(title,sub,accent){ this.setState({toast:{title,sub,accent:accent||'#0891B2'}}); clearTimeout(this._tt); this._tt=setTimeout(()=>this.setState({toast:null}),4200); }

  renderVals(){
    const op=this.props.operatorName ?? 'A. Siddiq';
    const gate5=this.props.gate5Cleared ?? false;
    const auto=(this.props.agentsAutonomous ?? false) && gate5;

    const nav=(name,active,href)=>({
      name, go:()=>{ if(href) window.location.href=href; },
      style:'display:flex;align-items:center;gap:10px;padding:8px 22px;font-size:12.5px;cursor:'+(href?'pointer':'default')+';'+(active?'color:#0891B2;border-left:2px solid #0891B2;background:linear-gradient(90deg,rgba(8,145,178,.08),transparent);font-weight:600;':'color:#4E576A;border-left:2px solid transparent;')+'user-select:none',
      dot:'width:6px;height:6px;border-radius:2px;flex-shrink:0;background:'+(active?'#0891B2':'#C4CBD6'),
    });
    const navSections=[
      {label:'Platform', items:[
        nav('Agent Runtime',false,'Agent Runtime & Sign-Off Queue.dc.html'),
        nav('Backend & Data',false,'Backend & Data Infrastructure.dc.html'),
        nav('Deterministic Engine',false,'Deterministic Engine.dc.html'),
        nav('Go-Live Monitoring',true,null),
        nav('AR Portal (Razlin view)',false,'AR Portal (Razlin).dc.html'),
      ]},
      {label:'Operations', items:[nav('Runbook',false,null),nav('Key rotation',false,null),nav('Quarterly review',false,null)]},
    ];

    const done=this.chip('rgba(21,128,61,.1)','#15803D','rgba(21,128,61,.3)');
    const prog=this.chip('rgba(180,83,9,.09)','#B45309','rgba(180,83,9,.28)');
    const wait=this.chip('#EDF0F5','#8A93A6','#D3D9E4');
    const dotStyle=(c)=>'width:12px;height:12px;border-radius:50%;flex-shrink:0;margin-top:4px;border:2.5px solid '+c+';background:'+(c==='#C4CBD6'?'#fff':c);
    const gates=[
      {name:'Gate 1 — Workflows, roster & agent scopes', state:'CLEARED', pill:done, dot:dotStyle('#15803D'), when:'12 Feb 2026', desc:'Prototype walked end-to-end; SIX, Drake Star, Codrington confirmed; draft-only guardrail and T-5BD…T+20BD ladder approved in writing.'},
      {name:'Gate 2 — Backend, data & API on staging', state:'CLEARED', pill:done, dot:dotStyle('#15803D'), when:'20 Mar 2026', desc:'UI on live data; query_database / write_register_entry (pending) / enqueue_for_signoff; AI review server-side; no secrets in the browser.'},
      {name:'Gate 3 — Identity, storage & audit verified', state:'CLEARED', pill:done, dot:dotStyle('#15803D'), when:'24 Apr 2026', desc:'SSO + row-level security tested cross-tenant; WORM storage with SHA-256; append-only audit; 6/7-yr retention enforced.'},
      {name:'Gate 4 — Agent drafts trusted (dry-run quarter)', state:'CLEARED', pill:done, dot:dotStyle('#15803D'), when:'26 Jun 2026', desc:'Seven agents headless, manual-trigger; whitelist test proves no withheld tool reachable; forced error fails closed; engine unit tests green.'},
      {name:'Gate 5 — Pilot quarter closes clean', state: gate5?'CLEARED':'IN PROGRESS', pill:gate5?done:prog, dot:dotStyle(gate5?'#15803D':'#B45309'), when:gate5?'Cleared':'Q3 2026', desc:'Codrington live with real submissions; DPA executed; pen test signed off; one real quarterly cycle with agents still manual.'},
      {name:'Phase 6 — Autonomy & full rollout', state: auto?'LIVE':'GATED', pill:auto?done:wait, dot:dotStyle(auto?'#15803D':'#C4CBD6'), when:auto?'Live':'After Gate 5', desc:'CRON + webhook triggers on; SIX and Drake Star onboarded; monitoring live; SMF quarterly platform review standing.'},
    ];

    const queueAge=[
      {ref:'CCS-AGT-2026-0411 · anomaly flag', h:38},
      {ref:'CCS-AGT-2026-0412 · CF30 chase', h:9},
      {ref:'CCS-AGT-2026-0410 · ICO draft', h:31},
      {ref:'FP-0234 · Codrington teaser', h:52},
      {ref:'CCS-AGT-2026-0408 · CPD strike 1', h:17},
    ].map(q=>({ref:q.ref, age:q.h+'h', w:Math.min(100,q.h/72*100)+'%', color:q.h>48?'#B91C1C':q.h>24?'#B45309':'#15803D'}));

    const sev=(s)=> s==='OPEN'?this.chip('rgba(185,28,28,.09)','#B91C1C','rgba(185,28,28,.3)'):s==='CLEARED'?done:prog;
    const alerts=[
      {t:'Today 02:14', sev:'OPEN', d:'agent-anomaly fail-closed — ambiguous adverse-media match (Drake Star). OPERATOR REVIEW pending.'},
      {t:'11 Apr 03:22', sev:'CLEARED', d:'agent-notification-drafter attempted send_email — blocked 403, reviewed & cleared by Compliance.'},
      {t:'09 Apr 06:00', sev:'CLEARED', d:'agent-quarterly-cycle timeout on registry read — retried clean on manual re-trigger.'},
      {t:'02 Apr 11:12', sev:'CLEARED', d:'Blob write latency > SLO during evidence pack — no data loss, hash chain verified.'},
    ].map(a=>({...a, pill:sev(a.sev)}));

    const boxOn='width:16px;height:16px;flex-shrink:0;border:1.5px solid #15803D;background:#15803D;color:#fff;font-size:11px;line-height:14px;text-align:center;font-weight:700;margin-top:1px';
    const boxOff='width:16px;height:16px;flex-shrink:0;border:1.5px solid #C4CBD6;background:#fff;color:transparent;font-size:11px;line-height:14px;text-align:center;margin-top:1px';
    const dodItems=[
      {t:'Tenant isolation', d:'AR sees only own firm; SMF is sole sign-off; no agent egress beyond the queue.', on:true},
      {t:'Immutable evidence', d:'Every submission, upload, decision and agent run in the append-only audit; docs WORM + SHA-256.', on:true},
      {t:'Deterministic arithmetic', d:'Dates and thresholds code-computed and unit-tested (18/18 green).', on:true},
      {t:'No client-side secrets', d:'Build output grepped; Anthropic key vaulted server-side only.', on:true},
      {t:'DPA executed (CCS↔Razlin)', d:'Processor agreement signed before real AR data.', on:gate5},
      {t:'Pen test signed off', d:'Independent security test completed and accepted.', on:gate5},
    ];
    const dod=dodItems.map(d=>({t:d.t, d:d.d, tick:d.on?'✓':'', box:d.on?boxOn:boxOff}));
    const dodDone=dodItems.filter(d=>d.on).length;

    const stats=[
      {label:'Gates cleared', value:(gate5?'5':'4')+'/5', sub:gate5?'autonomy authorised':'pilot quarter running', subColor:gate5?'#15803D':'#B45309', bar:gate5?'#15803D':'#B45309'},
      {label:'Uptime · 90d', value:'99.97%', sub:'SLO 99.9 · staging+prod', subColor:'#15803D', bar:'#15803D'},
      {label:'Median queue age', value:'26h', sub:'target < 48h', subColor:'#8A93A6', bar:'#0891B2'},
      {label:'Open fail-closed', value:'1', sub:'operator review pending', subColor:'#B91C1C', bar:'#B91C1C'},
      {label:'Agent egress', value:'0', sub:'since first deploy', subColor:'#15803D', bar:'#65A30D'},
    ];

    return {
      operator:op, navSections, gates, queueAge, alerts, dod, stats,
      phaseBadge: auto?'Phase 6 · Autonomous':'Phase 5 · Pilot (Codrington)',
      flagValue: auto?'true':'false',
      flagBtnLabel: auto?'AGENTS_AUTONOMOUS: ON':'Enable autonomy',
      flagBtnStyle: auto
        ? 'background:linear-gradient(180deg,#65A30D,#4D7C0F);color:#fff;border:none;padding:10px 17px;font-family:\'Manrope\',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 2px 12px rgba(101,163,13,.25)'
        : 'background:#FFFFFF;color:'+(gate5?'#101828':'#8A93A6')+';border:1px solid #D3D9E4;padding:10px 17px;font-family:\'Manrope\',sans-serif;font-size:12.5px;font-weight:600;cursor:pointer',
      toggleFlag:()=>{
        if(!gate5){ this.flash('Blocked — Gate 5 not cleared','AGENTS_AUTONOMOUS cannot be enabled until the pilot quarter closes clean, the DPA is executed and the pen test is signed off. Flip the Gate 5 tweak to simulate clearance.','#B91C1C'); }
        else { this.flash('Feature flag is a deploy-time control','In production this flips per-environment config and is recorded in the audit trail with the SMF authorisation reference.','#0891B2'); }
      },
      dodPill:this.chip(dodDone===dodItems.length?'rgba(21,128,61,.1)':'rgba(180,83,9,.09)', dodDone===dodItems.length?'#15803D':'#B45309', dodDone===dodItems.length?'rgba(21,128,61,.3)':'rgba(180,83,9,.28)'),
      dodLabel:dodDone+'/'+dodItems.length+' COMPLETE',
      toast:this.state.toast,
    };
  }
}
</script>
</body>
</html>
