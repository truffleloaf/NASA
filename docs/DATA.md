# Offline data and provenance

All application assets are bundled under `public/data/`. Data preparation scripts make explicit download requests; the application makes no external runtime data requests. These files support an educational planning estimate, not validated flight operations.

## Sources

**Terrain — Computed resampling of NASA LRO LOLA data.** The source is [LOLA LDEM_80S_80M V2.0](https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG), with its [PDS label](https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.LBL) also bundled at `/data/terrain/source.LBL`. The source contains 7,600 × 7,600 signed little-endian 16-bit samples, 0.5 metres per stored unit, and 80-metre pixels. It is a south-polar stereographic map on a 1,737,400-metre reference sphere, true scale at the pole. The source frame is Mean Earth/Polar Axis of DE421. Observation dates are 2009-07-13 through 2017-02-02; source product creation is 2017-06-15. LOLA's gridded product itself includes interpolated terrain between observations.

Source SHA-256: `e6591eeea35402ca5e124ca00f5bf0774381a2d4fa919144b455d82b8ff65fdc`.

**Directions and apparent diameters — Computed by NASA/JPL Horizons.** [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) observer ephemerides use Sun target `10`, Earth target `399`, observer centre `coord@301`, geodetic east-positive coordinates, apparent airless azimuth/elevation, and angular diameter. The returned ephemeris source is DE441. Each bundled file preserves exact query URLs and raw-response SHA-256 hashes. See the [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) for conventions and model limitations.

**Horizon angles, mast effects and operating windows — Estimated.** The source topography is real, but discretized rays, approximate site coordinates, finite ray length, uncertain local terrain and hourly sampling prevent an operational accuracy claim. No bundled number is a fabricated placeholder. `Estimated` does not imply a quantified confidence interval.

## Asset formats

`manifest.json` lists site coordinates, DEM-sampled elevation, ephemeris and horizon URLs. The named points are approximate regional reference locations, not surveyed landing sites. In particular, “Shackleton region” and “de Gerlache region” do not assert that the given coordinate lies on a usable rim.

`terrain/polar-1024.bin` is 1,024 × 1,024 unsigned 16-bit little-endian, row-major. Decode height in metres as `minMeters + sample * scaleMeters` using `terrain/polar-1024.json`. Its 608-kilometre square has nominal 593.75-metre display pixels. Each output sample averages a 7–8 pixel block of the original DEM; this uneven integer block partition adds a sub-source-pixel positional approximation to the nominal regular output grid. The visual mesh is for context; horizon calculations use the original 80-metre source. Quantization contributes at most half a stored unit (about 0.109 metres).

Row zero is the +Y edge; +Y points toward longitude 0° E. Columns increase toward +X, longitude 90° E. Pixel centres use `x = -304 + (column + 0.5) * kmPerPixel`, `y = 304 - (row + 0.5) * kmPerPixel`. The 80–90° S disc radius is in `validRadiusKm`; mask the square corners outside that disc. For latitude φ and longitude λ, `ρ = 2R tan((π/2 + φ)/2)`, `x = ρ sin λ`, `y = ρ cos λ`.

`ephemeris/{site}.json` has UTC start and inclusive end, `stepHours: 1`, and 8,761 rows from 2026-01-01 through 2027-01-01. Row fields are `[sunAzimuth, sunElevation, sunDiameter, earthAzimuth, earthElevation, earthDiameter]`, all in degrees. Azimuth is clockwise from local geographic north; diameter is full apparent angular diameter, not radius. Source arcseconds are converted to degrees. Observer altitude is DEM-sampled elevation plus 2 metres. Directions are held at that observer altitude for mast comparisons; the tiny parallax from changing observer height is omitted.

For a polar-map horizontal direction, use `[sin(longitude + azimuth), cos(longitude + azimuth)]`. Surface-view compass directions use the local azimuth directly. Interpolating azimuth must follow the shortest arc across 0°/360°. Linear interpolation of hourly positions improves visual continuity but creates no new source measurements.

`horizon/{site}.json` contains 360 obstruction elevation angles per mast height, with azimuth step 1°. `profiles["2"]` and `profiles["20"]` are computed at 2 and 20 metres above sampled terrain. Great-circle rays sample the original DEM every 80 metres, from 80 metres through 150 kilometres; heights use bilinear interpolation. Observer and target points are converted to three-dimensional positions on the lunar reference sphere. The obstruction is the maximum `atan2(vertical separation, horizontal separation)` from the observer's local tangent frame. This includes lunar curvature and allows a negative skyline elevation. A taller observer cannot increase the skyline angle.

Interpolate the two mast profiles only as an estimated sensitivity model. An 80-metre DEM does not resolve local terrain at the scale of a 2–20-metre antenna. No terrain beyond 150 kilometres is assessed. Frame offsets between LOLA DE421 ME/PA and Horizons' lunar MEAN_ME orientation have not been explicitly transformed or bounded. Do not describe the resulting mast delta as validated engineering performance.

## Solar-crossing reference checks

`validation.json` contains five reference points. For each, the first rising and first setting solar-centre zero-elevation crossing in 2026 is linearly interpolated from hourly source samples, then compared with a separate one-minute Horizons query over that hour. Each comparison preserves the reference query and response hash. The two additional numerical reference points use 2 metres above the reference sphere; they are not operating sites. The first rise and first set are selected independently and may fall in different lunations.

This validates hourly interpolation consistency against finer samples from the **same** ephemeris, not independent ephemeris accuracy. The reference is a flat astronomical horizon and solar centre; it does not validate terrain sunrise/sunset or solar upper-limb contact. Do not claim independent JPL agreement for the terrain-based windows. Hourly visibility sampling can miss short windows and shift boundaries by as much as one sample interval; one-minute consistency results do not remove that limitation.

