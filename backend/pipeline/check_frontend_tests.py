"""用真数据重跑前端 lib/mission.test.ts 里的断言，看哪些会挂。

前端测试里最关键的一条是：
    assert.ok(result.windows.length > 0)        # 2026-11-07 ~ 11-13, 默认需求
这条断言是照着假数据调出来的。换成真数据后它可能合理地不成立，
那时不是"后端算错了"，而是"前端该换一个日期去做测试"。

跑法：
    python backend/pipeline/check_frontend_tests.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import horizons
import intervals
import windows as W

SITES = {
    "shackleton": dict(label="Shackleton Crater Rim", lat=-89.90, lon=0.00),
    "malapert":   dict(label="Malapert Massif",       lat=-85.99, lon=2.30),
}
# 前端的默认需求（单位：小时）
DEFAULTS = dict(sunlight=12.0, blackout=4.0, duration=18.0)

# 采集范围要比测试窗口宽，才能把边界截断标出来
START = "2026-11-01 00:00"
STOP = "2026-11-29 00:00"
STEP = "10 m"
STEP_H = 10 / 60

# 前端测试实际用的窗口
TEST_START = "2026-11-07"
TEST_END = "2026-11-13"


def t0() -> datetime:
    return datetime.strptime(START, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


def load_all() -> dict:
    out = {}
    for site, meta in SITES.items():
        out[site] = {}
        for body in ("sun", "earth"):
            rows = horizons.fetch(body, site, meta["lon"], meta["lat"], START, STOP, STEP)
            out[site][body] = rows
    return out


def window_slice(rows) -> np.ndarray:
    """把测试窗口 [TEST_START 00:00, TEST_END 24:00) 映射成样本下标。"""
    base = t0()
    idx = []
    for i, (t, _, _) in enumerate(rows):
        day = t.strftime("%Y-%m-%d")
        if TEST_START <= day <= TEST_END:
            idx.append(i)
    return np.array(idx)


def main() -> None:
    data = load_all()
    hours = 168.0  # 7 天，含首尾（前端 periodHours 的定义）

    print(f"前端测试窗口 {TEST_START} → {TEST_END}（{hours:.0f} h），默认需求 {DEFAULTS}")
    print()

    for site, blob in data.items():
        sun_rows = blob["sun"]
        earth_rows = blob["earth"]
        idx = window_slice(sun_rows)
        sun_el = np.array([sun_rows[i][2] for i in idx])
        earth_el = np.array([earth_rows[i][2] for i in idx])

        sun = sun_el > 0.0
        earth = earth_el > 0.0

        wins = W.find_windows(sun, earth, STEP_H,
                              DEFAULTS["sunlight"], DEFAULTS["blackout"], DEFAULTS["duration"])

        print(f"== {SITES[site]['label']}")
        print(f"   太阳高度 {sun_el.min():+.3f}…{sun_el.max():+.3f}°   日照覆盖 {intervals.coverage(sun)*100:.1f}%")
        print(f"   地球高度 {earth_el.min():+.3f}…{earth_el.max():+.3f}°   对地覆盖 {intervals.coverage(earth)*100:.1f}%")
        print(f"   windows = {len(wins)}")
        for w in wins[:5]:
            print(f"      {w['start']*STEP_H:7.1f} h → {w['end']*STEP_H:7.1f} h"
                  f"  时长 {w['span_h']:6.1f} h  最大空档 {w['blackout_h']:5.1f} h")
        print(f"   断言 windows.length > 0 : {'通过' if wins else '❌ 不成立'}")

        # 断言 2：strict blackout
        strict = W.find_windows(sun, earth, STEP_H, DEFAULTS["sunlight"], 0.0, DEFAULTS["duration"])
        ok2 = all(w["blackout_h"] == 0 for w in strict)
        print(f"   断言 blackout=0 时都无空档 : {'通过' if ok2 else '❌ 不成立'}  (窗口数 {len(strict)})")

        # 断言 3：48 小时的需求给空结果
        imp = W.find_windows(sun, earth, STEP_H, DEFAULTS["sunlight"], DEFAULTS["blackout"], 48.0)
        print(f"   断言 duration=48 时无窗口  : {'通过' if not imp else '❌ 不成立'}  (窗口数 {len(imp)})")
        print()


if __name__ == "__main__":
    main()
