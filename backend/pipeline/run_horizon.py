"""Phase 1 跑起来：算两个候选站点的地形地平线剖面并做自检。

跑法：
    python backend/pipeline/run_horizon.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dem as demmod
import horizon

SITES = {
    "shackleton": dict(label="Shackleton Crater Rim", lat=-89.90, lon=0.00),
    "malapert":   dict(label="Malapert Massif",       lat=-85.99, lon=2.30),
}

AZ_STEP = 1.0
MAX_RANGE_KM = horizon.DEFAULT_MAX_RANGE_M / 1000.0

COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
           "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


def main() -> None:
    proj = demmod.Projection.from_label(demmod.LBL_PATH)
    print("=== 投影参数（来自 PDS 标签）===")
    print(f"  {proj.lines} x {proj.samples}, {proj.map_scale_m:.0f} m/pix")
    print(f"  中心 ({proj.center_lat}°, {proj.center_lon}°), 半径 {proj.radius_km} km")
    print(f"  投影偏移 line={proj.line_offset} sample={proj.sample_offset}")
    print()

    grid = horizon.HeightGrid(demmod.IMG_PATH, proj)

    dev = grid.selfcheck()
    print(f"=== 向量化自检：与 dem.Projection 最大偏差 {dev:.3e} 像素 ===")
    print()

    corners = []
    for line, sample in ((0, 0), (0, proj.samples - 1),
                         (proj.lines - 1, 0), (proj.lines - 1, proj.samples - 1)):
        lat, _ = grid.latlon_of(np.array([line]), np.array([sample]),
                                demmod.DEFAULT_CONVENTION)
        corners.append(round(float(lat[0]), 3))
    print(f"=== 四角纬度 {corners}（85°S 图，PDS 预测约 -82.93°）===")
    print()

    for key, meta in SITES.items():
        prof = horizon.horizon_profile(
            grid, meta["lat"], meta["lon"],
            az_step_deg=AZ_STEP, max_range_m=MAX_RANGE_KM * 1000.0,
        )
        hz = prof["horizon_deg"]
        print(f"== {meta['label']}  ({meta['lat']:+.2f}°, {meta['lon']:+.2f}°)")
        print(f"   站点地面高程      : {prof['site_elevation_m']:+.0f} m（相对 1737.4 km 球面）")
        print(f"   遮挡仰角          : 最小 {np.nanmin(hz):+.2f}°  "
              f"中位 {np.nanmedian(hz):+.2f}°  最大 {np.nanmax(hz):+.2f}°")
        reached = prof["max_range_reached_m"]
        print(f"   实际可采样距离    : 最小 {reached.min()/1000:5.1f} km  "
              f"最大 {reached.max()/1000:5.1f} km")
        if reached.min() < MAX_RANGE_KM * 1000.0 * 0.95:
            n_short = int((reached < MAX_RANGE_KM * 1000.0 * 0.95).sum())
            print(f"   ⚠ {n_short}/{len(reached)} 个方位没走满 {MAX_RANGE_KM:.0f} km（超出 DEM 边界）")
        print(f"   最大遮挡出现在     : 方位 {prof['azimuth_deg'][int(np.nanargmax(hz))]:5.1f}°"
              f"（{hz.max():+.2f}°，{prof['range_at_horizon_m'][int(np.nanargmax(hz))]/1000:.1f} km 处）")
        print()
        print("   16 方位遮挡仰角：")
        for i, c in enumerate(COMPASS):
            az_target = i * 22.5
            idx = int(round((az_target - AZ_STEP / 2) / AZ_STEP)) % len(hz)
            bar = "#" * max(0, int(round((hz[idx] + 1) * 3)))
            print(f"     {c:>3} ({az_target:5.1f}°)  {hz[idx]:+6.2f}°  {bar}")
        print()

    # 环回连续性：0° 和 360° 应是同一个方向
    prof = horizon.horizon_profile(grid, SITES["shackleton"]["lat"],
                                   SITES["shackleton"]["lon"],
                                   az_step_deg=AZ_STEP, max_range_m=MAX_RANGE_KM * 1000.0)
    wrap_gap = abs(prof["horizon_deg"][0] - prof["horizon_deg"][-1])
    print(f"=== 环回自检：方位 0.5° 与 359.5° 的遮挡角差 {wrap_gap:.3f}°（应很小）===")


if __name__ == "__main__":
    main()
