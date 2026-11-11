"""真数据小样：两个候选站点、2026-11 的太阳/地球可见性（先不做地形）。

这一步的目的不是交付，是先把"数字到底长什么样"看清楚；
有了它，你才知道地形那一步要修什么、验证什么。

跑法：
    python backend/pipeline/demo_geometric.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import horizons
import intervals

# 站点：坐标来自前端 lib/mission.ts
SITES = {
    "shackleton": dict(label="Shackleton Crater Rim", lat=-89.90, lon=0.00),
    "malapert":   dict(label="Malapert Massif",       lat=-85.99, lon=2.30),
}

START = "2026-11-01 00:00"
STOP = "2026-11-29 00:00"
STEP = "10 m"
STEP_H = 10 / 60

# 角半径（度）：判断"可见"到底是按中心还是按边缘，在极区差很多
SUN_RADIUS_DEG = 0.266
EARTH_RADIUS_DEG = np.degrees(np.arctan(6378.137 / 384400.0))  # ≈ 0.951


def load(body: str, site: str) -> tuple[list, np.ndarray, np.ndarray]:
    meta = SITES[site]
    rows = horizons.fetch(body, site, meta["lon"], meta["lat"], START, STOP, STEP)
    times = [r[0] for r in rows]
    az = np.array([r[1] for r in rows])
    el = np.array([r[2] for r in rows])
    return times, az, el


def main() -> None:
    print(f"窗口 {START}Z → {STOP}Z，步长 {STEP}，共 "
          f"{int((np.datetime64(STOP[:10]) - np.datetime64(START[:10])) / np.timedelta64(1, 'D')) * 24 * 6 + 1} 点")
    print(f"地球角半径（从月球看）≈ {EARTH_RADIUS_DEG:.3f}°，太阳角半径 ≈ {SUN_RADIUS_DEG:.3f}°")
    print()

    results = {}
    for site in SITES:
        _, sun_az, sun_el = load("sun", site)
        _, earth_az, earth_el = load("earth", site)

        # 两种判据：中心过地平线 / 边缘（上边缘、任一部位）过地平线
        sun_center = sun_el > 0.0
        sun_limb = sun_el > -SUN_RADIUS_DEG
        earth_center = earth_el > 0.0
        earth_any = earth_el > -EARTH_RADIUS_DEG

        results[site] = dict(
            sun_az=sun_az, sun_el=sun_el, earth_az=earth_az, earth_el=earth_el,
            sun_center=sun_center, sun_limb=sun_limb,
            earth_center=earth_center, earth_any=earth_any,
        )

        print(f"== {SITES[site]['label']}  ({SITES[site]['lat']:+.2f}°, {SITES[site]['lon']:+.2f}°)")
        print(f"   太阳高度角范围 : {sun_el.min():+7.3f}° … {sun_el.max():+7.3f}°")
        print(f"   太阳方位角范围 : {sun_az.min():7.1f}° … {sun_az.max():7.1f}°")
        print(f"   地球高度角范围 : {earth_el.min():+7.3f}° … {earth_el.max():+7.3f}°")
        print(f"   地球方位角范围 : {earth_az.min():7.1f}° … {earth_az.max():7.1f}°")
        print()
        print(f"   日照（日面中心在地平线上）     : {intervals.coverage(sun_center) * 100:5.1f}%  "
              f"最长连续 {intervals.longest_hours(sun_center, STEP_H):6.1f} h  "
              f"段数 {len(intervals.runs(sun_center))}")
        print(f"   日照（含日面上边缘）           : {intervals.coverage(sun_limb) * 100:5.1f}%  "
              f"最长连续 {intervals.longest_hours(sun_limb, STEP_H):6.1f} h")
        print(f"   对地可见（地球中心在地平线上） : {intervals.coverage(earth_center) * 100:5.1f}%  "
              f"最长中断 {intervals.longest_gap_hours(earth_center, STEP_H):6.1f} h")
        print(f"   对地可见（含地球边缘）         : {intervals.coverage(earth_any) * 100:5.1f}%  "
              f"最长中断 {intervals.longest_gap_hours(earth_any, STEP_H):6.1f} h")
        both = sun_center & earth_center
        print(f"   两者同时（严格）               : {intervals.coverage(both) * 100:5.1f}%  "
              f"最长连续 {intervals.longest_hours(both, STEP_H):6.1f} h  "
              f"段数 {len(intervals.runs(both))}")
        print()

    # 同一时刻两站点的差
    print("== 同一时刻的对比（前 12 个样本，每 2 小时抽一个）")
    a, b = results["shackleton"], results["malapert"]
    print(f"{'UTC':>17} | {'Shackleton sun/earth':>22} | {'Malapert sun/earth':>20}")
    for i in range(0, min(len(a['sun_el']), len(b['sun_el'])), 12):
        print(f"{'':>17} | {a['sun_el'][i]:+8.2f} / {a['earth_el'][i]:+8.2f}      | "
              f"{b['sun_el'][i]:+8.2f} / {b['earth_el'][i]:+8.2f}")

    print()
    print("注意：以上完全没有考虑地形。地形只会让可见性变差（把门槛从 0° "
          "抬到 horizon(az)），不会变好。")


if __name__ == "__main__":
    main()
