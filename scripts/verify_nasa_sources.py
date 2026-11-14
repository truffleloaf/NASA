#!/usr/bin/env python3
"""Verify shipped rows against original Horizons responses; publish a compact audit.

Run --refresh to request the six recorded annual queries again. Downloads happen
only during preparation, never in the application. No scientific values are rewritten.
"""
import argparse
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import urlopen

from ephemeris import parse, query, write_json


TEXT_SUFFIXES = {'.json', '.lbl', '.txt', '.csv'}


def digest(content):
    return hashlib.sha256(content).hexdigest()


def digest_asset(path):
    """Hash a shipped asset with line endings canonicalised to LF.

    Git stores these files with LF, but a Windows checkout with core.autocrlf
    rewrites text files to CRLF, so hashing the working-tree bytes would record
    a digest that no Linux checkout or static host can reproduce. Text assets
    are therefore normalised; binary assets (.bin, .jpg) are hashed as-is.
    """
    content = path.read_bytes()
    if path.suffix.lower() in TEXT_SUFFIXES:
        content = content.replace(b'\r\n', b'\n')
    return digest(content)


def compare_rows(raw, packed, offset, start):
    rows = parse(raw)
    if len(rows) != len(packed):
        raise ValueError('Source and bundled row counts differ')
    for i, (time, values) in enumerate(rows):
        if time != start + timedelta(hours=i) or values != packed[i][offset:offset + 3]:
            raise ValueError(f'Source differs from bundled data at row {i}')
    return len(rows)


def main(refresh):
    root = Path(__file__).resolve().parents[1]
    assets = root / 'public/data'
    cache = root / 'work/data-source'
    manifest = json.loads((assets / 'manifest.json').read_text())
    terrain = json.loads((assets / 'terrain/polar-1024.json').read_text())
    source = cache / 'LDEM_80S_80M.IMG'
    if digest(source.read_bytes()) != terrain['source']['sha256']:
        raise ValueError('Original LOLA DEM does not match the recorded source hash')
    sites = []
    for site in manifest['sites']:
        ephemeris = json.loads((root / 'public' / site['ephemeris'].lstrip('/')).read_text())
        start = datetime.fromisoformat(ephemeris['start'].replace('Z', '+00:00'))
        checks = []
        for offset, target, body in [(0, 10, 'Sun'), (3, 399, 'Earth')]:
            provenance = next(q for q in ephemeris['source']['queries'] if q['body'] == body)
            expected = query(site['lat'], site['lon'], site['elevationMeters'] + 2, target)
            if provenance['url'] != expected:
                raise ValueError(f"{site['id']}: query does not describe the selected observer")
            # ephemeris.py hashes the newline-normalised text it read from the cache, so
            # normalise here as well; raw CRLF bytes would give a different digest on
            # Windows than on the machine that generated the assets.
            original = (cache / f"{site['id']}-{target}-2026.txt").read_text()
            if digest(original.encode()) != provenance['sha256']:
                raise ValueError('Original Horizons response hash mismatch')
            compare_rows(original, ephemeris['rows'], offset, start)
            raw = original
            if refresh:
                with urlopen(expected, timeout=120) as response:
                    raw = response.read().decode().replace('\r\n', '\n')
                (cache / f"verified-{site['id']}-{target}-2026.txt").write_text(raw)
            count = compare_rows(raw, ephemeris['rows'], offset, start)
            checks.append({'body': body, 'url': expected, 'rowsCompared': count,
                           'responseSha256': digest(raw.encode()),
                           'originalResponseSha256': digest(original.encode())})
            print(site['id'], body, count, 'source rows match', flush=True)
        sites.append({'id': site['id'], 'name': site['name'], 'observer': ephemeris['source']['observer'],
                      'start': ephemeris['start'], 'end': ephemeris['end'], 'queries': checks})
    paths = ['manifest.json', 'terrain/polar-1024.bin', 'terrain/polar-1024.json',
             'terrain/source.LBL', 'terrain/polar-1024-lroc.jpg', 'terrain/polar-1024-lroc.json',
             'validation.json']
    paths += [site[key].removeprefix('/data/') for site in manifest['sites'] for key in ('ephemeris', 'horizon')]
    write_json(assets / 'source-audit.json', {
        'version': 1, 'checkedAtUtc': datetime.now(timezone.utc).isoformat(),
        'mode': 'fresh-horizons-responses' if refresh else 'original-cached-responses',
        'provenance': 'Computed', 'sites': sites,
        'terrainSource': terrain['source'],
        'assets': {f'/data/{p}': digest_asset(assets / p) for p in paths},
        'limitations': ['Source equality and file integrity do not establish flight accuracy.',
                        'Windows and mast effects remain estimates from terrain horizons and hourly samples.',
                        'Terrain source hash checked against the original local NASA LOLA product.']})


def self_test():
    raw = '$$SOE\n 2026-Jan-01 00:00,*,i,32.5,-1.5,1800,\n$$EOE'
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert compare_rows(raw, [[32.5, -1.5, .5]], 0, start) == 1
    for values, date in [([[32.5, -1.4, .5]], start), ([], start),
                         ([[32.5, -1.5, .5]], start + timedelta(hours=1))]:
        try:
            compare_rows(raw, values, 0, date)
        except ValueError:
            continue
        raise AssertionError('Source mismatch was accepted')
    print('Source comparison rejects changed values, missing rows and shifted timestamps.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        main(args.refresh)
