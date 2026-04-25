// Sat_Tracker — globo 3D + propagación orbital en navegador.
// Datos provienen de JSON generados desde catálogos Python locales (confiables).
// SGP4 con satellite.js usando TLEs cacheados en repo.

const REFRESH_MS_POSITIONS = 5000;
const REFRESH_MS_TABLE = 60000;
const TRACK_AHEAD_MIN = 90;
const TRACK_STEP_S = 60;
const PASS_WINDOW_H = 24;
const MIN_ELEV_DEG = 20;

const SAT_COLORS = {
  "SENTINEL-5P":  "#ff6b3d",
  "TERRA":        "#4cc9f0",
  "AQUA":         "#7cb9e8",
  "SUOMI NPP":    "#5cf377",
  "NOAA 20":      "#a3f35c",
  "NOAA 21":      "#c5f37e",
  "LANDSAT 8":    "#f3c75c",
  "LANDSAT 9":    "#f3a45c",
  "SENTINEL-2A":  "#c084fc",
  "SENTINEL-2B":  "#a855f7",
  "SENTINEL-3A":  "#f37e9b",
  "SENTINEL-3B":  "#f35c8a",
  "METOP-B":      "#5cf3d6",
  "METOP-C":      "#5ce3f3",
};
const DEFAULT_COLOR = "#4cc9f0";

let volcanoes = [];
let satMeta = [];
let satRecords = [];
let selectedVolcano = null;
let globe = null;
let showTracks = true;
let showLabels = true;

const $ = (s) => document.querySelector(s);

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}
function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

function fmtTime(d) { return d.toISOString().slice(11, 16); }
function fmtDelta(target, now) {
  const s = (target - now) / 1000;
  const abs = Math.abs(s);
  const sign = s >= 0 ? "en" : "hace";
  if (abs < 60) return `${sign} ${Math.round(abs)} s`;
  if (abs < 3600) return `${sign} ${Math.round(abs / 60)} min`;
  if (abs < 86400) return `${sign} ${(abs / 3600).toFixed(1)} h`;
  return `${sign} ${(abs / 86400).toFixed(1)} d`;
}
function fmtAge(iso) {
  const ageH = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (ageH < 1) return `${Math.round(ageH * 60)} min`;
  if (ageH < 48) return `${ageH.toFixed(1)} h`;
  return `${(ageH / 24).toFixed(1)} d`;
}
function elevClass(e) {
  if (e >= 60) return "elev-high";
  if (e >= 35) return "elev-mid";
  return "elev-low";
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
    const satrec = satellite.twoline2satrec(t.line1, t.line2);
    satRecords.push({ meta: s, satrec, name: t.name.trim() });
  }
  $("#tle-age").textContent = `${fmtAge(tle.fetched_at)} (${Object.keys(tle.satellites).length} sats)`;
}

function propagate(satrec, when) {
  const pv = satellite.propagate(satrec, when);
  if (!pv.position) return null;
  const gmst = satellite.gstime(when);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt: geo.height,
  };
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

