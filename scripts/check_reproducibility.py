#!/usr/bin/env python3
"""Recompute the bundled terrain horizons from source and compare with the committed assets.

Usage:
    python scripts/check_reproducibility.py --source work/data-source/LDEM_80S_80M.IMG

Requires numpy, like `terrain.py`: this is offline preparation glue, not a runtime dependency.

What this proves, and what it does not
--------------------------------------
It proves that `public/data/horizon/*.json` is what `scripts/terrain.py` produces from the
published LDEM_80S_80M source, byte for byte within storage rounding. If the source file, the
ray parameters or the generator drift, this fails. The comparison imports the generator's own
`horizon_profiles()` rather than reimplementing it: the question here is "do the committed
assets still match the committed code", not "is the code correct". A second, independent
implementation would answer a different question badly.

It does not prove the horizons are physically right. That is the known-geography test.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import terrain  # noqa: E402

TOLERANCE_DEG = 0.01        # assets store four decimals; anything above is a real drift
ELEVATION_TOLERANCE_M = 0.005  # assets store elevation rounded to centimetres


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True,
                        help="LDEM_80S_80M.IMG (7600 x 7600, 16-bit little-endian)")
    parser.add_argument("--assets", type=Path, default=Path("public/data"),
                        help="bundled asset root, default public/data")
    args = parser.parse_args()

    expected_bytes = terrain.SOURCE_SIZE * terrain.SOURCE_SIZE * 2
    actual_bytes = args.source.stat().st_size
    if actual_bytes != expected_bytes:
        raise SystemExit(f"{args.source} is {actual_bytes} bytes, expected {expected_bytes}")

    print(f"source  {args.source}")
    print(f"        {actual_bytes:,} bytes, sha256 {sha256(args.source)}")

    dem = np.memmap(args.source, dtype="<i2", mode="r",
                    shape=(terrain.SOURCE_SIZE, terrain.SOURCE_SIZE))

    failures: list[str] = []
    rows: list[tuple[str, float, int, float, float, str]] = []

    for site in terrain.SITES:
        site_id = site["id"]
        asset_path = args.assets / "horizon" / f"{site_id}.json"
        committed = json.loads(asset_path.read_text(encoding="utf-8"))

        recorded_hash = committed.get("source", {}).get("sha256")
        if recorded_hash != sha256(args.source):
            failures.append(f"{site_id}: source sha256 does not match the asset")
        for key, expected in (("rayStepMeters", 80), ("rayLimitKm", 150),
                              ("azimuthStepDegrees", 1)):
            if committed.get(key) != expected:
                failures.append(f"{site_id}: asset records {key}={committed.get(key)!r}, "
                                f"generator uses {expected}")

        elevation, profiles = terrain.horizon_profiles(dem, site)
        elevation_delta = abs(elevation - float(committed["siteElevationMeters"]))

        bins = len(profiles["2"])
        deltas: list[float] = []
        for mast in ("2", "20"):
            recomputed = np.asarray(profiles[mast], dtype=float)
            stored = np.asarray(committed["profiles"][mast], dtype=float)
            if recomputed.shape != stored.shape:
                failures.append(f"{site_id}: {mast} m profile has {recomputed.size} bins, "
                                f"asset has {stored.size}")
                deltas.append(float("nan"))
                continue
            delta = float(np.max(np.abs(recomputed - stored)))
            deltas.append(delta)
            if delta > TOLERANCE_DEG:
                worst = int(np.argmax(np.abs(recomputed - stored)))
                failures.append(f"{site_id}: {mast} m profile differs by {delta:.4f}° "
                                f"at azimuth {worst}°")

        if elevation_delta > ELEVATION_TOLERANCE_M:
            failures.append(f"{site_id}: site elevation differs by {elevation_delta:.4f} m")

        status = "PASS" if not any(f.startswith(site_id) for f in failures) else "FAIL"
        rows.append((site_id, elevation_delta, bins, deltas[0], deltas[1], status))

    print()
    print(f"{'site':<14}{'elev Δ m':>10}{'bins':>6}{'2 m max Δ°':>13}{'20 m max Δ°':>14}  result")
    for site_id, elev_delta, bins, d2, d20, status in rows:
        print(f"{site_id:<14}{elev_delta:>10.4f}{bins:>6}{d2:>13.4f}{d20:>14.4f}  {status}")
    print()

    if failures:
        print("FAIL")
        for message in failures:
            print(f"  - {message}")
        return 1
    print(f"PASS  all profiles reproduce within {TOLERANCE_DEG}° of the committed assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
