import React, { useState, useEffect, useRef, useCallback } from "react";

const STATUS = { IDLE:"IDLE", LIVE:"LIVE", FOUND:"FOUND", PAUSED:"PAUSED" };
const f2   = n => typeof n==="number"?n.toFixed(2):"--";
const fUp  = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
const now8 = () => new Date().toISOString().slice(11,19);

function Pill({ status }) {
  const M = {
    IDLE:   {bg:"#1a1a2e",bd:"#333",   tx:"#555",   dot:"#444",   lb:"IDLE"},
    LIVE:   {bg:"#0a1628",bd:"#0ea5e9",tx:"#38bdf8",dot:"#0ea5e9",lb:"LIVE"},
    FOUND:  {bg:"#0a2010",bd:"#22c55e",tx:"#4ade80",dot:"#22c55e",lb:"EDGE FOUND"},
    PAUSED: {bg:"#1a1200",bd:"#ca8a04",tx:"#facc15",dot:"#ca8a04",lb:"PAUSED"},
  };
  const C=M[status]||M.IDLE;
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 14px",background:C.bg,border:`1px solid ${C.bd}`,borderRadius:20}}>
      <span style={{width:7,height:7,borderRadius:"50%",background:C.dot,boxShadow:`0 0 8px ${C.dot}`,animation:(status==="LIVE"||status==="FOUND")?"blink 1s infinite":"none"}}/>
      <span style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.tx,fontFamily:"monospace"}}>{C.lb}</span>
    </div>
  );
}

function Stat({ label, value, color, sub }) {
  return (
    <div style={{background:"#0d1117",border:"1px solid #1e2a3a",borderRadius:10,padding:"12px 16px",flex:1,minWidth:80}}>
      <div style={{fontSize:8,color:"#4a5568",letterSpacing:2,marginBottom:4,fontFamily:"monospace"}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color:color||"#38bdf8",fontFamily:"monospace"}}>{value}</div>
      {sub&&<div style={{fontSize:8,color:"#334155",marginTop:2}}>{sub}</div>}
    </div>
  );
}

function LogLine({ e }) {
  const c=e.type==="success"?"#4ade80":e.type==="warn"?"#facc15":e.type==="error"?"#f87171":e.type==="live"?"#0ea5e9":"#334155";
  return (
    <div style={{display:"flex",gap:8,padding:"2px 0",borderBottom:"1px solid #080808",fontSize:10}}>
      <span style={{color:"#1e2a3a",fontFamily:"monospace",flexShrink:0}}>{e.time}</span>
      <span style={{color:c}}>{e.msg}</span>
    </div>
  );
}

