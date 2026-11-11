# Method

How the numbers in this project are produced, how far they can be trusted, and what they do
not cover. Every claim below is reproducible with the scripts in `pipeline/`.

If you only read one paragraph: the visibility numbers are **geometric** — a straight line
from a point on the surface to the centre (or limb) of the Sun or Earth, blocked by terrain
sampled from a 40 m/pixel LOLA digital elevation model. They are not a link budget, not a
power model, and not a landing-safety assessment.

---

## 1. Scope

**In scope**

- Apparent azimuth and elevation of the Sun and the Earth as seen from a named lunar site.
- The terrain horizon at that site: the maximum elevation angle of terrain along each
  azimuth.
- Whether the Sun or the Earth is above that horizon, as a function of time.
- The resulting time intervals, and operating windows derived from user requirements.

**Out of scope**

Radio link performance, solar-array output, battery state, thermal environment, surface
roughness, slope hazards, boulder distribution, secondary illumination scattered into
shadowed regions, and anything to do with landing. A visible Sun is not the same as
adequate power, and a visible Earth is not the same as a working communication link.

---

## 2. Conventions

| Quantity | Convention |
| --- | --- |
| Time | UTC throughout. Product labels use `YYYY-MM-DDTHH:MM:SSZ`. |
| Azimuth | Degrees, 0° = north, increasing clockwise (90° = east). |
| Elevation | Degrees above the local horizontal plane at the site. Negative means below. |
| Longitude | Selenographic, positive east, planetocentric. |
| Height | Metres relative to a sphere of radius 1737.4 km. |
| Visible | Body elevation > max(terrain horizon at that azimuth, 0°). |
| Intervals | Half-open `[start, end)`. |

The `max(..., 0°)` in the visibility rule matters. The local horizontal plane is itself a
horizon: a body below it is below the horizon no matter how the ground falls away. Without
the clamp, terrain that dips below the tangent plane would wrongly widen visibility, and the
terrain-aware result could exceed the terrain-free result.

---

## 3. Data sources

### 3.1 Ephemeris — JPL Horizons

| | |
| --- | --- |
| Service | `https://ssd.jpl.nasa.gov/api/horizons.api` |
| Ephemeris | DE441 |
| Target | Sun (`COMMAND='10'`), Earth (`COMMAND='399'`) |
| Observer | `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='lon,lat,alt_km'` |
| Quantity | `QUANTITIES='4'` — apparent azimuth and elevation of the body centre |
| Optics | `APPARENT='AIRLESS'` |

Horizons returns the *airless apparent* direction, already corrected for light-time,
stellar aberration and gravitational deflection. The Moon has no atmosphere, so no
refraction correction applies — a real simplification compared with any Earth-based
calculation.

The observer is specified as a geodetic site on the Moon (body 301) at the site's DEM
elevation. Horizons models the Moon as a sphere of radius 1737.4 km for this purpose, which
is the same reference used by the DEM, so the two are consistent.

### 3.2 Terrain — LRO / LOLA

| | |
| --- | --- |
| Product | `LDEM_85S_40M` |
| Node | PDS Geosciences, `lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/` |
| Coverage | 85°S to 90°S, polar stereographic, spherical |
| Grid | 7584 × 7584, 40 m/pixel |
| Encoding | 16-bit little-endian signed integers, `height_m = DN × 0.5` |
| Datum | radius 1737.4 km |
| Size | 115 MB |

The 40 m product was chosen over the 5 m and 10 m products because it covers both candidate
sites in one file at a size that can be handled on a laptop. See §5.3 for the measured cost
of that choice.

### 3.3 Projection orientation — PDS `dsmap_polar.cat`

The product label does not state which way longitude runs on the image. The authoritative
statement is in the PDS projection catalogue, and it is unambiguous:

> In the south, Longitude 0 extends straight up from the center, and Longitude 90 East
> extends to the right.

With `dx` positive to the right and `dy` positive upwards on the image, this is

```
lon = 90° − atan2(dy, dx)        up = 0°, right = 90°E, down = 180°, left = 270°
```

and, for the radius,

```
rho = 2 × 1737400 × tan((90 − |lat|) × π/360)   [metres]
col =  rho·sin(lon)/MAP_SCALE + 3791.5
row = −rho·cos(lon)/MAP_SCALE + 3791.5
```

The catalogue's own forward equation carries `SIGN(LAT)` inside `rho`, which for the
southern hemisphere produces a negative radius and does not round-trip through its own
inverse. The inverse is self-consistent with the prose, so `dem.py` inverts it analytically
instead of transcribing the forward form.

---

## 4. Method

