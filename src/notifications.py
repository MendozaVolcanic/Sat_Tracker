"""Generación de alertas de pasajes próximos.

Alerta = pasaje con max_elevation_deg ≥ min_elev cuya rise_utc está dentro
de los próximos `lead_min` minutos. Esto da al volcanólogo tiempo de
preparar adquisición / verificar producto.

Salidas posibles:
- Lista en dashboard
- Webhook (Slack-compatible JSON POST)
- Email (SMTP, configurable por env vars)
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from .orbit import find_passes
from .satellites import Satellite
from .volcanoes import Volcano


@dataclass
class Alert:
    volcano: str
    sat: str
    sensor: str
    rise_utc: datetime
    culminate_utc: datetime
    max_elev: float
    data_eta_utc: datetime
    minutes_to_rise: float
    product: str

    def text(self) -> str:
        return (
            f"🛰️ {self.sat} ({self.sensor}) pasa sobre {self.volcano} en "
            f"{self.minutes_to_rise:.0f} min — elev máx {self.max_elev:.0f}°. "
            f"Datos NRT ~{self.data_eta_utc:%H:%M UTC}. Producto: {self.product}."
        )

    def to_dict(self) -> dict:
        return {
            "volcano": self.volcano,
            "sat": self.sat,
            "sensor": self.sensor,
            "rise_utc": self.rise_utc.isoformat(),
            "culminate_utc": self.culminate_utc.isoformat(),
            "max_elev_deg": round(self.max_elev, 1),
            "data_eta_utc": self.data_eta_utc.isoformat(),
            "minutes_to_rise": round(self.minutes_to_rise, 1),
            "product": self.product,
            "text": self.text(),
        }


def collect_alerts(
    sat_objects: dict[int, "EarthSatellite"],  # noqa: F821
    sat_meta: list[Satellite],
    volcanoes: list[Volcano],
    lead_min: int = 60,
    min_elev: float = 20.0,
    now: datetime | None = None,
) -> list[Alert]:
    """Recolecta alertas para todos los volcanes y satélites dados."""
    if now is None:
        now = datetime.now(timezone.utc)
    horizon = now + timedelta(minutes=lead_min)
    alerts: list[Alert] = []
    meta_by_norad = {s.norad_id: s for s in sat_meta if s.norad_id}
    for v in volcanoes:
        for nid, sat_obj in sat_objects.items():
            meta = meta_by_norad.get(nid)
            if meta is None:
                continue
            passes = find_passes(sat_obj, v, now, horizon, min_elev=min_elev)
            for p in passes:
                alerts.append(Alert(
                    volcano=v.name,
                    sat=meta.name,
                    sensor=meta.sensor,
                    rise_utc=p.rise_utc,
                    culminate_utc=p.culminate_utc,
                    max_elev=p.max_elevation_deg,
                    data_eta_utc=p.set_utc + timedelta(minutes=meta.nrt_latency_min),
                    minutes_to_rise=(p.rise_utc - now).total_seconds() / 60.0,
                    product=meta.product,
                ))
    alerts.sort(key=lambda a: a.rise_utc)
    return alerts


def post_webhook(alerts: list[Alert], url: str) -> tuple[int, str]:
    """POST JSON {alerts: [...]} a webhook estilo Slack.

    Útil para integrar con Slack/Discord/Teams o un canal interno OVDAS.
    """
    import requests
    payload = {
        "text": f"Sat_Tracker: {len(alerts)} pasaje(s) próximos",
        "alerts": [a.to_dict() for a in alerts],
        "blocks": [
            {"type": "section", "text": {"type": "mrkdwn", "text": a.text()}}
            for a in alerts
        ],
    }
    r = requests.post(url, json=payload, timeout=10)
    return r.status_code, r.text[:200]


def render_text_digest(alerts: list[Alert]) -> str:
    if not alerts:
        return "Sin pasajes en horizonte solicitado."
    lines = [f"Sat_Tracker — {len(alerts)} alerta(s):", ""]
    for a in alerts:
        lines.append(f"  • {a.text()}")
    return "\n".join(lines)


def to_jsonl(alerts: list[Alert]) -> str:
    return "\n".join(json.dumps(a.to_dict(), ensure_ascii=False) for a in alerts)
