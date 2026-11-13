"""收敛性检验：地形地平线对射线采样步长有多敏感？

用途：METHOD.md 里要写误差，不能凭空估计。这里用同一份 DEM、同一条射线算法，
只改采样步长（40 / 80 / 160 / 240 m），看地平线结果变化多少。
若步长减半结果几乎不变，说明 40 m 已经收敛。

跑法：
    python backend/pipeline/check_convergence.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dem as demmod
import horizon

SITES = {
    "shackleton":  dict(lat=-89.90, lon=0.00),
    "malapert":    dict(lat=-85.99, lon=2.30),
    "de-gerlache": dict(lat=-88.70, lon=-68.70),
}
STEPS_M = [40.0, 80.0, 160.0, 240.0]
MAX_RANGE_KM = horizon.DEFAULT_MAX_RANGE_M / 1000.0


def main() -> None:
    proj = demmod.Projection.from_label(demmod.LBL_PATH)
    grid = horizon.HeightGrid(demmod.IMG_PATH, proj)

    for key, meta in SITES.items():
        print(f"== {key}")
        base = None
        for step in STEPS_M:
            prof = horizon.horizon_profile(
                grid, meta["lat"], meta["lon"], az_step_deg=1.0,
                max_range_m=MAX_RANGE_KM * 1000.0, step_m=step)
            # Compare the unclamped skyline: clamping at 0 would hide the
            # negative-angle differences this convergence check is looking for.
            hz = prof["horizon_terrain_deg"]
            if base is None:
                base = hz
                print(f"   步长 {step:5.0f} m  基准：中位 {np.nanmedian(hz):+.2f}°  "
                      f"最大 {np.nanmax(hz):+.2f}°")
            else:
                d = hz - base
                print(f"   步长 {step:5.0f} m  与基准差：中位 {np.nanmedian(np.abs(d)):.3f}°  "
                      f"p95 {np.nanpercentile(np.abs(d), 95):.3f}°  "
                      f"最大 {np.nanmax(np.abs(d)):.3f}°  "
                      f"（相对偏差中位 {np.nanmedian(d):+.3f}°）")
        print()

    print("以上用未 clamp 的 skyline（horizon_terrain_deg）；clamp 到 0° 的版本")
    print("只用于和 shipped 80 m 资产做同约定对比，见 cross_product.py。")
    print("解读：若 80/160/240 m 的偏差都很小，说明 40 m 采样已收敛；")
    print("      若有系统性负偏差，说明粗采样漏掉了细窄的山脊。")

    # 射线距离截断：50 / 150（默认）/ 250 km 三档，看多远之后不再有贡献
    print()
    print("== 射线距离截断（极点，2° 方位格）")
    ranges = [("50 km", 50_000.0),
              (f"{MAX_RANGE_KM:.0f} km（默认）", MAX_RANGE_KM * 1000.0),
              ("250 km", 250_000.0)]
    profs = [horizon.horizon_profile(grid, -90.0, 0.0, az_step_deg=2.0, max_range_m=r)
             for _, r in ranges]
    for i in range(1, len(profs)):
        diff = profs[i]["horizon_terrain_deg"] - profs[i - 1]["horizon_terrain_deg"]
        print(f"   {ranges[i-1][0]} → {ranges[i][0]}：中位差 {np.nanmedian(diff):+.3f}°  "
              f"p95 {np.nanpercentile(diff, 95):+.3f}°  最大 {np.nanmax(diff):+.3f}°")
    print(f"   （DEM 可用半径约 151.7 km，250 km 时有效方位数 "
          f"{int(np.isfinite(profs[-1]['horizon_deg']).sum())}/180）")


if __name__ == "__main__":
    main()
