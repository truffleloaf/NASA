# Offline data and provenance

All application assets are bundled under `public/data/`. Data preparation scripts make explicit download requests; the application makes no external runtime data requests. These files support an educational planning estimate, not validated flight operations.

## Sources

**Terrain — Computed resampling of NASA LRO LOLA data.** The source is [LOLA LDEM_80S_80M V2.0](https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG), with its [PDS label](https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.LBL) also bundled at `/data/terrain/source.LBL`. The source contains 7,600 × 7,600 signed little-endian 16-bit samples, 0.5 metres per stored unit, and 80-metre pixels. It is a south-polar stereographic map on a 1,737,400-metre reference sphere, true scale at the pole. The source frame is Mean Earth/Polar Axis of DE421. Observation dates are 2009-07-13 through 2017-02-02; source product creation is 2017-06-15. LOLA's gridded product itself includes interpolated terrain between observations.

Source SHA-256: `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`.

**Directions and apparent diameters — Computed by NASA/JPL Horizons.** [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) observer ephemerides use Sun target `10`, Earth target `399`, observer centre `coord@301`, geodetic east-positive coordinates, apparent airless azimuth/elevation, and angular diameter. The returned ephemeris source is DE441. Each bundled file preserves exact query URLs and raw-response SHA-256 hashes. See the [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) for conventions and model limitations.

**Surface imagery — Provided by NASA/GSFC/ASU LROC.** `terrain/polar-1024-lroc.jpg` is a display-only crop of the [LROC WAC south-pole summer mosaic](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_ROI_SOUTH_SUMMER) (`WAC_ROI_SOUTH_SUMMER_128P`, 236.901 m/pixel, 128 pixels/degree, images acquired 2010-09-21 through 2010-10-23). The centre 608 km square is cropped, autocontrasted, resampled to 1,024 × 1,024 with Lanczos, and written at JPEG quality 88 by `scripts/imagery.py`; `terrain/polar-1024-lroc.json` records the source hash, georeferencing, processing and limitations. The GeoTIFF georeferencing (polar stereographic, natural origin 90° S / 0° E, R = 1,737,400 m, north-up) matches the terrain grid, so no rotation or mirror is applied. The image shares the terrain pixel grid and is used only as a context layer in the 3D view: it never feeds a direction, horizon, visibility or window calculation. Its illumination is fixed to the 2010 southern summer, so baked shadows do not represent the simulated date, and mosaic seams and exposure differences remain.

**Horizon angles, mast effects and operating windows — Estimated.** The source topography is real, but discretized rays, approximate site coordinates, finite ray length, uncertain local terrain and hourly sampling prevent an operational accuracy claim. No bundled number is a fabricated placeholder. `Estimated` does not imply a quantified confidence interval.

## Asset formats

`manifest.json` lists site coordinates, DEM-sampled elevation, ephemeris and horizon URLs. The named points are approximate regional reference locations, not surveyed landing sites. In particular, “Shackleton region” and “de Gerlache region” do not assert that the given coordinate lies on a usable rim.

Three of the six sites are Artemis III candidate landing regions from NASA's October 2024 down-selection ([release 24-136](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)): `mons-mouton` (Mons Mouton), `nobile-rim-1` (Nobile Rim 1) and `haworth` (Haworth); `malapert` is also marked `artemis-candidate`, while `shackleton` and `de-gerlache` are `reference`. The manifest `kind` field carries that distinction into the UI. Region outlines and individual landing-site ellipses are not modelled. Nobile Rim 1 and Haworth use the published region bounding-box midpoints (−85.438°, 37.445° E and −86.753°, 23.672° W) from a companion south-polar topography dataset ([Zenodo 17954508](https://zenodo.org/records/17954508)); Mons Mouton uses the IAU feature centre (−84.6°, 31.0° E). At that latitude the northern 150 km rays cross the 80° S latitude circle and sample the source DEM square corners, which lie outside the nominal 80–90° S coverage; those samples come from the same LOLA product, but the declared-coverage caveat is repeated in that site's horizon limitations. A candidate region at 84° S or farther north would leave the source square entirely, which is why the fixed 150 km ray limit cannot process the northernmost Artemis regions.

