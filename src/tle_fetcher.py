"""Descarga y cachea TLEs desde Celestrak.

Estrategia:
- Bajamos 'active.txt' (todos los sats activos) una vez cada 6 h.
- Filtramos por NORAD ID los que nos interesan.
- Cache en data/tle_cache.txt con timestamp en data/tle_cache.meta.

Celestrak permite hasta ~1 request/grupo cada pocas horas; abusarlo bloquea IP.
"""

from __future__ import annotations

import time
from pathlib import Path

import requests

CELESTRAK_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CACHE_FILE = DATA_DIR / "tle_cache.txt"
META_FILE = DATA_DIR / "tle_cache.meta"
MAX_AGE_S = 6 * 3600  # 6 horas


def _cache_age_s() -> float:
    if not META_FILE.exists():
        return float("inf")
    try:
        return time.time() - float(META_FILE.read_text().strip())
    except (ValueError, OSError):
        return float("inf")


def _download() -> str:
    r = requests.get(CELESTRAK_URL, timeout=30)
    r.raise_for_status()
    return r.text


def get_tle_text(force_refresh: bool = False) -> str:
    """Devuelve texto TLE crudo (3 líneas por sat: name + L1 + L2)."""
    DATA_DIR.mkdir(exist_ok=True)
    if not force_refresh and CACHE_FILE.exists() and _cache_age_s() < MAX_AGE_S:
        return CACHE_FILE.read_text(encoding="utf-8")
    text = _download()
    CACHE_FILE.write_text(text, encoding="utf-8")
    META_FILE.write_text(str(time.time()))
    return text


def parse_tles(text: str) -> dict[int, tuple[str, str, str]]:
    """Parsea TLE multi-sat → {norad_id: (name, line1, line2)}."""
    out: dict[int, tuple[str, str, str]] = {}
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip()]
    for i in range(0, len(lines) - 2, 3):
        name = lines[i].strip()
        l1 = lines[i + 1]
        l2 = lines[i + 2]
        if not (l1.startswith("1 ") and l2.startswith("2 ")):
            continue
        try:
            norad = int(l1[2:7])
        except ValueError:
            continue
        out[norad] = (name, l1, l2)
    return out


def get_tles_for(norad_ids: list[int], force_refresh: bool = False) -> dict[int, tuple[str, str, str]]:
    """Devuelve sólo los TLEs solicitados."""
    parsed = parse_tles(get_tle_text(force_refresh))
    return {nid: parsed[nid] for nid in norad_ids if nid in parsed}


def cache_age_human() -> str:
    age = _cache_age_s()
    if age == float("inf"):
        return "sin cache"
    if age < 60:
        return f"{int(age)} s"
    if age < 3600:
        return f"{int(age/60)} min"
    return f"{age/3600:.1f} h"