function findPasses(satrec, observer, t0, t1, minElev = MIN_ELEV_DEG) {
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

function volcanoTooltipText(d) {
  const star = d.priority ? " [PRIORITARIO]" : "";
  return `${d.name}${star}\n${d.region} - zona ${d.zone}\n${d.elevation_m} m  (${d.lat.toFixed(2)}, ${d.lon.toFixed(2)})`;
}

function initGlobe() {
  globe = Globe()
    (document.getElementById("globeViz"))
    .globeImageUrl("https://unpkg.com/three-globe/example/img/earth-night.jpg")
    .bumpImageUrl("https://unpkg.com/three-globe/example/img/earth-topology.png")
    .backgroundImageUrl("https://unpkg.com/three-globe/example/img/night-sky.png")
    .atmosphereColor("#4cc9f0")
    .atmosphereAltitude(0.18)
    .pointOfView({ lat: -35, lng: -71, altitude: 2.2 }, 0);

  globe
    .pointsData(volcanoes)
    .pointLat("lat").pointLng("lon")
    .pointAltitude(0.005)
    .pointRadius(d => d.priority ? 0.35 : 0.22)
    .pointColor(d => d.priority ? "#ff3b30" : "#e74c3c")
    .pointLabel(volcanoTooltipText)
    .onPointClick(d => {
      $("#volcano-select").value = d.name;
      onVolcanoChange();
    });
}

function rebuildSatLayers() {
  const now = new Date();
  const satPoints = [];
  const trackPaths = [];
  const labels = [];

  for (const r of satRecords) {
    const color = SAT_COLORS[r.name] || DEFAULT_COLOR;
    const pos = propagate(r.satrec, now);
    if (!pos) continue;
    satPoints.push({ ...pos, name: r.meta.name, color });

    if (showTracks) {
      const pts = [];
      for (let i = 0; i <= TRACK_AHEAD_MIN * 60 / TRACK_STEP_S; i++) {
        const t = new Date(now.getTime() + i * TRACK_STEP_S * 1000);
        const p = propagate(r.satrec, t);
        if (p) pts.push([p.lat, p.lon, p.alt]);
      }
      let seg = [];
      for (let i = 0; i < pts.length; i++) {
        if (i > 0 && Math.abs(pts[i][1] - pts[i - 1][1]) > 180) {
          if (seg.length > 1) trackPaths.push({ coords: seg, color });
          seg = [];
        }
        seg.push(pts[i]);
      }
      if (seg.length > 1) trackPaths.push({ coords: seg, color });
    }

    if (showLabels) {
      labels.push({
        lat: pos.lat, lng: pos.lon, alt: pos.alt / 6371 + 0.05,
        text: r.meta.name, color,
      });
    }
  }

  globe
    .customLayerData(satPoints)
    .customThreeObject(d => {
      const geo = new THREE.SphereGeometry(0.6, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: d.color });
      return new THREE.Mesh(geo, mat);
    })
    .customThreeObjectUpdate((obj, d) => {
      Object.assign(obj.position, globe.getCoords(d.lat, d.lon, d.alt / 6371));
    });

  globe
    .pathsData(trackPaths)
    .pathPoints("coords")
    .pathPointLat(p => p[0])
    .pathPointLng(p => p[1])
    .pathPointAlt(p => p[2] / 6371)
    .pathColor(d => [d.color, d.color])
    .pathStroke(1.2)
    .pathTransitionDuration(0);

  globe
    .labelsData(labels)
    .labelLat("lat").labelLng("lng").labelAltitude("alt")
    .labelText("text").labelSize(0.45).labelColor("color")
    .labelDotRadius(0).labelResolution(2);
}

function populateVolcanoSelect() {
  const sel = $("#volcano-select");
  const byZone = { norte: [], centro: [], sur: [], austral: [] };
  for (const v of volcanoes) byZone[v.zone]?.push(v);
  clear(sel);
  const zones = { norte: "Zona Norte", centro: "Zona Centro-Sur",
                  sur: "Zona Sur", austral: "Zona Austral" };
  for (const [z, label] of Object.entries(zones)) {
    const og = el("optgroup");
    og.label = label;
    for (const v of byZone[z].sort((a,b) => a.lat > b.lat ? -1 : 1)) {
      og.appendChild(el("option", { value: v.name, text: v.priority ? `* ${v.name}` : v.name }));
    }
    sel.appendChild(og);
  }
  sel.value = volcanoes.find(v => v.name === "Villarrica")?.name || volcanoes[0].name;
  sel.onchange = onVolcanoChange;
}

function onVolcanoChange() {
  const name = $("#volcano-select").value;
  selectedVolcano = volcanoes.find(v => v.name === name);
  const v = selectedVolcano;
  const info = $("#volcano-info");
  clear(info);
  const d1 = el("div", {}, [`${v.region} · zona `, el("b", { text: v.zone })]);
  if (v.priority) d1.appendChild(el("span", { class: "tag-priority", text: "prioritario" }));
  info.appendChild(d1);
  info.appendChild(el("div", {}, [
    "Elevación: ", el("b", { text: `${v.elevation_m} m` }),
    ` · ${v.lat.toFixed(3)}, ${v.lon.toFixed(3)}`,
  ]));
  if (v.ranking) {
    info.appendChild(el("div", {}, ["Ranking SERNAGEOMIN: ", el("b", { text: `#${v.ranking}` })]));
  }
  updatePassesTable();
  globe.pointOfView({ lat: v.lat, lng: v.lon, altitude: 1.6 }, 800);
}

