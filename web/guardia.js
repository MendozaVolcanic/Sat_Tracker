// Modo Guardia OVDAS — panel de turno, optimizado para TV en sala de operaciones.
// Recalcula cada N segundos. Click "Pantalla completa" → ocupa toda la pantalla.

const REFRESH_MS = 30000;
const HORIZON_IMMINENT_MIN = 30;
const HORIZON_UPCOMING_H = 6;
const HORIZON_PER_VOLCANO_H = 24;
const MIN_ELEV = 20;

const $ = s => document.querySelector(s);

let volcanoes = [];
let satMeta = [];
let satRecords = [];

function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of kids) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }

function fmtTime(d) { return d.toISOString().slice(11, 16); }
function fmtCountdown(targetMs, nowMs) {
  const s = Math.round((targetMs - nowMs) / 1000);
  if (s < 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2,"0")}m`;
  return `${m}m ${String(sec).padStart(2,"0")}s`;
}
function fmtAge(iso) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h/24).toFixed(1)} d`;
}

async function loadData() {
  const [vol, sat, tle] = await Promise.all([
    fetch("data/volcanoes.json").then(r => r.json()),
    fetch("data/satellites.json").then(r => r.json()),
    fetch("data/tle.json").then(r => r.json()),
  ]);
  volcanoes = vol;
  satMeta = sat;
  satRecords = [];
  for (const s of satMeta) {
    if (s.kind !== "polar" || !s.norad_id) continue;
    const t = tle.satellites[String(s.norad_id)];
    if (!t) continue;
    satRecords.push({ meta: s, satrec: satellite.twoline2satrec(t.line1, t.line2) });
  }
  $("#stat-volc").textContent = volcanoes.length;
  $("#stat-sats").textContent = satRecords.length;
  $("#stat-tle").textContent = fmtAge(tle.fetched_at);
}

function lookAngles(satrec, observer, when) {
  const pv = satellite.propagate(satrec, when);
  if (!pv.position) return null;
  const gmst = satellite.gstime(when);
  const ecf = satellite.eciToEcf(pv.position, gmst);
  const obs = {
    longitude: satellite.degreesToRadians(observer.lon),
    latitude: satellite.degreesToRadians(observer.lat),
    height: observer.elevation_m / 1000,
  };
  const la = satellite.ecfToLookAngles(obs, ecf);
  return { elev: satellite.radiansToDegrees(la.elevation) };
}

function findPasses(satrec, observer, t0, t1, minElev = MIN_ELEV) {
  const passes = [];
  const stepS = 30;
  let prev = null, inPass = false, rise = null, peak = -90, peakT = null;
  for (let t = t0; t <= t1; t = new Date(t.getTime() + stepS * 1000)) {
    const la = lookAngles(satrec, observer, t);
    if (!la) continue;
    const e = la.elev;
    if (!inPass && e >= 0 && (prev === null || prev < 0)) {
      rise = t; inPass = true; peak = e; peakT = t;
    }
    if (inPass) {
      if (e > peak) { peak = e; peakT = t; }
      if (e < 0 && prev !== null && prev >= 0) {
        if (peak >= minElev) passes.push({ rise, set: t, peak, peakT });
        inPass = false;
      }
    }
    prev = e;
  }
  return passes;
}

function collectAllPasses(horizonHours) {
  const now = new Date();
  const t1 = new Date(now.getTime() + horizonHours * 3600 * 1000);
  const out = [];
  for (const v of volcanoes) {
    for (const r of satRecords) {
      for (const p of findPasses(r.satrec, v, now, t1)) {
        out.push({
          volcano: v,
          sat: r.meta,
          rise: p.rise, set: p.set,
          peak: p.peak, peakT: p.peakT,
          dataAt: new Date(p.set.getTime() + r.meta.nrt_latency_min * 60000),
        });
      }
    }
  }
  out.sort((a, b) => a.rise - b.rise);
  return out;
}

