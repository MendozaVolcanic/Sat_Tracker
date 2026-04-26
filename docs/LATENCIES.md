# Latencias NRT — fuentes y nivel de confianza

**Importante:** los valores `nrt_latency_min` en `src/satellites.py` son
**estimados conservadores basados en documentación operacional pública**, no
mediciones empíricas en tiempo real. La latencia real varía típicamente
±50% según congestión del segmento terreno, hora del día y producto específico.

Esto significa que cuando el dashboard dice "datos NRT ~14:23 UTC", debe
leerse como **"el producto típicamente está disponible alrededor de esa hora,
con margen de error ±15-30 min"** — no como un horario garantizado.

## Fuentes por satélite

### Sentinel-5P TROPOMI — 180 min (3 h)
- **Fuente:** [Copernicus Sentinel-5P Data Quality Reports](https://sentinel.esa.int/web/sentinel/technical-guides/sentinel-5p), ESA. Producto NRTI (Near-Real-Time) L2 SO₂ comprometido a entrega < 3 h tras adquisición.
- **Producto operacional:** L2__SO2___ NRTI vía Copernicus Data Space Ecosystem.
- **Variabilidad:** En la práctica suele estar disponible entre 2h30 y 3h30 después del pasaje.

### MODIS Terra/Aqua — 150 min (2.5 h)
- **Fuente:** [LANCE MODIS NRT Documentation](https://lance.modaps.eosdis.nasa.gov/about_lance.php). Compromiso oficial: < 3 h del observación a disponibilidad.
- **Producto:** MOD/MYD14 (active fires), MOD/MYD06_L2 (cloud/ash).
- **Variabilidad:** 2-4 h reportadas en ATBD. Pasajes sobre antárticas/sur de Sudamérica → cerca del límite alto.

### VIIRS Suomi-NPP / NOAA-20 / NOAA-21 — 30 min
- **Fuente:** [FIRMS VIIRS NRT Documentation](https://firms.modaps.eosdis.nasa.gov/descriptions/v1/firms_faq.html#latency) — VIIRS I-band 375 m NRT fire detections "available within 3 hours of satellite overpass" para US-NRT, **menos de 1h para datos via direct broadcast** en estaciones cercanas.
- **Estimación 30 min:** asume direct-broadcast / RT-STPS regional. **Para Chile/Sudamérica sin direct broadcast la latencia real es 60-120 min vía LANCE/FIRMS.**
- **A revisar:** ¿hay alguna estación HRPT/X-band activa en Chile o Argentina que reciba VIIRS directamente? Si no, el valor honesto es ~90 min, no 30.

### Landsat 8/9 — 540 min (9 h)
- **Fuente:** [USGS Landsat NRT (Real-Time) FAQ](https://www.usgs.gov/faqs/how-long-does-it-take-acquired-landsat-data-be-available-download). USGS distingue:
  - **RT (Real-Time)**: 4-12 h post-adquisición, calidad preliminar.
  - **T1 (Tier 1)**: ~16 días post-adquisición, calibración final.
- **Estimación 9 h:** asume RT. Para análisis cuantitativos (FRP térmico) querrás T1, que toma días.

### Sentinel-2A/B — 720 min (12 h)
- **Fuente:** [Copernicus Sentinel-2 Mission Overview](https://sentinels.copernicus.eu/web/sentinel/missions/sentinel-2). L1C disponible típicamente 6-24 h.
- **Variabilidad alta:** depende de carga del PDGS, banda de descarga, y zona.
- **NRT real:** Sentinel-2 NO es NRT — es delivery batch.

### Sentinel-3A/B SLSTR — 240 min (4 h)
- **Fuente:** [EUMETSAT Sentinel-3 Service Specification](https://www-cdn.eumetsat.int/files/2020-04/pdf_s3_pdgs_sg_imp_lev2.pdf). NRT product disponible "within 3 hours" de adquisición; en práctica 3-6 h.

### MetOp-B/C IASI — 540 min (9 h)
- **Fuente:** [EUMETSAT IASI L2 product specification](https://www.eumetsat.int/iasi). El producto SO₂ LMD/ULB es retrieval offline, típicamente disponible 6-12 h post-pasaje, no es NRT estricto.

### Geoestacionarios

#### GOES-19 ABI — 5 min
- **Fuente:** [NOAA GOES-R Series Latency Specifications](https://www.goes-r.gov/products/overview.html). Specs operacionales: L1b Full Disk delivered to user community within 4-7 min.
- En la práctica vía CIRA/RAMMB SLIDER: 3-5 min. Vía bucket NOAA S3: ~10 min.

#### Himawari-9 AHI — 5 min
- **Fuente:** [JMA Himawari Specification](https://www.data.jma.go.jp/mscweb/en/himawari89/index.html). Full Disk 10 min cadence, disponible vía JAXA P-Tree ~5 min.

#### MTG-I1 FCI — 10 min
- **Fuente:** [EUMETSAT MTG Specifications](https://www.eumetsat.int/our-satellites/mtg). FCI Full Disk 10 min cadence, primera distribución 5-10 min después.
- **No relevante para Chile** — está sobre Atlántico/África.

## Cómo verificar empíricamente

Para cada producto, el modo correcto de medir latencia real es comparar el
timestamp de adquisición (`acq_time` en metadata) con el timestamp de
publicación en el catálogo (cuando aparece searchable). Sería un buen
**próximo paso**: un cron que mide latencia real diariamente para Chile y
actualiza estos valores con mediciones empíricas.

## Conclusión honesta

Los valores en el dashboard son **una primera aproximación documental**. Si
necesitás precisión operacional para programar adquisiciones, **verificá con
el portal específico del producto** (Copernicus Data Space, FIRMS, EarthExplorer).
Para uso de "más o menos cuándo bajan los datos" el dashboard es suficiente.

**TODO pendiente:** validar empíricamente latencia VIIRS para Chile (sin
direct broadcast el valor real probablemente es ~90 min, no 30).
