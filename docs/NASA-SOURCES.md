# NASA data integration — source verification

The existing visual design is unchanged. The planner already uses actual NASA/JPL
Horizons ephemerides and NASA LRO LOLA topography, not illustrative numeric curves.
This pass verifies that connection and makes it inspectable in the product.

## What was checked

- All six recorded annual Horizons queries were fetched again from JPL. For each of
  three representative sites, every one of the 8,761 hourly Sun rows and 8,761 Earth
  rows matches the bundled azimuth, elevation and apparent diameter at stored precision.
  Total: 52,566 body/time records, or 157,698 numerical fields. Exact UTC timestamps and
  record counts are also checked. Original response hashes match the existing cache.
- The original 115,520,000-byte LDEM_80S_80M source matches its recorded SHA-256 hash.
  All 2,160 skyline angles (three sites × two mast heights × 360 directions) reproduce
  from that DEM with a maximum stored-angle difference of 0.0000°.
- No scientific rows were replaced: the fresh source comparisons matched. No claim is
  made that a newer response has the same whole-response hash, because JPL headers can
  change while the numerical values remain identical.
- `public/data/source-audit.json` records the verification timestamp, source query
  URLs, observer settings, fresh/original response hashes and shipped asset checksums.

## How the application uses it

The existing window calculations consume the verified ephemeris and horizon files.
Before using a downloaded file, the browser now checks its SHA-256 digest. A changed
or corrupt ephemeris/horizon file is rejected and the existing missing-data state is
shown; a corrupt display DEM uses the existing terrain fallback. No external runtime
requests were added. Files are still served from `public/data/`.

The build also checks every audited asset, including the manifest, terrain metadata,
source label and reference checks. Regenerating data requires rerunning verification;
a stale audit fails the build rather than shipping mismatched files.

The Methods page lists each site's observer, coverage, downloadable inputs and exact
reproducible JPL queries. The explorer's limits panel and exported brief link to the
selected site's record. It also includes the resources supplied in the challenge:

- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/): actual numerical position source.
- [LROC QuickMap](https://quickmap.lroc.asu.edu/): complementary imagery/terrain exploration.
- [NASA Moon Trek](https://trek.nasa.gov/moon/): complementary lunar terrain exploration.
- [CSA Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/): educational mission context.
- [Space Apps Connect](https://github.com/nasa/spaceapps): community discussion.

QuickMap and Moon Trek are not numerical APIs wired into the runtime. The original
LOLA DEM, rather than screenshots from those portals, supplies terrain calculations.
The challenge webpage could not be independently retrieved during this pass; the
resource list was taken from the user's supplied challenge text and the resource
destinations were checked. No NASA endorsement is implied.

## Reproduce

From the repository root, with the original source cache prepared as in DATA.md:

```sh
python3 scripts/verify_nasa_sources.py --self-test
python3 scripts/verify_nasa_sources.py --refresh
python3 scripts/check_data.py
work/data-venv/bin/python scripts/check_reproducibility.py --source work/data-source/LDEM_80S_80M.IMG
npm run typecheck
npm test
npm run build
```

Without `--refresh`, verification uses the original cached responses and labels the
audit accordingly. The refresh option is preparation-time only. It does not silently
replace scientific values when JPL disagrees; it fails and requires investigation.

Source equality proves provenance and reproducibility, not physical accuracy. Horizons
directions are Computed; representative coordinates, terrain horizons, mast effects,
visibility percentages and operating windows remain Estimated. Hourly boundaries,
DEM resolution, finite ray lengths and unresolved reference-frame differences still
limit the results. Landing graphics remain Illustrative, exactly as before.
