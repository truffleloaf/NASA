"""Phase 3：把真实计算结果导出成前端能直接读的 JSON。

设计原则
--------
1. **只交可见性区间，不交最终窗口。** 前端 `analyze()` 里已经有窗口判定逻辑，
   保留它，用户改需求时才能立刻重算（what-if 滑块）。后端交"什么时候有阳光 /
   什么时候看得见地球"，窗口由前端自己算。这是职责划分，不是偷懒。

2. **区间用绝对 UTC 时间，不用「距 startDate 的小时数」。** 用户会改日期范围，
   绝对时间才能任意切片。前端切片后减一下就是它自己的 hours 单位。

3. **数据要能自证。** 每个文件都带 provenance：数据集、版本、步长、单位、约定。
   `AGENTS.md` 规则 1 要求界面上的数字带来源徽章，这些字段就是徽章的内容。

输出
----
    out/data/index.json            站点元数据 + 地形地平线剖面 + 清单
    out/data/sites/<id>.json       全年时间序列 + 可见性区间 + 年度统计

跑法：
    python backend/pipeline/export_data.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import dem as demmod
import horizon
import horizons
import intervals

SITES = [
    dict(id="shackleton", name="Shackleton Crater Rim", lat=-89.90, lon=0.00),
    dict(id="malapert", name="Malapert Massif", lat=-85.99, lon=2.30),
]

START = "2026-01-01 00:00"
STOP = "2027-01-01 00:00"
SERIES_STEP = "1 h"
SERIES_STEP_MIN = 60
MASK_STEP_MIN = 10          # 遮罩用更细的步长（由 1 小时序列线性插值）
AZ_STEP_DEG = 1.0
MAX_RANGE_KM = horizon.DEFAULT_MAX_RANGE_M / 1000.0

OUT = Path(__file__).resolve().parents[1] / "export" / "data"


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def unwrap_az(az_deg: np.ndarray) -> np.ndarray:
    """方位角在 0/360 处会跳，线性插值前必须先展开。"""
    return np.degrees(np.unwrap(np.radians(az_deg)))


def runs_to_iso(mask: np.ndarray, t0: datetime, step_min: float) -> list[list[str]]:
    """布尔序列 → 绝对 UTC 区间列表。"""
    out = []
    for a, b in intervals.runs(mask):
        start = t0 + timedelta(minutes=float(a) * step_min)
        end = t0 + timedelta(minutes=float(b) * step_min)
        out.append([iso(start), iso(end)])
    return out


def main() -> None:
    proj = demmod.Projection.from_label(demmod.LBL_PATH)
    grid = horizon.HeightGrid(demmod.IMG_PATH, proj)
    t0 = datetime.strptime(START, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)

    (OUT / "sites").mkdir(parents=True, exist_ok=True)

    index_sites = []
    for site in SITES:
        sid, lat, lon = site["id"], site["lat"], site["lon"]
        print(f"== {sid}")

        prof = horizon.horizon_profile(
            grid, lat, lon, az_step_deg=AZ_STEP_DEG, max_range_m=MAX_RANGE_KM * 1000.0)
        hz = prof["horizon_deg"]
        print(f"   地形：{np.nanmin(hz):+.1f}° … {np.nanmax(hz):+.1f}°，"
              f"站点 {prof['site_elevation_m']:+.0f} m")

        sun = horizons.fetch("sun", sid, lon, lat, START, STOP, SERIES_STEP,
                             alt_km=prof["site_elevation_m"] / 1000.0)
        earth = horizons.fetch("earth", sid, lon, lat, START, STOP, SERIES_STEP,
                               alt_km=prof["site_elevation_m"] / 1000.0)
        sun_az = np.array([r[1] for r in sun])
        sun_el = np.array([r[2] for r in sun])
        ear_az = np.array([r[1] for r in earth])
        ear_el = np.array([r[2] for r in earth])
        n = len(sun_az)
        assert n == len(ear_az), "太阳和地球的采样数不一致"

        # ---- 遮罩：插值到 10 分钟，减少边界量化误差 ----
        factor = SERIES_STEP_MIN // MASK_STEP_MIN
        fine = np.arange((n - 1) * factor + 1, dtype=np.float64) / factor

        sun_az_f = np.mod(np.interp(fine, np.arange(n), unwrap_az(sun_az)), 360.0)
        sun_el_f = np.interp(fine, np.arange(n), sun_el)
        ear_az_f = np.mod(np.interp(fine, np.arange(n), unwrap_az(ear_az)), 360.0)
        ear_el_f = np.interp(fine, np.arange(n), ear_el)
        mstep = MASK_STEP_MIN / 60.0

        def hz_at(az):
            return np.interp(az % 360.0, prof["azimuth_deg"], hz, period=360.0)

        sun_hz = hz_at(sun_az_f)
        ear_hz = hz_at(ear_az_f)

        masks = {
            "solar_center": sun_el_f > sun_hz,
            "solar_limb": sun_el_f + horizon.SUN_ANGULAR_RADIUS_DEG > sun_hz,
            "earth_center": ear_el_f > ear_hz,
            "earth_limb": ear_el_f + horizon.EARTH_ANGULAR_RADIUS_DEG > ear_hz,
        }
        both = masks["solar_center"] & masks["earth_center"]

        vis = {k: runs_to_iso(v, t0, MASK_STEP_MIN) for k, v in masks.items()}

        annual = {
            "solar_fraction": round(float(intervals.coverage(masks["solar_center"])), 4),
            "solar_limb_fraction": round(float(intervals.coverage(masks["solar_limb"])), 4),
            "earth_fraction": round(float(intervals.coverage(masks["earth_center"])), 4),
            "earth_limb_fraction": round(float(intervals.coverage(masks["earth_limb"])), 4),
            "both_fraction": round(float(intervals.coverage(both)), 4),
            "longest_solar_h": round(intervals.longest_hours(masks["solar_center"], mstep), 2),
            "longest_both_h": round(intervals.longest_hours(both, mstep), 2),
            "longest_earth_gap_h": round(intervals.longest_gap_hours(masks["earth_center"], mstep), 2),
        }
        print(f"   日照 {annual['solar_fraction']*100:.1f}%  "
              f"对地 {annual['earth_fraction']*100:.1f}%  "
              f"同时 {annual['both_fraction']*100:.1f}%")

        # ---- 写站点文件 ----
        site_doc = {
            "schema_version": 1,
            "site": {
                "id": sid,
                "name": site["name"],
                "lat_deg": lat,
                "lon_deg": lon,
                "elevation_m": round(prof["site_elevation_m"], 1),
            },
            "series": {
                "start_utc": iso(t0),
                "step_minutes": SERIES_STEP_MIN,
                "unit": "0.01 degree",
                "sun_azimuth": [int(round(v * 100)) for v in sun_az],
                "sun_elevation": [int(round(v * 100)) for v in sun_el],
                "earth_azimuth": [int(round(v * 100)) for v in ear_az],
                "earth_elevation": [int(round(v * 100)) for v in ear_el],
            },
            "visibility": {
                "mask_step_minutes": MASK_STEP_MIN,
                "note": "intervals are absolute UTC, half-open [start, end)",
                **vis,
            },
            "annual": annual,
            "horizon_deg": [int(round(v * 100)) for v in hz],
        }
        p = OUT / "sites" / f"{sid}.json"
        p.write_text(json.dumps(site_doc, separators=(",", ":")), encoding="utf-8")
        print(f"   → {p.name}  {p.stat().st_size/1024:.0f} KB")

        index_sites.append({
            "id": sid,
            "name": site["name"],
            "lat_deg": lat,
            "lon_deg": lon,
            "elevation_m": round(prof["site_elevation_m"], 1),
            "horizon_summary": {
                "min_deg": round(float(np.nanmin(hz)), 2),
                "median_deg": round(float(np.nanmedian(hz)), 2),
                "max_deg": round(float(np.nanmax(hz)), 2),
                "max_at_azimuth_deg": round(float(prof["azimuth_deg"][int(np.nanargmax(hz))]), 1),
            },
            "annual": annual,
            "file": f"sites/{sid}.json",
        })

    # 覆盖时长：所有站点的序列长度相同，取最后一个
    total_hours = (len(site_doc["series"]["sun_azimuth"]) - 1) * SERIES_STEP_MIN / 60.0

    index = {
        "schema_version": 1,
        "generated_utc": iso(datetime.now(timezone.utc).replace(microsecond=0)),
        "manifest": {
            "ephemeris": {
                "source": "JPL Horizons, DE441",
                "api": "https://ssd.jpl.nasa.gov/api/horizons.api",
                "center": "coord@301 (topocentric on the Moon)",
                "quantity": "airless apparent azimuth/elevation of the body centre",
                "corrections": ["light-time", "stellar aberration", "gravitational deflection"],
                "refraction": "none (no lunar atmosphere)",
            },
            "terrain": {
                "source": "LRO LOLA LDEM_85S_40M (PDS Geosciences)",
                "map_scale_m": 40,
                "azimuth_bins": int(360 / AZ_STEP_DEG),
                "max_range_km": MAX_RANGE_KM,
                "curvature": "exact spherical, R = 1737.4 km",
                "projection": "polar stereographic, lon 0 up, +90E right",
            },
            "coverage": {
                "start_utc": iso(t0),
                "end_utc": iso(t0 + timedelta(hours=total_hours)),
                "series_step_minutes": SERIES_STEP_MIN,
                "mask_step_minutes": MASK_STEP_MIN,
            },
            "conventions": {
                "azimuth": "degrees, 0 = north, 90 = east",
                "elevation": "degrees above the local horizontal plane",
                "time": "UTC",
                "visible": "body elevation > max(terrain horizon at that azimuth, 0)",
                "solar_center": "sun centre above the terrain horizon",
                "solar_limb": "sun upper limb above the terrain horizon (radius 0.266 deg)",
                "earth_limb": "any part of Earth above the horizon (radius 0.951 deg)",
                "units": {"horizon_deg": "0.01 deg integers", "series": "0.01 deg integers"},
            },
            "limits": [
                "DEM is 40 m/pixel; terrain detail below that is not represented",
                f"rays are traced to {MAX_RANGE_KM:.0f} km, the usable radius of this 85S-90S DEM; "
                "azimuths that leave the DEM earlier stop at the edge",
                "1-hour ephemeris, interpolated to 10 minutes for visibility masks",
                "geometric line of sight only; no radio-link budget",
                "site positions are the product's fixed points, not re-optimised for illumination",
            ],
        },
        "sites": index_sites,
    }
    p = OUT / "index.json"
    p.write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"\n→ index.json  {p.stat().st_size/1024:.0f} KB")
    print(f"输出目录 {OUT}")


if __name__ == "__main__":
    main()
