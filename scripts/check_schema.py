#!/usr/bin/env python3
"""Validate public/data/ against the schema and the cross-file linkage rules.

Schema shape lives in schema/data-contract.schema.json. Physical invariants (binary size,
hash, row counts, mast monotonicity) stay in check_data.py; this file covers the contract
boundary: every bundled file validates, every manifest path resolves, and site ids agree.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from contract import ContractError, validate

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "public" / "data"


def _read(path: Path):
    return json.loads(path.read_text())


def _checked(path: Path, definition: str, data_dir: Path):
    value = _read(path)
    try:
        validate(value, definition)
    except ContractError as exc:
        raise ContractError(f"{path.relative_to(data_dir).as_posix()}: {exc}") from exc
    print(f"{path.relative_to(data_dir).as_posix()}: {definition} ok")
    return value


def validate_all(data_dir: Path = DEFAULT_DATA) -> int:
    manifest = _checked(data_dir / "manifest.json", "manifest", data_dir)
    if manifest["status"] != "ready":
        raise ContractError("manifest.json: a shipped manifest must have status 'ready'")
    for key in ("ephemerisProvenance", "visibilityProvenance"):
        if key not in manifest:
            raise ContractError(f"manifest.json: a shipped manifest must carry {key}")

    site_ids = [site["id"] for site in manifest["sites"]]
    if len(site_ids) != len(set(site_ids)):
        raise ContractError("manifest.json: site ids must be unique")

    terrain = _checked(data_dir / "terrain" / "polar-1024.json", "terrainHeader", data_dir)
    for key in ("terrain", "terrainHeader"):
        if not (data_dir / manifest[key].removeprefix("/data/")).is_file():
            raise ContractError(f"manifest.json: {key} path does not exist: {manifest[key]}")

    for site in manifest["sites"]:
        ephemeris = _checked(
            data_dir / site["ephemeris"].removeprefix("/data/"), "ephemeris", data_dir
        )
        horizon = _checked(
            data_dir / site["horizon"].removeprefix("/data/"), "horizon", data_dir
        )
        for name, value in (("ephemeris", ephemeris), ("horizon", horizon)):
            if value["siteId"] != site["id"]:
                raise ContractError(
                    f"{site['id']}: {name} siteId is {value['siteId']!r}, expected {site['id']!r}"
                )
        if abs(site["elevationMeters"] - horizon["siteElevationMeters"]) > 0.01:
            raise ContractError(
                f"{site['id']}: manifest elevation {site['elevationMeters']} does not match "
                f"horizon siteElevationMeters {horizon['siteElevationMeters']}"
            )
        start = datetime.fromisoformat(ephemeris["start"].replace("Z", "+00:00"))
        if start.year != manifest["year"]:
            raise ContractError(
                f"{site['id']}: ephemeris starts in {start.year}, manifest year is {manifest['year']}"
            )

    validation = _checked(data_dir / "validation.json", "validationReport", data_dir)
    reference_ids = {row["id"] for row in validation["rows"]}
    missing = [site["id"] for site in manifest["sites"] if site["id"] not in reference_ids]
    if missing:
        raise ContractError(f"validation.json: missing reference rows for {', '.join(missing)}")

    print(
        f"Contract ok: {len(manifest['sites'])} sites, terrain {terrain['width']}x{terrain['height']}, "
        f"{len(validation['rows'])} validation rows."
    )
    return 2 * len(manifest["sites"]) + 3


def _expect_failure(value, definition: str, label: str) -> None:
    try:
        validate(value, definition)
    except ContractError:
        print(f"self-test: rejected {label}")
        return
    raise AssertionError(f"self-test: accepted invalid {label}")


def self_test(data_dir: Path = DEFAULT_DATA) -> None:
    manifest = _read(data_dir / "manifest.json")
    ephemeris = _read(data_dir / "ephemeris" / "shackleton.json")
    horizon = _read(data_dir / "horizon" / "shackleton.json")
    report = _read(data_dir / "validation.json")

    missing_provenance = copy.deepcopy(manifest)
    missing_provenance["sites"][0].pop("provenance")
    _expect_failure(missing_provenance, "manifest", "site without provenance")

    short_row = copy.deepcopy(ephemeris)
    short_row["rows"][0] = short_row["rows"][0][:5]
    _expect_failure(short_row, "ephemeris", "five-column ephemeris row")

    short_profile = copy.deepcopy(horizon)
    short_profile["profiles"]["2"] = short_profile["profiles"]["2"][:-1]
    _expect_failure(short_profile, "horizon", "359-point skyline")

    missing_event = copy.deepcopy(report)
    event_row = next((row for row in missing_event["rows"] if isinstance(row.get("sunrise"), dict)), None)
    if event_row is None:
        raise AssertionError("self-test needs a shipped validation row with a sunrise event")
    event_row["sunrise"].pop("differenceSeconds")
    _expect_failure(missing_event, "validationReport", "event without differenceSeconds")

    unknown_unit = copy.deepcopy(ephemeris)
    unknown_unit["stepHours"] = 2
    _expect_failure(unknown_unit, "ephemeris", "two-hour ephemeris step")

    intermediate = copy.deepcopy(manifest)
    intermediate["status"] = "terrain-ready"
    intermediate.pop("ephemerisProvenance", None)
    intermediate.pop("visibilityProvenance", None)
    validate(intermediate, "manifest")
    print("self-test: accepted the terrain-ready intermediate manifest")
    print("Schema self-test passed.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test(args.data)
    else:
        validate_all(args.data)


if __name__ == "__main__":
    main()
