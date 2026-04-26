"""Catálogo de satélites trackeados.

Latencias NRT son estimadas (variabilidad real ±50%).
Producto = string corto del producto volcánico clave.
Access = URL/portal donde bajar el dato.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Satellite:
    name: str
    sensor: str
    norad_id: int | None
    kind: str                 # "polar" | "geo"
    product: str
    nrt_latency_min: int
    access_url: str
    note: str = ""
    swath_km: int = 0         # ancho de barrido (footprint en superficie). 0 = no aplica.


CATALOG: list[Satellite] = [
    # ── Polares ──
    Satellite(
        "Sentinel-5P", "TROPOMI", 42969, "polar",
        "L2 SO₂ columna troposférica (5.5×3.5 km)", 180,
        "https://dataspace.copernicus.eu/",
        "Estándar para SO₂ cuantitativo. ~13:30 LT descendente.",
        swath_km=2600,
    ),
    Satellite(
        "Terra", "MODIS", 25994, "polar",
        "MOD14 hot spots, MOD06 ash RGB", 150,
        "https://lance.modaps.eosdis.nasa.gov/",
        "~10:30 LT descendente.",
        swath_km=2330,
    ),
    Satellite(
        "Aqua", "MODIS", 27424, "polar",
        "MYD14 hot spots, MYD06 ash RGB", 150,
        "https://lance.modaps.eosdis.nasa.gov/",
        "~13:30 LT ascendente. Cierra el día con Terra.",
        swath_km=2330,
    ),
    Satellite(
        "Suomi-NPP", "VIIRS", 37849, "polar",
        "VNP14 active fires 375 m (NRT)", 30,
        "https://firms.modaps.eosdis.nasa.gov/",
        "VIIRS 375 m = mejor para hot spots volcánicos NRT.",
        swath_km=3060,
    ),
    Satellite(
        "NOAA-20", "VIIRS", 43013, "polar",
        "VJ114 active fires 375 m (NRT)", 30,
        "https://firms.modaps.eosdis.nasa.gov/",
        "~50 min antes que S-NPP en mismo plano.",
        swath_km=3060,
    ),
    Satellite(
        "NOAA-21", "VIIRS", 54234, "polar",
        "VJ214 active fires 375 m (NRT)", 30,
        "https://firms.modaps.eosdis.nasa.gov/",
        swath_km=3060,
    ),
    Satellite(
        "Landsat 8", "OLI/TIRS", 39084, "polar",
        "TIRS B10/B11 térmico 100 m, OLI 30 m", 540,
        "https://earthexplorer.usgs.gov/",
        "Cada 16 días por path/row. Reanálisis post-evento.",
        swath_km=185,
    ),
    Satellite(
        "Landsat 9", "OLI-2/TIRS-2", 49260, "polar",
        "TIRS B10/B11 térmico 100 m, OLI 30 m", 540,
        "https://earthexplorer.usgs.gov/",
        "Offset 8 d con L8 → revisita combinada 8 d.",
        swath_km=185,
    ),
    Satellite(
        "Sentinel-2A", "MSI", 40697, "polar",
        "L2A multibanda 10/20/60 m", 720,
        "https://dataspace.copernicus.eu/",
        "Cada 10 d. Combinado con 2B → 5 d.",
        swath_km=290,
    ),
    Satellite(
        "Sentinel-2B", "MSI", 42063, "polar",
        "L2A multibanda 10/20/60 m", 720,
        "https://dataspace.copernicus.eu/",
        swath_km=290,
    ),
    Satellite(
        "Sentinel-3A", "OLCI/SLSTR", 41335, "polar",
        "SLSTR FRP, OLCI multibanda", 240,
        "https://dataspace.copernicus.eu/",
        swath_km=1420,
    ),
    Satellite(
        "Sentinel-3B", "OLCI/SLSTR", 43437, "polar",
        "SLSTR FRP, OLCI multibanda", 240,
        "https://dataspace.copernicus.eu/",
        swath_km=1420,
    ),
    Satellite(
        "MetOp-B", "IASI", 38771, "polar",
        "IASI SO₂ column (LMD/ULB)", 540,
        "https://eumetview.eumetsat.int/",
        "~21:30 LT — complementa TROPOMI con paso nocturno.",
        swath_km=2200,
    ),
    Satellite(
        "MetOp-C", "IASI", 43689, "polar",
        "IASI SO₂ column (LMD/ULB)", 540,
        "https://eumetview.eumetsat.int/",
        swath_km=2200,
    ),

    # ── Geoestacionarios (estacionados sobre su longitud ~36000 km) ──
    Satellite(
        "GOES-19", "ABI", 56128, "geo",
        "ABI L1b Full Disk 10 min, Ash RGB, FDCF hot spots", 5,
        "https://www.star.nesdis.noaa.gov/GOES/",
        "75.2°W. Cobertura Chile = limbo este. Cadencia 10 min FD / 5 min CONUS.",
    ),
    Satellite(
        "Himawari-9", "AHI", 49055, "geo",
        "AHI Full Disk 10 min", 5,
        "https://www.eorc.jaxa.jp/ptree/",
        "140.7°E. Cobertura Chile marginal — limbo opuesto.",
    ),
    Satellite(
        "MTG-I1", "FCI", 54743, "geo",
        "FCI Full Disk 10 min", 10,
        "https://eumetview.eumetsat.int/",
        "0°. NO cubre Chile (Atlántico/África).",
    ),
]


def polars() -> list[Satellite]:
    return [s for s in CATALOG if s.kind == "polar"]


def geos() -> list[Satellite]:
    return [s for s in CATALOG if s.kind == "geo"]


def by_norad(norad_id: int) -> Satellite | None:
    for s in CATALOG:
        if s.norad_id == norad_id:
            return s
    return None