function updatePassesTable() {
  const tbody = $("#passes-table tbody");
  clear(tbody);
  if (!selectedVolcano) return;
  const now = new Date();
  const t1 = new Date(now.getTime() + PASS_WINDOW_H * 3600 * 1000);
  const rows = [];
  for (const r of satRecords) {
    const passes = findPasses(r.satrec, selectedVolcano, now, t1);
    for (const p of passes) {
      const dataAt = new Date(p.set.getTime() + r.meta.nrt_latency_min * 60000);
      rows.push({ sat: r.meta.name, peak: p.peak, peakT: p.peakT, dataAt });
    }
  }
  rows.sort((a, b) => a.peakT - b.peakT);
  if (rows.length === 0) {
    tbody.appendChild(el("tr", {}, [
      el("td", { colspan: "4", class: "muted",
                 text: `Sin pasajes en próximas ${PASS_WINDOW_H} h con elev >= ${MIN_ELEV_DEG}°.` }),
    ]));
    return;
  }
  for (const row of rows) {
    const tr = el("tr");
    tr.appendChild(el("td", {}, [el("b", { text: row.sat })]));
    tr.appendChild(el("td", {}, [
      fmtTime(row.peakT) + " ",
      el("span", { class: "muted small", text: fmtDelta(row.peakT, now) }),
    ]));
    tr.appendChild(el("td", { class: elevClass(row.peak), text: `${Math.round(row.peak)}°` }));
    tr.appendChild(el("td", { text: fmtTime(row.dataAt) }));
    tbody.appendChild(tr);
  }
}

function updateNowTable() {
  const tbody = $("#now-table tbody");
  clear(tbody);
  const now = new Date();
  const rows = satRecords
    .map(r => ({ name: r.meta.name, pos: propagate(r.satrec, now) }))
    .filter(x => x.pos)
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) {
    const overChile = r.pos.lat < -17 && r.pos.lat > -56 && r.pos.lon < -65 && r.pos.lon > -77;
    const tr = el("tr");
    const c1 = el("td", {}, [el("b", { text: r.name })]);
    if (overChile) {
      const dot = el("span", { text: " ●" });
      dot.style.color = "#5cf377";
      c1.appendChild(dot);
    }
    tr.appendChild(c1);
    tr.appendChild(el("td", { text: r.pos.lat.toFixed(1) }));
    tr.appendChild(el("td", { text: r.pos.lon.toFixed(1) }));
    tr.appendChild(el("td", { text: r.pos.alt.toFixed(0) }));
    tbody.appendChild(tr);
  }
}

function populateGeoTable() {
  const tbody = $("#geo-table tbody");
  clear(tbody);
  for (const s of satMeta.filter(x => x.kind === "geo")) {
    const tr = el("tr");
    tr.appendChild(el("td", {}, [
      el("b", { text: s.name }),
      el("div", { class: "muted small", text: s.note || "" }),
    ]));
    tr.appendChild(el("td", { text: "10 min FD" }));
    tr.appendChild(el("td", { text: `~${s.nrt_latency_min} min` }));
    tbody.appendChild(tr);
  }
}

function tickHeader() {
  $("#now-utc").textContent = new Date().toISOString().slice(0, 19).replace("T", " ");
}

async function main() {
  await loadData();
  populateVolcanoSelect();
  populateGeoTable();
  initGlobe();
  rebuildSatLayers();
  selectedVolcano = volcanoes.find(v => v.name === $("#volcano-select").value);
  onVolcanoChange();
  updateNowTable();

  setInterval(tickHeader, 1000);
  setInterval(() => { rebuildSatLayers(); updateNowTable(); }, REFRESH_MS_POSITIONS);
  setInterval(updatePassesTable, REFRESH_MS_TABLE);
  tickHeader();

  $("#btn-chile").onclick = () =>
    globe.pointOfView({ lat: -35, lng: -71, altitude: 1.5 }, 800);
  $("#btn-world").onclick = () =>
    globe.pointOfView({ lat: 0, lng: -70, altitude: 2.5 }, 800);
  $("#chk-tracks").onchange = (e) => { showTracks = e.target.checked; rebuildSatLayers(); };
  $("#chk-labels").onchange = (e) => { showLabels = e.target.checked; rebuildSatLayers(); };
}

window.addEventListener("DOMContentLoaded", main);