### 4.1 Terrain horizon

For a site at `(lat₀, lon₀)` and each azimuth bin `a`:

1. Walk outward along the great circle at bearing `a`, in steps equal to the DEM pixel size,
   to a maximum range (150 km by default).
2. At each step `r`, compute the apparent elevation of the terrain relative to the observer:

   ```
   d      = r / R                      R = 1737 400 m
   elev(r)= atan2( (R + h_t)·cos d − (R + h_s) , (R + h_t)·sin d )
   ```

   This is the exact spherical form: in the great-circle plane through the site and the
   target, the site sits at `(R + h_s, 0)` and the target at `(R + h_t)·(cos d, sin d)`, so
   the vertical component of the line of sight is `(R + h_t)·cos d − (R + h_s)` and the
   horizontal component is `(R + h_t)·sin d`. For equal heights it reduces to **−d/2**, the
   surface dropping away below the local horizontal. The small-angle approximation
   `atan((h_t − h_s − r²/(2R)) / r)` agrees to better than 0.01° at these ranges.

   **The sign of the curvature term is a one-character bug with a four-degree consequence.**
   The first version of this pipeline had `(R + h_t) − (R + h_s)·cos d` over
   `(R + h_s)·sin d`, which lifts distant terrain instead of dropping it: at 150 km an
   equal-height point came out at **+2.47°** instead of **−2.47°**, a 4.95° error. Since the
   Sun stays within ±1.5° of the pole's horizon all year, that inverted the illumination
   numbers. `horizon.selfcheck()` now pins the analytic cases (equal height → −d/2, monotone
   fall-off with range, zero-range → +90°) and `run_horizon.py` refuses to continue if any
   of them fail.

3. Take `horizon(a) = max over r of elev(r)`, then clamp to `≥ 0`.

**Curvature cannot be omitted.** At 20 km the surface falls 115 m below the tangent plane;
at 150 km it falls 6.5 km. Without the correction, distant terrain is grossly over-weighted
and the horizon is systematically too high.

**Range truncation is a second-order effect once the curvature sign is right.** At the pole,
tracing to 50 km, 150 km and 250 km gives identical horizons to the printed precision (0.000°
median, p95 and max over 180 azimuths). That is expected: curvature puts a target 50 km away
719 m below the tangent plane, and one 150 km away 6.5 km below, so only terrain far above the
site can reach over the curve. The 150 km default is kept because it costs nothing and uses
all the data, not because it moves the numbers.

An earlier revision of this document claimed range mattered a great deal — a 0.74° median
shift from 50 km to 150 km. That measurement was taken while the curvature term had the wrong
sign, which amplified distant terrain instead of suppressing it. Both findings trace to the
same bug; the corrected number is zero.

### 4.2 Extended bodies

The Sun and the Earth are not points. As seen from the Moon:

| Body | Angular radius |
| --- | --- |
| Sun | 0.266° |
| Earth | 0.951° |

At the poles both bodies graze the horizon, so the choice of centre versus limb changes the
answer by several percentage points. The pipeline therefore reports both and never mixes
them:

- `solar_center`, `earth_center` — the body's centre must clear the horizon.
- `solar_limb` — the Sun's upper limb clears the horizon (elevation + 0.266° > horizon).
- `earth_limb` — any part of the Earth clears the horizon (elevation + 0.951° > horizon).

`solar_limb` is the better proxy for "is there light on the ground"; `solar_center` is the
stricter geometric criterion. Which one a given screen shows must be stated next to the
number.

### 4.3 Sampling in time

- Ephemeris: 1 hour, 8761 samples covering 2026.
- Visibility masks: interpolated to 10 minutes before thresholding, so interval boundaries
  carry about ±10 minutes of quantisation rather than ±30.

Azimuth is unwrapped before interpolation; interpolating across the 0°/360° discontinuity
would produce a spurious swing through the opposite direction.

### 4.4 Intervals and windows

Boolean masks are reduced to maximal runs, converted to absolute UTC intervals. Coverage is
the fraction of samples that are true; longest gap is the longest run of false *between*
true runs (edge gaps are excluded, since they are not interruptions of anything).

Operating windows are **not** computed by the backend. The frontend derives them from the
visibility intervals so that a requirement slider can be re-evaluated instantly without a
round trip. The rule, mirrored in `windows.py` and in `lib/mission.ts`, is: within one
continuous sunlit interval, merge Earth-visible pieces whose separation is at most the
allowed communication blackout, and keep the merged span if it is at least
`max(min_sunlight, required_duration)`.

A window that touches the edge of the requested period is truncated by that period. It must
be presented as `≥ N hours`, not `N hours`.

