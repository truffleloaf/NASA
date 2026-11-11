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

Honest status. Nothing is marked `done` unless it produces a number that has been checked.

| Piece | State | Notes |
| --- | --- | --- |
| Ephemeris (Sun / Earth az-el) | **done** | JPL Horizons, topocentric on the Moon, cached to `data/horizons/` |
| Interval analysis | **done** | runs, coverage, longest gap, edge truncation |
| Operating-window matching | **done** | mirrors `lib/mission.ts` `analyze()` semantics exactly |
| Geometric visibility (no terrain) | **done** | baseline with no terrain |
| DEM acquisition | **done** | LOLA `LDEM_85S_40M`, 115 MB, byte count verified |
| DEM projection (lat/lon <-> pixel) | **done** | matches PDS `dsmap_polar.cat`; corners land at −82.936° |
| Terrain horizon profile | **done** | 1° azimuth bins, 50 km range, lunar curvature included |
| Terrain-aware occlusion | **done** | `elevation > max(terrain_horizon, 0)` |
| Validation suite | **done** | three invariants plus a control site, see below |
| Export to `public/data/` | **done** | `export_data.py`; 338 kB raw, 98 kB gzipped for two sites |
| Contract check | **done** | `check_export.py` rebuilds `analyze()` output from JSON alone |
| `METHOD.md` | **not started** | required by the proposal |

## Layout

```
backend/
├─ pipeline/
│  ├─ dem.py                  DEM reader + polar-stereographic projection (Phase 0)
│  ├─ horizon.py              vectorised terrain horizon + occlusion (Phase 1)
│  ├─ horizons.py             JPL Horizons topocentric az/el + disk cache
│  ├─ intervals.py            boolean runs, coverage, longest gap, edge truncation
│  ├─ windows.py              operating windows (same rules as the frontend)
│  ├─ fetch_dem.py            download LOLA polar DEM (resumable)
│  ├─ run_horizon.py          horizon profile for the candidate sites + self-checks
│  ├─ run_annual.py           full-year visibility, with terrain (Phase 2)
│  ├─ export_data.py          write the JSON data product (Phase 3)
│  ├─ check_export.py         rebuild analyze() output from the JSON alone
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

python backend/pipeline/fetch_dem.py             # download the 115 MB DEM (resumable)
python backend/pipeline/run_horizon.py           # horizon profiles + projection self-checks
python backend/pipeline/run_annual.py            # full-year visibility with terrain
python backend/pipeline/export_data.py           # write out/data/*.json
python backend/pipeline/check_export.py          # verify the JSON rebuilds analyze()
python backend/pipeline/demo_geometric.py        # two-site Sun/Earth comparison, no terrain
python backend/pipeline/scan_windows.py          # which weeks contain windows
python backend/pipeline/check_frontend_tests.py  # frontend assertions on real data
```

`run_annual.py` and the other ephemeris users read the cache in `data/horizons/`. If it is
absent they fetch from JPL and write it, so the first run needs network and later runs do not.

## Data sources

| Source | Used for | Reference |
| --- | --- | --- |
| JPL Horizons (DE441) | topocentric Sun and Earth az/el from a lunar site | <https://ssd.jpl.nasa.gov/horizons/> |
| LRO / LOLA GDR | terrain elevation, 40 m/pixel, 85°S–90°S | <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/> |
| PDS `dsmap_polar.cat` | authoritative polar-stereographic transformation | <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/dsmap_polar.cat> |

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

## Projection orientation

`dsmap_polar.cat` states the orientation in words rather than only in equations:

> In the south, Longitude 0 extends straight up from the center, and Longitude 90 East
> extends to the right.

So on this map, with `dx` positive to the right and `dy` positive upwards:

```
lon = 90° − atan2(dy, dx)      →  up = 0°, right = 90°E, down = 180°, left = 270°
```

`dem.py` implements this as `Convention(handed=-1, offset_deg=90)`. Two independent checks
confirm it: all four image corners map to latitude −82.936° (the value predicted from
`MAP_SCALE` and the image size), and a landmark fit places the Shackleton crater centre at
89.654°S 128.31°E, consistent with published coordinates.

## Validation results

Full year 2026, 1-hour step, 8761 samples. Sun centre and Earth centre above the local
horizon unless stated otherwise.

**Control site — Shackleton crater floor, 89.654°S 128.31°E.** This location is known to be
permanently shadowed. It is the end-to-end test of the whole chain.

| | |
| --- | --- |
| site elevation | −2771 m |
| terrain horizon | +20.6° … +22.7° (median +21.6°) — a bowl, as expected |
| sunlit, with terrain | **0.0 %** |
| Earth visible, with terrain | **0.0 %** |

Getting exactly zero here requires the projection, the DEM sampling, the curvature term,
the horizon search, the ephemeris and the masking to all be correct at once.

**Candidate sites.**

