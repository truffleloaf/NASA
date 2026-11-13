"""LEGACY — 验证旧 `export/data` 契约，当前前端已不再使用。

它对照的是已被删除的 `lib/mission.ts` 语义（默认 blackout=4 h），而不是新的
`lib/science.ts`（默认 blackout=0，数据从 `public/data` 的 rows+profiles 现算）。
当前的后端-前端对照请用 `cross_product.py`；前端的契约测试请用
`check_frontend_tests.py`。

跑法：
    python backend/pipeline/check_export.py
"""

from __future__ import annotations

import gzip
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

DATA = Path(__file__).resolve().parents[1] / "export" / "data"

DEFAULTS = dict(sunlight=12.0, blackout=4.0, duration=18.0)


def parse_iso(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def clip(intervals, t0: datetime, t1: datetime):
    """把绝对 UTC 区间裁到 [t0, t1)，并换算成「距 t0 的小时数」。"""
    out = []
    for a, b in intervals:
        s = max(t0, parse_iso(a))
        e = min(t1, parse_iso(b))
        if e > s:
            out.append(((s - t0).total_seconds() / 3600.0,
                        (e - t0).total_seconds() / 3600.0))
    return out


def windows_from(solar, earth, req):
    """逐行对齐前端 lib/mission.ts 的 analyze() 窗口判定。"""
    need = max(req["sunlight"], req["duration"])
    windows = []
    for s0, s1 in solar:
        pieces = [(max(s0, e0), min(s1, e1)) for e0, e1 in earth
                  if min(s1, e1) > max(s0, e0)]
        cur = None
        gap_max = 0.0

        def flush():
            nonlocal cur, gap_max
            if cur and (cur[1] - cur[0]) >= need:
                windows.append(dict(start=cur[0], end=cur[1],
                                    span=cur[1] - cur[0], blackout=gap_max))
            cur, gap_max = None, 0.0

        for a, b in pieces:
            if cur and (a - cur[1]) <= req["blackout"]:
                gap_max = max(gap_max, a - cur[1])
                cur = (cur[0], b)
            else:
                flush()
                cur = (a, b)
        flush()
    return windows


def analyze(doc, start_date: str, end_date: str, req):
    a = datetime.strptime(start_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    b = datetime.strptime(end_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    hours = (b - a).total_seconds() / 3600.0 + 24.0
    t1 = a + timedelta(hours=hours)
    vis = doc["visibility"]
    solar = clip(vis["solar_center"], a, t1)
    earth = clip(vis["earth_center"], a, t1)
    wins = windows_from(solar, earth, req)
    total = sum(e - s for s, e in solar)
    tot_e = sum(e - s for s, e in earth)
    return dict(
        hours=hours, solar=solar, earth=earth, windows=wins,
        sunlight=round(100 * total / hours),
        earth_visibility=round(100 * tot_e / hours),
        longest=max((w["span"] for w in wins), default=0.0),
    )


def main() -> None:
    index = json.loads((DATA / "index.json").read_text(encoding="utf-8"))
    print("=== index.json ===")
    print(f"  schema {index['schema_version']}, 生成于 {index['generated_utc']}")
    cov = index["manifest"]["coverage"]
    print(f"  覆盖 {cov['start_utc']} → {cov['end_utc']}，"
          f"序列步长 {cov['series_step_minutes']} min，遮罩步长 {cov['mask_step_minutes']} min")
    print()

    total_raw = total_gz = 0
    for s in index["sites"]:
        p = DATA / s["file"]
        raw = p.read_bytes()
        gz = len(gzip.compress(raw, 9))
        total_raw += len(raw)
        total_gz += gz
        print(f"  {s['id']:<12} {len(raw)/1024:6.1f} KB → gzip {gz/1024:6.1f} KB")
    print(f"  {'合计':<12} {total_raw/1024:6.1f} KB → gzip {total_gz/1024:6.1f} KB")
    print()

    print("=== 结构完整性 ===")
    for s in index["sites"]:
        doc = json.loads((DATA / s["file"]).read_text(encoding="utf-8"))
        ser = doc["series"]
        lens = {k: len(ser[k]) for k in ("sun_azimuth", "sun_elevation",
                                         "earth_azimuth", "earth_elevation")}
        hz = doc["horizon_deg"]
        print(f"  {s['id']:<12} 序列长度 {set(lens.values())}，"
              f"地平线 {len(hz)} 个方位，"
              f"区间 solar {len(doc['visibility']['solar_center'])} / "
              f"earth {len(doc['visibility']['earth_center'])}")
    print()

    print("=== 复现前端 analyze()：默认需求，2026-11-14 → 11-20 ===")
    for s in index["sites"]:
        doc = json.loads((DATA / s["file"]).read_text(encoding="utf-8"))
        r = analyze(doc, "2026-11-14", "2026-11-20", DEFAULTS)
        print(f"  {s['id']}")
        print(f"    hours={r['hours']:.0f}  日照={r['sunlight']}%  对地={r['earth_visibility']}%  "
              f"窗口={len(r['windows'])}  最长={r['longest']:.1f} h")
        for w in r["windows"]:
            print(f"      {w['start']:7.1f} h → {w['end']:7.1f} h   "
                  f"时长 {w['span']:6.1f} h  最大空档 {w['blackout']:4.1f} h")
    print()

    print("=== 同样的窗口，2026-11-07 → 11-13（前端旧测试用的那周） ===")
    for s in index["sites"]:
        doc = json.loads((DATA / s["file"]).read_text(encoding="utf-8"))
        r = analyze(doc, "2026-11-07", "2026-11-13", DEFAULTS)
        print(f"  {s['id']:<12} 窗口={len(r['windows'])}  日照={r['sunlight']}%  对地={r['earth_visibility']}%")


if __name__ == "__main__":
    main()