`terrain/polar-1024.bin` is 1,024 × 1,024 unsigned 16-bit little-endian, row-major. Decode height in metres as `minMeters + sample * scaleMeters` using `terrain/polar-1024.json`. Its 608-kilometre square has nominal 593.75-metre display pixels. Each output sample averages a 7–8 pixel block of the original DEM; this uneven integer block partition adds a sub-source-pixel positional approximation to the nominal regular output grid. The visual mesh is for context; horizon calculations use the original 80-metre source. Quantization contributes at most half a stored unit (about 0.109 metres).

Row zero is the +Y edge; +Y points toward longitude 0° E. Columns increase toward +X, longitude 90° E. Pixel centres use `x = -304 + (column + 0.5) * kmPerPixel`, `y = 304 - (row + 0.5) * kmPerPixel`. The 80–90° S disc radius is in `validRadiusKm`; mask the square corners outside that disc. For latitude φ and longitude λ, `ρ = 2R tan((π/2 + φ)/2)`, `x = ρ sin λ`, `y = ρ cos λ`.

`ephemeris/{site}.json` has UTC start and inclusive end, `stepHours: 1`, and 8,761 rows from 2026-01-01 through 2027-01-01. Row fields are `[sunAzimuth, sunElevation, sunDiameter, earthAzimuth, earthElevation, earthDiameter]`, all in degrees. Azimuth is clockwise from local geographic north; diameter is full apparent angular diameter, not radius. Source arcseconds are converted to degrees. Observer altitude is DEM-sampled elevation plus 2 metres. Directions are held at that observer altitude for mast comparisons; the tiny parallax from changing observer height is omitted.

For a polar-map horizontal direction, use `[sin(longitude + azimuth), cos(longitude + azimuth)]`. Surface-view compass directions use the local azimuth directly. Interpolating azimuth must follow the shortest arc across 0°/360°. Linear interpolation of hourly positions improves visual continuity but creates no new source measurements.

`horizon/{site}.json` contains 360 obstruction elevation angles per mast height, with azimuth step 1°. `profiles["2"]` and `profiles["20"]` are computed at 2 and 20 metres above sampled terrain. Great-circle rays sample the original DEM every 80 metres, from 80 metres through 150 kilometres; heights use bilinear interpolation. Observer and target points are converted to three-dimensional positions on the lunar reference sphere. The obstruction is the maximum `atan2(vertical separation, horizontal separation)` from the observer's local tangent frame. This includes lunar curvature and allows a negative skyline elevation. A taller observer cannot increase the skyline angle.

Interpolate the two mast profiles only as an estimated sensitivity model. An 80-metre DEM does not resolve local terrain at the scale of a 2–20-metre antenna. No terrain beyond 150 kilometres is assessed. Frame offsets between LOLA DE421 ME/PA and Horizons' lunar MEAN_ME orientation have not been explicitly transformed or bounded. Do not describe the resulting mast delta as validated engineering performance.

## Machine-readable contract

`schema/data-contract.schema.json` is the source of truth for the shape of every bundled file. The mapping from file to schema definition, the supported JSON Schema subset, and the invariants that remain in Python are documented in `schema/README.md`.

- `lib/data-types.ts` is generated from the schema by `scripts/generate-types.mjs`; `npm run check:contract` fails if the two drift.
- `scripts/contract.py` validates the objects that `terrain.py`, `ephemeris.py` and `validate_ephemeris.py` are about to write. A malformed asset fails at generation time, not in the browser.
- `scripts/check_schema.py` validates all five file types plus cross-file linkage (paths resolve, `siteId` agrees, manifest elevation matches the horizon, ephemeris year matches the manifest).
- `python scripts/check_data.py` runs the schema check and the physical-invariant checks; CI runs it on every change to `public/data/`, `scripts/`, `schema/` or this document.

The schema pins values the frontend assumes: `stepHours: 1`, six ephemeris columns, `azimuthStepDegrees: 1`, 360 skyline points, `[2, 20]` mast heights, `1024 × 1024` uint16 terrain, the closed set of site ids and site `kind` values (`artemis-candidate`/`reference`), and the imagery layer's path, `1024 × 1024` size and north-up orientation (`rotationDegrees: 0`, `mirrored: false`). Changing any of those is a contract change: edit the schema, regenerate `lib/data-types.ts`, regenerate the data, and run the checks.

