"""Cálculo de pasajes y posiciones orbitales con skyfield.

Definiciones:
- "Pasaje útil": elevación máxima ≥ MIN_ELEVATION_DEG sobre el horizonte del volcán.
- Ventana de búsqueda: típicamente ±24 h respecto a 'now'.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import numpy as np
from skyfield.api import EarthSatellite, load, wgs84

from .volcanoes import Volcano

MIN_ELEVATION_DEG = 20.0

# Carga única de timescale (cara la primera vez)
_TS = load.timescale()


@dataclass
class Pass:
    sat_name: str
    rise_utc: datetime
    culminate_utc: datetime
    set_utc: datetime
    max_elevation_deg: float

    @property
    def duration_min(self) -> float:
        return (self.set_utc - self.rise_utc).total_seconds() / 60.0


def make_satellite(name: str, line1: str, line2: str) -> EarthSatellite:
    return EarthSatellite(line1, line2, name, _TS)


def find_passes(
    sat: EarthSatellite,
    volcano: Volcano,
    t0: datetime,
    t1: datetime,
    min_elev: float = MIN_ELEVATION_DEG,
) -> list[Pass]:
    """Encuentra pasajes del satélite sobre el volcano entre t0 y t1 (UTC)."""
    topos = wgs84.latlon(volcano.lat, volcano.lon, volcano.elevation_m)
    ts0 = _TS.from_datetime(t0.replace(tzinfo=timezone.utc) if t0.tzinfo is None else t0)
    ts1 = _TS.from_datetime(t1.replace(tzinfo=timezone.utc) if t1.tzinfo is None else t1)

    times, events = sat.find_events(topos, ts0, ts1, altitude_degrees=min_elev)
    passes: list[Pass] = []
    rise = culm = None
    for t, ev in zip(times, events):
        if ev == 0:        # rise
            rise = t
            culm = None
        elif ev == 1:      # culmination
            culm = t
        elif ev == 2 and rise is not None and culm is not None:  # set
            diff = (sat - topos).at(culm)
            alt, _, _ = diff.altaz()
            passes.append(Pass(
                sat_name=sat.name,
                rise_utc=rise.utc_datetime(),
                culminate_utc=culm.utc_datetime(),
                set_utc=t.utc_datetime(),
                max_elevation_deg=float(alt.degrees),
            ))
            rise = culm = None
    return passes


def last_and_next(
    sat: EarthSatellite,
    volcano: Volcano,
    now: datetime | None = None,
    window_h: int = 36,
) -> tuple[Pass | None, Pass | None]:
    """Devuelve (último_pasaje, próximo_pasaje) dentro de ±window_h."""
    if now is None:
        now = datetime.now(timezone.utc)
    passes = find_passes(sat, volcano, now - timedelta(hours=window_h), now + timedelta(hours=window_h))
    last_p = next_p = None
    for p in passes:
        if p.culminate_utc <= now:
            last_p = p
        elif next_p is None:
            next_p = p
            break
    return last_p, next_p


def subpoint(sat: EarthSatellite, when: datetime | None = None) -> tuple[float, float, float]:
    """Lat, lon, altitud (km) del punto subsatelital actual."""
    if when is None:
        when = datetime.now(timezone.utc)
    geo = sat.at(_TS.from_datetime(when))
    sp = wgs84.subpoint_of(geo)
    return float(sp.latitude.degrees), float(sp.longitude.degrees), float(geo.distance().km - 6371.0)


def ground_track(
    sat: EarthSatellite,
    start: datetime | None = None,
    minutes_ahead: int = 90,
    step_s: int = 30,
) -> list[tuple[float, float]]:
    """Lista (lat, lon) de la traza terrestre desde 'start' hasta start+minutes_ahead."""
    if start is None:
        start = datetime.now(timezone.utc)
    n = int(minutes_ahead * 60 / step_s) + 1
    seconds = np.arange(n) * step_s
    times = _TS.from_datetimes([start + timedelta(seconds=int(s)) for s in seconds])
    geo = sat.at(times)
    sp = wgs84.subpoint_of(geo)
    lats = sp.latitude.degrees
    lons = sp.longitude.degrees
    return list(zip(lats.tolist(), lons.tolist()))