| | Shackleton 89.90°S 0.00°E | Malapert 85.99°S 2.30°E |
| --- | --- | --- |
| site elevation | +629 m | +5148 m |
| terrain horizon | 0° … +22.4° (median +2.6°) | 0° … +3.8° (median +0.7°) |
| sunlit, geometry only | 52.6 % | 51.6 % |
| sunlit, with terrain | **19.6 %** | **36.5 %** |
| longest continuous sunlit | 234 h (9.8 d) | 347 h (14.5 d) |
| Earth visible, geometry only | 46.3 % | 66.6 % |
| Earth visible, with terrain | 46.3 % | **54.7 %** |
| sunlit **and** Earth visible | 15.0 % | **22.8 %** |

**Invariants.**

1. **Monotonicity** — terrain-aware visibility never exceeds geometric visibility. Passes
   for all three sites. This check caught a real bug: unclamped negative horizon angles
   made a body below the local tangent plane count as visible.
2. **Known geography** — the crater floor is fully dark. Passes (0.0 %).
3. **Azimuth wrap** — horizon at 0.5° and 359.5° differ by 0.098°. Passes.

Additional numerical checks: the vectorised sampler agrees with `dem.Projection` to
1.8 × 10⁻¹² pixel; all four image corners map to −82.936°.

## Data product

`export_data.py` writes three files into `backend/out/data/`. Copy that directory to the
frontend's `public/data/`.

```
data/index.json           manifest + per-site metadata + horizon summary   ~3 kB
data/sites/shackleton.json                                             ~168 kB (45 kB gzip)
data/sites/malapert.json                                               ~171 kB (53 kB gzip)
```

**`index.json`** carries `manifest` (sources, coverage, conventions, limits) and a `sites`
array with `id`, `lat_deg`, `lon_deg`, `elevation_m`, `horizon_summary`, `annual` and the
path to the per-site file.

**`sites/<id>.json`** carries four blocks:

| Block | Contents |
| --- | --- |
| `site` | id, name, coordinates, elevation |
| `series` | `sun_azimuth`, `sun_elevation`, `earth_azimuth`, `earth_elevation`; 8761 samples at 60 min from 2026-01-01T00:00Z, integers in units of 0.01° |
| `visibility` | `solar_center`, `solar_limb`, `earth_center`, `earth_limb` — arrays of `[start, end]` absolute UTC ISO-8601 pairs, half-open, computed at 10 min |
| `annual` | coverage fractions and longest runs, for display and sanity checks |

Two deliberate decisions:

1. **Operating windows are not exported.** The frontend already has the window-matching
   logic and needs to re-run it whenever the user moves a requirement slider. The backend
   ships *when there is sunlight* and *when Earth is visible*; the frontend derives windows.
   `check_export.py` proves this works by rebuilding `analyze()` output from the JSON alone.
2. **Intervals are absolute UTC, not hours since a start date.** The user can pick any date
   range, so the frontend slices and then re-bases: `hours = (t - start) / 3600`.

**Truncation caveat.** A window that runs to the edge of the requested period is clipped by
that period and must be displayed as `≥ N h`. In the 2026-11-14 → 11-20 test the Shackleton
window ends exactly at hour 168, i.e. at the period boundary, so its true duration is longer
than the 18.7 h reported inside the window.

## Findings that affect the frontend

- At 89.90°S 0.00°E the site is **19.6 % sunlit over a year**, and the terrain horizon
  reaches +22.4°. The point is about 12.6 km from the Shackleton centre (crater radius is
  about 10.5 km), i.e. on the outer flank rather than on the rim crest. If the product is
  meant to demonstrate a favourable site, this coordinate should be reconsidered.
- With terrain included, **Malapert outperforms Shackleton on every metric**, which
  reverses the picture suggested by geometry alone.
- Earth visibility from the pole is dominated by libration in latitude (±6.7° swing), not
  by terrain. A week with no Earth visibility is expected and is not a bug.

## Known caveats

- `public/moon-height.jpg` in the frontend is `ldem_3_8bit`: 3 pixels per degree (about
  10 km/pixel) and 8-bit. It is a texture and must never be used to compute a horizon.
- Sun and Earth are extended discs, not points. The Sun subtends 0.266° and the Earth
  about 0.951° as seen from the Moon; at the poles, where both graze the horizon, the
  choice of centre versus limb changes results materially. `run_annual.py` reports both.
- Lunar curvature must be removed when testing terrain obstruction:
  `drop(r) = r^2 / (2 * 1737.4 km)`, which is about 115 m at 20 km. Omitting it
  systematically overestimates obstruction. `horizon.py` uses the exact spherical form.
- For Malapert, 101 of 360 azimuths cannot be traced to 50 km because the ray leaves the
  85°S–90°S DEM. The affected directions have short effective range and are reported by
  `run_horizon.py`.
