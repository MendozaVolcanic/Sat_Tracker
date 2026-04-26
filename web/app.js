// Sat_Tracker — globo 3D + propagación orbital en navegador.
// Datos provienen de JSON generados desde catálogos Python locales (confiables).
// SGP4 con satellite.js usando TLEs cacheados en repo.

const REFRESH_MS_TRACKS = 30000;        // recalcula trazas 90 min cada 30 s
const REFRESH_MS_NOW_TABLE = 5000;       // tabla "sats ahora" cada 5 s
const REFRESH_MS_PASSES_TABLE = 60000;   // tabla pasajes 24 h cada 60 s
const TRACK_AHEAD_MIN = 90;
const TRACK_STEP_S = 60;
const PASS_WINDOW_H = 24;
const MIN_ELEV_DEG = 20;

const GEO_COLOR = "#ffd166";
const GEO_SPHERE_RADIUS = 5.0;          // grande para verse a 36k km de distancia
const POLAR_SPHERE_RADIUS = 0.6;
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

// Posiciones nominales de geoestacionarios (longitud subsatelital).
// Son estacionarios por diseño — el drift orbital es < 1° y no afecta la
// visualización. Hardcodear es mucho más confiable que SDP4 para deep-space.
const GEO_POSITIONS = {
  "GOES-19":     { lat: 0, lon: -75.2, alt: 35786 },
  "Himawari-9":  { lat: 0, lon: 140.7, alt: 35786 },
  "MTG-I1":      { lat: 0, lon: 0,     alt: 35786 },
};

// Mapeo nombres operacionales OVDAS → satélites del catálogo.
// Útil para que el guardián identifique de qué sat viene la imagen que mira.
const OVDAS_PRODUCTS = [
  { product: "VIIRS 375 m (I-band fires)", resolution: "375 m",
    sats: ["Suomi-NPP", "NOAA-20", "NOAA-21"] },
  { product: "VIIRS 750 m (M-band)",       resolution: "750 m",
    sats: ["Suomi-NPP", "NOAA-20", "NOAA-21"] },
  { product: "VIIRS DNB (Day/Night Band)", resolution: "750 m",
    sats: ["Suomi-NPP", "NOAA-20", "NOAA-21"] },
  { product: "MODIS hot spots / Ash RGB",  resolution: "1 km / 250 m",
    sats: ["Terra", "Aqua"] },
  { product: "TROPOMI SO₂",                resolution: "5.5 × 3.5 km",
    sats: ["Sentinel-5P"] },
  { product: "Landsat TIRS térmico",       resolution: "100 m",
    sats: ["Landsat 8", "Landsat 9"] },
  { product: "Landsat OLI visible",        resolution: "30 m",
    sats: ["Landsat 8", "Landsat 9"] },
  { product: "Sentinel-2 MSI (visible)",   resolution: "10/20/60 m",
    sats: ["Sentinel-2A", "Sentinel-2B"] },
  { product: "Sentinel-3 SLSTR FRP",       resolution: "1 km",
    sats: ["Sentinel-3A", "Sentinel-3B"] },
  { product: "IASI SO₂ column",            resolution: "12 km",
    sats: ["MetOp-B", "MetOp-C"] },
  { product: "GOES ABI Ash RGB / FDCF",    resolution: "2 km",
    sats: ["GOES-19"] },
  { product: "Himawari AHI Ash RGB",       resolution: "2 km",
    sats: ["Himawari-9"] },
];

let volcanoes = [];
let satMeta = [];
let satRecords = [];
let selectedVolcano = null;
let globe = null;
let showTracks = true;
let showLabels = true;
let showFootprints = false;
let showCone = false;

// Time warp — virtualTime != null cuando estamos en preview/replay.
let virtualTime = null;       // ms epoch
let timeRate = 1;             // velocidad de avance (1 = real, 30 = preview)
let _lastWallMs = null;
let previewTimeout = null;

function getNow() {
  return virtualTime === null ? new Date() : new Date(virtualTime);
}

function advanceVirtualTime() {
  if (virtualTime === null) {
    _lastWallMs = null;
    return;
  }
  const wall = Date.now();
  if (_lastWallMs !== null) {
    virtualTime += (wall - _lastWallMs) * timeRate;
  }
  _lastWallMs = wall;
}

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

