# Sat_Tracker — Monitoreo de pasajes satelitales sobre volcanes Chile

🌐 **Sitio público en vivo:** https://mendozavolcanic.github.io/Sat_Tracker/

**Estado:** Fases 1 + 2 + 3 implementadas. Globo 3D web público (GitHub Pages) + dashboard Streamlit local con alertas.
**Objetivo:** Dashboard que muestra cuándo pasa cada satélite de observación
sobre los 43 volcanes activos de Chile (catálogo SERNAGEOMIN/RNVV), y cuándo
estarán los datos disponibles para descarga.

## Dos formas de uso

### A) Página pública (GitHub Pages) — recomendada

Globo 3D en navegador con cálculo orbital (SGP4) en cliente, sin servidor:

🌐 **https://mendozavolcanic.github.io/Sat_Tracker/**

- Globo 3D interactivo (`globe.gl` + `three.js`)
- Posición en vivo de los 14 satélites polares + trazas terrestres 90 min
- Click en cualquier volcán → tabla de pasajes próximas 24 h
- TLEs refrescados diariamente vía GitHub Action desde Celestrak
- Funciona en cualquier navegador, móvil incluido

### B) Dashboard Streamlit local — análisis avanzado

```bash
pip install -r requirements.txt
streamlit run dashboard/app.py
```

6 tabs:
- **📋 Tabla pasajes** — volcán × satélite con último/próximo + latencia NRT (CSV download).
- **🌍 Mapa en vivo** — Plotly 2D con posición y traza, auto-refresh 30 s.
- **🌐 Globo 3D** — pydeck con altitudes reales de los sats.
- **⏱️ Timeline 24 h** — gantt de pasajes por volcán.
- **🔔 Alertas** (Fase 3) — pasajes en próximos N min, descarga JSONL/TXT, push a webhook (Slack/Discord/Teams).
- **📡 Geoestacionarios** — GOES-19 / Himawari-9 / MTG-I1.

## Refresh de TLEs

GitHub Action (`.github/workflows/update_tles.yml`) corre todos los días a las 06:00 UTC, baja TLEs frescos de Celestrak (per-CATNR para no chocar con rate-limit del endpoint `GROUP=active`) y commitea `web/data/tle.json` si cambió. Manual: ejecutar `python scripts/export_data.py`.

## Por qué este proyecto

Cada vez que pasa un evento volcánico interesante, el volcanólogo se
pregunta: **"¿qué satélites están viendo esto y cuándo bajan los datos?"**

Hoy es un cálculo manual:
- Sentinel-5P TROPOMI pasa sobre Chile ~13:30 LT, datos L2 SO2 disponibles
  ~3 h después
- MODIS Aqua/Terra pasan ~10:30 y ~13:30 LT, NRT ~2-4 h
- VIIRS S-NPP/N20/N21 pasan a ~13:30 LT (orbital plane), NRT ~30 min
- Landsat 8/9 pasan cada 16 días sobre el mismo punto
- GOES-19 / Himawari / MTG son geoestacionarios — siempre arriba

Este dashboard responde de un vistazo: **qué pasó, qué viene, dónde están
los datos**.

## Stack técnico planeado

