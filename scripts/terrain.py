#!/usr/bin/env python3
"""Build a compact polar terrain asset and estimated horizon masks from LOLA PDS3.

Usage: python scripts/terrain.py --source work/data-source/LDEM_80S_80M.IMG
Requires numpy (offline preprocessing only). Does not fetch data.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import numpy as np

RADIUS_M = 1737400.0
SOURCE_SIZE = 7600
SOURCE_MPP = 80.0
EXTENT_M = SOURCE_SIZE * SOURCE_MPP
SOURCE_URL = 'https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.IMG'
SITES = [
    {'id': 'shackleton', 'name': 'Shackleton region', 'lat': -89.9, 'lon': 0.0},
    {'id': 'malapert', 'name': 'Malapert Massif', 'lat': -85.99, 'lon': 2.3},
    {'id': 'de-gerlache', 'name': 'de Gerlache region', 'lat': -88.7, 'lon': -68.7},
]

def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def polar_xy(lat, lon):
    """South polar stereographic: +Y points to 0E; +X toward 90E."""
    lat, lon = np.deg2rad(lat), np.deg2rad(lon)
    rho = 2 * RADIUS_M * np.tan((math.pi / 2 + lat) / 2)
    return rho * np.sin(lon), rho * np.cos(lon)

def sample(dem, lat, lon):
    x, y = polar_xy(lat, lon)
    col = (x + EXTENT_M / 2) / SOURCE_MPP - 0.5
    row = (EXTENT_M / 2 - y) / SOURCE_MPP - 0.5
    c, r = np.floor(col).astype(int), np.floor(row).astype(int)
    if np.any(c < 0) or np.any(r < 0) or np.any(c + 1 >= SOURCE_SIZE) or np.any(r + 1 >= SOURCE_SIZE):
        raise ValueError('Horizon ray exceeds the source DEM. Do not extrapolate.')
    fx, fy = col - c, row - r
    return 0.5 * ((1-fx)*(1-fy)*dem[r,c] + fx*(1-fy)*dem[r,c+1] + (1-fx)*fy*dem[r+1,c] + fx*fy*dem[r+1,c+1])

def unit_xyz(lat, lon):
    lat, lon = np.deg2rad(lat), np.deg2rad(lon)
    return np.stack((np.cos(lat)*np.cos(lon), np.cos(lat)*np.sin(lon), np.sin(lat)), axis=-1)

def horizon_profiles(dem, site):
    lat, lon = math.radians(site['lat']), math.radians(site['lon'])
    altitude = float(sample(dem, site['lat'], site['lon']))
    up = unit_xyz(site['lat'], site['lon'])
    profiles = {'2': [], '20': []}
    # shortcut: 80m terrain cannot resolve local slopes or metre-scale mast improvements; use surveyed local DEMs for operational work.
    distances = np.arange(80., 150000.1, 80.)
    angle = distances / RADIUS_M
    for az in range(360):
        bearing = math.radians(az)
        target_lat = np.arcsin(math.sin(lat)*np.cos(angle) + math.cos(lat)*np.sin(angle)*math.cos(bearing))
        target_lon = lon + np.arctan2(math.sin(bearing)*np.sin(angle)*math.cos(lat), np.cos(angle)-math.sin(lat)*np.sin(target_lat))
        target_elevation = sample(dem, np.rad2deg(target_lat), np.rad2deg(target_lon))
        targets = unit_xyz(np.rad2deg(target_lat), np.rad2deg(target_lon)) * (RADIUS_M + target_elevation)[:,None]
        for mast in (2, 20):
            delta = targets - up*(RADIUS_M + altitude + mast)
            vertical = np.sum(delta * up, axis=1)
            horizontal = np.linalg.norm(delta - vertical[:,None]*up, axis=1)
            profiles[str(mast)].append(round(float(np.max(np.rad2deg(np.arctan2(vertical, horizontal)))), 4))
    return altitude, profiles

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':'), allow_nan=False) + '\n')

def build(source, output):
    if source.stat().st_size != SOURCE_SIZE * SOURCE_SIZE * 2:
        raise ValueError('Expected a 7600 x 7600 LSB_INTEGER 16-bit PDS image (115520000 bytes).')
    dem = np.memmap(source, dtype='<i2', mode='r', shape=(SOURCE_SIZE,SOURCE_SIZE))
    source_hash = sha256(source)
    size = 1024
    edges = np.floor(np.linspace(0, SOURCE_SIZE, size+1)).astype(int)
    widths = np.diff(edges)
    resized = np.empty((size,size), dtype=np.float64)
    for row in range(size):
        row_sum = np.sum(dem[edges[row]:edges[row+1]], axis=0, dtype=np.int64)
        resized[row] = np.add.reduceat(row_sum, edges[:-1]) / widths / (edges[row+1]-edges[row]) * .5
    low, high = float(resized.min()), float(resized.max())
    scale = (high-low)/65535
    encoded = np.rint((resized-low)/scale).astype('<u2')
    terrain = output/'terrain'; terrain.mkdir(parents=True, exist_ok=True)
    binary = terrain/'polar-1024.bin'; encoded.tofile(binary)
    header = {
        'version':1,'width':size,'height':size,'encoding':'uint16-le','minMeters':round(low,6),
        'maxMeters':round(high,6),'scaleMeters':scale,'kmPerPixel':EXTENT_M/size/1000,
        'extentKm':EXTENT_M/1000,'boundsKm':[-304,-304,304,304],'validRadiusKm':2*RADIUS_M*math.tan(math.radians(5))/1000,
        'referenceRadiusKm':RADIUS_M/1000,'projection':'south polar stereographic, spherical, true scale at -90 deg',
        'orientation':'row-major; row 0 is +Y (0 deg E); columns increase +X (90 deg E); +Y points north at longitude 0',
        'latitudeCoverage':[-90,-80],'referenceFrame':'Mean Earth / Polar Axis of DE421',
        'resampling':'Area mean of 7-8 original pixels per axis, quantized to uint16; nominal output pixel 593.75m',
        'source':{'name':'NASA LRO LOLA LDEM_80S_80M V2.0','url':SOURCE_URL,'labelUrl':SOURCE_URL.replace('.IMG','.LBL'),'sha256':source_hash,'originalMetersPerPixel':80,'sourceEpoch':'2009-07-13 through 2017-02-02'},
        'provenance':'Computed','binarySha256':sha256(binary),'limitations':['Display resolution is approximately594m/pixel.','Render only the valid80-90S polar disc; square corners lie outside the stated latitude coverage.','Terrain is sampled topography, not an operational landing hazard map.']
    }
    write_json(terrain/'polar-1024.json',header)
    manifest_sites=[]
    for site in SITES:
        elevation, profiles = horizon_profiles(dem, site)
        body = {'version':1,'siteId':site['id'],'azimuthStepDegrees':1,'mastHeightsMeters':[2,20],'profiles':profiles,'provenance':'Estimated','source':header['source'],
          'method':'Maximum apparent elevation along great-circle rays with spherical lunar curvature; bilinear samples from original80m DEM; azimuth clockwise from geographic north.',
          'rayStepMeters':80,'rayLimitKm':150,'siteElevationMeters':round(elevation,2),
          'limitations':['Subpixel terrain and local hazards are unresolved.','No obstructions beyond150km assessed.','2-20m mast comparison is a sensitivity estimate, not a validated mast benefit.','Approximate site coordinates do not define validated landing locations.','Horizons MEAN_ME and LOLA DE421 ME/PA frames are not explicitly transformed; residual frame offsets are unquantified.']}
        write_json(output/'horizon'/f"{site['id']}.json",body)
        manifest_sites.append({**site,'elevationMeters':round(elevation,2),'provenance':'Estimated','ephemeris':f"/data/ephemeris/{site['id']}.json",'horizon':f"/data/horizon/{site['id']}.json"})
    write_json(output/'manifest.json',{'version':1,'year':2026,'terrain':'/data/terrain/polar-1024.bin','terrainHeader':'/data/terrain/polar-1024.json','sites':manifest_sites,'status':'terrain-ready','provenance':'Estimated'})
    reconstructed = encoded.astype(float)*scale+low
    assert np.max(np.abs(reconstructed-resized)) <= scale*.501
    assert encoded.size == 1024*1024 and binary.stat().st_size == 2097152
    for site in manifest_sites: print(site['id'],site['elevationMeters'])
    print('Terrain and horizon masks written:', output)

def self_test():
    x,y=polar_xy(-90,0);assert abs(x)<1e-8 and abs(y)<1e-8
    x,y=polar_xy(-80,0);assert abs(x)<1e-8 and 303000<y<305000
    x,y=polar_xy(-80,90);assert 303000<x<305000 and abs(y)<1e-8
    v=unit_xyz(-90,0);assert np.allclose(v,[0,0,-1])
    assert math.isclose(EXTENT_M/1024/1000,.59375)
    print('terrain coordinate and encoding checks passed')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path);parser.add_argument('--output',type=Path,default=Path('public/data'));parser.add_argument('--self-test',action='store_true');args=parser.parse_args()
    if args.self_test:self_test()
    elif args.source:build(args.source,args.output)
    else:parser.error('--source is required (or use --self-test)')
