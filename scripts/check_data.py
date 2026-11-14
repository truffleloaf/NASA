#!/usr/bin/env python3
"""Offline integrity and physical-invariant checks for bundled science assets."""
import hashlib
import json
import math
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]/'public/data'
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_schema import validate_all


def read(path):
    return json.loads(path.read_text())


def main():
    validate_all(ROOT)
    manifest = read(ROOT/'manifest.json')
    assert manifest['status'] == 'ready'
    header = read(ROOT/'terrain/polar-1024.json')
    terrain = (ROOT/'terrain/polar-1024.bin').read_bytes()
    assert len(terrain) == header['width']*header['height']*2 == 2097152
    assert hashlib.sha256(terrain).hexdigest() == header['binarySha256']
    assert header['minMeters'] < header['maxMeters'] and header['scaleMeters'] > 0
    for site in manifest['sites']:
        ephemeris = read(ROOT/Path(site['ephemeris']).relative_to('/data'))
        horizon = read(ROOT/Path(site['horizon']).relative_to('/data'))
        assert ephemeris['siteId'] == horizon['siteId'] == site['id']
        start = datetime.fromisoformat(ephemeris['start'].replace('Z','+00:00'))
        end = datetime.fromisoformat(ephemeris['end'].replace('Z','+00:00'))
        assert len(ephemeris['rows']) == (end-start).total_seconds()/3600+1 == 8761
        assert ephemeris['stepHours'] == 1
        for row in ephemeris['rows']:
            assert len(row) == 6 and all(math.isfinite(v) for v in row)
            for offset in (0,3):
                assert 0 <= row[offset] <= 360 and -90 <= row[offset+1] <= 90
            assert .45 < row[2] < .6 and 1.6 < row[5] < 2.2
        low, high = horizon['profiles']['2'], horizon['profiles']['20']
        assert len(low) == len(high) == 360
        assert all(math.isfinite(v) and -90 < v < 90 for v in low+high)
        assert all(a >= b for a,b in zip(low,high)), 'A taller mast cannot raise the obstruction angle.'
    imagery_meta = ROOT/'terrain/polar-1024-lroc.json'
    if imagery_meta.exists():
        imagery = read(imagery_meta)
        image = ROOT/Path(imagery['path']).relative_to('/data')
        assert image.is_file(), 'The bundled LROC imagery is missing.'
        assert imagery['width'] == imagery['height'] == 1024
        assert hashlib.sha256(image.read_bytes()).hexdigest() == imagery['sha256']
        assert imagery['provenance'] == 'Provided'
    validation = ROOT/'validation.json'
    if validation.exists():
        references = read(validation)['rows']
        assert len(references) == len(manifest['sites']) + 2
        for point in references:
            for event in ('sunrise','sunset'):
                if point[event] is not None:
                    gap = abs(point[event]['differenceSeconds'])
                    # Both crossings are linear interpolations inside the same hour, so
                    # any value is below 3600 s by construction: that bound can never
                    # fail. Five minutes is an actual accuracy claim about the hourly
                    # ephemeris against the one-minute reference.
                    assert gap < 300, (f"{point['id']} {event}: hourly interpolation is "
                                       f"{gap:.0f} s off the minute reference")
    print('Bundled terrain, ephemeris, horizon, and validation integrity checks passed.')


if __name__ == '__main__': main()
