"""Guards for the ephemeris cache used when regenerating public/data.

The cache file name only carries the site id, so a stale response for the same
site but different coordinates would otherwise be reused silently and recorded
under the new query URL. Run with:

    python -m unittest discover -s backend/pipeline/tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts"))

import ephemeris  # noqa: E402

HEADER = """\
 Target body name: Sun (10)                        {{source: DE441}}
 Center geodetic : {lon}, {lat}, {alt}               {{E-lon(deg),Lat(deg),Alt(km)}}
$$SOE
 2026-Jan-01 00:00,*,i,32.5,-1.5,1800,
$$EOE
"""


def response(lon="0.0", lat="-89.9", alt=".6278") -> str:
    return HEADER.format(lon=lon, lat=lat, alt=alt)


class CacheProvenanceTests(unittest.TestCase):
    def url(self, lon, lat, altitude_m=629.8):
        return ephemeris.query(lat, lon, altitude_m, 10)

    def test_url_and_header_sites_are_parsed(self):
        url = self.url(0.0, -89.9, 629.8)
        self.assertEqual(ephemeris.requested_site(url), [0.0, -89.9, 0.6298])
        self.assertEqual(ephemeris.cached_site(response(alt=".6298")), [0.0, -89.9, 0.6298])

    def test_matching_cache_is_accepted(self):
        ephemeris.check_cached_response("shackleton-10-2026.txt",
                                        self.url(0.0, -89.9, 629.8),
                                        response(alt=".6298"))

    def test_east_longitude_normalisation_is_accepted(self):
        # de Gerlache is lon -68.7 in the manifest; Horizons prints 291.3.
        ephemeris.check_cached_response("de-gerlache-10-2026.txt",
                                        self.url(-68.7, -88.7, 1771.32),
                                        response(lon="291.3", lat="-88.7", alt="1.77132"))

    def test_moved_site_or_changed_elevation_is_rejected(self):
        url = self.url(0.0, -89.9, 629.8)
        cases = {
            "moved latitude": response(lat="-89.8", alt=".6298"),
            "moved longitude": response(lon="12.0", alt=".6298"),
            "changed elevation": response(alt=".629393"),
        }
        for label, raw in cases.items():
            with self.assertRaises(ValueError, msg=label):
                ephemeris.check_cached_response("shackleton-10-2026.txt", url, raw)

    def test_unparsable_header_is_not_rejected(self):
        ephemeris.check_cached_response("old.txt", self.url(0.0, -89.9, 629.8),
                                        "no header here\n$$SOE\n$$EOE\n")


if __name__ == "__main__":
    unittest.main()