// Elevación solar (grados sobre horizonte) en (lat,lon) en momento t.
// Fórmula astronómica estándar — precisión ~0.1° suficiente para clasificar
// día / terminator / noche.
function solarElevation(lat, lon, t) {
  const dayOfYear = Math.floor(
    (t - new Date(Date.UTC(t.getUTCFullYear(), 0, 0))) / 86400000,
  );
  const decl = 23.45 * Math.sin((2 * Math.PI / 365) * (dayOfYear - 81)) * Math.PI / 180;
  const utcH = t.getUTCHours() + t.getUTCMinutes() / 60 + t.getUTCSeconds() / 3600;
  const hourAngle = ((utcH - 12) * 15 + lon) * Math.PI / 180;
  const φ = lat * Math.PI / 180;
  const sinAlt = Math.sin(φ) * Math.sin(decl) + Math.cos(φ) * Math.cos(decl) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI;
}

// Devuelve { icon, label } según elevación solar en el momento del pasaje.
function dayNightInfo(volcano, t) {
  const sunElev = solarElevation(volcano.lat, volcano.lon, t);
  if (sunElev > 6) return { icon: "☀", label: "día", elev: sunElev, kind: "day" };
  if (sunElev > -6) return { icon: "🌅", label: "terminator", elev: sunElev, kind: "term" };
  return { icon: "🌙", label: "noche", elev: sunElev, kind: "night" };
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
    if (!s.norad_id) continue;
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

// Estado mutable de cada sat — los objetos se referencian por identidad,
// así globe.gl solo actualiza posición/labels en cada frame sin recrear meshes.
let satState = [];

function buildSatState() {
  satState = satRecords.map(r => ({
    name: r.meta.name,
    kind: r.meta.kind,
    color: r.meta.kind === "geo" ? GEO_COLOR : (SAT_COLORS[r.name] || DEFAULT_COLOR),
    radius: r.meta.kind === "geo" ? GEO_SPHERE_RADIUS : POLAR_SPHERE_RADIUS,
    swath_km: r.meta.swath_km || 0,
    lat: 0, lon: 0, alt: 0,
    text: r.meta.name,
    lng: 0,
    labelAlt: 0,
    _satrec: r.satrec,
  }));
}

function tickPositions(_unused) {
  advanceVirtualTime();
  const now = getNow();
  for (const s of satState) {
    let pos;
    if (s.kind === "geo") {
      pos = GEO_POSITIONS[s.name] || { lat: 0, lon: 0, alt: 35786 };
    } else {
      pos = propagate(s._satrec, now);
      if (!pos) continue;
    }
    s.lat = pos.lat;
    s.lon = pos.lon;
    s.lng = pos.lon;
    s.alt = pos.alt;
    // Geos están a 35786 km — labelAlt en unidades de radio terrestre.
    s.labelAlt = s.kind === "geo" ? 0.4 : pos.alt / 6371 + 0.05;
  }
}

// Footprint real = franja CROSS-TRACK siguiendo la traza orbital.
// Para cada par consecutivo de puntos en la traza, calculamos el bearing
// (rumbo) y desplazamos lateralmente ±swath/2 perpendicular al vector de
// vuelo. Eso da una banda que es lo que el sensor barre realmente.

const FOOTPRINT_AHEAD_MIN = 30;          // mostrar swath próximos 30 min
const FOOTPRINT_STEP_S = 60;
const R_EARTH_KM = 6371;

function bearingDeg(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) -
            Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Mover un punto (lat,lon) una distancia 'distKm' en bearing 'brngDeg'.
function offsetPoint(lat, lon, distKm, brngDeg) {
  const δ = distKm / R_EARTH_KM;
  const θ = brngDeg * Math.PI / 180;
  const φ1 = lat * Math.PI / 180, λ1 = lon * Math.PI / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) +
                        Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(
    Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
    Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
  );
  return [φ2 * 180 / Math.PI, ((λ2 * 180 / Math.PI + 540) % 360) - 180];
}

