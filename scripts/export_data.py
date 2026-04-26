"""Exporta volcanes/satélites a JSON para la página web.

Uso:
    python scripts/export_data.py
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src import satellites, tle_fetcher, volcanoes

OUT = ROOT / "web" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def main() -> int:
    # Volcanes
    volc_data = [
        {
            "name": v.name,
            "lat": v.lat,
            "lon": v.lon,
            "elevation_m": v.elevation_m,
            "region": v.region,
            "zone": v.zone,
            "ranking": v.ranking,
            "priority": v.name in volcanoes.PRIORITY,
        }
        for v in volcanoes.CATALOG
    ]
    (OUT / "volcanoes.json").write_text(
        json.dumps(volc_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  → web/data/volcanoes.json: {len(volc_data)} volcanes")

    # Satélites
    sat_data = [
        {
            "name": s.name,
            "sensor": s.sensor,
            "norad_id": s.norad_id,
            "kind": s.kind,
            "product": s.product,
            "nrt_latency_min": s.nrt_latency_min,
            "access_url": s.access_url,
            "note": s.note,
            "swath_km": s.swath_km,
        }
        for s in satellites.CATALOG
    ]
    (OUT / "satellites.json").write_text(
        json.dumps(sat_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  → web/data/satellites.json: {len(sat_data)} satélites")

    # TLEs
    norad = [s.norad_id for s in satellites.CATALOG if s.norad_id]
    tles = tle_fetcher.get_tles_for(norad, force_refresh=True)
    tle_data = {
        "fetched_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        "source": "celestrak.org/NORAD/elements/gp.php?GROUP=active",
        "satellites": {
            str(nid): {"name": name, "line1": l1, "line2": l2}
            for nid, (name, l1, l2) in tles.items()
        },
    }
    (OUT / "tle.json").write_text(
        json.dumps(tle_data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  → web/data/tle.json: {len(tles)} TLEs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
