"""Unit tests for the offline terrain pipeline.

These need neither the 100 MB LOLA rasters nor network access: the skyline test
drives ``horizon_profile`` with an analytic ramp surface, so CI runs the whole
file in well under a second.  Run with:

    python -m unittest discover -s backend/pipeline/tests -v
"""

from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import dem as demmod  # noqa: E402
import horizon  # noqa: E402
import horizons  # noqa: E402
import intervals  # noqa: E402

R = horizon.R_MOON_M


class IntervalTests(unittest.TestCase):
    def test_runs(self):
        mask = [False, True, True, True, False, True, True]
        self.assertEqual(intervals.runs(mask), [(1, 4), (5, 7)])
        self.assertEqual(intervals.runs([]), [])
        self.assertEqual(intervals.runs([True, True, True]), [(0, 3)])
        self.assertEqual(intervals.runs([False, False]), [])

    def test_run_hours_and_longest(self):
        mask = [True, True, False, True, True, True, True]
        self.assertEqual(intervals.run_hours(mask, 0.5), [1.0, 2.0])
        self.assertEqual(intervals.longest_hours(mask, 0.5), 2.0)
        self.assertEqual(intervals.longest_hours([False, False], 1.0), 0.0)

    def test_gap_hours_is_the_gap_not_the_run_difference(self):
        # Regression: gap_hours used to return run[1] - run[0] = 3h - 2h = 1h.
        mask = [True, True, False, False, False, True]
        self.assertEqual(intervals.gaps(mask), [(2, 5)])
        self.assertEqual(intervals.gap_hours(mask, 1.0), [3.0])
        self.assertEqual(intervals.longest_gap_hours(mask, 1.0), 3.0)

    def test_gap_hours_two_gaps(self):
        mask = [True, False, True, True, False, False, True]
        self.assertEqual(intervals.gaps(mask), [(1, 2), (4, 6)])
        self.assertEqual(intervals.gap_hours(mask, 0.5), [0.5, 1.0])

    def test_gap_hours_ignores_window_edges(self):
        # Leading/trailing invisible stretches may extend beyond the window and
        # are reported through truncates(), not counted as an interior gap.
        mask = [False, False, True, False, True, True, False]
        self.assertEqual(intervals.gap_hours(mask, 1.0), [1.0])

    def test_gap_hours_is_never_negative(self):
        for mask in ([True, False, False, True, True, True, False],
                     [True] * 5,
                     [False] * 5,
                     [True, False, True, False, True]):
            gaps = intervals.gap_hours(mask, 1.0)
            self.assertTrue(all(h >= 0.0 for h in gaps), mask)

    def test_coverage_total_and_truncation(self):
        mask = [True, True, False, True]
        self.assertAlmostEqual(intervals.coverage(mask), 0.75)
        self.assertAlmostEqual(intervals.total_hours(mask, 6.0), 18.0)
        self.assertEqual(intervals.coverage([]), 0.0)
        self.assertEqual(intervals.truncates(mask), (True, True))
        self.assertEqual(intervals.truncates([False, True, False]), (False, False))


class ElevationTests(unittest.TestCase):
    def test_equal_height_ray_sits_below_the_local_tangent(self):
        dists = np.array([1e3, 5e3, 20e3, 50e3, 150e3])
        got = horizon.elevation_angle(0.0, np.zeros_like(dists), dists)
        expected = -np.degrees(dists / R / 2.0)
        np.testing.assert_allclose(got, expected, atol=1e-12)
        self.assertTrue(np.all(got < 0.0))

    def test_elevation_decreases_with_range_and_rises_with_target_height(self):
        far = np.array([1e3, 2e3, 5e3, 10e3, 20e3, 50e3, 100e3, 150e3])
        equal = horizon.elevation_angle(0.0, np.zeros_like(far), far)
        self.assertTrue(np.all(np.diff(equal) < 0.0))
        self.assertGreater(float(horizon.elevation_angle(0.0, 1000.0, 20e3)),
                           float(horizon.elevation_angle(0.0, 0.0, 20e3)))

    def test_high_target_at_zero_range_is_overhead(self):
        self.assertGreater(float(horizon.elevation_angle(0.0, 1000.0, 1e-6)), 89.9)


