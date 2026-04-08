require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const axios     = require("axios");
const rateLimit = require("express-rate-limit");
const cron      = require("node-cron");
const path      = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const http      = require("http");

const app    = express();
const server = http.createServer(app);
const PORT   = process.env.PORT || 3001;

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());
app.use("/api/", rateLimit({ windowMs: 60000, max: 120 }));

const GAMMA  = "https://gamma-api.polymarket.com";
const CLOB   = "https://clob.polymarket.com";
const METEO  = "https://api.open-meteo.com/v1/forecast";
const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";

const STATIONS = [
  { city:"New York",    country:"US", stationId:"KLGA", stationName:"LaGuardia Airport",  lat:40.7769,  lon:-73.8740,  tz:"America/New_York",    unit:"F" },
  { city:"London",      country:"UK", stationId:"EGLC", stationName:"London City Airport", lat:51.5048,  lon:0.0495,    tz:"Europe/London",       unit:"C" },
  { city:"Miami",       country:"US", stationId:"KMIA", stationName:"Miami Intl Airport",  lat:25.7959,  lon:-80.2870,  tz:"America/New_York",    unit:"F" },
  { city:"Chicago",     country:"US", stationId:"KORD", stationName:"O Hare Airport",      lat:41.9742,  lon:-87.9073,  tz:"America/Chicago",     unit:"F" },
  { city:"Los Angeles", country:"US", stationId:"KLAX", stationName:"LAX Airport",         lat:33.9425,  lon:-118.4081, tz:"America/Los_Angeles", unit:"F" },
  { city:"Hong Kong",   country:"HK", stationId:"VHHH", stationName:"HK Intl Airport",     lat:22.3089,  lon:113.9149,  tz:"Asia/Hong_Kong",      unit:"C" },
];

const MODELS = [
  { id:"ecmwf", name:"ECMWF IFS", param:"best_match",   weight:0.45, heatBiasF:0.6,  precipBias:0.04 },
  { id:"gfs",   name:"NOAA GFS",  param:"gfs_seamless",  weight:0.35, heatBiasF:1.8,  precipBias:0.12 },
  { id:"icon",  name:"DWD ICON",  param:"icon_seamless", weight:0.20, heatBiasF:0.9,  precipBias:0.07 },
];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const CtoF  = (c) => +(c * 9/5 + 32).toFixed(1);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function calcProbs(data, model, station) {
  const d = data.daily, cur = data.current;
  let maxC = (d.temperature_2m_max[0] || 0) - (model.heatBiasF * 5 / 9);
  const maxF = CtoF(maxC), minC = d.temperature_2m_min[0] || 0;
  const precMm  = (d.precipitation_sum[0] || 0) * (1 - model.precipBias);
  const pPct    = clamp((d.precipitation_probability_max[0] || 0) / 100 * (1 - model.precipBias * 0.5), 0, 1);
  const snowMm  = d.snowfall_sum[0] || 0;
  const wind    = d.wind_speed_10m_max[0] || 0;
  const wmo     = d.weather_code_dominant[0] || 0;
  const hum     = cur.relative_humidity_2m || 0;
  const precIn  = precMm * 0.03937;

  const hot = station.unit === "F" ? clamp(
    maxF >= 90 ? 0.88 + (maxF - 90) * 0.015 :
    maxF >= 86 ? 0.55 + (maxF - 86) * 0.08  :
    maxF >= 80 ? 0.20 + (maxF - 80) * 0.06  : 0.04, 0.02, 0.97
  ) : clamp(
    maxC >= 32 ? 0.88 + (maxC - 32) * 0.02 :
    maxC >= 30 ? 0.55 + (maxC - 30) * 0.16 :
    maxC >= 27 ? 0.20 + (maxC - 27) * 0.11 : 0.04, 0.02, 0.97
  );

  const rain = clamp(
    pPct > 0.7 && precIn > 0.5  ? 0.85 + pPct * 0.10 :
    pPct > 0.5 && precIn > 0.2  ? 0.65 + pPct * 0.15 :
    pPct > 0.3 && precIn > 0.05 ? 0.38 + pPct * 0.22 :
    pPct > 0.1                  ? 0.12 + pPct * 0.20 : 0.04, 0.03, 0.96);

  const snow = clamp(
    snowMm > 10 && minC < 0  ? 0.92 : snowMm > 5  && minC < 2 ? 0.76 :
    snowMm > 1  && minC < 4  ? 0.55 : snowMm > 0  && minC < 6 ? 0.34 :
    minC < 0 && pPct > 0.3   ? 0.22 : 0.02, 0.01, 0.97);

  const storm = clamp(
    wmo >= 95                             ? 0.82 + (hum - 60) * 0.003 :
    wmo >= 80 && hum > 75 && wind > 30   ? 0.48 :
    hum > 80 && wind > 25 && pPct > 0.5  ? 0.32 :
    hum > 70 && wind > 20                ? 0.16 : 0.05, 0.02, 0.95);

  return {
    hot, rain, snow, storm,
    tempC: +(cur.temperature_2m).toFixed(1),
    maxC:  +maxC.toFixed(1), maxF,
    precMm: +precMm.toFixed(1), precIn: +precIn.toFixed(3),
    hum, wind: +(cur.wind_speed_10m || 0).toFixed(1),
  };
}