---

## 5. Validation

### 5.1 Control site — a prediction that can fail

`Shackleton` crater floor, 89.654°S 128.31°E, is permanently shadowed. Running the complete
chain on it produces:

| | |
| --- | --- |
| site elevation | −2771 m |
| terrain horizon | +20.2° … +22.4° (median +21.2°) |
| sunlit, with terrain | **0.0 %** |
| Earth visible, with terrain | **0.0 %** |

This is the strongest available end-to-end test. A wrong projection orientation would put
the site somewhere else on the map and would not produce a 21° bowl. A mis-scaled radius
would shift the horizon away from 21°. Getting exactly zero requires the projection, the DEM
sampling, the curvature term, the horizon search, the ephemeris and the masking to be
simultaneously correct.

It is not, however, sensitive to the *sign* of the curvature term. A 21° bowl is dominated by
terrain 2–8 km away, where that term contributes 0.05–0.3° whichever way it points. The sign
error found on 2026-11-11 moved this table by 0.4° and left both zeros intact while the
lit-site numbers were wrong by a factor of eight. A control site shows that the chain is
connected; it does not calibrate it. That is why the analytic checks in §5.2 exist beside it.

### 5.2 Invariants

| Invariant | Result |
| --- | --- |
| Terrain-aware visibility ≤ geometric visibility, per site and body | passes for all three sites |
| Azimuth wrap continuity: horizon(0.5°) ≈ horizon(359.5°) | 0.036° apart |
| Image corners map to the latitude predicted from `MAP_SCALE` and image size | −82.936° vs −82.93° predicted |
| Vectorised sampler ≡ scalar `dem.Projection` | max 1.8 × 10⁻¹² pixel |
| Equal-height ray elevation = −r/2R (analytic, 1–150 km) | max deviation 3.5 × 10⁻¹²° |
| Equal-height elevation strictly decreases with range | passes at 1–150 km |

The first invariant found a real bug. With unclamped negative horizon angles, a body below
the local tangent plane was counted as visible, and terrain-aware Earth visibility exceeded
the terrain-free value (49.9 % vs 46.3 %). Invisible without the check; the fix is the
`max(..., 0°)` clamp in §2.

### 5.3 Numerical convergence

Rerunning the horizon search with coarser ray steps, against the 40 m baseline:

| Ray step | Shackleton p95 / max | Malapert p95 / max |
| --- | --- | --- |
| 80 m | 0.114° / 0.225° | 0.589° / 0.634° |
| 160 m | 0.177° / 0.558° | 1.238° / 1.489° |
| 240 m | 0.256° / 0.432° | 1.483° / 1.705° |

Median differences are 0.000° at 80 m for both sites. The 40 m step is converged; halving it
would not change results usefully. Malapert is more sensitive because its terrain is steeper
and it sits near the DEM edge.

### 5.4 Consistency with known values

- Sunlit fraction with **no terrain**, at 89.90°S: 52.6 % of the year. At the pole the Sun's
  elevation is set by the subsolar latitude, which swings ±1.54° over a year, so roughly
  half the year should be lit. ✓
- Earth elevation at the pole swings between about −7.00° and +6.63°, matching the amplitude
  of libration in latitude. Earth visibility is therefore interrupted on a monthly
  timescale even with no terrain at all. ✓
- The crater floor is dark and the surrounding high ground is not, which is the expected
  qualitative pattern. ✓

---

## 6. Uncertainty budget

Full year 2026, one-hour ephemeris, 150 km rays, 40 m DEM.

| Source | Size | Effect on the reported numbers |
| --- | --- | --- |
| Ephemeris accuracy | sub-arcsecond (DE441) | negligible |
| Site position | ±1 pixel, 40 m | sub-arcsecond parallax |
| DEM vertical accuracy | ~1 m | 0.001/`d` rad → < 0.02° beyond 3 km |
| DEM horizontal sampling | 40 m | p95 ≤ 0.12° (Shackleton), ≤ 0.59° (Malapert) |
| Ray range truncation | 150 km, DEM-limited | negligible: 50/150/250 km differ by 0.000° at the pole |
| Disc vs point treatment | Sun 0.266°, Earth 0.951° | +2.3 to +3.6 pt (sun), +4.6 to +5.0 pt (Earth) |
| Time quantisation | 10 min masks, 1 h ephemeris | ±10 min on interval boundaries |
| Sphere vs ellipsoid | Moon flattening ≈ 1/581 | < 0.01° |