class DestinationTests(unittest.TestCase):
    def test_north_and_east_from_a_mid_latitude_site(self):
        lat0, lon0 = -45.0, 10.0
        dist = 50_000.0
        lat_n, lon_n = horizon.destination(lat0, lon0, 0.0, dist)
        self.assertAlmostEqual(float(lat_n) - lat0, math.degrees(dist / R), places=6)
        self.assertAlmostEqual(float(lon_n), lon0, places=6)

        lat_e, lon_e = horizon.destination(lat0, lon0, 90.0, dist)
        self.assertGreater(float(lon_e), lon0)
        # A great circle due east leaves the parallel: 50 km at 45S drops
        # ~0.024 deg of latitude.  That is geometry, not an error.
        self.assertAlmostEqual(float(lat_e), lat0, delta=0.05)

    def test_pole_azimuth_maps_to_the_matching_meridian(self):
        # Regression: at the exact pole atan2(0, 0) collapsed every azimuth to
        # a handful of meridians, so 180 azimuths became two identical rays.
        az = np.array([0.0, 45.0, 90.0, 180.0, 270.0])
        dist = 100_000.0
        lat, lon = horizon.destination(-90.0, 0.0, az, dist)
        np.testing.assert_allclose(lat, -90.0 + np.degrees(dist / R), atol=1e-9)
        np.testing.assert_allclose(lon, az, atol=1e-9)

    def test_pole_respects_the_site_meridian(self):
        az = np.array([0.0, 30.0, 300.0])
        _, lon = horizon.destination(-90.0, 120.0, az, 10_000.0)
        np.testing.assert_allclose(lon, (120.0 + az) % 360.0, atol=1e-9)


class BlockedMaskTests(unittest.TestCase):
    def setUp(self):
        self.profile = {"azimuth_deg": np.arange(0.0, 360.0, 1.0),
                        "horizon_deg": np.full(360, 2.0)}

    def test_body_above_and_below_the_skyline(self):
        blocked, hz = horizon.blocked_mask([2.5, 1.5, 2.0], [0.0, 90.0, 359.0],
                                           self.profile, body_radius_deg=0.266)
        self.assertEqual(hz.tolist(), [2.0, 2.0, 2.0])
        self.assertEqual(blocked.tolist(), [False, True, True])

    def test_limb_makes_a_low_body_visible(self):
        blocked_centre, _ = horizon.blocked_mask([1.9], [90.0], self.profile,
                                                 body_radius_deg=0.266)
        blocked_limb, _ = horizon.blocked_mask([1.9], [90.0], self.profile,
                                               body_radius_deg=0.266, use_limb=True)
        self.assertTrue(bool(blocked_centre[0]))
        self.assertFalse(bool(blocked_limb[0]))

    def test_interpolation_wraps_between_359_and_0(self):
        profile = {"azimuth_deg": np.arange(0.0, 360.0, 1.0),
                   "horizon_deg": np.concatenate([np.zeros(180), np.full(180, 10.0)])}
        # 359.5 deg sits between bin 359 (10 deg) and bin 0 (0 deg).
        _, hz = horizon.blocked_mask([5.0], [359.5], profile, body_radius_deg=0.0)
        self.assertAlmostEqual(float(hz[0]), 5.0)


