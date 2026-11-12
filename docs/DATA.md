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

## Reproduce

Run from the repository root. Python's standard library handles ephemerides and integrity checks; only terrain preparation requires NumPy. A full rerun downloads approximately 116 MB of source terrain plus cached text ephemerides. The source/cache directory is intentionally not a runtime asset.

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
python3 scripts/ephemeris.py --self-test
python3 scripts/validate_ephemeris.py --self-test
python3 scripts/check_data.py
```

Run in this order: terrain preparation recreates the manifest, then ephemeris preparation marks it ready. Ephemeris requests reuse files in `work/data-source/`; remove the relevant cached text file to request refreshed source data. A future Horizons model update can change regenerated values and response hashes. Data source labels and per-query metadata record what was actually used.

No radio link budget, diffraction, spacecraft relay, power storage, solar-array orientation, subpixel hazards, terrain uncertainty propagation or communication hardware constraints are modeled. Earth-centre clearance is a geometric visibility criterion, not a guarantee of an operational communications link.