function makeSwathStrip(satrec, startTime, ahedMin, swathKm) {
  // Genera puntos de la traza, computa bearing local, y desplaza ±swath/2
  // perpendicular para obtener bordes izq/der de la banda.
  const half = swathKm / 2;
  const n = Math.floor(ahedMin * 60 / FOOTPRINT_STEP_S);
  const track = [];
  for (let i = 0; i <= n; i++) {
    const t = new Date(startTime.getTime() + i * FOOTPRINT_STEP_S * 1000);
    const p = propagate(satrec, t);
    if (p) track.push(p);
  }
  if (track.length < 2) return [];

  // Por cada punto, bearing al siguiente; bordes a 90° y -90° del bearing.
  const left = [], right = [];
  for (let i = 0; i < track.length; i++) {
    const cur = track[i];
    const next = track[Math.min(i + 1, track.length - 1)];
    const prev = track[Math.max(i - 1, 0)];
    const ref = i < track.length - 1 ? next : prev;
    const brg = (i < track.length - 1)
      ? bearingDeg(cur.lat, cur.lon, ref.lat, ref.lon)
      : bearingDeg(prev.lat, prev.lon, cur.lat, cur.lon);
    left.push(offsetPoint(cur.lat, cur.lon, half, (brg - 90 + 360) % 360));
    right.push(offsetPoint(cur.lat, cur.lon, half, (brg + 90) % 360));
  }
  // Polígono = bordes izquierdos + bordes derechos invertidos. Pero hay que
  // partir cuando cruza antimeridiano para evitar polígonos rotos.
  // Estrategia simple: emitir múltiples segmentos rectos como sub-polígonos.
  const segments = [];
  let segL = [], segR = [];
  for (let i = 0; i < left.length; i++) {
    if (i > 0) {
      const dl = Math.abs(left[i][1] - left[i-1][1]);
      const dr = Math.abs(right[i][1] - right[i-1][1]);
      if (dl > 180 || dr > 180) {
        if (segL.length > 1) segments.push({ left: segL, right: segR });
        segL = []; segR = [];
      }
    }
    segL.push(left[i]);
    segR.push(right[i]);
  }
  if (segL.length > 1) segments.push({ left: segL, right: segR });
  return segments;
}

// Cono de visibilidad desde el volcán: región del cielo donde un sat es
// "visible" con elevación >= MIN_ELEV. Tip en el volcán, eje hacia zenith.
// Ángulo de apertura medio = 90 - MIN_ELEV (e.g. 70° con MIN_ELEV=20).
let coneObj = null;

