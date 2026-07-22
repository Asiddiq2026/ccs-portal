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
<script src="./deterministic-engine.js"></script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Manrope',sans-serif;background:#F3F5F8;color:#101828}
  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-thumb{background:#D3D9E4;border-radius:4px}
  a{color:#0891B2;text-decoration:none}
  a:hover{color:#0E7490}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.78)}}
  @keyframes fadeDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
</style>
</helmet>
<div style="min-height:100vh;background:#F3F5F8;color:#101828;font-family:'Manrope',sans-serif;font-size:14px">

  <header style="position:sticky;top:0;z-index:100;background:rgba(255,255,255,.94);backdrop-filter:blur(14px);border-bottom:1px solid #E3E7EE;padding:0 26px;display:flex;align-items:center;justify-content:space-between;height:62px">
    <div style="display:flex;align-items:center;gap:13px">
      <div style="display:flex;align-items:center;gap:11px;border-right:1px solid #E3E7EE;padding-right:18px;margin-right:4px">
        <svg width="26" height="33" viewBox="0 0 64 84" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CCS Shard" style="filter:drop-shadow(0 0 3px rgba(101,163,13,.35))">
          <defs>
            <linearGradient id="eFaceL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#155E75"/><stop offset="1" stop-color="#06B6D4" stop-opacity="0.92"/></linearGradient>
            <linearGradient id="eFaceR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0891B2"/><stop offset="1" stop-color="#0F172A"/></linearGradient>
            <linearGradient id="eApex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A3E635"/><stop offset="1" stop-color="#84CC16"/></linearGradient>
          </defs>
          <polygon points="32,12 32,74 15,74" fill="url(#eFaceL)"/>
          <polygon points="32,12 49,74 32,74" fill="url(#eFaceR)"/>
          <polygon points="32,2 35,15 29,15" fill="url(#eApex)"/>
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
        {{ testBadge }}
      </div>
      <div style="background:linear-gradient(180deg,#0E7490,#155E75);color:#fff;font-family:'JetBrains Mono',monospace;font-size:9.5px;letter-spacing:1px;padding:6px 12px">SMF16/17 · {{ operator }}</div>
    </div>
  </header>

  <div style="display:grid;grid-template-columns:238px 1fr;min-height:calc(100vh - 62px)">
    <aside style="background:#FFFFFF;border-right:1px solid #E3E7EE;padding:22px 0;overflow-y:auto;max-height:calc(100vh - 62px);position:sticky;top:62px">
      <sc-for list="{{ navSections }}" as="sec" hint-placeholder-count="4">
        <div style="margin-bottom:16px">
          <div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:2px;color:#8A93A6;text-transform:uppercase;padding:0 22px;margin-bottom:6px">{{ sec.label }}</div>
          <sc-for list="{{ sec.items }}" as="it" hint-placeholder-count="3">
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
          <h1 style="font-family:'Sora',sans-serif;font-size:27px;font-weight:600;color:#101828;line-height:1.05;margin-bottom:7px;letter-spacing:-.3px">Deterministic Engine</h1>
          <div style="font-family:'JetBrains Mono',monospace;font-size:9.5px;color:#8A93A6;letter-spacing:1px">DATES · THRESHOLDS · ESCALATION · COMPUTED IN CODE — ZERO LLM INVOLVEMENT · deterministic-engine.js</div>
        </div>
        <button onClick="{{ rerun }}" style="background:linear-gradient(180deg,#06B6D4,#0891B2);color:#fff;border:none;padding:10px 17px;font-family:'Manrope',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:0 2px 12px rgba(8,145,178,.25)" style-hover="filter:brightness(1.06)">Re-run test suite</button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;background:linear-gradient(100deg,rgba(8,145,178,.07),transparent);border:1px solid #E3E7EE;border-left:3px solid #0891B2;padding:13px 18px;margin-bottom:20px">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0891B2" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
        <div style="font-size:12.5px;color:#4E576A;line-height:1.45"><strong style="color:#101828">Agents never do arithmetic.</strong> Quarter-end + 10BD due dates, the T-5BD…T+20BD ladder, CPD 35h three-strike thresholds, 5-factor risk banding, retention clocks and the Art 33 72-hour clock are all pure functions in this module — UK bank-holiday aware, unit-tested, and callable from the agent runtime as <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#0891B2">compute_dates</span> / <span style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#0891B2">compute_thresholds</span>.</div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px;animation:fadeDown .4s .05s ease both">
        <sc-for list="{{ stats }}" as="s" hint-placeholder-count="4">
          <div style="background:#FFFFFF;border:1px solid #E3E7EE;padding:16px 18px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.05)">
            <div style="position:absolute;bottom:0;left:0;right:0;height:2px;background:{{ s.bar }}"></div>
            <div style="font-family:'JetBrains Mono',monospace;font-size:8px;letter-spacing:1.3px;color:#8A93A6;text-transform:uppercase;margin-bottom:8px">{{ s.label }}</div>
            <div style="font-family:'Sora',sans-serif;font-size:30px;font-weight:700;color:#101828;line-height:1;margin-bottom:4px;letter-spacing:-.5px">{{ s.value }}</div>
            <div style="font-size:10.5px;color:{{ s.subColor }}">{{ s.sub }}</div>
          </div>
        </sc-for>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">
        <div style="background:#FFFFFF;border:1px solid #E3E7EE;box-shadow:0 1px 3px rgba(16,24,40,.05)">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
            <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">CF30 cycle computer</div>
            <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6">QUARTER-END + 10BD · E&amp;W BANK HOLIDAYS</span>
          </div>
          <div style="padding:16px 20px">
            <div style="display:flex;gap:8px;margin-bottom:16px">
              <sc-for list="{{ quarters }}" as="q" hint-placeholder-count="4">
                <button onClick="{{ q.pick }}" style="{{ q.style }}">{{ q.label }}</button>
              </sc-for>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
              <div style="background:#F5F7FA;border:1px solid #E3E7EE;padding:11px 13px">
                <div style="font-family:'JetBrains Mono',monospace;font-size:7.5px;letter-spacing:1px;color:#8A93A6;text-transform:uppercase;margin-bottom:4px">Quarter end</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#101828">{{ qEnd }}</div>
              </div>
              <div style="background:rgba(8,145,178,.06);border:1px solid rgba(8,145,178,.3);padding:11px 13px">
                <div style="font-family:'JetBrains Mono',monospace;font-size:7.5px;letter-spacing:1px;color:#0891B2;text-transform:uppercase;margin-bottom:4px">Return due (T)</div>
                <div style="font-family:'JetBrains Mono',monospace;font-size:13px;color:#0891B2;font-weight:500">{{ qDue }}</div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column">
              <sc-for list="{{ ladder }}" as="l" hint-placeholder-count="5">
                <div style="display:flex;gap:12px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(148,163,184,.12)">
                  <span style="{{ l.stepStyle }}">{{ l.step }}</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#101828;min-width:92px;padding-top:2px">{{ l.date }}</span>
                  <span style="font-size:11.5px;color:#4E576A;line-height:1.4;padding-top:1px">{{ l.action }}</span>
                </div>
              </sc-for>
            </div>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:18px">
          <div style="background:#FFFFFF;border:1px solid #E3E7EE;box-shadow:0 1px 3px rgba(16,24,40,.05)">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
              <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">Risk banding calculator</div>
              <span style="{{ bandPill }}">{{ bandLabel }}</span>
            </div>
            <div style="padding:14px 20px;display:flex;flex-direction:column;gap:9px">
              <sc-for list="{{ factors }}" as="f" hint-placeholder-count="5">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
                  <span style="font-size:12px;color:#4E576A">{{ f.name }}</span>
                  <div style="display:flex;gap:5px">
                    <sc-for list="{{ f.opts }}" as="o" hint-placeholder-count="3">
                      <button onClick="{{ o.pick }}" style="{{ o.style }}">{{ o.v }}</button>
                    </sc-for>
                  </div>
                </div>
              </sc-for>
              <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid #E3E7EE;padding-top:11px;margin-top:3px">
                <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6;letter-spacing:1px">TOTAL {{ bandTotal }} / 15</span>
                <span style="font-size:11.5px;color:#4E576A">{{ bandCadence }}</span>
              </div>
            </div>
          </div>
          <div style="background:#FFFFFF;border:1px solid #E3E7EE;box-shadow:0 1px 3px rgba(16,24,40,.05)">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
              <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">CPD three-strike check</div>
              <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6">35H/YR · CODED THRESHOLDS</span>
            </div>
            <div style="padding:6px 0">
              <sc-for list="{{ cpdRows }}" as="p" hint-placeholder-count="4">
                <div style="display:flex;align-items:center;gap:12px;padding:9px 20px;border-bottom:1px solid rgba(148,163,184,.1)">
                  <span style="font-size:12px;color:#101828;font-weight:500;min-width:130px">{{ p.name }}</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#4E576A;min-width:70px">{{ p.hours }}</span>
                  <span style="font-family:'JetBrains Mono',monospace;font-size:10.5px;color:#8A93A6;min-width:88px">{{ p.left }}</span>
                  <span style="{{ p.pill }};margin-left:auto">{{ p.verdict }}</span>
                </div>
              </sc-for>
            </div>
          </div>
        </div>
      </div>

      <div style="background:#FFFFFF;border:1px solid #E3E7EE;margin-bottom:24px;box-shadow:0 1px 3px rgba(16,24,40,.05)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 20px;border-bottom:1px solid #E3E7EE">
          <div style="display:flex;align-items:center;gap:11px">
            <div style="font-family:'Sora',sans-serif;font-size:15px;font-weight:600;color:#101828">Unit test suite</div>
            <span style="{{ suitePill }}">{{ suiteLabel }}</span>
          </div>
          <span style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6">bank-holiday edges · quarter boundaries · band limits · retention</span>
        </div>
        <div style="padding:6px 0">
          <sc-for list="{{ tests }}" as="t" hint-placeholder-count="8">
            <div style="display:flex;align-items:baseline;gap:13px;padding:8px 20px;border-bottom:1px solid rgba(148,163,184,.1)">
              <span style="{{ t.pill }}">{{ t.res }}</span>
              <span style="font-size:12px;color:#101828;min-width:320px">{{ t.name }}</span>
              <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:#8A93A6">got {{ t.got }} · want {{ t.want }}</span>
            </div>
          </sc-for>
        </div>
      </div>

      <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:#8A93A6;letter-spacing:.6px;padding-bottom:20px">CCS — Comprehensive Compliance Solutions · deterministic-engine.js is the single source of date/threshold truth · CPD strike thresholds to be confirmed with RAZ at Gate 1</div>
    </main>
  </div>
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props="{&quot;$preview&quot;:{&quot;width&quot;:1280,&quot;height&quot;:900},&quot;operatorName&quot;:{&quot;editor&quot;:&quot;text&quot;,&quot;default&quot;:&quot;A. Siddiq&quot;,&quot;tsType&quot;:&quot;string&quot;,&quot;section&quot;:&quot;Runtime&quot;,&quot;label&quot;:&quot;Sign-off authority (SMF16/17)&quot;}}">
class Component extends DCLogic {
  state = { q: 0, factors: [2,1,3,1,2], testNonce: 0 };
  componentDidMount(){ if(!window.CCSEngine){ this._iv=setInterval(()=>{ if(window.CCSEngine){ clearInterval(this._iv); this.forceUpdate(); } },100); } }
  componentWillUnmount(){ clearInterval(this._iv); }

  chip(bg,fg,bd){ return "font-family:'JetBrains Mono',monospace;font-size:10px;padding:3px 9px;background:"+bg+";color:"+fg+";border:1px solid "+bd+";white-space:nowrap"; }

  renderVals(){
    const E = window.CCSEngine;
    const op = this.props.operatorName ?? 'A. Siddiq';
    const nav=(name,active,href)=>({
      name, go:()=>{ if(href) window.location.href=href; },
      style:'display:flex;align-items:center;gap:10px;padding:8px 22px;font-size:12.5px;cursor:'+(href||active?'pointer':'default')+';'+(active?'color:#0891B2;border-left:2px solid #0891B2;background:linear-gradient(90deg,rgba(8,145,178,.08),transparent);font-weight:600;':'color:#4E576A;border-left:2px solid transparent;')+'user-select:none',
      dot:'width:6px;height:6px;border-radius:2px;flex-shrink:0;background:'+(active?'#0891B2':'#C4CBD6'),
    });
    const navSections=[
      {label:'Platform', items:[
        nav('Agent Runtime',false,'Agent Runtime & Sign-Off Queue.dc.html'),
        nav('Backend & Data',false,'Backend & Data Infrastructure.dc.html'),
        nav('Deterministic Engine',true,null),
        nav('Go-Live Monitoring',false,'Go-Live Monitoring.dc.html'),
        nav('AR Portal (Razlin view)',false,'AR Portal (Razlin).dc.html'),
      ]},
      {label:'Engine consumers', items:[nav('CF30 Returns',false,null),nav('AR Risk Scoring',false,null),nav('CPD & Certification',false,null),nav('Data Breaches (ICO)',false,null)]},
    ];

    if(!E){
      return { operator:op, testBadge:'Engine · loading', navSections, stats:[], quarters:[], ladder:[], factors:[], cpdRows:[], tests:[],
        qEnd:'—', qDue:'—', bandPill:this.chip('#EDF0F5','#8A93A6','#D3D9E4'), bandLabel:'—', bandTotal:'—', bandCadence:'—',
        suitePill:this.chip('#EDF0F5','#8A93A6','#D3D9E4'), suiteLabel:'LOADING', rerun:()=>this.forceUpdate() };
    }

    const tests = E.runTests();
    const passed = tests.filter(t=>t.pass).length;
    const allPass = passed===tests.length;

    const qEnds=['2026-03-31','2026-06-30','2026-09-30','2026-12-31'];
    const qi=this.state.q;
    const due=E.cf30DueDate(qEnds[qi]);
    const ladder=E.escalationLadder(due).map((l,i)=>({
      step:l.step, date:E.fmt(l.date), action:l.action,
      stepStyle:this.chip(i===1?'rgba(8,145,178,.1)':i<1?'#EDF0F5':'rgba(180,83,9,.09)', i===1?'#0891B2':i<1?'#4E576A':'#B45309', i===1?'rgba(8,145,178,.35)':i<1?'#D3D9E4':'rgba(180,83,9,.28)')+';min-width:58px;text-align:center',
    }));
    const quarters=qEnds.map((qe,i)=>({
      label:'Q'+(i+1)+' 2026', pick:()=>this.setState({q:i}),
      style:'flex:1;padding:7px 0;font-family:\'JetBrains Mono\',monospace;font-size:10.5px;cursor:pointer;border:1px solid '+(i===qi?'rgba(8,145,178,.4);background:rgba(8,145,178,.08);color:#0891B2;font-weight:500':'#D3D9E4;background:#FFFFFF;color:#4E576A'),
    }));

    const fNames=['Permissions & RAO scope','Complaints history','FP volume & complexity','Training & competence','Prior breaches'];
    const band=E.riskBand(this.state.factors);
    const bandColors={GREEN:['rgba(21,128,61,.1)','#15803D','rgba(21,128,61,.3)'],AMBER:['rgba(180,83,9,.09)','#B45309','rgba(180,83,9,.28)'],RED:['rgba(185,28,28,.09)','#B91C1C','rgba(185,28,28,.3)']}[band.band];
    const factors=fNames.map((name,fi)=>({
      name,
      opts:[1,2,3].map(v=>({ v:String(v), pick:()=>this.setState(s=>{ const f=[...s.factors]; f[fi]=v; return {factors:f}; }),
        style:'width:30px;height:26px;font-family:\'JetBrains Mono\',monospace;font-size:11px;cursor:pointer;border:1px solid '+(this.state.factors[fi]===v?'rgba(8,145,178,.4);background:rgba(8,145,178,.08);color:#0891B2;font-weight:500':'#D3D9E4;background:#FFFFFF;color:#8A93A6') })),
    }));

    const people=[
      {name:'A. Mensah · Drake Star', hours:22, monthsLeft:3},
      {name:'J. Okafor · SIX', hours:31, monthsLeft:3},
      {name:'R. Bailey · Codrington', hours:29, monthsLeft:1},
      {name:'T. Whitmore · SIX', hours:20, monthsLeft:0},
    ];
    const strikePill=(n)=> n===0?this.chip('rgba(21,128,61,.1)','#15803D','rgba(21,128,61,.3)'):n===1?this.chip('rgba(180,83,9,.09)','#B45309','rgba(180,83,9,.28)'):this.chip('rgba(185,28,28,.09)','#B91C1C','rgba(185,28,28,.3)');
    const cpdRows=people.map(p=>{
      const s=E.cpdStrike(p);
      return { name:p.name, hours:p.hours+' / 35h', left:p.monthsLeft+' mo left', verdict:s===0?'ON TRACK':'STRIKE '+s, pill:strikePill(s) };
    });

    const testRows=tests.map(t=>({ ...t, res:t.pass?'PASS':'FAIL', pill:this.chip(t.pass?'rgba(21,128,61,.1)':'rgba(185,28,28,.09)', t.pass?'#15803D':'#B91C1C', t.pass?'rgba(21,128,61,.3)':'rgba(185,28,28,.3)')+';min-width:46px;text-align:center' }));

    const stats=[
      {label:'Tests passing', value:passed+'/'+tests.length, sub:allPass?'suite green':'FAILURES — fix before Gate 4', subColor:allPass?'#15803D':'#B91C1C', bar:allPass?'#15803D':'#B91C1C'},
      {label:'Pure functions', value:'9', sub:'no I/O · no LLM', subColor:'#8A93A6', bar:'#0891B2'},
      {label:'Bank holidays coded', value:'24', sub:'E&W · 2025–2027', subColor:'#8A93A6', bar:'#1D4ED8'},
      {label:'Model arithmetic', value:'0', sub:'agents call, never compute', subColor:'#15803D', bar:'#65A30D'},
    ];

    return {
      operator:op, navSections, stats, quarters, ladder, factors, cpdRows, tests:testRows,
      testBadge: allPass?'Engine · '+passed+'/'+tests.length+' green':'Engine · FAILING',
      qEnd:E.fmt(qEnds[qi]), qDue:E.fmt(due),
      bandPill:this.chip(bandColors[0],bandColors[1],bandColors[2]), bandLabel:band.band+' · '+band.total,
      bandTotal:String(band.total), bandCadence:band.cadence,
      suitePill:this.chip(allPass?'rgba(21,128,61,.1)':'rgba(185,28,28,.09)', allPass?'#15803D':'#B91C1C', allPass?'rgba(21,128,61,.3)':'rgba(185,28,28,.3)'),
      suiteLabel: passed+'/'+tests.length+' PASSING',
      rerun:()=>this.setState(s=>({testNonce:s.testNonce+1})),
    };
  }
}
</script>
</body>
</html>
