"""扫描：在已缓存的数据范围内，哪些"一周"真的有任务窗口。

用途：给前端挑一个能演示的默认日期。这比争论"算法对不对"有用得多 ——
        如果所有周都没有窗口，那是需求定得太严；如果只有某几周有，
        那几个周就是你们的演示日。

跑法（不联网，全部走缓存）：
    python backend/pipeline/scan_windows.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import horizons
import windows as W

SITES = {
    "shackleton": dict(label="Shackleton", lat=-89.90, lon=0.00),
    "malapert":   dict(label="Malapert",   lat=-85.99, lon=2.30),
}
START = "2026-11-01 00:00"
STOP = "2026-11-29 00:00"
STEP = "10 m"
STEP_H = 10 / 60
DEFAULTS = dict(sunlight=12.0, blackout=4.0, duration=18.0)


def main() -> None:
    base = datetime.strptime(START, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
    series = {}
    for site, meta in SITES.items():
        sun = horizons.fetch("sun", site, meta["lon"], meta["lat"], START, STOP, STEP)
        earth = horizons.fetch("earth", site, meta["lon"], meta["lat"], START, STOP, STEP)
        series[site] = (sun, earth)

    print(f"需求 {DEFAULTS}（小时）　数据范围 {START}Z → {STOP}Z")
    print()
    header = f"{'7天窗口':<26}"
    for site in SITES:
        header += f" {SITES[site]['label'] + ' 窗口/最长':<24}"
    print(header)
    print("-" * len(header))

    day = 0
    while True:
        d0 = base + timedelta(days=day)
        d1 = d0 + timedelta(days=6)
        if d1 > base + timedelta(days=28):
            break
        lo = day * 144
        hi = (day + 7) * 144
        row = f"{d0:%Y-%m-%d} → {d1:%m-%d}      "
        for site in SITES:
            sun_rows, earth_rows = series[site]
            sun = np.array([r[2] for r in sun_rows[lo:hi]]) > 0.0
            earth = np.array([r[2] for r in earth_rows[lo:hi]]) > 0.0
            wins = W.find_windows(sun, earth, STEP_H, DEFAULTS["sunlight"],
                                  DEFAULTS["blackout"], DEFAULTS["duration"])
            best = max((w["span_h"] for w in wins), default=0.0)
            row += f" {len(wins):>3} 个 / {best:>6.1f} h        "
        print(row)
        day += 1


if __name__ == "__main__":
    main()
