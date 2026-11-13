#!/usr/bin/env python3
"""Resample the LROC WAC south-pole summer mosaic onto the bundled terrain grid.

Source: NASA/GSFC/ASU LROC WAC_ROI_SOUTH_SUMMER_128P (128 px/deg, 236.901 m/px),
a shadow-minimised mosaic of images acquired 2010-09-21 through 2010-10-23.
The 608 km square covered by public/data/terrain/polar-1024.bin is cropped from
the mosaic centre and resampled to 1024 x 1024. Orientation is taken from the
GeoTIFF georeferencing: polar stereographic, natural origin at 90 S / 0 E,
R = 1,737,400 m, north-up, which is the same convention as the terrain grid, so
no rotation or mirror is applied. `--report-alignment` prints a coarse
correlation against a LOLA hillshade for information only.

Usage: python scripts/imagery.py --source work/data-source/WAC_ROI_SOUTH_SUMMER_128P.TIF
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps

Image.MAX_IMAGE_PIXELS = None

SOURCE_URL = 'https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/BROWSE/WAC_ROI/WAC_ROI_SOUTH_SUMMER/WAC_ROI_SOUTH_SUMMER_128P.TIF'
SOURCE_MPP = 236.90117518866
EXTENT_M = 608_000.0
SIZE = 1024
ACQUISITION = '2010-09-21 through 2010-10-23 (southern summer, sub-solar latitude near 1.5 S)'
CREDIT = 'NASA/GSFC/Arizona State University, LROC WAC south-pole summer mosaic; Speyerer et al. (2020), Lunar Surface Science Workshop abstract 5132.'


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def alignment_report(image, dem_path):
    """Coarse, illumination-dependent sanity check. Never changes the output."""
    header = json.loads((Path(dem_path).parent / 'polar-1024.json').read_text())
    raw = np.fromfile(dem_path, dtype='<u2').reshape(header['height'], header['width'])
    dem = header['minMeters'] + raw.astype(np.float32) * header['scaleMeters']
    dem = np.asarray(Image.fromarray(dem).resize((256, 256), Image.Resampling.BILINEAR), dtype=np.float32)
    img = np.asarray(image.resize((256, 256), Image.Resampling.LANCZOS), dtype=np.float32)
    mpp = EXTENT_M / 256
    gy, gx = np.gradient(dem, mpp)
    normal = np.sqrt(gx * gx + gy * gy + 1.0)
    light = (0.0, -0.94, 0.34)
    shade = (-gx * light[0] - gy * light[1] + light[2]) / normal
    shade = (shade - shade.min()) / (shade.max() - shade.min()) * 255
    shade = np.asarray(
        Image.fromarray(shade.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32
    )
    img = np.asarray(
        Image.fromarray(img.astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), dtype=np.float32
    )
    a = (img - img.mean()) / (img.std() or 1.0)
    b = (shade - shade.mean()) / (shade.std() or 1.0)
    return float((a * b).mean())


def build(source, output, dem_path=None, report_alignment=False):
    image = Image.open(source)
    if image.mode != 'L':
        image = image.convert('L')
    width, height = image.size
    if width != height:
        raise ValueError(f'Expected a square polar mosaic, got {width} x {height}.')
    crop_size = int(round(EXTENT_M / SOURCE_MPP))
    if crop_size % 2:
        crop_size += 1
    if crop_size > width:
        raise ValueError('Source mosaic is smaller than the requested 608 km square.')
    left = (width - crop_size) // 2
    crop = ImageOps.autocontrast(image.crop((left, left, left + crop_size, left + crop_size)), cutoff=1)
    resized = crop.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    score = None
    if report_alignment and dem_path is not None:
        score = alignment_report(resized, dem_path)
        print(f'coarse alignment correlation with LOLA hillshade: {score:.3f} (information only)')

    terrain = Path(output) / 'terrain'
    terrain.mkdir(parents=True, exist_ok=True)
    image_path = terrain / 'polar-1024-lroc.jpg'
    resized.save(image_path, 'JPEG', quality=88, optimize=True, progressive=True)
    metadata = {
        'version': 1,
        'path': '/data/terrain/polar-1024-lroc.jpg',
        'width': SIZE,
        'height': SIZE,
        'sha256': sha256(image_path),
        'grid': 'Same pixel grid as terrain/polar-1024.bin: row 0 is +Y (0 E), columns increase toward +X (90 E).',
        'source': {
            'name': 'NASA/GSFC/ASU LROC WAC south-pole summer mosaic, WAC_ROI_SOUTH_SUMMER_128P',
            'url': SOURCE_URL,
            'sha256': sha256(source),
            'nativePixelsPerDegree': 128,
            'metersPerPixel': round(SOURCE_MPP, 6),
            'acquisition': ACQUISITION,
            'sourceSize': [width, height],
            'cropPixels': crop_size,
            'georeferencing': 'GeoTIFF GeoKeys: polar stereographic, natural origin 90 S / 0 E, R = 1,737,400 m, north-up tiepoint at (-1,439,293 m, +1,439,293 m).',
        },
        'processing': 'Centre 608 km square cropped, autocontrast (1% cutoff), Lanczos resample to 1024 x 1024, JPEG quality 88.',
        'orientation': {'rotationDegrees': 0, 'mirrored': False, 'basis': 'GeoTIFF georeferencing matches the terrain grid; no rotation or mirror applied.'},
        'alignmentReport': None if score is None else round(score, 3),
        'credit': CREDIT,
        'license': 'NASA/GSFC/ASU LROC imagery; free to use with credit. Not a NASA endorsement of this project.',
        'provenance': 'Provided',
        'limitations': [
            'Imagery is context only: it is not used for any direction, elevation, horizon or window calculation.',
            'Illumination is fixed to the 2010 southern summer mosaic; shadows baked into the image are not the simulated date.',
            'The mosaic is 236.901 m/px and was resampled to 593.75 m/px display pixels, so fine surface detail is not resolved.',
            'Grayscale 643 nm WAC band; values are display-stretched, not calibrated reflectance.',
            'Mosaic seams and exposure differences between the contributing WAC frames remain.',
        ],
    }
    (terrain / 'polar-1024-lroc.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'wrote {image_path} ({image_path.stat().st_size} bytes)')


def self_test():
    assert SIZE == 1024 and abs(EXTENT_M / SOURCE_MPP - 2566.5) < 1.0
    print('imagery self-test passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--output', type=Path, default=Path('public/data'))
    parser.add_argument('--dem', type=Path, default=Path('public/data/terrain/polar-1024.bin'))
    parser.add_argument('--report-alignment', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    elif args.source:
        build(args.source, args.output, args.dem, args.report_alignment)
    else:
        parser.error('--source is required (or use --self-test)')