function OppRow({ o }) {
  const ec=Math.abs(o.netEdge)>2?"#4ade80":Math.abs(o.netEdge)>1?"#facc15":"#f87171";
  return (
    <div style={{padding:"10px 14px",borderBottom:"1px solid #111",background:Math.abs(o.netEdge)>2?"#080f1e":"#0a0a14",borderLeft:"3px solid #0ea5e9"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <div>
          <span style={{color:"#0ea5e9",fontFamily:"monospace",fontSize:10,fontWeight:700}}>[{o.stationId}]</span>
          <span style={{color:"#e2e8f0",fontSize:11,marginLeft:8}}>{o.city} — {o.outcome}</span>
          {o.isLive&&<span style={{fontSize:8,color:"#4ade80",background:"#0a2010",padding:"1px 5px",borderRadius:3,marginLeft:8}}>LIVE</span>}
        </div>
        <div style={{fontSize:11,fontWeight:800,color:ec,fontFamily:"monospace"}}>
          {o.direction} | {o.netEdge>0?"+":""}{f2(o.netEdge)}%
        </div>
      </div>
      <div style={{fontSize:9,color:"#4a5568"}}>
        Model: {o.modelProb?(o.modelProb*100).toFixed(1):"--"}% | Poly: {o.polyProb?(o.polyProb*100).toFixed(1):"--"}% | Spread: {o.spread}% | {o.ts}
      </div>
      {o.question&&<div style={{fontSize:9,color:"#334155",marginTop:3}}>{o.question.slice(0,80)}</div>}
    </div>
  );
}

function StationDetail({ data, loading, onRefresh }) {
  if (loading) return <div style={{textAlign:"center",color:"#334155",padding:"60px 0",fontSize:12}}>Scanning...</div>;
  if (!data)   return <div style={{textAlign:"center",color:"#1e2a3a",padding:"60px 0",fontSize:12}}>Select a station or click SCAN ALL</div>;
  const st=data.station, cnd=data.conditions||{};
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:"#e2e8f0"}}>{st.city} <span style={{fontSize:10,color:"#4a5568"}}>{st.country}</span></div>
          <div style={{fontSize:9,color:"#0ea5e9",fontFamily:"monospace",marginTop:2}}>[{st.stationId}] {st.stationName} | {st.lat}, {st.lon}</div>
          <div style={{fontSize:8,color:"#334155",marginTop:2}}>{data.modelsOk}/3 models | {data.liveMarkets} live markets | {data.fetchTime?.slice(11,19)}</div>
        </div>
        <button onClick={onRefresh} style={{background:"#1e2a3a",color:"#64748b",border:"1px solid #1e2a3a",borderRadius:5,padding:"5px 10px",cursor:"pointer",fontSize:9,fontFamily:"monospace"}}>Refresh</button>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {[{l:"TEMP",v:`${cnd.tempC}C`,c:"#f97316"},{l:"HUMIDITY",v:`${cnd.hum}%`,c:"#38bdf8"},{l:"WIND",v:`${cnd.wind}kph`,c:"#a78bfa"},{l:"MAX",v:`${cnd.maxC}C/${cnd.maxF}F`,c:"#facc15"},{l:"PRECIP",v:`${cnd.precIn}in`,c:"#4ade80"}].map(x=>(
          <div key={x.l} style={{flex:1,background:"#0a0a14",border:"1px solid #1e2a3a",borderRadius:7,padding:"7px 9px",minWidth:0}}>
            <div style={{fontSize:7,color:"#4a5568",letterSpacing:1,marginBottom:2}}>{x.l}</div>
            <div style={{fontSize:12,fontWeight:800,color:x.c,fontFamily:"monospace"}}>{x.v}</div>
          </div>
        ))}
      </div>

      {data.opportunities?.length>0&&(
        <div style={{marginBottom:12}}>
          <div style={{fontSize:8,color:"#4ade80",letterSpacing:2,marginBottom:6}}>{data.opportunities.length} LIVE EDGE(S) FOUND</div>
          {data.opportunities.map((o,i)=>(
            <div key={i} style={{background:"#080f1e",border:"1px solid #22c55e",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:"#4ade80",fontFamily:"monospace",fontWeight:700,fontSize:12}}>{o.direction} — {o.outcome}</span>
                <span style={{color:"#4ade80",fontFamily:"monospace",fontWeight:800}}>+{f2(o.netEdge)}% net</span>
              </div>
              <div style={{fontSize:9,color:"#4a5568"}}>Model: {(o.modelProb*100).toFixed(1)}% vs Poly: {(o.polyProb*100).toFixed(1)}% | Spread: {o.spread}% | {o.isLive?"LIVE PRICE":"est"}</div>
              {o.question&&<div style={{fontSize:9,color:"#334155",marginTop:3}}>{o.question.slice(0,70)}</div>}
            </div>
          ))}
        </div>
      )}

      {data.markets?.length>0&&(
        <div>
          <div style={{fontSize:8,color:"#334155",letterSpacing:2,marginBottom:6}}>LIVE POLYMARKET MARKETS</div>
          {data.markets.map((m,i)=>(
            <div key={i} style={{background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:7,padding:"8px 10px",marginBottom:4}}>
              <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.4}}>{(m.question||m.title||"").slice(0,80)}</div>
              <div style={{display:"flex",gap:12,marginTop:4,fontSize:9,color:"#4a5568"}}>
                <span>Vol: ${Number(m.volume||m.volume24hr||0).toLocaleString()}</span>
                {m.outcomePrices&&<span style={{color:"#38bdf8"}}>YES: {(parseFloat(m.outcomePrices[0]||0)*100).toFixed(0)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [status,setStatus]    = useState(STATUS.IDLE);
  const [stations,setStns]    = useState([]);
  const [selIdx,setSelIdx]    = useState(0);
  const [scanData,setScanData]= useState({});
  const [loadingIds,setLdg]   = useState(new Set());
  const [opps,setOpps]        = useState([]);
  const [log,setLog]          = useState([]);
  const [stats,setStats]      = useState({edges:0,scanned:0,uptime:0,lastScan:null});
  const [tab,setTab]          = useState("live");
  const [health,setHealth]    = useState(null);
  const [minEdge,setMinEdge]  = useState(1.5);
  const [simMode,setSimMode]  = useState(true);
  const [wsOk,setWsOk]       = useState(false);

  const scanRef=useRef(null), uptRef=useRef(null), t0Ref=useRef(null), wsRef=useRef(null);

  const addLog=useCallback((msg,type)=>setLog(p=>[{id:Date.now()+Math.random(),time:now8(),msg,type:type||"info"},...p].slice(0,80)),[]);

  useEffect(()=>{
    fetch("/api/stations").then(r=>r.json()).then(d=>{setStns(d);addLog(`Loaded ${d.length} stations`,"success");}).catch(e=>addLog("Stations: "+e.message,"error"));
    fetch("/api/health").then(r=>r.json()).then(h=>{setHealth(h);addLog("Server OK | uptime "+Math.floor(h.uptime)+"s","success");}).catch(e=>addLog("Health: "+e.message,"error"));
  },[addLog]);

  useEffect(()=>{
    const proto=window.location.protocol==="https:"?"wss:":"ws:";
    const ws=new WebSocket(`${proto}//${window.location.host}`);
    wsRef.current=ws;
    ws.onopen=()=>{setWsOk(true);addLog("WebSocket connected — live price relay active","live");};
    ws.onclose=()=>{setWsOk(false);addLog("WebSocket disconnected","warn");};
    ws.onmessage=evt=>{ try{ const d=JSON.parse(evt.data); if(d.event_type==="price_change") addLog("Price update received","live"); }catch(e){} };
    return ()=>ws.close();
  },[addLog]);

  const scanStation=useCallback(async(stationId)=>{
    setLdg(p=>new Set([...p,stationId]));
    addLog(`[${stationId}] Scanning...`,"info");
    try {
      const res=await fetch(`/api/scan/${stationId}?minEdge=${minEdge}`);
      const data=await res.json();
      if(data.error) throw new Error(data.error);
      setScanData(p=>({...p,[stationId]:data}));
      setStats(s=>({...s,scanned:s.scanned+1,lastScan:now8()}));
      addLog(`[${stationId}] ${data.modelsOk}/3 models | ${data.liveMarkets} markets | ${data.opportunities.length} edges`,"success");
      if(data.opportunities.length>0){
        setStatus(STATUS.FOUND);
        setTimeout(()=>setStatus(c=>c===STATUS.FOUND?STATUS.LIVE:c),3000);
        const newOpps=data.opportunities.map(o=>({...o,city:data.station.city,stationId,ts:now8()}));
        setOpps(p=>[...newOpps,...p].slice(0,30));
        setStats(s=>({...s,edges:s.edges+newOpps.length}));
        newOpps.forEach(o=>addLog(`EDGE [${stationId}] ${o.outcome} ${o.direction} net=${f2(o.netEdge)}%`,"success"));
      }
    } catch(e){ addLog(`[${stationId}] Error: ${e.message}`,"error"); }
    setLdg(p=>{ const n=new Set(p); n.delete(stationId); return n; });
  },[minEdge,addLog]);

  const scanAll=useCallback(async()=>{
    addLog("Full scan started...","info");
    for(const st of stations){ await scanStation(st.stationId); await new Promise(r=>setTimeout(r,500)); }
    addLog("Scan complete","success");
  },[stations,scanStation,addLog]);

  const start=useCallback(()=>{
    setStatus(STATUS.LIVE); t0Ref.current=Date.now();
    addLog("Bot LIVE — scanning every 6 minutes","success");
    scanAll();
    scanRef.current=setInterval(scanAll,6*60*1000);
    uptRef.current=setInterval(()=>setStats(s=>({...s,uptime:Math.floor((Date.now()-t0Ref.current)/1000)})),1000);
  },[scanAll,addLog]);

  const stop=useCallback(()=>{ clearInterval(scanRef.current); clearInterval(uptRef.current); setStatus(STATUS.PAUSED); addLog("Paused","warn"); },[addLog]);
  const reset=useCallback(()=>{ clearInterval(scanRef.current); clearInterval(uptRef.current); setStatus(STATUS.IDLE); setOpps([]); setLog([]); setScanData({}); setStats({edges:0,scanned:0,uptime:0,lastScan:null}); addLog("Reset","info"); },[addLog]);
  useEffect(()=>()=>{ clearInterval(scanRef.current); clearInterval(uptRef.current); },[]);

  const isRunning=status===STATUS.LIVE||status===STATUS.FOUND;
  const selSt=stations[selIdx];
  const selData=selSt?scanData[selSt.stationId]:null;
  const selLoading=selSt?loadingIds.has(selSt.stationId):false;

  return (
    <div style={{background:"#060910",minHeight:"100vh",color:"#c9d1d9",fontFamily:"'Courier New',monospace",padding:18}}>
      <style>{"@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0d1117} ::-webkit-scrollbar-thumb{background:#1e2a3a;border-radius:2px}"}</style>

      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#e2e8f0",letterSpacing:2}}>POLYMARKET ARB BOT</div>
            <div style={{fontSize:9,color:"#334155",letterSpacing:2,marginTop:2}}>OPEN-METEO + GAMMA API + CLOB WS | DOCKER</div>
          </div>
          <Pill status={status}/>
          <div style={{fontSize:8,fontFamily:"monospace",padding:"3px 7px",borderRadius:3,background:wsOk?"#0a2010":"#111",color:wsOk?"#4ade80":"#334155",border:`1px solid ${wsOk?"#4ade80":"#1e2a3a"}`}}>WS:{wsOk?"OK":"--"}</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          {!isRunning
            ?<button onClick={start} style={{background:"#0ea5e9",color:"#000",border:"none",borderRadius:7,padding:"7px 16px",fontWeight:800,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>START LIVE</button>
            :<button onClick={stop}  style={{background:"#ca8a04",color:"#000",border:"none",borderRadius:7,padding:"7px 16px",fontWeight:800,cursor:"pointer",fontSize:11,fontFamily:"monospace"}}>PAUSE</button>
          }
          <button onClick={reset} style={{background:"#1e2a3a",color:"#64748b",border:"1px solid #1e2a3a",borderRadius:7,padding:"7px 10px",cursor:"pointer",fontSize:11}}>RESET</button>
        </div>
      </div>

      {simMode&&<div style={{background:"#1a0a2e",border:"1px solid #7c3aed",borderRadius:7,padding:"6px 12px",marginBottom:10,fontSize:10,color:"#a78bfa",display:"flex",alignItems:"center",gap:8}}>
        <strong>PAPER MODE</strong><span>Weather REAL. Prices LIVE from CLOB. No orders placed.</span>
        <button onClick={()=>setSimMode(false)} style={{marginLeft:"auto",background:"#7c3aed",color:"#fff",border:"none",borderRadius:4,padding:"2px 8px",cursor:"pointer",fontSize:9}}>GO LIVE</button>
      </div>}

      <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <Stat label="STATIONS"    value={stations.length}      color="#38bdf8"/>
        <Stat label="SCANNED"     value={stats.scanned}        color="#38bdf8"/>
        <Stat label="EDGES FOUND" value={stats.edges}          color="#4ade80"/>
        <Stat label="UPTIME"      value={fUp(stats.uptime)}    color="#94a3b8" sub="mm:ss"/>
        <Stat label="LAST SCAN"   value={stats.lastScan||"--"} color="#334155"/>
      </div>

      <div style={{background:"#0d1117",border:"1px solid #1e2a3a",borderRadius:10,overflow:"hidden"}}>
        <div style={{display:"flex",borderBottom:"1px solid #1e2a3a"}}>
          {[["live","LIVE STATIONS"],["opps","OPPORTUNITIES"],["log","LOG"],["config","CONFIG"]].map(([id,lb])=>(
            <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"10px 6px",fontSize:10,letterSpacing:1,cursor:"pointer",background:tab===id?"#131b2e":"transparent",color:tab===id?(id==="live"?"#0ea5e9":"#38bdf8"):"#4a5568",border:"none",fontFamily:"monospace",fontWeight:tab===id?700:400,borderBottom:tab===id?`2px solid ${id==="live"?"#0ea5e9":"#38bdf8"}`:"2px solid transparent"}}>{lb}</button>
          ))}
        </div>

        <div style={{padding:14}}>
          {tab==="live"&&(
            <div style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:14,minHeight:460}}>
              <div style={{borderRight:"1px solid #1a1a2a",paddingRight:12}}>
                <div style={{fontSize:8,color:"#334155",letterSpacing:2,marginBottom:8}}>RESOLUTION STATIONS</div>
                <button onClick={scanAll} style={{width:"100%",background:"#0ea5e9",color:"#000",border:"none",borderRadius:5,padding:"7px 0",fontWeight:800,cursor:"pointer",fontSize:9,letterSpacing:1,marginBottom:10,fontFamily:"monospace"}}>SCAN ALL NOW</button>
                {stations.map((st,i)=>{
                  const d=scanData[st.stationId], busy=loadingIds.has(st.stationId);
                  const edge=d?.opportunities?.length>0;
                  return (
                    <div key={st.stationId} onClick={()=>{setSelIdx(i);if(!d&&!busy)scanStation(st.stationId);}}
                      style={{padding:"7px 8px",borderRadius:7,cursor:"pointer",marginBottom:4,background:selIdx===i?"#131b2e":"transparent",border:`1px solid ${selIdx===i?"#0ea5e9":edge?"#22c55e":busy?"#ca8a04":"#1e2a3a"}`}}>
                      <div style={{fontSize:10,color:"#e2e8f0",fontWeight:600}}>{st.city}</div>
                      <div style={{fontSize:8,color:"#0ea5e9",fontFamily:"monospace"}}>[{st.stationId}]</div>
                      {busy&&<div style={{fontSize:8,color:"#ca8a04"}}>scanning...</div>}
                      {d&&!busy&&<div style={{fontSize:9,color:"#38bdf8",fontFamily:"monospace"}}>{d.conditions?.tempC}C</div>}
                      {edge&&<div style={{fontSize:8,color:"#4ade80",background:"#0a2010",padding:"1px 5px",borderRadius:3}}>EDGE</div>}
                      {!d&&!busy&&<div style={{fontSize:8,color:"#1e2a3a"}}>click to scan</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{overflowY:"auto"}}>
                <StationDetail data={selData} loading={selLoading} onRefresh={()=>selSt&&scanStation(selSt.stationId)}/>
              </div>
            </div>
          )}

          {tab==="opps"&&(
            <div style={{maxHeight:460,overflowY:"auto"}}>
              {opps.length===0?<div style={{padding:40,textAlign:"center",color:"#1a1a2a",fontSize:12}}>No opportunities yet — click START LIVE</div>:opps.map((o,i)=><OppRow key={i} o={o}/>)}
            </div>
          )}

          {tab==="log"&&(
            <div style={{maxHeight:460,overflowY:"auto"}}>
              {log.length===0?<div style={{padding:40,textAlign:"center",color:"#1a1a2a",fontSize:12}}>No log entries</div>:log.map(e=><LogLine key={e.id} e={e}/>)}
            </div>
          )}

          {tab==="config"&&(
            <div style={{maxWidth:440}}>
              <div style={{fontSize:9,color:"#334155",letterSpacing:2,marginBottom:14}}>CONFIGURATION</div>
              <div style={{marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:11,color:"#94a3b8"}}>Min Net Edge (%)</span>
                  <span style={{fontSize:13,fontWeight:700,color:"#38bdf8"}}>{minEdge}</span>
                </div>
                <input type="range" min={0.5} max={5} step={0.1} value={minEdge} onChange={e=>setMinEdge(+e.target.value)} style={{width:"100%",accentColor:"#0ea5e9"}}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#334155",marginTop:2}}><span>0.5%</span><span>5.0%</span></div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#1a0a2e",border:"1px solid #7c3aed",borderRadius:8,marginBottom:14}}>
                <div>
                  <div style={{fontSize:11,color:"#a78bfa",fontWeight:700}}>Paper Trading Mode</div>
                  <div style={{fontSize:9,color:"#6d28d9",marginTop:2}}>No real orders placed</div>
                </div>
                <div onClick={()=>setSimMode(s=>!s)} style={{width:44,height:24,borderRadius:12,cursor:"pointer",position:"relative",background:simMode?"#7c3aed":"#1e2a3a",transition:"background 0.2s"}}>
                  <div style={{position:"absolute",top:3,left:simMode?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                </div>
              </div>
              {health&&<div style={{padding:"12px 14px",background:"#080f1e",border:"1px solid #1e2a3a",borderRadius:8,fontSize:9,color:"#4a5568",lineHeight:1.9,marginBottom:12}}>
                <div style={{color:"#0ea5e9",fontWeight:700,marginBottom:6}}>SERVER STATUS</div>
                <div>Uptime: {Math.floor(health.uptime)}s</div>
                <div>WS Clients: {health.wsClients}</div>
                <div>Polymarket WS: {health.polyWsConnected?"Connected":"Disconnected"}</div>
              </div>}
              <div style={{padding:"12px 14px",background:"#080f1e",border:"1px solid #0ea5e9",borderRadius:8,fontSize:9,color:"#4a5568",lineHeight:1.9}}>
                <div style={{color:"#0ea5e9",fontWeight:700,marginBottom:6}}>DATA SOURCES</div>
                <div>Weather: Open-Meteo ECMWF+GFS+ICON (exact station coords)</div>
                <div>Markets: gamma-api.polymarket.com</div>
                <div>Prices: clob.polymarket.com (server-side proxy)</div>
                <div>Live feed: Polymarket CLOB WebSocket relay</div>
                <div style={{marginTop:8,color:"#334155"}}>Scan: every 6 min (model update cycle)</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