function rebuildCone() {
  // Quitar cono previo si existe.
  if (coneObj) {
    if (coneObj.parent) coneObj.parent.remove(coneObj);
    coneObj.geometry.dispose();
    coneObj.material.dispose();
    coneObj = null;
  }
  if (!showCone || !selectedVolcano) return;

  // Cono: tip arriba, base abajo (orientación default de ConeGeometry).
  // Lo creamos con tip en origen, base hacia +Y, lo rotamos para apuntar
  // hacia zenith del volcán, y lo posicionamos en el volcán.
  const halfAngleDeg = 90 - MIN_ELEV_DEG;
  const halfAngleRad = halfAngleDeg * Math.PI / 180;
  // Altura suficiente para alcanzar órbita LEO (~800 km / 6371 = 0.126
  // unidades en escala globe.gl, que tiene radio = 100 → 12.6 unidades).
  // Usamos 25 unidades (~1600 km) para asegurar cubrir todos los polares.
  const height = 25;
  const baseRadius = height * Math.tan(halfAngleRad);

  const geo = new THREE.ConeGeometry(baseRadius, height, 48, 1, true);
  // Por default la geometría tiene su tip en (0, h/2, 0) y base en (0, -h/2, 0).
  // Trasladamos para que el tip quede en el origen y la base en (0, h, 0).
  geo.translate(0, height / 2, 0);

  const mat = new THREE.MeshBasicMaterial({
    color: 0x4cc9f0,
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const cone = new THREE.Mesh(geo, mat);

  // Wireframe sobre la superficie cónica (más visual).
  const wire = new THREE.Mesh(
    new THREE.ConeGeometry(baseRadius, height, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x4cc9f0, wireframe: true, transparent: true, opacity: 0.35,
    }),
  );
  wire.geometry.translate(0, height / 2, 0);
  cone.add(wire);

  // Posicionar el cono en el volcán. globe.gl: getCoords(lat,lon,altRel)
  // devuelve {x,y,z} de un punto en escena.
  const tip = globe.getCoords(selectedVolcano.lat, selectedVolcano.lon, 0);
  cone.position.set(tip.x, tip.y, tip.z);
  // Orientar el cono para apuntar hacia zenith (radial outward).
  // El tip está en el origen del mesh; queremos que el eje +Y del mesh
  // apunte desde el centro de la Tierra hacia el volcán.
  const center = new THREE.Vector3(0, 0, 0);
  const tipVec = new THREE.Vector3(tip.x, tip.y, tip.z);
  const radialOut = tipVec.clone().sub(center).normalize();
  // Necesitamos rotar el "+Y" del mesh para que coincida con radialOut.
  const yAxis = new THREE.Vector3(0, 1, 0);
  cone.quaternion.setFromUnitVectors(yAxis, radialOut);

  // Agregar al scene de three.js. globe.gl expone .scene().
  globe.scene().add(cone);
  coneObj = cone;
}

function rebuildFootprints() {
  if (!showFootprints) {
    globe.polygonsData([]);
    return;
  }
  const now = new Date();
  const polys = [];
  for (const r of satRecords) {
    if (r.meta.kind === "geo" || !r.meta.swath_km) continue;
    const segs = makeSwathStrip(r.satrec, now, FOOTPRINT_AHEAD_MIN, r.meta.swath_km);
    const color = SAT_COLORS[r.name] || DEFAULT_COLOR;
    for (const seg of segs) {
      // ring = left forward + right backward
      const ring = [
        ...seg.left.map(p => [p[1], p[0]]),
        ...seg.right.slice().reverse().map(p => [p[1], p[0]]),
      ];
      ring.push(ring[0]);  // cerrar
      polys.push({
        geometry: { type: "Polygon", coordinates: [ring] },
        color, name: r.meta.name,
      });
    }
  }
  globe
    .polygonsData(polys)
    .polygonGeoJsonGeometry("geometry")
    .polygonAltitude(0.003)
    .polygonCapColor(d => d.color + "30")
    .polygonSideColor(d => d.color + "10")
    .polygonStrokeColor(d => d.color)
    .polygonsTransitionDuration(0);
}

function rebuildTracks() {
  const now = new Date();
  const trackPaths = [];
  if (!showTracks) {
    globe.pathsData([]);
    return;
  }
  for (const r of satRecords) {
    if (r.meta.kind === "geo") continue;  // geoestacionarios no tienen "traza" útil
    const color = SAT_COLORS[r.name] || DEFAULT_COLOR;
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
  globe
    .pathsData(trackPaths)
    .pathPoints("coords")
    .pathPointLat(p => p[0])
    .pathPointLng(p => p[1])
    .pathPointAlt(p => p[2] / 6371)
    .pathColor(d => [d.color, d.color])
    .pathStroke(1.2)
    .pathTransitionDuration(0);
}

function setupSatLayers() {
  buildSatState();
  // Custom layer: una esfera por satélite, persistente.
  globe
    .customLayerData(satState)
    .customThreeObject(d => {
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(d.radius, 16, 16),
        new THREE.MeshBasicMaterial({ color: d.color }),
      );
      if (d.kind === "geo") {
        // Halo amarillo tenue para geoestacionarios — más visibles
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(d.radius * 1.6, d.radius * 1.9, 24),
          new THREE.MeshBasicMaterial({ color: d.color, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }),
        );
        halo.lookAt(0, 0, 0);
        sphere.add(halo);
      }
      return sphere;
    })
    .customThreeObjectUpdate((obj, d) => {
      Object.assign(obj.position, globe.getCoords(d.lat, d.lon, d.alt / 6371));
    });

  // Labels via HTML elements — siempre renderizan, no se auto-ocultan
  // por colisión (problema de globe.gl labelsData).
  globe
    .htmlElementsData(satState)
    .htmlLat("lat").htmlLng("lng").htmlAltitude("labelAlt")
    .htmlElement(d => {
      const div = document.createElement("div");
      div.className = "sat-html-label" + (d.kind === "geo" ? " geo" : "");
      div.textContent = d.text;
      div.style.color = d.color;
      div.style.borderColor = d.color;
      return div;
    });

  rebuildTracks();
}

let _footprintTickCounter = 0;
function animationLoop() {
  tickPositions();
  globe.customLayerData(satState);
  globe.htmlElementsData(satState);
  // Footprints más pesados — refresco cada ~12 frames (~5 Hz).
  if (showFootprints && (++_footprintTickCounter % 12 === 0)) {
    rebuildFootprints();
  }
  requestAnimationFrame(animationLoop);
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
  rebuildCone();
  globe.pointOfView({ lat: v.lat, lng: v.lon, altitude: 1.6 }, 800);
}