function buildEnsemble(results) {
  const keys = ["hot","rain","snow","storm"];
  const total = results.reduce((s, r) => s + r.model.weight, 0);
  const ens = {}, spread = {};
  keys.forEach(k => {
    const vals = results.map(r => r.probs[k]);
    ens[k] = results.reduce((s, r) => s + r.probs[k] * r.model.weight, 0) / total;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    spread[k] = +(Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length) * 100).toFixed(1);
  });
  return { ens, spread };
}

// ── WebSocket relay ────────────────────────────────────────────
const wss = new WebSocketServer({ server });
const clients = new Set();
const subIds  = new Set();
let polyWs    = null;

function connectPolyWS() {
  try {
    polyWs = new WebSocket(WS_URL);
    polyWs.on("open", () => {
      console.log("[WS] Connected to Polymarket");
      if (subIds.size > 0) polyWs.send(JSON.stringify({ type:"subscribe", market_ids:[...subIds] }));
    });
    polyWs.on("message", d => clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(d.toString()); }));
    polyWs.on("close",   () => { console.log("[WS] Disconnected, retry in 5s"); setTimeout(connectPolyWS, 5000); });
    polyWs.on("error",   e => console.error("[WS]", e.message));
  } catch (e) { setTimeout(connectPolyWS, 10000); }
}

wss.on("connection", ws => {
  clients.add(ws);
  console.log("[WS] Client connected, total:", clients.size);
  ws.on("close", () => clients.delete(ws));
  ws.on("message", msg => {
    try {
      const d = JSON.parse(msg);
      if (d.type === "subscribe" && Array.isArray(d.market_ids)) {
        d.market_ids.forEach(id => subIds.add(id));
        if (polyWs?.readyState === WebSocket.OPEN) polyWs.send(msg.toString());
      }
    } catch (e) {}
  });
});

// ── Routes ────────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({
  status: "ok", uptime: process.uptime(),
  wsClients: clients.size,
  polyWsConnected: polyWs?.readyState === WebSocket.OPEN,
  ts: new Date().toISOString(),
}));

app.get("/api/stations", (req, res) => res.json(STATIONS));

