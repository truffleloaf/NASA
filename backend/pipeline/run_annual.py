"""Phase 2 验证：把星历和地形合起来，算全年可见性。

这是整个后端最关键的一张表 —— 它同时回答两个问题：
    1. 地形到底把可见性削掉多少？（几何值 vs 地形值）
    2. 算出来的结果符合已知地理事实吗？（Shackleton 坑底应全年黑暗）

跑法：
    python backend/pipeline/run_annual.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dem as demmod
import horizons
import horizon
import intervals

SITES = {
    "shackleton": dict(label="Shackleton (89.90S, 0.00E)", lat=-89.90, lon=0.00),
    "malapert":   dict(label="Malapert  (85.99S, 2.30E)", lat=-85.99, lon=2.30),
    # 对照点：Shackleton 坑底。已知全年几乎无光，用来校验整条流水线。
    "crater_floor": dict(label="Shackleton floor (89.654S, 128.31E) [对照]",
                         lat=-89.654, lon=128.31),
}

START = "2026-01-01 00:00"
STOP = "2027-01-01 00:00"
STEP = "1 h"
STEP_H = 1.0
MAX_RANGE_KM = horizon.DEFAULT_MAX_RANGE_M / 1000.0


def fmt(h: float) -> str:
    return f"{h:7.1f} h ({h/24:5.2f} d)"


def main() -> None:
    proj = demmod.Projection.from_label(demmod.LBL_PATH)
    grid = horizon.HeightGrid(demmod.IMG_PATH, proj)

    print(f"窗口 {START}Z → {STOP}Z，步长 {STEP}（{STEP_H} h）")
    print()

    for key, meta in SITES.items():
        prof = horizon.horizon_profile(
            grid, meta["lat"], meta["lon"],
            az_step_deg=1.0, max_range_m=MAX_RANGE_KM * 1000.0,
        )

        sun = horizons.fetch("sun", key, meta["lon"], meta["lat"], START, STOP, STEP,
                             alt_km=prof["site_elevation_m"] / 1000.0)
        earth = horizons.fetch("earth", key, meta["lon"], meta["lat"], START, STOP, STEP,
                               alt_km=prof["site_elevation_m"] / 1000.0)

        sun_az = np.array([r[1] for r in sun])
        sun_el = np.array([r[2] for r in sun])
        ear_az = np.array([r[1] for r in earth])
        ear_el = np.array([r[2] for r in earth])

        # 地形门槛：把 360 个方位的地平线插值到每个时刻的方位角上
        sun_hz = np.interp(sun_az % 360.0, prof["azimuth_deg"], prof["horizon_deg"], period=360.0)
        ear_hz = np.interp(ear_az % 360.0, prof["azimuth_deg"], prof["horizon_deg"], period=360.0)

        sun_geo = sun_el > 0.0
        sun_ter = sun_el > sun_hz
        sun_ter_limb = sun_el + horizon.SUN_ANGULAR_RADIUS_DEG > sun_hz
        ear_geo = ear_el > 0.0
        ear_ter = ear_el > ear_hz
        ear_ter_limb = ear_el + horizon.EARTH_ANGULAR_RADIUS_DEG > ear_hz
        both = sun_ter & ear_ter

        print(f"== {meta['label']}")
        print(f"   站点高程 {prof['site_elevation_m']:+.0f} m，"
              f"地形遮挡 {np.nanmin(prof['horizon_deg']):+.1f}° … {np.nanmax(prof['horizon_deg']):+.1f}°"
              f"（中位 {np.nanmedian(prof['horizon_deg']):+.1f}°）")
        print()
        print(f"   日照（纯几何，无地形）  : {intervals.coverage(sun_geo)*100:5.1f}%  "
              f"最长连续 {fmt(intervals.longest_hours(sun_geo, STEP_H))}")
        print(f"   日照（地形，日面中心）  : {intervals.coverage(sun_ter)*100:5.1f}%  "
              f"最长连续 {fmt(intervals.longest_hours(sun_ter, STEP_H))}  "
              f"段数 {len(intervals.runs(sun_ter))}")
        print(f"   日照（地形，含日面边缘）: {intervals.coverage(sun_ter_limb)*100:5.1f}%  "
              f"最长连续 {fmt(intervals.longest_hours(sun_ter_limb, STEP_H))}")
        print()
        print(f"   对地（纯几何）          : {intervals.coverage(ear_geo)*100:5.1f}%  "
              f"最长中断 {fmt(intervals.longest_gap_hours(ear_geo, STEP_H))}")
        print(f"   对地（地形，地心）      : {intervals.coverage(ear_ter)*100:5.1f}%  "
              f"最长中断 {fmt(intervals.longest_gap_hours(ear_ter, STEP_H))}")
        print(f"   对地（地形，含地球边缘）: {intervals.coverage(ear_ter_limb)*100:5.1f}%  "
              f"最长中断 {fmt(intervals.longest_gap_hours(ear_ter_limb, STEP_H))}")
        print()
        print(f"   两者同时（地形，严格）  : {intervals.coverage(both)*100:5.1f}%  "
              f"最长连续 {fmt(intervals.longest_hours(both, STEP_H))}  "
              f"段数 {len(intervals.runs(both))}")
        tr = intervals.truncates(both)
        print(f"   边界截断（首/尾）       : {tr}")

        # 硬不变量：地形只能减少可见性，绝不能增加
        bad = []
        for name, geo, ter in (("日照", sun_geo, sun_ter), ("对地", ear_geo, ear_ter)):
            if intervals.coverage(ter) > intervals.coverage(geo) + 1e-9:
                bad.append(f"{name} {intervals.coverage(geo)*100:.1f}% → {intervals.coverage(ter)*100:.1f}%")
        print(f"   单调性检查（地形≤几何） : {'❌ ' + '; '.join(bad) if bad else '✅ 通过'}")
        print()

    print("=== 已知事实校验 ===")
    print("Shackleton 坑底 (89.654S, 128.31E) 应几乎全年黑暗；坑缘应高照度。")
    print("若坑底算出来不是接近 0%，说明投影或地平线算法有错。")


if __name__ == "__main__":
    main()
