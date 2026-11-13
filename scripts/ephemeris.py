#!/usr/bin/env python3
"""Fetch JPL Horizons ONCE during data preparation; ship compact hourly JSON.
No application runtime network access is introduced. Raw response cache lives in work/.
Usage: python scripts/ephemeris.py [--self-test]
"""
import argparse
import csv
import hashlib
import io
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
import urllib.parse
import urllib.request
from contract import validate

START = datetime(2026,1,1,tzinfo=timezone.utc)
END = datetime(2027,1,1,tzinfo=timezone.utc)
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'


def query(lat, lon, altitude_m, target, start='2026-01-01', end='2027-01-01', step='1 h'):
    params={'format':'text','COMMAND':f"'{target}'",'EPHEM_TYPE':"'OBSERVER'",'CENTER':"'coord@301'",'COORD_TYPE':"'GEODETIC'",'SITE_COORD':f"'{lon},{lat},{altitude_m/1000:.6f}'",'START_TIME':f"'{start}'",'STOP_TIME':f"'{end}'",'STEP_SIZE':f"'{step}'",'QUANTITIES':"'4,13'",'CSV_FORMAT':"'YES'",'ANG_FORMAT':"'DEG'",'APPARENT':"'AIRLESS'",'CAL_FORMAT':"'CAL'",'TIME_DIGITS':"'MINUTES'"}
    return API+'?'+urllib.parse.urlencode(params)


def download(url, cache):
    if cache.exists(): raw=cache.read_text()
    else:
        request=urllib.request.Request(url,headers={'User-Agent':'LunarMissionNavigator-offline-data/1.0'})
        with urllib.request.urlopen(request,timeout=120) as response: raw=response.read().decode()
        if '$$SOE' not in raw or '$$EOE' not in raw: raise ValueError(raw[-1800:])
        cache.parent.mkdir(parents=True,exist_ok=True); cache.write_text(raw)
    if '$$SOE' not in raw or '$$EOE' not in raw: raise ValueError('Cached response is not an ephemeris.')
    return raw


def parse(raw):
    body=raw.split('$$SOE',1)[1].split('$$EOE',1)[0].strip()
    rows=[]
    for cols in csv.reader(io.StringIO(body)):
        time=datetime.strptime(cols[0].strip(),'%Y-%b-%d %H:%M').replace(tzinfo=timezone.utc)
        az,el,diam=map(float,cols[3:6])
        if not all(math.isfinite(v) for v in (az,el,diam)) or not 0<=az<=360 or not -90<=el<=90 or not 0<diam<360*3600: raise ValueError('Invalid ephemeris quantity.')
        rows.append((time,[round(az,5),round(el,5),round(diam/3600,6)]))
    return rows


def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,separators=(',',':'),allow_nan=False)+'\n')


def build(output, cache):
    manifest=json.loads((output/'manifest.json').read_text())
    for site in manifest['sites']:
        bodies=[];sources=[]
        for target,label in [(10,'Sun'),(399,'Earth')]:
            url=query(site['lat'],site['lon'],site['elevationMeters']+2,target)
            raw=download(url,cache/f"{site['id']}-{target}-2026.txt")
            rows=parse(raw)
            expected=int((END-START).total_seconds()/3600)+1
            if len(rows)!=expected or any(t!=START+timedelta(hours=i) for i,(t,_) in enumerate(rows)): raise ValueError('Missing/non-hourly ephemeris sample.')
            bodies.append([r for _,r in rows]);sources.append({'body':label,'url':url,'sha256':hashlib.sha256(raw.encode()).hexdigest(),'apiVersion':raw.splitlines()[0].replace('API VERSION: ','')})
        packed=[sun+earth for sun,earth in zip(*bodies)]
        body={'version':1,'siteId':site['id'],'start':START.isoformat().replace('+00:00','Z'),'end':END.isoformat().replace('+00:00','Z'),'stepHours':1,'fields':['sunAzimuthDegrees','sunElevationDegrees','sunDiameterDegrees','earthAzimuthDegrees','earthElevationDegrees','earthDiameterDegrees'],'rows':packed,'provenance':'Computed','source':{'name':'NASA/JPL Horizons, DE441','documentation':'https://ssd.jpl.nasa.gov/horizons/manual.html','queries':sources,'observer':{'center':'coord@301','coordinateType':'GEODETIC','latitudeDegrees':site['lat'],'eastLongitudeDegrees':site['lon'],'altitudeMeters':site['elevationMeters']+2},'coordinates':'Apparent airless azimuth/elevation, azimuth clockwise from north; angular diameters converted from arcseconds to degrees; UTC timestamps.'},'limitations':['Ephemeris directions are computed source values; terrain visibility and sampled intervals remain estimates.','One-hour samples do not resolve sub-hour visibility transitions.','Observer directions use2m above the sampled terrain; changing mast height changes horizon obstruction only (tiny18m observer parallax ignored).','No atmospheric refraction; no diffraction, link budget, relay spacecraft, solar panels, or terrain uncertainty model.']}
        validate(body, 'ephemeris')
        write_json(output/'ephemeris'/f"{site['id']}.json",body)
        print(site['id'],len(packed),'hourly samples',flush=True)
    manifest['status']='ready';manifest['ephemerisProvenance']='Computed';manifest['visibilityProvenance']='Estimated'
    validate(manifest, 'manifest')
    write_json(output/'manifest.json',manifest)


def self_test():
    raw='$$SOE\n 2026-Jan-01 00:00,*,i,32.5,-1.5,1800,\n$$EOE'
    result=parse(raw)
    assert result==[(START,[32.5,-1.5,.5])]
    assert 'coord%40301' in query(-89.9,0,2,10)
    try:parse(raw.replace('32.5','nan'));raise AssertionError('NaN accepted')
    except ValueError:pass
    print('ephemeris parsing, units, and source query checks passed')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,default=Path('public/data'));p.add_argument('--cache',type=Path,default=Path('work/data-source'));p.add_argument('--self-test',action='store_true');args=p.parse_args()
    if args.self_test:self_test()
    else:build(args.output,args.cache)
