"""可见性区间分析。

这个文件是整个后端最"纯"的部分：不联网、不依赖数据源，只处理布尔序列。
也正因为纯，它可以被单元测试彻底覆盖 —— 这是你最该先写测试的地方。

单位约定：
    时间轴 = 等间隔采样的时间戳数组
    step_h = 采样步长（小时）
    所有时长对外都是小时
"""

from __future__ import annotations

import numpy as np


def runs(mask) -> list[tuple[int, int]]:
    """找出 mask 中所有连续 True 段，返回 [(起始下标, 结束下标(不含)), ...]。

    例：[F,T,T,T,F,T,T] -> [(1,4),(5,7)]
    """
    m = np.asarray(mask, dtype=bool)
    if m.size == 0:
        return []
    # 首尾各补一个 False，这样每一段 True 都会产生一对 上升沿/下降沿
    padded = np.concatenate(([False], m, [False]))
    edges = np.diff(padded.astype(np.int8))
    starts = np.flatnonzero(edges == 1)
    ends = np.flatnonzero(edges == -1)
    return list(zip(starts.tolist(), ends.tolist()))


def run_hours(mask, step_h: float) -> list[float]:
    """每一段连续的时长（小时）。注意：这是"采样点数 × 步长"。"""
    return [(e - s) * step_h for s, e in runs(mask)]


def longest_hours(mask, step_h: float) -> float:
    hs = run_hours(mask, step_h)
    return max(hs) if hs else 0.0


def coverage(mask) -> float:
    """True 占全部样本的比例，0..1。"""
    m = np.asarray(mask, dtype=bool)
    return float(m.mean()) if m.size else 0.0


def total_hours(mask, step_h: float) -> float:
    return float(np.count_nonzero(mask)) * step_h


def gaps(mask) -> list[tuple[int, int]]:
    """夹在两段可见之间的不可见段，返回 [(起始下标, 结束下标(不含)), ...]。

    首尾两端的不可见段不算：那一段可能延伸到窗口之外，长度不可知，
    要判断只能看 `truncates()`。
    """
    r = runs(mask)
    return [(end, start) for (_, end), (start, _) in zip(r, r[1:])]


def gap_hours(mask, step_h: float) -> list[float]:
    """相邻两段可见之间"不可见"的时长（小时），只算中间的空档。

    注意：这是空档本身的长度，不是两段可见时长之差。2026-11-14 修的就是
    后者：mask = [T,T,F,F,F,T] 曾返回 (1-2)*step 而不是 3*step，负值还可能
    让 `longest_gap_hours` 报出一个负的"最长中断"。
    """
    return [(e - s) * step_h for s, e in gaps(mask)]


def longest_gap_hours(mask, step_h: float) -> float:
    hs = gap_hours(mask, step_h)
    return max(hs) if hs else 0.0


def truncates(mask) -> tuple[bool, bool]:
    """分析窗口的两端是否被"切断"了。

    这是最容易被忽略的 bug：如果可见段正好顶到窗口的开头或结尾，
    它的真实时长其实更长，直接报"最长连续 X 小时"会低估；
    反过来若你只报窗口内的长度又会被误读成"窗口就这么长"。
    所以必须显式标记，前端要显示"≥"而不是"=。
    """
    m = np.asarray(mask, dtype=bool)
    if m.size == 0:
        return (False, False)
    return (bool(m[0]), bool(m[-1]))