**The DEM edge, in detail.** Shackleton never stops short of 148.5 km in any azimuth, so it is
unaffected. Malapert sits 121.7 km from the pole inside a DEM whose usable radius is about
151.7 km, so rays heading away from the pole leave the data after about 30 km: 155 of 360
azimuths stop before 142.5 km, the shortest at 30.0 km. Malapert's horizon is therefore a
lower bound in roughly that half of the sky, and its true illumination is lower than reported
— the one number here limited by data extent rather than by method. Re-running it against the
80°S–90°S product (`ldem_80s_40m`, 462 MB) would remove this limitation.

**What is not in the budget.** DEM errors are correlated at the scale of the interpolation,
so the quoted per-azimuth errors understate the uncertainty of a *time series*; a
systematic 0.1° bias in the horizon shifts every transition in the same direction. Treat the
coverage fractions as good to roughly one percentage point, and individual transition times
as good to tens of minutes, not better.

---

## 7. Assumptions

1. The observer stands on the DEM surface at the site coordinate, with zero height above it.
   `observer_height_m` exists in `horizon_profile()` for mast or antenna heights but is 0 in
   the exported product.
2. Terrain is static over the modelled year. No thermal expansion, no lander disturbance.
3. The DEM is taken as ground truth at its own resolution. Sub-pixel relief (boulders,
   small craters, the lander itself) is not represented.
4. Terrain blocks light and line of sight completely. No diffraction, no scattering into
   shadowed regions, no earthshine.
5. Azimuth bins are 1°. Terrain structure narrower than about 1° in azimuth at a given range
   is averaged, not resolved.
6. The Moon is a sphere of radius 1737.4 km for geometry and for the elevation datum.

---

## 8. Limitations

- **Not a landing-safety tool.** Slope, roughness, boulder density and comm-link margin are
  all outside this model. A favourable illumination window says nothing about whether a
  vehicle can land there.
- **Not a power model.** Sunlit does not mean the array produces power; incidence angle,
  array geometry, shadowing by the vehicle and battery state are not modelled.
- **Not a link budget.** Geometric line of sight is necessary but not sufficient for a
  communication link.
- **40 m terrain.** Features below 40 m — including anything a rover would care about — are
  absent.
- **Two sites, one year.** The product covers 2026 only, and only the sites in
  `export_data.py`. Libration and illumination repeat over an 18.6-year cycle, so 2026 is
  representative but not universal.
- **Southern hemisphere only.** The pipelines are written for the south polar products.
  Northern-hemisphere products use the opposite longitude convention.
- **Solar cycle and thermal environment** are not considered.

---

## 9. Reproducing this

```sh
pip install -r backend/requirements.txt

python backend/pipeline/fetch_dem.py        # 115 MB, resumable
python backend/pipeline/run_horizon.py      # horizon + projection self-checks
python backend/pipeline/run_annual.py       # full-year visibility + invariants
python backend/pipeline/check_convergence.py# sampling and range sensitivity
python backend/pipeline/export_data.py      # write export/data/*.json
python backend/pipeline/check_export.py     # rebuild analyze() from JSON alone
```

The ephemeris is cached under `data/horizons/`; the first run needs network, later runs do
not. The DEM is cached under `data/dem/`. Neither is committed.

The value of each script is that it can fail. `run_annual.py` prints the control site and
the monotonicity check; `check_convergence.py` prints the sensitivity; `check_export.py`
deliberately cannot see any of the computation code and must rebuild the result from JSON
alone.

---

## 10. References

1. JPL Horizons On-Line Ephemeris System — <https://ssd.jpl.nasa.gov/horizons/>
2. LRO LOLA Gridded Data Records, PDS Geosciences Node —
   <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/>
3. PDS `dsmap_polar.cat`, polar stereographic transformation for LRO-L-LOLA-4-GDR-V1.0
   (revised 2022-01-15) —
   <https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/dsmap_polar.cat>
4. Smith, D. E. et al., *The Lunar Orbiter Laser Altimeter investigation on the Lunar
   Reconnaissance Orbiter mission*, Space Science Reviews, 2010.
5. Mazarico, E. et al., *Illumination conditions of the lunar polar regions using LOLA
   topography*, Icarus 211, 2011.
6. Snyder, J. P., *Map Projections — A Working Manual*, USGS Professional Paper 1395, 1987.

---

## 11. Acknowledgements

Ephemeris calculations use JPL Horizons (NASA/JPL-Caltech). Terrain data are from the Lunar
Orbiter Laser Altimeter on the Lunar Reconnaissance Orbiter (NASA/Goddard Space Flight
Center), distributed by the PDS Geosciences Node at Washington University in St. Louis.
This is an independent project and is not an official NASA product.
