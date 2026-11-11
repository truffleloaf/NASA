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
    "shackleton": dict(lat=-89.90, lon=0.00),
    "malapert":   dict(lat=-85.99, lon=2.30),
}
STEPS_M = [40.0, 80.0, 160.0, 240.0]
MAX_RANGE_KM = 50.0


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
            hz = prof["horizon_deg"]
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

    print("解读：若 80/160/240 m 的偏差都很小，说明 40 m 采样已收敛；")
    print("      若有系统性负偏差，说明粗采样漏掉了细窄的山脊。")

    # 50 km 之外还有多少地形贡献？用极点做一次 200 km 的对照
    print()
    print("== 50 km 截断误差（极点，扫到 200 km 对照）")
    near = horizon.horizon_profile(grid, -90.0, 0.0, az_step_deg=2.0,
                                   max_range_m=50_000.0)
    far = horizon.horizon_profile(grid, -90.0, 0.0, az_step_deg=2.0,
                                  max_range_m=200_000.0)
    diff = far["horizon_deg"] - near["horizon_deg"]
    print(f"   50 km  vs 200 km：中位差 {np.nanmedian(diff):+.3f}°  "
          f"p95 {np.nanpercentile(diff, 95):+.3f}°  最大 {np.nanmax(diff):+.3f}°")
    print(f"   （200 km 时有效方位数 {int(np.isfinite(far['horizon_deg']).sum())}/180）")


if __name__ == "__main__":
    main()