## Solar-crossing reference checks

`validation.json` contains one reference row per shipped site plus two numerical reference points. For each, the first rising and first setting solar-centre zero-elevation crossing in 2026 is linearly interpolated from hourly source samples, then compared with a separate one-minute Horizons query over that hour. Each comparison preserves the reference query and response hash. The two additional numerical reference points use 2 metres above the reference sphere; they are not operating sites. The first rise and first set are selected independently and may fall in different lunations.

This validates hourly interpolation consistency against finer samples from the **same** ephemeris, not independent ephemeris accuracy. The reference is a flat astronomical horizon and solar centre; it does not validate terrain sunrise/sunset or solar upper-limb contact. Do not claim independent JPL agreement for the terrain-based windows. Hourly visibility sampling can miss short windows and shift boundaries by as much as one sample interval; one-minute consistency results do not remove that limitation.

## Terrain reproducibility check

`check_reproducibility.py` re-runs the committed generator against the published source DEM and compares the result with the shipped `horizon/*.json`: the site elevation, the source hash recorded in each asset, the ray parameters, and 360 skyline angles at both mast heights. It imports `terrain.py`'s own `horizon_profiles()` rather than reimplementing the ray march, because the question is whether the assets still match the committed code, not whether the code is right.

On the shipped assets, all 2,160 skyline angles reproduce within 0.01° (measured maximum 0.0000°), and the source file hash matches the one recorded in every asset.

## Cross-product terrain check

The horizons are also compared against an independent terrain product and ray marcher: the 40 m `LDEM_80S_40M` DEM, sampled at 40 m along the same 1° azimuth grid by the separate `backend/` pipeline. Both sides are clamped at 0° before comparison, because the shipped assets keep negative skyline elevations while that pipeline's legacy convention clamps them; comparing unclamped values measures the convention rather than the terrain, and inflates the difference to the most negative angle at each site. The 80S–90S window is used because the older 85S product truncated most of the Artemis sites' northern 150 km rays.

| site | complete-coverage azimuths | median Δ, 2 m / 20 m | p95 Δ | max Δ | annual sunlight, 80 m (clamped) | annual sunlight, 40 m (clamped) |
| --- | --- | --- | --- | --- | --- | --- |
| Shackleton | 360 / 360 | −0.01° / −0.01° | 0.26° | 0.50° | 23.7 % | 23.8 % |
| Malapert | 360 / 360 | 0.00° / 0.00° | 0.10° | 0.20° | 39.8 % | 39.9 % |
| de Gerlache | 360 / 360 | 0.00° / 0.00° | 0.68° | 0.73° | 30.5 % | 29.0 % |
| Mons Mouton | 360 / 360 | −0.03° / −0.02° | 0.44° | 0.60° | 30.9 % | 31.2 % |
| Nobile Rim 1 | 360 / 360 | 0.01° / 0.00° | 2.40° | 2.92° | 21.0 % | 20.9 % |
| Haworth | 360 / 360 | 0.00° / 0.00° | 0.16° | 0.24° | 23.1 % | 23.1 % |

No azimuth is excluded now: every 150 km ray stays inside the 80S–90S window, so `complete` is 360/360 for all six sites. The skyline agrees to well under a degree everywhere except Nobile Rim 1 (p95 ≤ 0.68°, max ≤ 0.73°), and the annual illumination fraction to within 1.5 percentage points, despite a 2× difference in elevation sampling and separate code. **Nobile Rim 1 is the one row with a real tail:** its 2 m median agrees (0.01°), but its p95 is 2.40° and its maximum 2.92° — about 5 % of azimuths resolve the steep near-field rim differently, while its 20 m median agrees to 0.00° and its annual fraction to 0.1 percentage point. An earlier version of this table reported a +1.01° median for that site; that was an artifact of the 136-azimuth partial coverage, and the median disappears once the whole sky is compared. The tail remains, so the row is a documented discrepancy, not agreement, and none of these rows by itself validates an Artemis site's windows.

Both annual columns are the clamped convention; the three original sites' unclamped 2 m numbers are 30.3 % / 44.7 % / 46.0 % and are not what this table measures.