## Terrain reproducibility check

`check_reproducibility.py` re-runs the committed generator against the published source DEM and compares the result with the shipped `horizon/*.json`: the site elevation, the source hash recorded in each asset, the ray parameters, and 360 skyline angles at both mast heights. It imports `terrain.py`'s own `horizon_profiles()` rather than reimplementing the ray march, because the question is whether the assets still match the committed code, not whether the code is right.

On the shipped assets, all 2,160 skyline angles reproduce within 0.01° (measured maximum 0.0000°), and the source file hash matches the one recorded in every asset.

## Cross-product terrain check

The horizons are also compared against an independent terrain product and ray marcher: the 40 m `LDEM_85S_40M` DEM, sampled at 40 m along the same 1° azimuth grid by the separate `backend/` pipeline. Both sides are clamped at 0° before comparison, because the shipped assets keep negative skyline elevations while that pipeline's legacy convention clamps them; comparing unclamped values measures the convention rather than the terrain, and inflates the difference to the most negative angle at each site.

| site | complete-coverage azimuths | median Δ, 2 m / 20 m | p95 Δ | max Δ | annual sunlight, 80 m (clamped) | annual sunlight, 40 m (clamped) |
| --- | --- | --- | --- | --- | --- | --- |
| Shackleton | 360 / 360 | −0.01° / −0.01° | 0.26° | 0.50° | 23.7 % | 23.8 % |
| Malapert | 205 / 360 | 0.00° / 0.00° | 0.10° | 0.20° | 39.8 % | 39.9 % |
| de Gerlache | 256 / 360 | 0.00° / 0.00° | 0.45° | 0.66° | 30.5 % | 29.0 % |

Where the two products overlap, the skyline agrees to well under a degree (p95 ≤ 0.45°, max ≤ 0.66°) and the annual illumination fraction to within 1.5 percentage points, despite a 2× difference in elevation sampling and separate code. Both annual columns are the clamped convention; the app's unclamped 2 m numbers are 30.3 % / 44.7 % / 46.0 % and are not what this table measures.

`backend/pipeline/cross_product.py` regenerates this table from the shipped 80 m assets and the 40 m DEM. It uses the 40 m pipeline's 0.5° bin centres, interpolates the 80 m asset to the same physical azimuths, clamps both sides at 0°, and counts annual sunlight hourly at 2 m. The 2026-11-13 run is the source of the numbers above; the script's `--check` mode guards them.

CI runs the same check in `.github/workflows/backend-data-check.yml` whenever `public/data/`, `backend/`, `scripts/` or this file changes. The workflow caches the 115 MB 40 m DEM (verified against `backend/PROVENANCE.json`), re-downloads it on a cache miss, and asserts that the check did not modify `public/data/`. A second job runs the frontend's `npm test`, `npm run typecheck` and `npm run build` on Node 24.

Two limits on that claim. Both DEMs derive from LOLA, so this tests the product and resolution choice, not the underlying altimetry. And Malapert and de Gerlache are only compared where the 85S product still holds data: its 151.7 km usable radius ends before a 150 km ray for those sites, leaving 43 % and 29 % of their sky unchecked.

This is a drift guard, not a physical validation. It cannot detect a wrong-but-consistent pipeline: if the ray march were wrong in the same way on both sides, the comparison would still pass. Agreement means the shipped numbers can be rebuilt from published data, not that they are correct.

## Reproduce

Run from the repository root. Python's standard library handles ephemerides and integrity checks; only terrain preparation requires NumPy. A full rerun downloads approximately 116 MB of source terrain plus cached text ephemerides. The source/cache directory is intentionally not a runtime asset. Only `scripts/` writes `public/data/`; see `scripts/README.md` for the ownership rule.

```sh
mkdir -p work/data-source
python3 -m venv work/data-venv
work/data-venv/bin/pip install numpy==2.0.2
curl --fail --location https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG --output work/data-source/LDEM_80S_80M.IMG
curl --fail --location https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.LBL --output public/data/terrain/source.LBL
work/data-venv/bin/python scripts/terrain.py --source work/data-source/LDEM_80S_80M.IMG
python3 scripts/ephemeris.py
python3 scripts/validate_ephemeris.py
work/data-venv/bin/python scripts/terrain.py --self-test
work/data-venv/bin/python scripts/check_reproducibility.py --source work/data-source/LDEM_80S_80M.IMG
python3 scripts/ephemeris.py --self-test
python3 scripts/validate_ephemeris.py --self-test
python3 scripts/check_data.py
```

Run in this order: terrain preparation recreates the manifest, then ephemeris preparation marks it ready. Ephemeris requests reuse files in `work/data-source/`; remove the relevant cached text file to request refreshed source data. A future Horizons model update can change regenerated values and response hashes. Data source labels and per-query metadata record what was actually used.

The independent 40 m cross-check lives in `backend/pipeline/cross_product.py` and needs `backend/data/dem/ldem_85s_40m.img`, downloaded by `backend/pipeline/fetch_dem.py` (about 115 MB). It reads the committed `public/data` assets, not a generated copy:

```sh
python backend/pipeline/cross_product.py \
    --source backend/data/dem/ldem_85s_40m.img \
    --label  backend/data/dem/ldem_85s_40m.lbl --check
```

No radio link budget, diffraction, spacecraft relay, power storage, solar-array orientation, subpixel hazards, terrain uncertainty propagation or communication hardware constraints are modeled. Earth-centre clearance is a geometric visibility criterion, not a guarantee of an operational communications link.
