# Backend — lunar data pipeline

Data pipeline for the Lunar Mission Navigator. **This is not a web service.** It runs
offline, on a developer machine, and writes data files that the static frontend reads.

## Why there is no API server

- `AGENTS.md` rule 2: *"No new runtime network calls. All data ships in `public/data/`."*
- `next.config.ts` uses `output: "export"`, so the deployed site is static — there is no
  process to host a Python server in.

So the backend's deliverable is a **data product** (JSON under the frontend's `public/data/`),
produced by the scripts here. A thin local FastAPI wrapper could be added later for
development, but it is not part of the deployed path.

## Status

Honest status. Do not mark anything `done` until it produces a file you can inspect.

| Piece | State | Notes |
| --- | --- | --- |
| Ephemeris (Sun / Earth az-el) | **done** | JPL Horizons, topocentric on the Moon, cached to `data/horizons/` |
| Interval analysis | **done** | runs, coverage, longest gap, edge truncation |
| Operating-window matching | **done** | mirrors `lib/mission.ts` `analyze()` semantics exactly |
| Geometric visibility (no terrain) | **done** | produces real numbers; terrain only makes visibility worse |
| DEM acquisition | **done** | LOLA `LDEM_85S_40M`, 115 MB, byte count verified |
| DEM projection (lat/lon <-> pixel) | **in progress** | polar-stereographic azimuth convention not yet pinned down |
| Terrain horizon profile | **not started** | the one genuinely hard piece |
| Terrain-aware occlusion | **not started** | `el > horizon(az)` |
| Export to `public/data/` | **not started** | schema intentionally not frozen yet |
| Validation suite | **not started** | three hard invariants, listed below |
| `METHOD.md` | **not started** | required by the proposal |

## Layout

```
backend/
├─ pipeline/
│  ├─ horizons.py             JPL Horizons topocentric az/el + disk cache
│  ├─ intervals.py            boolean runs, coverage, longest gap, edge truncation
│  ├─ windows.py              operating windows (same rules as the frontend)
│  ├─ fetch_dem.py            download LOLA polar DEM (resumable)
│  ├─ demo_geometric.py       two-site comparison, no terrain
│  ├─ scan_windows.py         which 7-day periods actually contain windows
│  └─ check_frontend_tests.py replay the frontend's assertions on real data
└─ data/                      generated, not committed (see data/README.md)
```

## Run

Requires Python 3.10+ and `numpy`. No other dependencies — network access uses `urllib`
from the standard library.

```sh
pip install -r backend/requirements.txt

python backend/pipeline/demo_geometric.py        # two-site Sun/Earth comparison
python backend/pipeline/scan_windows.py          # which weeks contain windows
python backend/pipeline/check_frontend_tests.py  # frontend assertions on real data
python backend/pipeline/fetch_dem.py             # download the 115 MB DEM (resumable)
```

The first three read the cache in `data/horizons/`. If it is absent they fetch from JPL
and write it, so the first run needs network and later runs do not.

## Data sources

| Source | Used for | Reference |
| --- | --- | --- |
| JPL Horizons (DE441) | topocentric Sun and Earth az/el from a lunar site | <https://ssd.jpl.nasa.gov/horizons/> |
| LRO / LOLA GDR | terrain elevation, 40 m/pixel, 85°S–90°S | <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/> |

Horizons is queried with `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`,
`SITE_COORD='lon,lat,alt_km'`, `QUANTITIES='4'`, `APPARENT='AIRLESS'`. The result is the
airless apparent azimuth and elevation of the body centre, already corrected for
light-time, stellar aberration and gravitational deflection. The Moon has no atmosphere,
so no refraction correction applies.

## Elevation convention

`LDEM_85S_40M` stores 16-bit little-endian integers; `height_m = DN * 0.5`, measured
relative to a reference radius of 1737.4 km (`OFFSET` in the product label). The label
also gives `LINES = LINE_SAMPLES = 7584`, `MAP_SCALE = 40 m/pix`,
`LINE/SAMPLE_PROJECTION_OFFSET = 3791.5`, polar stereographic, centre latitude −90°,
centre longitude 0°, positive east.

## Validation invariants

These must hold before any number reaches the UI:

1. **Monotonicity** — terrain-aware visibility must never exceed geometric visibility,
   per site and per body. A violation means the projection or the azimuth convention is wrong.
2. **Known geography** — the Shackleton crater floor should be dark for nearly the whole
   year, while its rim is highly illuminated. Compare against published NASA illumination
   products; a disagreement is a bug in this code, not in the NASA data.
3. **Azimuth wrap** — `horizon[0°]` and `horizon[360°]` must agree; a discontinuity means
   the ring buffer is wrong.

Additional cross-check: recompute a sample of timestamps with an independent ephemeris
(SPICE + DE440s) and confirm agreement below 0.01°.

## Known caveats

- `public/moon-height.jpg` in the frontend is `ldem_3_8bit`: 3 pixels per degree (about
  10 km/pixel) and 8-bit. It is a texture and must never be used to compute a horizon.
- Sun and Earth are extended discs, not points. The Sun subtends 0.266° and the Earth
  about 0.951° as seen from the Moon; at the poles, where both graze the horizon, the
  choice of centre versus limb changes results materially. Record which convention is used.
- Lunar curvature must be removed when testing terrain obstruction:
  `drop(r) = r^2 / (2 * 1737.4 km)`, which is about 115 m at 20 km. Omitting it
  systematically overestimates obstruction.
