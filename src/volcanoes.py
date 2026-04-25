"""Catálogo de volcanes activos de Chile (RNVV / SERNAGEOMIN).

Porteado desde Goes/src/volcanos.py. Coordenadas WGS84.
Ranking de peligrosidad SERNAGEOMIN 2019 (1 = mayor peligro, 0 = sin ranking).
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Volcano:
    name: str
    lat: float
    lon: float
    elevation_m: int
    region: str
    zone: str       # norte | centro | sur | austral
    ranking: int


CATALOG: list[Volcano] = [
    # Zona Norte (ZVN/ZVC)
    Volcano("Taapaca", -18.10, -69.50, 5860, "Arica y Parinacota", "norte", 0),
    Volcano("Parinacota", -18.17, -69.14, 6348, "Arica y Parinacota", "norte", 0),
    Volcano("Guallatiri", -18.42, -69.09, 6071, "Arica y Parinacota", "norte", 15),
    Volcano("Isluga", -19.15, -68.83, 5550, "Tarapacá", "norte", 18),
    Volcano("Irruputuncu", -20.73, -68.56, 5163, "Tarapacá", "norte", 22),
    Volcano("Olca", -20.95, -68.48, 5407, "Tarapacá", "norte", 0),
    Volcano("Aucanquilcha", -21.22, -68.47, 6176, "Antofagasta", "norte", 0),
    Volcano("Ollagüe", -21.30, -68.18, 5868, "Antofagasta", "norte", 25),
    Volcano("San Pedro", -21.88, -68.40, 6145, "Antofagasta", "norte", 0),
    Volcano("Putana", -22.57, -67.85, 5890, "Antofagasta", "norte", 23),
    Volcano("Láscar", -23.37, -67.73, 5592, "Antofagasta", "norte", 4),
    Volcano("Lastarria", -25.17, -68.50, 5697, "Atacama", "norte", 0),
    Volcano("Ojos del Salado", -27.12, -68.54, 6893, "Atacama", "norte", 0),

    # Zona Centro-Sur (ZVS)
    Volcano("Planchón-Peteroa", -35.24, -70.57, 4107, "Maule", "centro", 12),
    Volcano("Descabezado Grande", -35.58, -70.75, 3953, "Maule", "centro", 10),
    Volcano("Cerro Azul / Quizapu", -35.65, -70.76, 3788, "Maule", "centro", 0),
    Volcano("Laguna del Maule", -36.02, -70.49, 3092, "Maule", "centro", 7),
    Volcano("Nevado de Longaví", -36.19, -71.16, 3242, "Maule", "centro", 19),
    Volcano("Nevados de Chillán", -36.86, -71.38, 3212, "Ñuble", "centro", 5),
    Volcano("Antuco", -37.41, -71.35, 2979, "Biobío", "centro", 14),
    Volcano("Copahue", -37.85, -71.17, 2997, "Biobío", "centro", 6),
    Volcano("Callaqui", -37.92, -71.45, 3164, "Biobío", "centro", 17),
    Volcano("Lonquimay", -38.38, -71.59, 2865, "Araucanía", "sur", 9),
    Volcano("Llaima", -38.69, -71.73, 3125, "Araucanía", "sur", 2),
    Volcano("Sollipulli", -38.97, -71.52, 2282, "Araucanía", "sur", 11),
    Volcano("Villarrica", -39.42, -71.93, 2847, "Araucanía", "sur", 1),
    Volcano("Quetrupillán", -39.50, -71.70, 2360, "Araucanía", "sur", 16),
    Volcano("Lanín", -39.64, -71.50, 3747, "Araucanía", "sur", 0),
    Volcano("Mocho-Choshuenco", -39.93, -72.03, 2422, "Los Ríos", "sur", 8),
    Volcano("Puyehue-Cordón Caulle", -40.59, -72.12, 2236, "Los Ríos", "sur", 3),
    Volcano("Casablanca / Antillanca", -40.77, -72.15, 1990, "Los Lagos", "sur", 0),
    Volcano("Osorno", -41.10, -72.49, 2652, "Los Lagos", "sur", 13),
    Volcano("Calbuco", -41.33, -72.61, 2003, "Los Lagos", "sur", 3),
    Volcano("Yate", -41.76, -72.40, 2187, "Los Lagos", "sur", 0),
    Volcano("Hornopirén", -41.87, -72.43, 1572, "Los Lagos", "sur", 0),
    Volcano("Huequi", -42.38, -72.58, 1318, "Los Lagos", "sur", 20),
    Volcano("Michinmahuida", -42.79, -72.44, 2404, "Los Lagos", "sur", 21),
    Volcano("Chaitén", -42.83, -72.65, 1122, "Los Lagos", "sur", 3),

    # Zona Austral (ZVA)
    Volcano("Corcovado", -43.19, -72.08, 2300, "Los Lagos", "austral", 0),
    Volcano("Melimoyu", -44.08, -72.87, 2400, "Aysén", "austral", 0),
    Volcano("Mentolat", -44.70, -73.08, 1660, "Aysén", "austral", 0),
    Volcano("Hudson", -45.90, -72.97, 1905, "Aysén", "austral", 3),
    Volcano("Lautaro", -49.02, -73.55, 3607, "Magallanes", "austral", 24),
]

PRIORITY = {
    "Villarrica", "Láscar", "Copahue", "Puyehue-Cordón Caulle",
    "Calbuco", "Nevados de Chillán", "Llaima", "Hudson",
}


def by_name(name: str) -> Volcano | None:
    n = name.lower()
    for v in CATALOG:
        if n in v.name.lower():
            return v
    return None