| Componente | Librería |
|---|---|
| Propagación orbital | [`skyfield`](https://rhodesmill.org/skyfield/) (TLE → posición) |
| TLE source | [Celestrak](https://celestrak.org/NORAD/elements/) HTTP, sin auth |
| Globe viz tiempo real | `pydeck` o `plotly mapbox` |
| Dashboard | Streamlit |
| Almacenamiento de overpasses | SQLite local + cache Streamlit |

## Satélites a trackear (v1)

### Polares (calcular pasajes con TLE)

| Satélite | Sensor | Cadencia visita | Latencia NRT | Producto volcánico clave |
|---|---|---|---|---|
| Sentinel-5P | TROPOMI | 1×/día (~13:30 LT) | ~3 h | SO2 L2, columna troposférica |
| MODIS Terra | MODIS | 1-2×/día | 2-4 h | Hot spots, Ash RGB |
| MODIS Aqua | MODIS | 1-2×/día | 2-4 h | Hot spots, Ash RGB |
| Suomi-NPP | VIIRS | 1×/día (~13:30 LT) | ~30 min | Hot spots NRT, alta res |
| NOAA-20 | VIIRS | 1×/día | ~30 min | Hot spots NRT |
| NOAA-21 | VIIRS | 1×/día | ~30 min | Hot spots NRT |
| Landsat 8 | OLI/TIRS | cada 16 d | 6-12 h | Térmico alta res 100m |
| Landsat 9 | OLI/TIRS | cada 16 d (offset 8d) | 6-12 h | Térmico alta res 100m |
| Sentinel-2A | MSI | cada 5 d | 6-24 h | Visible alta res 10m |
| Sentinel-2B | MSI | cada 5 d (offset) | 6-24 h | Visible alta res 10m |
| Sentinel-3A | OLCI/SLSTR | 1-2×/día | 3-6 h | Térmico + visible |
| IASI MetOp-B | IASI | 2×/día | 6-12 h | SO2 columna |
| IASI MetOp-C | IASI | 2×/día | 6-12 h | SO2 columna |

### Geoestacionarios (siempre arriba — solo data latency)

| Satélite | Cadencia | Latencia | Cobertura Chile |
|---|---|---|---|
| GOES-19 (East) | 10 min Full Disk | 3-5 min | Sí — limbo |
| Himawari-9 | 10 min Full Disk | 3-5 min | Marginal — limbo opuesto |
| MTG-I1 (FCI) | 10 min Full Disk | 5-10 min | No — Atlántico-África |

## Roadmap

### Fase 1 — Tabla simple (mínimo viable, ~200 LOC)

Una página Streamlit con tabla por volcán × satélite mostrando:
- Último pasaje (UTC + hace cuánto)
- Próximo pasaje (UTC + en cuánto)
- Datos disponibles (link al producto)

Sin globe, sin animación. Solo tabla. Suficiente para empezar.

### Fase 2 — Globe en tiempo real (~400 LOC adicionales)

- Mundi-mapa con posiciones actuales de cada sat polar
- Trazas orbitales próximos 90 min
- Highlight cuando un sat está sobre Chile
- Click en sat → ver próximos pasajes

### Fase 3 — Notificaciones (~200 LOC)

- "Sentinel-5P pasa en 23 min sobre Lascar"
- Email / webhook configurable
- Filtros: solo prioridad alta, solo si hay actividad confirmada

## Implementación: por dónde empezar

1. `src/tle_fetcher.py` — bajar TLEs de Celestrak, cachear 6 h.
2. `src/orbit.py` — wrapper sobre `skyfield.Topos` para próximos pasajes.
3. `src/data_latency.py` — tabla estática de latencias por sensor (algunas
   se pueden chequear haciendo HEAD a los buckets, e.g. AWS S3 Sentinel).
4. `dashboard/app.py` — tabla volcán × satélite.

## Integración con otros proyectos

- **Goes/**: este proyecto le dice "Sentinel-5P pasa en 20 min, esperar
  para tener cross-check de SO2".
- **VRP Chile/**: idem para confirmar hot spots VIIRS NRT.
- **Pronostico_Cenizas/**: timing de inputs satelitales para HYSPLIT.

Mantener un `INTEGRATION.md` apenas haya implementación funcional.

## Estructura

```
Sat_Tracker/
├── README.md
├── LICENSE                       ← MIT
├── INTEGRATION.md
├── requirements.txt
├── src/
│   ├── volcanoes.py              ← 43 volcanes RNVV (lat/lon/zona/ranking)
│   ├── satellites.py             ← catálogo sats + NORAD + latencia NRT
│   ├── tle_fetcher.py            ← descarga Celestrak, cache 6 h
│   └── orbit.py                  ← skyfield: pasajes, posición, ground track
├── dashboard/
│   └── app.py                    ← Streamlit (4 tabs)
├── tests/
│   └── smoke_test.py             ← descarga TLE + calcula pasaje S-NPP/Villarrica
└── docs/
    └── SATELLITES.md             ← detalle por sensor
```

## Licencia

MIT — uso libre incluyendo comercial, manteniendo aviso de copyright.