class RampGrid:
    """A 40 m/pixel polar DEM whose height is 0.5 m per metre toward +x (east).

    From the pole this gives the analytic skyline ``atan(0.5 * cos(azimuth))``,
    which exercises destination(), the curvature term and the clamp without any
    raster I/O.
    """

    def __init__(self, radius_m: float = 5120.0):
        self.proj = demmod.Projection(
            lines=256, samples=256, map_scale_m=40.0,
            line_offset=128.0, sample_offset=128.0,
            radius_km=1737.4, center_lat=-90.0, center_lon=0.0,
            scale_factor=1.0, offset_m=1737400.0,
        )
        self.radius_m = radius_m

    @staticmethod
    def _radius_m(lat):
        return 2.0 * 1737.4 * 1000.0 * np.tan(np.radians((90.0 + lat) / 2.0))

    def sample(self, lat, lon, conv: demmod.Convention):
        r = self._radius_m(np.asarray(lat, dtype=np.float64))
        height = 0.5 * r * np.sin(np.radians(np.asarray(lon, dtype=np.float64)))
        return np.where(r <= self.radius_m, height, np.nan)


class HorizonProfileTests(unittest.TestCase):
    def profile(self, max_range_m=5000.0):
        return horizon.horizon_profile(RampGrid(), -90.0, 0.0, az_step_deg=1.0,
                                       max_range_m=max_range_m)

    def test_skyline_follows_the_analytic_ramp(self):
        # Bins are centred at 0.5, 1.5, ... deg; index i holds azimuth i + 0.5.
        prof = self.profile()
        for index in (0, 45, 90, 180, 270):
            az = index + 0.5
            expected = math.degrees(math.atan(0.5 * math.sin(math.radians(az))))
            got = float(prof["horizon_terrain_deg"][index])
            self.assertAlmostEqual(got, expected, delta=0.3,
                                   msg=f"azimuth {az}: got {got:+.3f}, expected {expected:+.3f}")

    def test_skyline_is_azimuthal_not_collapsed(self):
        hz = self.profile()["horizon_terrain_deg"]
        # A smooth ramp sampled at 1 deg bins gives ~180 distinct values (the
        # sine is symmetric); the exact-pole degeneracy used to leave only 2.
        self.assertGreater(len(np.unique(np.round(hz, 6))), 100)
        self.assertGreater(float(hz[90]), float(hz[45]) + 5.0)
        self.assertGreater(float(hz[45]), float(hz[0]) + 5.0)

    def test_clamped_profile_is_never_negative(self):
        prof = self.profile()
        self.assertTrue(np.all(prof["horizon_deg"] >= 0.0))
        self.assertLess(float(np.nanmin(prof["horizon_terrain_deg"])), 0.0)
        self.assertAlmostEqual(float(np.nanmin(prof["horizon_deg"])), 0.0)

    def test_range_reached_and_metadata(self):
        prof = self.profile()
        self.assertAlmostEqual(float(prof["max_range_reached_m"].max()), 5000.0)
        self.assertEqual(len(prof["azimuth_deg"]), 360)
        self.assertEqual(prof["az_origin_deg"], 0.5)
        self.assertAlmostEqual(float(prof["step_m"]), 40.0)

    def test_site_outside_the_raster_raises(self):
        with self.assertRaises(ValueError):
            horizon.horizon_profile(RampGrid(), -80.0, 0.0, az_step_deg=45.0,
                                    max_range_m=1000.0)


class CacheKeyTests(unittest.TestCase):
    """The ephemeris cache must not answer a different question with old data."""

    BASE = dict(kind="azel", body="sun", site="shackleton", lon=0.0, lat=-89.9,
                start="2026-01-01 00:00", stop="2027-01-01 00:00", step="1 h",
                alt_km=0.6294)

    def test_same_query_maps_to_the_same_file(self):
        self.assertEqual(horizons._cache_path(**self.BASE), horizons._cache_path(**self.BASE))

    def test_coordinates_time_range_and_altitude_all_change_the_key(self):
        base = horizons._cache_path(**self.BASE)
        for field, value in (("lon", 1.0), ("lat", -89.8), ("alt_km", 2.0),
                             ("start", "2026-01-01 18:00"),
                             ("stop", "2026-06-01 00:00"),
                             ("step", "10 m")):
            changed = horizons._cache_path(**dict(self.BASE, **{field: value}))
            self.assertNotEqual(base, changed, field)


if __name__ == "__main__":
    unittest.main()
