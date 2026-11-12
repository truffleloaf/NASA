#!/usr/bin/env python3
"""Compare hourly solar-zero interpolation to one-minute Horizons source samples.

This checks interpolation, not independent ephemeris or terrain accuracy.
"""
import argparse
import hashlib
import json
from datetime import timedelta
from pathlib import Path
from ephemeris import download, parse, query, write_json, START


def crossing(rows, rising):
    for (t0, r0), (t1, r1) in zip(rows, rows[1:]):
        a, b = r0[1], r1[1]
        if (a <= 0 < b) if rising else (a >= 0 > b):
            return t0 + (t1-t0)*(-a/(b-a)), t0, t1
    return None


def iso(time):
    return time.isoformat(timespec='seconds').replace('+00:00', 'Z')


def build(output, cache):
    manifest = json.loads((output/'manifest.json').read_text())
    sites = manifest['sites'] + [
        {'id':'reference-east','name':'East reference point','lat':-88.0,'lon':45.0,'elevationMeters':0},
        {'id':'reference-west','name':'West reference point','lat':-87.0,'lon':-90.0,'elevationMeters':0},
    ]
    records = []
    for site in sites:
        url = query(site['lat'],site['lon'],site['elevationMeters']+2,10)
        raw = download(url,cache/f"{site['id']}-10-2026.txt")
        hourly = parse(raw)
        record = {'id':site['id'],'name':site['name'],'lat':site['lat'],'lon':site['lon'],
                  'observerAltitudeMeters':site['elevationMeters']+2,
                  'hourlySourceUrl':url,'hourlySourceSha256':hashlib.sha256(raw.encode()).hexdigest()}
        for kind, rising in [('sunrise',True),('sunset',False)]:
            event = crossing(hourly,rising)
            if event is None:
                record[kind] = None
                record[kind+'UnavailableReason'] = 'No solar-centre zero-elevation crossing in the reference year.'
                continue
            estimate,t0,t1 = event
            fine_url = query(site['lat'],site['lon'],site['elevationMeters']+2,10,
                             t0.strftime('%Y-%m-%d %H:%M'),t1.strftime('%Y-%m-%d %H:%M'),'1 m')
            fine_raw = download(fine_url,cache/f"{site['id']}-{kind}-minute.txt")
            fine = crossing(parse(fine_raw),rising)
            if fine is None: raise ValueError('Hourly event absent from minute reference samples.')
            record[kind] = {'hourlyInterpolatedUtc':iso(estimate),'horizonsMinuteInterpolatedUtc':iso(fine[0]),
                            'differenceSeconds':round((estimate-fine[0]).total_seconds(),3),
                            'sourceUrl':fine_url,'sourceSha256':hashlib.sha256(fine_raw.encode()).hexdigest()}
        records.append(record)
        print(site['id'],'reference crossings checked',flush=True)
    write_json(output/'validation.json',{'version':1,'provenance':'Estimated',
        'method':'Linear interpolation of solar-centre elevation through 0 degrees: hourly Horizons data versus separately queried one-minute Horizons data.',
        'source':'NASA/JPL Horizons DE441 apparent airless observer ephemeris',
        'documentation':'https://ssd.jpl.nasa.gov/horizons/manual.html','rows':records,
        'limitations':['This is a sampling/interpolation consistency check against the same ephemeris, not independent model validation.',
                       'Zero-elevation solar-centre crossings use a flat astronomical horizon; they are not terrain sunrise/sunset or upper-limb contacts.',
                       'Reference-east and reference-west use 2m above the reference sphere and are numerical test points, not surface operating sites.',
                       'The first rising and first setting crossing in 2026 are selected independently and may belong to different lunations.']})


def self_test():
    rows = [(START,[0,-1,.5]),(START+timedelta(hours=1),[0,3,.5])]
    assert crossing(rows,True)[0] == START+timedelta(minutes=15)
    assert crossing(rows,False) is None
    assert crossing([(t,[0,-r[1],.5]) for t,r in rows],False)[0] == START+timedelta(minutes=15)
    print('reference crossing interpolation checks passed')


if __name__ == '__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=Path('public/data'));p.add_argument('--cache',type=Path,default=Path('work/data-source'));p.add_argument('--self-test',action='store_true');args=p.parse_args()
    if args.self_test:self_test()
    else:build(args.output,args.cache)