function updatePassesTable() {
  const tbody = $("#passes-table tbody");
  clear(tbody);
  if (!selectedVolcano) return;
  const now = getNow();
  const t1 = new Date(now.getTime() + PASS_WINDOW_H * 3600 * 1000);
  const rows = [];
  for (const r of satRecords) {
    if (r.meta.kind === "geo") continue;
    const passes = findPasses(r.satrec, selectedVolcano, now, t1);
    for (const p of passes) {
      const dataAt = new Date(p.set.getTime() + r.meta.nrt_latency_min * 60000);
      const dn = dayNightInfo(selectedVolcano, p.peakT);
      rows.push({ sat: r.meta.name, peak: p.peak, peakT: p.peakT, dataAt, dn,
                  rise: p.rise, set: p.set });
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
    const satCell = el("td", {}, [el("b", { text: row.sat })]);
    const dnSpan = el("span", {
      class: `dn-tag dn-${row.dn.kind}`,
      text: row.dn.icon,
      title: `Sol ${row.dn.elev.toFixed(0)}° — ${row.dn.label}`,
    });
    satCell.appendChild(document.createTextNode(" "));
    satCell.appendChild(dnSpan);
    tr.appendChild(satCell);
    tr.appendChild(el("td", {}, [
      fmtTime(row.peakT) + " ",
      el("span", { class: "muted small", text: fmtDelta(row.peakT, now) }),
    ]));
    tr.appendChild(el("td", { class: elevClass(row.peak), text: `${Math.round(row.peak)}°` }));
    tr.appendChild(el("td", { text: fmtTime(row.dataAt) }));
    // Botón Preview (idea 20)
    const playCell = el("td");
    const playBtn = el("button", {
      class: "preview-btn",
      title: "Animación acelerada del pasaje (30×)",
      text: "▶",
    });
    playBtn.onclick = () => previewPass(row);
    playCell.appendChild(playBtn);
    tr.appendChild(playCell);
    tbody.appendChild(tr);
  }
}

function flyToSatPos(lat, lon, isGeo) {
  // Geos están a ~36k km — necesitan zoom-out para verse bien.
  const altitude = isGeo ? 4.5 : 1.0;
  globe.pointOfView({ lat, lng: lon, altitude }, 1200);
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
    tr.style.cursor = "pointer";
    tr.title = `Click: ir a ${r.name}`;
    const meta = satMeta.find(m => m.name === r.name);
    const isGeo = meta?.kind === "geo";
    const lat = r.pos.lat, lon = r.pos.lon;
    tr.onclick = () => flyToSatPos(lat, lon, isGeo);
    const c1 = el("td", {}, [el("b", { text: r.name })]);
    if (overChile) {
      const dot = el("span", { text: " ●" });
      dot.style.color = "#5cf377";
      dot.title = "Sobre Chile ahora";
      c1.appendChild(dot);
    }
    tr.appendChild(c1);
    tr.appendChild(el("td", { text: r.pos.lat.toFixed(1) }));
    tr.appendChild(el("td", { text: r.pos.lon.toFixed(1) }));
    tr.appendChild(el("td", { text: r.pos.alt.toFixed(0) }));
    tbody.appendChild(tr);
  }
}

