# Detalle por satélite y producto volcánico

## Polares (orbita LEO, calcular pasajes con TLE)

### Sentinel-5P (TROPOMI)
- **Operador:** ESA / Copernicus
- **Lanzamiento:** 2017-10-13 — operacional
- **Órbita:** sun-synchronous, ~824 km, ~13:30 LT cruce ecuador descendente
- **Producto volcánico:** L2_SO2 (columna troposférica DU)
- **Latencia NRT:** ~3 h
- **Acceso:** Copernicus Data Space Ecosystem (auth gratis)
- **TLE NORAD:** 42969
- **Comentario:** **El estándar para SO2 cuantitativo.** Resolución 5.5×3.5 km.

### MODIS Terra
- **Operador:** NASA
- **Órbita:** sun-sync, ~705 km, ~10:30 LT descendente
- **Productos:** Hot spots (MOD14), Ash (MOD06_L2), Cloud Mask
- **Latencia NRT:** 2-4 h (LANCE)
- **TLE NORAD:** 25994

### MODIS Aqua
- **Operador:** NASA
- **Órbita:** sun-sync, ~705 km, ~13:30 LT ascendente
- **Productos:** idem MODIS Terra
- **Latencia NRT:** 2-4 h
- **TLE NORAD:** 27424
- **Comentario:** **Cierra el día con Terra** — juntos dan 4 pasajes/día sobre Chile.

### Suomi-NPP (VIIRS)
- **Operador:** NASA / NOAA
- **Órbita:** sun-sync, ~824 km, ~13:30 LT
- **Productos:** Active Fires VNP14 (NRT), I-band 375m
- **Latencia NRT:** ~30 min (VIIRS I-band fire detection)
- **TLE NORAD:** 37849
- **Comentario:** **VIIRS 375m es lo mejor para hot spots volcánicos NRT.**

### NOAA-20 (VIIRS)
- **Órbita:** sun-sync, ~824 km, ~13:30 LT (50 min antes de S-NPP)
- **TLE NORAD:** 43013

### NOAA-21 (VIIRS)
- **Lanzamiento:** 2022-11
- **TLE NORAD:** 54234

### Landsat 8 (OLI/TIRS)
- **Operador:** USGS / NASA
- **Órbita:** sun-sync, ~705 km, ~10:00 LT
- **Productos:** Bandas térmicas TIRS B10/B11 (100 m), Visible 30 m
- **Cadencia:** cada 16 días sobre el mismo path/row
- **Latencia:** 6-12 h
- **TLE NORAD:** 39084
- **Comentario:** **Resolución espacial alta, cadencia baja.** Útil para reanálisis post-evento, no NRT.

### Landsat 9 (OLI-2/TIRS-2)
- **Lanzamiento:** 2021-09
- **Órbita:** Igual a L8 pero offset 8 días → juntos 8 días revisita
- **TLE NORAD:** 49260

### Sentinel-2A (MSI)
- **Operador:** ESA
- **Órbita:** sun-sync, ~786 km, ~10:30 LT
- **Productos:** L1C / L2A multibanda 10-20-60 m
- **Cadencia:** cada 10 días (5 con 2A+2B)
- **TLE NORAD:** 40697

### Sentinel-2B (MSI)
- **TLE NORAD:** 42063

### Sentinel-3A/B (OLCI + SLSTR)
- **Operador:** ESA
- **Órbita:** sun-sync, ~814 km
- **Productos:** SLSTR FRP (fire radiative power), OLCI multibanda
- **Cadencia:** ~daily combinado
- **TLE NORAD:** 41335 (3A), 43437 (3B)

### MetOp-B / MetOp-C (IASI)
- **Operador:** EUMETSAT
- **Órbita:** sun-sync, ~817 km, ~21:30 LT descendente
- **Productos:** SO2 column (LMD/ULB retrieval), atmospheric profiles
- **Latencia:** 6-12 h
- **TLE NORAD:** 38771 (B), 43689 (C)
- **Comentario:** Complementa TROPOMI con paso nocturno.

## Geoestacionarios (posición fija — solo data latency)

### GOES-19 (East)
- **Posición:** -75.0° lon
- **Cobertura Chile:** **sí, limbo este**
- **Cadencia:** Full Disk 10 min, CONUS 5 min, Meso 1 min
- **Latencia:** 3-5 min (RAMMB/CIRA), ~10 min (NOAA S3)
- **Productos volcánicos:** ABI L1b, Ash RGB derivado, FDCF L2 (hot spots)

### Himawari-9 (replaced Himawari-8 in 2022)
- **Posición:** 140.7° E
- **Cobertura Chile:** marginal (limbo opuesto, geometría pobre)
- **Cadencia:** Full Disk 10 min
- **Comentario:** Útil solo para overlap zone Pacífico Oeste.

### MTG-I1 (Meteosat Third Generation)
- **Posición:** 0° lon
- **Cobertura Chile:** **no** (sobre Atlántico/Africa)
- **Comentario:** No relevante operacionalmente para Chile.

## Notas de implementación

1. Para los polares, usar `skyfield.api.EarthSatellite(line1, line2, name)` con TLEs frescos (≤7 días).
2. Para predecir pasajes sobre un volcán, usar `Topos(latitude, longitude, elevation_m)` y calcular elevación angular del sat. Pasaje "útil" = elevación ≥ 20° en algún momento.
3. Los TLEs de Celestrak vienen en grupos: `active.txt`, `weather.txt`, `noaa.txt`. Descargar `active.txt` y filtrar por NORAD ID.
4. Cache de TLEs: refrescar cada 6 h (TLEs se publican típicamente 2-4×/día).
5. Las latencias NRT son **estimadas** — variabilidad real ±50%.
