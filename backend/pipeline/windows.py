"""任务窗口判定 —— 严格对齐前端 lib/mission.ts 里 analyze() 的语义。

前端现在的实现有一个"72 小时循环模式"，但它对"窗口"的定义是清楚且合理的，
我们照抄它的判据，只把输入从假模式换成真数据：

    对每一段连续日照 S：
        把 S 与"对地可见"求交，得到若干可见片段
        相邻片段之间的空档 <= blackout 就合并（记下最大空档）
        合并后的总时长 >= max(sunlight, duration) 才算一个窗口

单位：
    min_sun_h / max_gap_h / min_dur_h 都是小时
    step_h 是采样步长（小时）
"""

from __future__ import annotations

import numpy as np

from intervals import runs


def find_windows(sun, earth, step_h: float,
                 min_sun_h: float, max_gap_h: float, min_dur_h: float) -> list[dict]:
    sun = np.asarray(sun, dtype=bool)
    earth = np.asarray(earth, dtype=bool)
    needed = max(min_sun_h, min_dur_h)  # 前端就是这么算的

    windows: list[dict] = []
    for s0, s1 in runs(sun):
        pieces = []
        for e0, e1 in runs(earth):
            a, b = max(e0, s0), min(e1, s1)
            if b > a:
                pieces.append((a, b))

        cur: tuple[int, int] | None = None
        gap_max = 0.0

        def flush() -> None:
            nonlocal cur, gap_max
            if cur is None:
                return
            span_h = (cur[1] - cur[0]) * step_h
            if span_h >= needed:
                windows.append({
                    "start": cur[0],
                    "end": cur[1],
                    "span_h": span_h,
                    "blackout_h": gap_max,
                })
            cur, gap_max = None, 0.0

        for a, b in pieces:
            if cur is not None:
                gap = (a - cur[1]) * step_h
                if gap <= max_gap_h:
                    gap_max = max(gap_max, gap)
                    cur = (cur[0], b)
                    continue
                flush()
            cur, gap_max = (a, b), 0.0
        flush()

    return windows