function populateOvdasProducts() {
  const tbody = document.querySelector("#ovdas-products tbody");
  if (!tbody) return;
  clear(tbody);
  for (const p of OVDAS_PRODUCTS) {
    const tr = el("tr");
    tr.appendChild(el("td", {}, [el("b", { text: p.product })]));
    tr.appendChild(el("td", { class: "muted small", text: p.resolution }));
    const satsCell = el("td");
    p.sats.forEach((satName, i) => {
      const meta = satMeta.find(m => m.name === satName);
      const color = meta && meta.kind !== "geo"
        ? (SAT_COLORS[satName.toUpperCase().replace("-", "-")] || DEFAULT_COLOR)
        : (meta?.kind === "geo" ? GEO_COLOR : DEFAULT_COLOR);
      // satellite.js TLE names use spaces sometimes — try color match against record.name
      const rec = satRecords.find(r => r.meta.name === satName);
      const c = rec ? (SAT_COLORS[rec.name] || (meta?.kind === "geo" ? GEO_COLOR : DEFAULT_COLOR)) : color;
      const chip = el("span", { class: "sat-chip", text: satName });
      chip.style.borderColor = c;
      chip.style.color = c;
      chip.style.cursor = "pointer";
      chip.title = `Click: ir a ${satName} en el globo`;
      chip.onclick = () => {
        const s = satState.find(x => x.name === satName);
        if (s) flyToSatPos(s.lat, s.lon, s.kind === "geo");
      };
      satsCell.appendChild(chip);
      if (i < p.sats.length - 1) satsCell.appendChild(document.createTextNode(" "));
    });
    tr.appendChild(satsCell);
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
  const now = getNow();
  let text = now.toISOString().slice(0, 19).replace("T", " ");
  if (virtualTime !== null) text = `▶ ${text}  (preview ${timeRate}×)`;
  $("#now-utc").textContent = text;
  $("#now-utc").style.color = virtualTime !== null ? "#ff9500" : "";
}

function previewPass(row) {
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  // Empezar 90 s antes del rise, terminar 60 s después del set.
  const startMs = row.rise.getTime() - 90 * 1000;
  const endMs = row.set.getTime() + 60 * 1000;
  const passDurMs = endMs - startMs;
  timeRate = 30;
  virtualTime = startMs;
  _lastWallMs = null;
  // Centrar globo en volcán para ver el pasaje.
  globe.pointOfView({
    lat: selectedVolcano.lat, lng: selectedVolcano.lon, altitude: 1.4,
  }, 600);
  showPreviewBanner(row);
  previewTimeout = setTimeout(() => {
    virtualTime = null;
    timeRate = 1;
    hidePreviewBanner();
  }, passDurMs / timeRate + 500);
}

function showPreviewBanner(row) {
  hidePreviewBanner();
  const banner = el("div", { id: "preview-banner" });
  banner.appendChild(document.createTextNode(
    `▶ Preview ${row.sat} sobre ${selectedVolcano.name} (${timeRate}× tiempo real)`));
  const cancel = el("button", { class: "preview-cancel", text: "✕ Cancelar" });
  cancel.onclick = cancelPreview;
  banner.appendChild(cancel);
  document.body.appendChild(banner);
}
function hidePreviewBanner() {
  const b = document.getElementById("preview-banner");
  if (b) b.remove();
}
function cancelPreview() {
  if (previewTimeout) clearTimeout(previewTimeout);
  previewTimeout = null;
  virtualTime = null;
  timeRate = 1;
  hidePreviewBanner();
}

async function main() {
  // Reloj primero — siempre debe andar aunque algo abajo falle.
  tickHeader();
  setInterval(tickHeader, 1000);

  await loadData();
  populateVolcanoSelect();
  populateOvdasProducts();
  populateGeoTable();
  initGlobe();

  // Cada paso protegido — un fallo no debe romper el resto del dashboard.
  try { setupSatLayers(); } catch (e) { console.error("setupSatLayers:", e); }
  selectedVolcano = volcanoes.find(v => v.name === $("#volcano-select").value);
  try { onVolcanoChange(); } catch (e) { console.error("onVolcanoChange:", e); }
  try { updateNowTable(); } catch (e) { console.error("updateNowTable:", e); }

  setInterval(() => { try { updateNowTable(); } catch(e){console.error(e);} }, REFRESH_MS_NOW_TABLE);
  setInterval(() => { try { rebuildTracks(); } catch(e){console.error(e);} }, REFRESH_MS_TRACKS);
  setInterval(() => { try { updatePassesTable(); } catch(e){console.error(e);} }, REFRESH_MS_PASSES_TABLE);

  // Movimiento continuo: 60 fps.
  requestAnimationFrame(animationLoop);

  $("#btn-chile").onclick = () =>
    globe.pointOfView({ lat: -35, lng: -71, altitude: 1.5 }, 800);
  $("#btn-world").onclick = () =>
    globe.pointOfView({ lat: 0, lng: -70, altitude: 2.5 }, 800);
  $("#btn-geos").onclick = () =>
    globe.pointOfView({ lat: 0, lng: -90, altitude: 8 }, 1500);

  // En móvil, hacer paneles 4+ colapsables (ahorra scroll).
  document.querySelectorAll(".panel h2").forEach(h => {
    h.addEventListener("click", () => {
      if (window.innerWidth <= 600) {
        h.parentElement.classList.toggle("expanded");
      }
    });
  });
  $("#chk-tracks").onchange = (e) => { showTracks = e.target.checked; rebuildTracks(); };
  $("#chk-labels").onchange = (e) => {
    showLabels = e.target.checked;
    document.body.classList.toggle("hide-sat-labels", !showLabels);
  };
  $("#chk-footprints").onchange = (e) => {
    showFootprints = e.target.checked;
    rebuildFootprints();
  };
  $("#chk-cone").onchange = (e) => {
    showCone = e.target.checked;
    rebuildCone();
  };
}

window.addEventListener("DOMContentLoaded", main);
