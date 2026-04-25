---
slug: sat_tracker
title: Sat Tracker (pasajes satelitales)
last_updated: 2026-04-25
last_commit: scaffold
status: scaffold
tier: 4
deploy_url: ""
repo_url: ""
---

# Proyecto: Sat_Tracker

**Path local:** `..\..\Sat_Tracker\`
**Estado:** Scaffold. Sin implementacion.

## Que hace (planeado)

Calcula y muestra cuando pasa cada satelite de observacion sobre los
43 volcanes Chile, y cuando estaran los datos disponibles para descarga.

## Stack planeado

- skyfield (propagacion orbital con TLE de Celestrak)
- Streamlit dashboard
- pandas, plotly

## Datos

| Campo | Detalle |
|---|---|
| Fuente TLE | Celestrak (https://celestrak.org/) |
| Cache TLE | 6 h |
| Satelites trackeados | Sentinel-2/3/5P, Landsat 8/9, MODIS Aqua/Terra, VIIRS S-NPP/N20/N21, MetOp B/C |
| Geoestacionarios | GOES-19, Himawari-9, MTG (solo latencia, no posicion) |

## Fases planeadas

1. Tabla volcan x satelite (~200 LOC)
2. Globe en tiempo real con trazas orbitales (~400 LOC)
3. Notificaciones email/webhook (~200 LOC)

## Puntos de integracion (planeados)

### Lo que este proyecto PRODUCIRA

| Dato | Formato | Endpoint / archivo | Cadencia |
|---|---|---|---|
| Proximos pasajes por volcan | JSON / DataFrame | `src/orbit.py::next_passes(volcan, hours=24)` | on-demand |
| Latencia de datos por sensor | dict | `src/data_latency.py::sensor_latency()` | estatica |
| Posicion actual sat polar | (lat, lon, alt) | `src/orbit.py::current_position(sat)` | on-demand |

### Lo que este proyecto CONSUMIRA

| Dato | Formato | Origen |
|---|---|---|
| TLE actualizados | text | Celestrak HTTP |
| Catalogo de volcanes | dict | `Goes/src/volcanos.py` (compartir) |

### Pares con integracion natural ALTA

- **Goes/**: cross-check de scans GOES con pasaje VIIRS NRT inminente.
- **VRP Chile/**: timing del proximo pasaje MODIS/VIIRS para validar
  hot spot que VRP detecto.
- **Pronostico_Cenizas/**: timing de inputs Sentinel-5P SO2 para HYSPLIT.

## Limitaciones conocidas (anticipadas)

- TLEs envejecen rapido (precision degrada >7 dias). Refresh frecuente.
- Latencias NRT son estimadas, no garantizadas. Producto real puede
  llegar antes/despues.
- No predice cobertura nubosa — un pasaje puede no servir si hay nubes.

## Contactos

- Celestrak: T.S. Kelso (https://celestrak.org/)
- Skyfield: Brandon Rhodes (https://rhodesmill.org/skyfield/)