`backend/pipeline/cross_product.py` regenerates this table from the shipped 80 m assets and the 40 m DEM. It uses the 40 m pipeline's 0.5° bin centres, interpolates the 80 m asset to the same physical azimuths, clamps both sides at 0°, and counts annual sunlight hourly at 2 m. The 2026-11-14 full-coverage run on `LDEM_80S_40M` is the source of the numbers above; the script's `--check` mode guards them.

CI runs the same check in `.github/workflows/backend-data-check.yml` whenever `public/data/`, `backend/`, `scripts/`, `schema/` or this file changes. The workflow caches the 462 MB 40 m DEM (verified against `backend/PROVENANCE.json`), re-downloads it on a cache miss, and asserts that the check did not modify `public/data/`. A second job runs the frontend's `npm test`, `npm run typecheck`, `npm run check:contract` and `npm run build` on Node 24.

Two limits on that claim. Both DEMs derive from LOLA, so this tests the product and resolution choice, not the underlying altimetry. And the comparison is limited to the same 608 km source window as the shipped assets: rays from the Artemis sites reach the square's corners outside the nominal 80–90° S disc, so both sides share that coverage caveat. Nobile Rim 1's 2 m tail is the one place where the two products visibly disagree.

This is a drift guard, not a physical validation. It cannot detect a wrong-but-consistent pipeline: if the ray march were wrong in the same way on both sides, the comparison would still pass. Agreement means the shipped numbers can be rebuilt from published data, not that they are correct.

## Reproduce

Run from the repository root. Python's standard library handles ephemerides and integrity checks; terrain and imagery preparation require NumPy, and imagery also needs Pillow. A full rerun downloads approximately 116 MB of source terrain + 141 MB of LROC imagery plus cached text ephemerides. The source/cache directory is intentionally not a runtime asset. Only `scripts/` writes `public/data/`; see `scripts/README.md` for the ownership rule.

```sh
mkdir -p work/data-source
python3 -m venv work/data-venv
work/data-venv/bin/pip install numpy==2.0.2 pillow
curl --fail --location https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG --output work/data-source/LDEM_80S_80M.IMG
curl --fail --location https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.LBL --output public/data/terrain/source.LBL
curl --fail --location https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/BROWSE/WAC_ROI/WAC_ROI_SOUTH_SUMMER/WAC_ROI_SOUTH_SUMMER_128P.TIF --output work/data-source/WAC_ROI_SOUTH_SUMMER_128P.TIF
work/data-venv/bin/python scripts/terrain.py --source work/data-source/LDEM_80S_80M.IMG
work/data-venv/bin/python scripts/imagery.py --source work/data-source/WAC_ROI_SOUTH_SUMMER_128P.TIF
python3 scripts/ephemeris.py
python3 scripts/validate_ephemeris.py
work/data-venv/bin/python scripts/terrain.py --self-test
work/data-venv/bin/python scripts/imagery.py --self-test
work/data-venv/bin/python scripts/check_reproducibility.py --source work/data-source/LDEM_80S_80M.IMG
python3 scripts/verify_nasa_sources.py --self-test
python3 scripts/verify_nasa_sources.py
python3 scripts/ephemeris.py --self-test
python3 scripts/validate_ephemeris.py --self-test
python3 scripts/check_schema.py --self-test
python3 scripts/check_data.py
```

Run in this order: terrain preparation recreates the manifest, then ephemeris preparation marks it ready. Ephemeris requests reuse files in `work/data-source/`; remove the relevant cached text file to request refreshed source data. A future Horizons model update can change regenerated values and response hashes. Data source labels and per-query metadata record what was actually used.

The independent 40 m cross-check lives in `backend/pipeline/cross_product.py` and needs `backend/data/dem/ldem_80s_40m.img`, downloaded by `python backend/pipeline/fetch_dem.py --product 80s` (about 462 MB). It reads the committed `public/data` assets, not a generated copy:

```sh
python backend/pipeline/cross_product.py \
    --source backend/data/dem/ldem_80s_40m.img \
    --label  backend/data/dem/ldem_80s_40m.lbl --check
```

No radio link budget, diffraction, spacecraft relay, power storage, solar-array orientation, subpixel hazards, terrain uncertainty propagation or communication hardware constraints are modeled. Earth-centre clearance is a geometric visibility criterion, not a guarantee of an operational communications link.