app.get("/api/ensemble/:id", async (req, res) => {
  const st = STATIONS.find(s => s.stationId === req.params.id);
  if (!st) return res.status(404).json({ error: "Station not found" });
  try {
    const daily   = "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,snowfall_sum,weather_code_dominant,wind_speed_10m_max";
    const current = "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code";
    const results = await Promise.allSettled(MODELS.map(async m => {
      const url = `${METEO}?latitude=${st.lat}&longitude=${st.lon}&timezone=${encodeURIComponent(st.tz)}&forecast_days=3&models=${m.param}&current=${current}&daily=${daily}`;
      const { data } = await axios.get(url, { timeout: 8000 });
      return { model: m, data, probs: calcProbs(data, m, st) };
    }));
    const ok     = results.filter(r => r.status === "fulfilled").map(r => r.value);
    const failed = results.filter(r => r.status === "rejected").map((r, i) => ({ model: MODELS[i].id, error: r.reason?.message }));
    if (!ok.length) return res.status(502).json({ error: "All models failed", failed });
    const { ens, spread } = buildEnsemble(ok);
    res.json({
      station: st, ensemble: ens, spread, modelsOk: ok.length, failed,
      currentConditions: ok[0].probs,
      perModel: ok.map(r => ({ modelId: r.model.id, name: r.model.name, probs: r.probs })),
      fetchTime: new Date().toISOString(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/polymarket/markets", async (req, res) => {
  try {
    const { data } = await axios.get(`${GAMMA}/markets?tag_slug=weather&active=true&limit=100&closed=false`, { timeout: 8000, headers: { "Accept": "application/json" } });
    const markets = Array.isArray(data) ? data : (data.data || data.markets || []);
    res.json({ markets, count: markets.length, fetchTime: new Date().toISOString() });
  } catch (e) { res.status(502).json({ error: e.message, markets: [] }); }
});

app.get("/api/polymarket/price/:tokenId", async (req, res) => {
  try {
    const { data } = await axios.get(`${CLOB}/price?token_id=${req.params.tokenId}&side=BUY`, { timeout: 5000, headers: { "Accept": "application/json" } });
    res.json({ tokenId: req.params.tokenId, price: parseFloat(data.price), raw: data });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get("/api/polymarket/orderbook/:tokenId", async (req, res) => {
  try {
    const { data } = await axios.get(`${CLOB}/book?token_id=${req.params.tokenId}`, { timeout: 5000, headers: { "Accept": "application/json" } });
    const bids = (data.bids || []).slice(0, 5);
    const asks = (data.asks || []).slice(0, 5);
    const bidLiq = bids.reduce((s, b) => s + parseFloat(b.size || 0) * parseFloat(b.price || 0), 0);
    const askLiq = asks.reduce((s, a) => s + parseFloat(a.size || 0) * parseFloat(a.price || 0), 0);
    res.json({ tokenId: req.params.tokenId, bids, asks, bidLiquidity: +bidLiq.toFixed(2), askLiquidity: +askLiq.toFixed(2) });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

app.get("/api/scan/:id", async (req, res) => {
  const st = STATIONS.find(s => s.stationId === req.params.id);
  if (!st) return res.status(404).json({ error: "Station not found" });
  const minEdge = parseFloat(req.query.minEdge) || 1.5;
  try {
    const base = `http://localhost:${PORT}`;
    const [ensRes, mktRes] = await Promise.all([
      axios.get(`${base}/api/ensemble/${st.stationId}`, { timeout: 15000 }),
      axios.get(`${base}/api/polymarket/markets`, { timeout: 8000 }),
    ]);
    const ensData  = ensRes.data;
    const cityStr  = st.city.toLowerCase();
    const cityMkts = (mktRes.data.markets || []).filter(m => {
      const q = (m.question || m.title || "").toLowerCase();
      return q.includes(cityStr) || q.includes(st.stationId.toLowerCase());
    }).slice(0, 8);

    const priceMap = {};
    await Promise.all(cityMkts.map(async m => {
      const tid = m.clobTokenIds?.[0] || m.tokens?.[0]?.token_id;
      if (tid) {
        try {
          const pr = await axios.get(`${base}/api/polymarket/price/${tid}`, { timeout: 4000 });
          priceMap[m.conditionId || m.id] = pr.data.price;
        } catch (e) {}
      }
    }));

    const OKEYS = [
      { key:"hot",   label:"HOT (>90F/32C)", fee:0.0125 },
      { key:"rain",  label:"RAIN (>0.5in)",   fee:0.0125 },
      { key:"snow",  label:"SNOW",            fee:0.0125 },
      { key:"storm", label:"STORM",           fee:0.0125 },
    ];

    const opps = [];
    OKEYS.forEach(o => {
      const prob = ensData.ensemble[o.key], sp = ensData.spread[o.key];
      const mkt  = cityMkts.find(m => {
        const q = (m.question || "").toLowerCase();
        return (o.key === "hot"   && q.includes("temperature")) ||
               (o.key === "rain"  && q.includes("rain"))        ||
               (o.key === "snow"  && q.includes("snow"))        ||
               (o.key === "storm" && q.includes("thunder"));
      });
      const mktId    = mkt ? (mkt.conditionId || mkt.id) : null;
      const polyProb = mktId ? priceMap[mktId] : null;
      if (polyProb == null) return;
      const raw = (prob - polyProb) * 100;
      const net = raw - o.fee * 100;
      if (Math.abs(net) > minEdge && sp < 15) {
        opps.push({ outcome: o.label, key: o.key, modelProb: +prob.toFixed(3), polyProb: +polyProb.toFixed(3), rawEdge: +raw.toFixed(2), netEdge: +net.toFixed(2), spread: sp, direction: net > 0 ? "BUY YES" : "BUY NO", marketId: mktId, question: mkt?.question, isLive: true });
      }
    });

    res.json({ station: st, ensemble: ensData.ensemble, spread: ensData.spread, modelsOk: ensData.modelsOk, conditions: ensData.currentConditions, markets: cityMkts, liveMarkets: cityMkts.length, opportunities: opps, fetchTime: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/scan-all", async (req, res) => {
  const minEdge = parseFloat(req.query.minEdge) || 1.5;
  const results = [];
  for (const st of STATIONS) {
    try {
      const r = await axios.get(`http://localhost:${PORT}/api/scan/${st.stationId}?minEdge=${minEdge}`, { timeout: 20000 });
      results.push(r.data);
    } catch (e) { results.push({ station: st, error: e.message, opportunities: [] }); }
    await sleep(400);
  }
  const allOpps = results.flatMap(r => (r.opportunities || []).map(o => ({ ...o, city: r.station?.city, stationId: r.station?.stationId })));
  res.json({ results, opportunities: allOpps, total: allOpps.length, fetchTime: new Date().toISOString() });
});

// Serve React build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../build")));
  app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../build/index.html")));
}

// Auto-scan every 6 minutes
cron.schedule("*/6 * * * *", async () => {
  console.log("[CRON] Scanning all stations...");
  try { await axios.get(`http://localhost:${PORT}/api/scan-all`, { timeout: 120000 }); console.log("[CRON] Done"); }
  catch (e) { console.error("[CRON] Failed:", e.message); }
});

server.listen(PORT, () => {
  console.log(`\n Polymarket Weather Bot`);
  console.log(` Port: ${PORT} | Mode: ${process.env.NODE_ENV || "development"}\n`);
  connectPolyWS();
});
