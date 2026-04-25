"""Sat_Tracker — dashboard Streamlit.

Run:
    streamlit run dashboard/app.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src import satellites as sats_mod
from src import tle_fetcher
from src import volcanoes as volc_mod
from src.orbit import find_passes, ground_track, last_and_next, make_satellite, subpoint

st.set_page_config(
    page_title="Sat_Tracker — pasajes satelitales sobre volcanes Chile",
    page_icon="🛰️",
    layout="wide",
)


# ── Helpers ─────────────────────────────────────────────────────────────

def fmt_dt(dt: datetime | None) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%Y-%m-%d %H:%M UTC")


def fmt_delta(dt: datetime | None, now: datetime) -> str:
    if dt is None:
        return "—"
    delta = dt - now
    s = abs(delta.total_seconds())
    sign = "en" if delta.total_seconds() > 0 else "hace"
    if s < 60:
        return f"{sign} {int(s)} s"
    if s < 3600:
        return f"{sign} {int(s/60)} min"
    if s < 86400:
        return f"{sign} {s/3600:.1f} h"
    return f"{sign} {s/86400:.1f} d"


def fmt_latency(min_: int) -> str:
    if min_ < 60:
        return f"~{min_} min"
    return f"~{min_/60:.1f} h"


@st.cache_data(ttl=6 * 3600, show_spinner="Bajando TLEs de Celestrak…")
def load_tles(norad_ids: tuple[int, ...]) -> dict[int, tuple[str, str, str]]:
    return tle_fetcher.get_tles_for(list(norad_ids))


@st.cache_resource
def make_sat_objects(_tles: dict[int, tuple[str, str, str]]):
    """Crea EarthSatellite objects (cached)."""
    return {nid: make_satellite(name, l1, l2) for nid, (name, l1, l2) in _tles.items()}


# ── Header ──────────────────────────────────────────────────────────────

st.title("🛰️ Sat_Tracker — pasajes satelitales sobre volcanes Chile")

now = datetime.now(timezone.utc)
st.caption(
    f"UTC ahora: **{now.strftime('%Y-%m-%d %H:%M:%S')}** · "
    f"Cache TLE: {tle_fetcher.cache_age_human()} · "
    f"Catálogo: {len(volc_mod.CATALOG)} volcanes · "
    f"{len(sats_mod.polars())} sats polares + {len(sats_mod.geos())} geoestacionarios"
)

# ── Sidebar ─────────────────────────────────────────────────────────────

with st.sidebar:
    st.header("Filtros")

    zonas = st.multiselect(
        "Zona volcánica",
        ["norte", "centro", "sur", "austral"],
        default=["norte", "centro", "sur", "austral"],
    )

    only_priority = st.checkbox("Sólo volcanes prioritarios", value=False)

    sat_names = [s.name for s in sats_mod.polars()]
    selected_sats = st.multiselect("Satélites polares", sat_names, default=sat_names)

    min_elev = st.slider("Elevación mínima de pasaje (°)", 0, 60, 20, 5)

    if st.button("🔄 Refrescar TLE ahora"):
        st.cache_data.clear()
        st.rerun()

    st.markdown("---")
    st.caption(
        "Fuente TLE: [Celestrak](https://celestrak.org/). "
        "Cálculo orbital: [skyfield](https://rhodesmill.org/skyfield/). "
        "Latencias NRT son estimadas (±50%)."
    )


# ── Filtrado ────────────────────────────────────────────────────────────

volcs = [v for v in volc_mod.CATALOG if v.zone in zonas]
if only_priority:
    volcs = [v for v in volcs if v.name in volc_mod.PRIORITY]

polar_sats_meta = [s for s in sats_mod.polars() if s.name in selected_sats]
norad_ids = tuple(s.norad_id for s in polar_sats_meta if s.norad_id)

tles = load_tles(norad_ids) if norad_ids else {}
sat_objects = make_sat_objects(tles) if tles else {}

if not tles:
    st.warning("No hay TLEs cargados. Selecciona al menos un satélite y refrescá.")
    st.stop()


# ── Tabs ────────────────────────────────────────────────────────────────

tab_table, tab_globe, tab_timeline, tab_geo = st.tabs([
    "📋 Tabla pasajes",
    "🌍 Mapa en vivo",
    "⏱️ Timeline 24 h",
    "📡 Geoestacionarios",
])


# ── Tab 1: Tabla ────────────────────────────────────────────────────────

with tab_table:
    st.subheader("Próximo y último pasaje por volcán × satélite")
    st.caption(
        f"Pasaje útil = elevación máxima ≥ {min_elev}°. "
        "Datos disponibles ≈ pasaje + latencia NRT."
    )

    rows = []
    for v in volcs:
        for s in polar_sats_meta:
            sat_obj = sat_objects.get(s.norad_id)
            if sat_obj is None:
                continue
            last_p, next_p = last_and_next(sat_obj, v, now=now)
            # Recalcular si min_elev != default
            if min_elev != 20:
                passes = find_passes(
                    sat_obj, v,
                    now - timedelta(hours=36), now + timedelta(hours=36),
                    min_elev=float(min_elev),
                )
                last_p = next((p for p in reversed(passes) if p.culminate_utc <= now), None)
                next_p = next((p for p in passes if p.culminate_utc > now), None)
            data_avail = (
                next_p.set_utc + timedelta(minutes=s.nrt_latency_min)
                if next_p else None
            )
            rows.append({
                "Volcán": v.name,
                "Zona": v.zone,
                "Satélite": s.name,
                "Sensor": s.sensor,
                "Último pasaje": fmt_dt(last_p.culminate_utc) if last_p else "—",
                "↳ hace": fmt_delta(last_p.culminate_utc, now) if last_p else "—",
                "Próximo pasaje": fmt_dt(next_p.culminate_utc) if next_p else "—",
                "↳ en": fmt_delta(next_p.culminate_utc, now) if next_p else "—",
                "Elev máx (°)": f"{next_p.max_elevation_deg:.0f}" if next_p else "—",
                "Datos NRT disp.": fmt_dt(data_avail) if data_avail else "—",
                "Latencia": fmt_latency(s.nrt_latency_min),
                "Producto": s.product,
            })

    df = pd.DataFrame(rows)
    st.dataframe(df, use_container_width=True, hide_index=True, height=600)

    csv = df.to_csv(index=False).encode("utf-8")
    st.download_button("⬇️ Descargar CSV", csv, "pasajes.csv", "text/csv")


# ── Tab 2: Mapa en vivo ─────────────────────────────────────────────────

with tab_globe:
    st.subheader("Posición actual + traza terrestre próximos 90 min")

    auto = st.checkbox("Auto-refresh cada 30 s", value=False)
    if auto:
        # Usa st.empty + sleep alternativo: st.rerun después de 30 s sería bloqueante.
        # Simple workaround: meta-refresh via HTML.
        st.markdown(
            '<meta http-equiv="refresh" content="30">',
            unsafe_allow_html=True,
        )

    fig = go.Figure()

    # Volcanes
    fig.add_trace(go.Scattergeo(
        lon=[v.lon for v in volcs],
        lat=[v.lat for v in volcs],
        text=[v.name for v in volcs],
        mode="markers",
        marker=dict(size=6, color="red", symbol="triangle-up"),
        name="Volcanes",
        hovertemplate="<b>%{text}</b><br>%{lat:.2f}, %{lon:.2f}<extra></extra>",
    ))

    # Trazas + posición actual de cada sat
    palette = [
        "#1f77b4", "#ff7f0e", "#2ca02c", "#9467bd", "#8c564b",
        "#e377c2", "#7f7f7f", "#bcbd22", "#17becf", "#aec7e8",
        "#ffbb78", "#98df8a", "#c5b0d5", "#c49c94",
    ]
    for i, s in enumerate(polar_sats_meta):
        sat_obj = sat_objects.get(s.norad_id)
        if sat_obj is None:
            continue
        color = palette[i % len(palette)]

        track = ground_track(sat_obj, start=now, minutes_ahead=90, step_s=60)
        lats = [p[0] for p in track]
        lons = [p[1] for p in track]
        # Romper traza cuando salta longitud (180/-180)
        seg_lats, seg_lons = [], []
        for k in range(len(lats)):
            if k > 0 and abs(lons[k] - lons[k-1]) > 180:
                seg_lats.append(None)
                seg_lons.append(None)
            seg_lats.append(lats[k])
            seg_lons.append(lons[k])

        fig.add_trace(go.Scattergeo(
            lon=seg_lons, lat=seg_lats,
            mode="lines",
            line=dict(width=1.5, color=color),
            name=f"{s.name} (traza)",
            hoverinfo="skip",
            showlegend=False,
        ))

        lat0, lon0, alt_km = subpoint(sat_obj, now)
        fig.add_trace(go.Scattergeo(
            lon=[lon0], lat=[lat0],
            mode="markers+text",
            marker=dict(size=11, color=color, line=dict(width=1, color="white")),
            text=[s.name],
            textposition="top right",
            textfont=dict(size=9, color=color),
            name=s.name,
            hovertemplate=(
                f"<b>{s.name}</b> ({s.sensor})<br>"
                f"lat %{{lat:.2f}} lon %{{lon:.2f}}<br>"
                f"alt {alt_km:.0f} km<extra></extra>"
            ),
        ))

    fig.update_geos(
        projection_type="natural earth",
        showcountries=True,
        countrycolor="rgba(120,120,120,0.5)",
        showcoastlines=True,
        coastlinecolor="rgba(80,80,80,0.6)",
        showland=True,
        landcolor="rgb(243,243,243)",
        showocean=True,
        oceancolor="rgb(220,235,245)",
    )
    fig.update_layout(height=650, margin=dict(l=0, r=0, t=10, b=0))
    st.plotly_chart(fig, use_container_width=True)

    if st.button("Centrar en Chile"):
        st.session_state["chile_zoom"] = True
    if st.session_state.get("chile_zoom"):
        fig2 = go.Figure(fig)
        fig2.update_geos(
            lonaxis_range=[-85, -60], lataxis_range=[-56, -17],
            projection_type="mercator",
        )
        st.plotly_chart(fig2, use_container_width=True)


# ── Tab 3: Timeline ─────────────────────────────────────────────────────

with tab_timeline:
    st.subheader("Pasajes próximas 24 h por volcán")

    target = st.selectbox(
        "Volcán",
        [v.name for v in volcs],
        index=0 if volcs else None,
    )
    v = volc_mod.by_name(target)
    if v is None:
        st.info("Selecciona un volcán.")
    else:
        rows = []
        for s in polar_sats_meta:
            sat_obj = sat_objects.get(s.norad_id)
            if sat_obj is None:
                continue
            passes = find_passes(
                sat_obj, v, now, now + timedelta(hours=24),
                min_elev=float(min_elev),
            )
            for p in passes:
                rows.append(dict(
                    Sat=s.name,
                    Inicio=p.rise_utc,
                    Fin=p.set_utc,
                    Elev=f"{p.max_elevation_deg:.0f}°",
                    Dur=f"{p.duration_min:.1f} min",
                    DataDisp=p.set_utc + timedelta(minutes=s.nrt_latency_min),
                ))

        if not rows:
            st.info("Sin pasajes en próximas 24 h con la elevación mínima seleccionada.")
        else:
            tdf = pd.DataFrame(rows)
            fig = go.Figure()
            for _, r in tdf.iterrows():
                fig.add_trace(go.Bar(
                    x=[(r["Fin"] - r["Inicio"]).total_seconds() * 1000],
                    y=[r["Sat"]],
                    base=[r["Inicio"]],
                    orientation="h",
                    name=r["Sat"],
                    showlegend=False,
                    hovertemplate=(
                        f"<b>{r['Sat']}</b><br>"
                        f"{r['Inicio']:%H:%M} → {r['Fin']:%H:%M} UTC<br>"
                        f"Elev máx {r['Elev']}, {r['Dur']}<br>"
                        f"Datos ~{r['DataDisp']:%H:%M} UTC<extra></extra>"
                    ),
                ))
            fig.add_vline(x=now, line=dict(color="red", width=1, dash="dash"),
                          annotation_text="ahora")
            fig.update_layout(
                height=max(300, 40 * tdf["Sat"].nunique() + 100),
                xaxis_title="UTC",
                margin=dict(l=10, r=10, t=10, b=40),
            )
            st.plotly_chart(fig, use_container_width=True)

            st.dataframe(
                tdf.assign(
                    Inicio=tdf["Inicio"].dt.strftime("%H:%M UTC"),
                    Fin=tdf["Fin"].dt.strftime("%H:%M UTC"),
                    DataDisp=tdf["DataDisp"].dt.strftime("%H:%M UTC"),
                ),
                use_container_width=True, hide_index=True,
            )


# ── Tab 4: Geoestacionarios ─────────────────────────────────────────────

with tab_geo:
    st.subheader("Geoestacionarios — siempre arriba, sólo importa la latencia")
    geo_rows = []
    for s in sats_mod.geos():
        next_data = now + timedelta(minutes=s.nrt_latency_min)
        geo_rows.append({
            "Satélite": s.name,
            "Sensor": s.sensor,
            "Cadencia FD": "10 min",
            "Latencia NRT": fmt_latency(s.nrt_latency_min),
            "Próximo dato disp.": next_data.strftime("%H:%M UTC"),
            "Cobertura Chile": s.note,
            "Acceso": s.access_url,
            "Producto": s.product,
        })
    st.dataframe(pd.DataFrame(geo_rows), use_container_width=True, hide_index=True)
