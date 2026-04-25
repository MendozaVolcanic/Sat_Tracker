"""Smoke test: descarga TLE, calcula próximo pasaje S-NPP sobre Villarrica."""

import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import satellites, tle_fetcher, volcanoes
from src.orbit import last_and_next, make_satellite, subpoint


def main() -> int:
    villarrica = volcanoes.by_name("Villarrica")
    assert villarrica is not None
    print(f"Volcán: {villarrica.name} ({villarrica.lat}, {villarrica.lon})")

    test_sats = ["Suomi-NPP", "Sentinel-5P", "Terra", "Aqua"]
    norad = [s.norad_id for s in satellites.CATALOG if s.name in test_sats and s.norad_id]

    print(f"Bajando TLEs ({len(norad)} sats)...")
    tles = tle_fetcher.get_tles_for(norad)
    print(f"  → {len(tles)} TLEs obtenidos. Cache age: {tle_fetcher.cache_age_human()}")

    if not tles:
        print("ERROR: no se obtuvieron TLEs")
        return 1

    now = datetime.now(timezone.utc)
    print(f"\nUTC ahora: {now:%Y-%m-%d %H:%M}")
    print()
    for nid, (name, l1, l2) in tles.items():
        sat_obj = make_satellite(name, l1, l2)
        lat, lon, alt = subpoint(sat_obj, now)
        last_p, next_p = last_and_next(sat_obj, villarrica, now=now)
        print(f"{name:30s}  pos ahora ({lat:+6.2f}, {lon:+7.2f}) alt {alt:.0f} km")
        if last_p:
            print(f"    último pasaje: {last_p.culminate_utc:%H:%M UTC} (elev {last_p.max_elevation_deg:.0f}°)")
        if next_p:
            print(f"    próximo:       {next_p.culminate_utc:%H:%M UTC} (elev {next_p.max_elevation_deg:.0f}°)")
        if not last_p and not next_p:
            print("    sin pasajes en ±36 h")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
