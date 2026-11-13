#!/usr/bin/env python3
"""Reproduce the frontend's cross-product terrain table.

The shipped product under ``public/data`` uses the 80 m ``LDEM_80S_80M`` DEM and
keeps negative skyline angles.  This backend pipeline uses the independent 40 m
``LDEM_85S_40M`` DEM and clamps the skyline at 0 degrees.  Comparing the two is
therefore a comparison of terrain products *after* making the convention equal:
both sides are clamped at 0 degrees here, exactly as the frontend's
``docs/DATA.md`` "Cross-product terrain check" section describes.

The table this script prints is the same one documented in ``docs/DATA.md``:
complete-coverage azimuths, median/p95/max skyline differences at 2 m and 20 m,
and the annual sunlight fraction of both products on the shipped ephemeris.

Usage
-----
    python backend/pipeline/cross_product.py \
        --source backend/data/dem/ldem_85s_40m.img \
        --label  backend/data/dem/ldem_85s_40m.lbl

    python backend/pipeline/cross_product.py --check ...

``--check`` compares the printed values with the numbers recorded in
``docs/DATA.md`` and exits non-zero on drift.  The 40 m DEM is not committed
(see ``backend/data/README.md``); download it with ``fetch_dem.py`` first.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dem as demmod  # noqa: E402
import horizon  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ASSETS = ROOT / "public" / "data"
DEFAULT_SOURCE = Path(__file__).resolve().parents[1] / "data" / "dem" / "ldem_85s_40m.img"
DEFAULT_LABEL = Path(__file__).resolve().parents[1] / "data" / "dem" / "ldem_85s_40m.lbl"

AZ_STEP_DEG = 1.0
# The 40 m pipeline's historical bins are centred at 0.5, 1.5, ...; the
# frontend's shipped 80 m bins are centred at 0, 1, ... .  Compare at the
# 40 m centres by interpolating the 80 m asset, so the two sides see the
# same physical azimuths.
COMPARE_ORIGIN_DEG = 0.5
# The backend's own run_horizon.py calls an azimuth "complete" when the ray
# reaches at least 95% of the configured range; docs/DATA.md uses the same
# convention (360 / 205 / 256 complete azimuths for the three original sites,
# 123 / 136 / 168 for the three Artemis sites).
COMPLETE_FRACTION = 0.95
MASTS = (2.0, 20.0)
MAX_RANGE_M = horizon.DEFAULT_MAX_RANGE_M

# Baseline produced by this script on the shipped assets.  The check
# tolerances allow for display rounding.
#
# ``complete`` is the number of 1 deg azimuths whose 150 km ray stays inside
# the 40 m product; only those are compared.  The three Artemis sites sit close
# to its 85 S edge, so a majority of their azimuths (the northern sector) are
# excluded and their rows are weaker evidence than the first three.  Nobile Rim
# 1 is the known exception: the 40 m and 80 m products resolve its steep
# near-field rim differently, so its 2 m p95 (2.80 deg) is a documented
# discrepancy, not agreement.
EXPECTED = {
    "shackleton": dict(complete=360, median_2=-0.01, median_20=-0.01,
                       p95=0.26, maximum=0.50, annual_80=23.7, annual_40=23.8),
    "malapert": dict(complete=205, median_2=0.00, median_20=0.00,
                     p95=0.10, maximum=0.20, annual_80=39.8, annual_40=39.9),
    "de-gerlache": dict(complete=256, median_2=0.00, median_20=0.00,
                        p95=0.45, maximum=0.66, annual_80=30.5, annual_40=29.0),
    "mons-mouton": dict(complete=123, median_2=-0.04, median_20=-0.04,
                        p95=0.32, maximum=0.36, annual_80=30.9, annual_40=31.2),
    "nobile-rim-1": dict(complete=136, median_2=1.01, median_20=0.01,
                         p95=2.80, maximum=2.92, annual_80=21.0, annual_40=20.9),
    "haworth": dict(complete=168, median_2=0.00, median_20=0.00,
                    p95=0.12, maximum=0.18, annual_80=23.1, annual_40=23.1),
}

# Values printed in docs/DATA.md.  Kept separately so this script can report
# which cells the documented method does not reproduce instead of hiding them.
DOCUMENTED = {
    "shackleton": dict(complete=360, p95=0.26, annual_40=23.8),
    "malapert": dict(complete=205, p95=0.10, annual_40=39.9),
    "de-gerlache": dict(complete=256, p95=0.45, annual_40=29.0),
    "mons-mouton": dict(complete=123, p95=0.32, annual_40=31.2),
    "nobile-rim-1": dict(complete=136, p95=2.80, annual_40=20.9),
    "haworth": dict(complete=168, p95=0.12, annual_40=23.1),
}


def asset_path(root: Path, url: str) -> Path:
    """Resolve a manifest URL such as ``/data/horizon/x.json`` under ``root``."""
    if not url.startswith("/data/"):
        raise ValueError(f"Not a bundled data URL: {url!r}")
    return root / url[len("/data/"):]


def horizon_at(profile, azimuth: float, step: float = AZ_STEP_DEG,
               origin: float = 0.0) -> float:
    """Linear interpolation between azimuth bins, wrapping at 360 degrees."""
    index = (((azimuth - origin) % 360.0) + 360.0) % 360.0 / step
    left = int(math.floor(index)) % len(profile)
    fraction = index - math.floor(index)
    return profile[left] * (1.0 - fraction) + profile[(left + 1) % len(profile)] * fraction


def annual_sun(ephemeris: dict, profile: list[float] | np.ndarray,
               origin: float) -> float:
    """Hourly solar-centre-above-clamped-skyline fraction, in percent."""
    rows = ephemeris["rows"]
    visible = sum(row[1] > horizon_at(profile, row[0], origin=origin) for row in rows)
    return 100.0 * visible / len(rows)


def compare_site(grid, assets: Path, site: dict) -> dict:
    shipped = json.loads(asset_path(assets, site["horizon"]).read_text(encoding="utf-8"))
    ephemeris = json.loads(asset_path(assets, site["ephemeris"]).read_text(encoding="utf-8"))

    shipped_2 = np.maximum(np.asarray(shipped["profiles"]["2"], dtype=float), 0.0)
    shipped_20 = np.maximum(np.asarray(shipped["profiles"]["20"], dtype=float), 0.0)
    # Interpolate the shipped 0, 1, 2, ... bins at the 40 m pipeline's
    # 0.5, 1.5, 2.5, ... centres before differencing.
    shipped_at_origin = {
        2.0: np.asarray([horizon_at(shipped_2, COMPARE_ORIGIN_DEG + i)
                         for i in range(360)], dtype=float),
        20.0: np.asarray([horizon_at(shipped_20, COMPARE_ORIGIN_DEG + i)
                          for i in range(360)], dtype=float),
    }

    computed = {}
    for mast in MASTS:
        prof = horizon.horizon_profile(
            grid,
            float(site["lat"]),
            float(site["lon"]),
            az_step_deg=AZ_STEP_DEG,
            max_range_m=MAX_RANGE_M,
            observer_height_m=mast,
        )
        skyline = np.asarray(prof["horizon_terrain_deg"], dtype=float)
        computed[mast] = {
            "clamped": np.maximum(np.where(np.isfinite(skyline), skyline, 0.0), 0.0),
            "complete": (np.asarray(prof["max_range_reached_m"], dtype=float)
                         >= COMPLETE_FRACTION * MAX_RANGE_M),
        }

    complete = computed[2.0]["complete"] & computed[20.0]["complete"]
    if not complete.any():
        raise ValueError(f"{site['id']}: no azimuth reaches "
                         f"{COMPLETE_FRACTION:.0%} of {MAX_RANGE_M / 1000:.0f} km")

    deltas = {}
    for mast in MASTS:
        raw = computed[mast]["clamped"] - shipped_at_origin[mast]
        deltas[mast] = raw[complete]

    # The documented table's single p95/max pair is the 2 m profile's; the
    # 20 m medians are reported separately.  Keep that convention explicit.
    primary = deltas[2.0]
    return {
        "id": site["id"],
        "complete": int(complete.sum()),
        "median_2": float(np.median(deltas[2.0])),
        "median_20": float(np.median(deltas[20.0])),
        "p95": float(np.percentile(np.abs(primary), 95)),
        "maximum": float(np.max(np.abs(primary))),
        "annual_80": annual_sun(ephemeris, shipped_2, origin=0.0),
        "annual_40": annual_sun(ephemeris, computed[2.0]["clamped"],
                                origin=COMPARE_ORIGIN_DEG),
    }


def documented_drift(rows: list[dict]) -> list[str]:
    """Report cells in docs/DATA.md that this method does not reproduce."""
    drift: list[str] = []
    for row in rows:
        expected = DOCUMENTED.get(row["id"])
        if expected is None:
            drift.append(f"{row['id']}: not in docs/DATA.md")
            continue
        if row["complete"] != expected["complete"]:
            drift.append(f"{row['id']}: complete {row['complete']} != docs {expected['complete']}")
        for key, tolerance in (("p95", 0.02), ("annual_40", 0.2)):
            if abs(row[key] - expected[key]) > tolerance:
                drift.append(f"{row['id']}: {key} measured {row[key]:.2f}, "
                             f"docs {expected[key]:.2f}")
    return drift


def check(rows: list[dict]) -> list[str]:
    failures: list[str] = []
    for row in rows:
        expected = EXPECTED.get(row["id"])
        if expected is None:
            failures.append(f"{row['id']}: no expected values in docs/DATA.md")
            continue
        if row["complete"] != expected["complete"]:
            failures.append(f"{row['id']}: complete azimuths {row['complete']} != {expected['complete']}")
        for key, tolerance in (("median_2", 0.06), ("median_20", 0.06),
                               ("p95", 0.06), ("maximum", 0.06),
                               ("annual_80", 0.2), ("annual_40", 0.2)):
            if abs(row[key] - expected[key]) > tolerance:
                failures.append(f"{row['id']}: {key} {row[key]:.3f} != {expected[key]:.3f} "
                                f"(tolerance {tolerance})")
    for site_id in EXPECTED:
        if site_id not in {row["id"] for row in rows}:
            failures.append(f"{site_id}: missing from manifest")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=DEFAULT_ASSETS,
                        help="bundled asset root (default: public/data)")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                        help="40 m LDEM_85S_40M image")
    parser.add_argument("--label", type=Path, default=DEFAULT_LABEL,
                        help="PDS label for the 40 m image")
    parser.add_argument("--check", action="store_true",
                        help="fail if values drift from docs/DATA.md")
    args = parser.parse_args()

    if not args.source.exists() or not args.label.exists():
        print(f"Missing 40 m source: {args.source} / {args.label}", file=sys.stderr)
        print("Run backend/pipeline/fetch_dem.py first, or pass --source/--label.", file=sys.stderr)
        return 2

    manifest = json.loads((args.assets / "manifest.json").read_text(encoding="utf-8"))
    proj = demmod.Projection.from_label(args.label)
    grid = horizon.HeightGrid(args.source, proj)

    print("Cross-product terrain check: shipped 80 m vs independent 40 m")
    print(f"  assets {args.assets}")
    print(f"  source {args.source}")
    print(f"  {proj.lines} x {proj.samples}, {proj.map_scale_m:.0f} m/pixel")
    print(f"  both sides clamped at 0 deg; {AZ_STEP_DEG:g} deg bins at "
          f"{COMPARE_ORIGIN_DEG:g} deg centres")
    print()

    rows = [compare_site(grid, args.assets, site) for site in manifest["sites"]]

    header = (f"{'site':<14}{'complete':>9}{'2 m med':>10}{'20 m med':>11}"
              f"{'2 m p95':>9}{'2 m max':>9}{'sun 80 m':>10}{'sun 40 m':>10}")
    print(header)
    print("-" * len(header))
    for row in rows:
        print(f"{row['id']:<14}{row['complete']:>6}/360"
              f"{row['median_2']:>+10.2f}{row['median_20']:>+11.2f}"
              f"{row['p95']:>8.2f}{row['maximum']:>8.2f}"
              f"{row['annual_80']:>9.1f}%{row['annual_40']:>9.1f}%")
    print()
    print("Deltas are 40 m minus 80 m over azimuths where the 40 m ray reaches "
          f"{COMPLETE_FRACTION:.0%} of {MAX_RANGE_M / 1000:.0f} km.")
    print("Annual sunlight is solar-centre, 2 m, hourly, clamped skyline; it is not the UI number.")
    print("The shipped UI keeps negative skyline angles and reports 30.3 / 44.7 / 46.0 %.")

    drift = documented_drift(rows)
    print()
    if drift:
        print("docs/DATA.md comparison: the documented table does not reproduce in:")
        for message in drift:
            print(f"  - {message}")
        print("  Other cells agree within tolerance; regenerate the table with this")
        print("  script or document the annual/percentile method difference before citing it.")
    else:
        print("docs/DATA.md comparison: all documented cells reproduce within tolerance.")

    if args.check:
        failures = check(rows)
        if failures:
            print("\nFAIL")
            for message in failures:
                print(f"  - {message}")
            return 1
        print("\nPASS  values match the recorded cross-product baseline")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