function renderImminent(passes, now) {
  const wrap = $("#imminent-list");
  clear(wrap);
  const horizon = now.getTime() + HORIZON_IMMINENT_MIN * 60 * 1000;
  const filtered = passes.filter(p => p.rise.getTime() <= horizon);
  if (filtered.length === 0) {
    wrap.appendChild(el("div", { class: "muted",
      text: `Sin pasajes en próximos ${HORIZON_IMMINENT_MIN} min.` }));
    return;
  }
  for (const p of filtered) {
    const minsTo = (p.rise.getTime() - now.getTime()) / 60000;
    const cls = minsTo <= 5 ? "urgent" : minsTo <= 15 ? "soon" : "normal";
    const row = el("div", { class: "row" });
    const left = el("div");
    left.appendChild(el("div", { class: "sat-name" }, [
      p.sat.name, el("span", { class: "sensor", text: ` ${p.sat.sensor}` }),
    ]));
    left.appendChild(el("div", { class: "vol",
      text: `→ ${p.volcano.name}${p.volcano.priority ? " ★" : ""}` }));
    left.appendChild(el("div", { class: "muted small",
      text: `${fmtTime(p.rise)} → ${fmtTime(p.set)} UTC · datos ~${fmtTime(p.dataAt)}` }));
    row.appendChild(left);
    row.appendChild(el("div", { class: `countdown ${cls}`,
      text: fmtCountdown(p.rise.getTime(), now.getTime()) }));
    row.appendChild(el("div", { class: "elev",
      text: `${Math.round(p.peak)}°` }));
    wrap.appendChild(row);
  }
}

function renderUpcoming(passes, now) {
  const tbody = $("#upcoming-list");
  clear(tbody);
  const horizon = now.getTime() + HORIZON_UPCOMING_H * 3600 * 1000;
  const imminent = now.getTime() + HORIZON_IMMINENT_MIN * 60 * 1000;
  const rows = passes.filter(p =>
    p.rise.getTime() > imminent && p.rise.getTime() <= horizon);
  if (rows.length === 0) {
    const tr = el("tr");
    tr.appendChild(el("td", { colspan: "5", class: "muted",
      text: `Sin pasajes adicionales en próximas ${HORIZON_UPCOMING_H} h.` }));
    tbody.appendChild(tr);
    return;
  }
  for (const p of rows) {
    const tr = el("tr");
    tr.appendChild(el("td", {}, [el("b", { text: p.sat.name })]));
    tr.appendChild(el("td", { text: p.volcano.name + (p.volcano.priority ? " ★" : "") }));
    tr.appendChild(el("td", { text: fmtTime(p.rise) }));
    const elevTd = el("td", { text: `${Math.round(p.peak)}°` });
    elevTd.className = p.peak >= 60 ? "elev-high" : p.peak >= 35 ? "elev-mid" : "elev-low";
    tr.appendChild(elevTd);
    tr.appendChild(el("td", { text: fmtTime(p.dataAt) }));
    tbody.appendChild(tr);
  }
}

function renderVolGrid(passes24, now) {
  const grid = $("#vol-grid");
  clear(grid);
  // Próximo pasaje por volcán
  const byVol = new Map();
  for (const p of passes24) {
    if (!byVol.has(p.volcano.name)) byVol.set(p.volcano.name, p);
  }
  // Volcanes prioritarios primero
  const ordered = [...volcanoes].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return a.lat > b.lat ? -1 : 1;
  });
  for (const v of ordered) {
    const card = el("div", { class: "vol-card" + (v.priority ? " priority" : "") });
    card.appendChild(el("div", { class: "vname",
      text: (v.priority ? "★ " : "") + v.name }));
    const next = byVol.get(v.name);
    if (next) {
      card.appendChild(el("div", { class: "next-sat",
        text: `${next.sat.name}` }));
      card.appendChild(el("div", { class: "next-when",
        text: `${fmtTime(next.rise)} UTC · ${fmtCountdown(next.rise.getTime(), now.getTime())}` }));
    } else {
      card.appendChild(el("div", { class: "next-when",
        text: "sin pasajes 24 h" }));
    }
    grid.appendChild(card);
  }
}

function tickClocks() {
  const now = new Date();
  $("#clock-utc").textContent = now.toISOString().slice(11, 19) + " UTC";
  $("#clock-local").textContent = now.toLocaleTimeString("es-CL", {
    timeZone: "America/Santiago", hour12: false,
  }) + " (Chile)";
}

function refreshAll() {
  const now = new Date();
  const passes24 = collectAllPasses(HORIZON_PER_VOLCANO_H);
  renderImminent(passes24, now);
  renderUpcoming(passes24, now);
  renderVolGrid(passes24, now);
  $("#stat-passes").textContent = passes24.filter(
    p => p.rise.getTime() <= now.getTime() + HORIZON_UPCOMING_H * 3600 * 1000,
  ).length;
}

async function main() {
  await loadData();
  tickClocks();
  setInterval(tickClocks, 1000);
  refreshAll();
  setInterval(refreshAll, REFRESH_MS);
  $("#fullscreen-btn").onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  };
}

window.addEventListener("DOMContentLoaded", main);
