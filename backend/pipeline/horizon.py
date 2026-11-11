"""局部地形地平线：给定站点，算出每个方位角上的最大遮挡仰角。

在 dem.py（Phase 0，投影换算）之上做 Phase 1。不修改 dem.py：
这里把它的标量公式做了一份向量化拷贝，并用 `selfcheck()` 逐点比对，
任何一侧改了都会立刻报错。

物理要点
--------
1. **月球曲率必须算进去。** 距离 r 处的点因为球面弯曲，比平面模型低约
   r²/(2R)：r = 20 km 时约 115 m。极区太阳仰角只有 0–2°，这点差别足以
   改变可见性判断。这里用精确球面公式，不用小角近似。在过站点与目标的
   大圆平面里，以站点半径方向为「上」：

       elev = atan2( (R+h_t)·cos(d) − (R+h_s) , (R+h_t)·sin(d) ),  d = r/R

   等高点（h_t = h_s）必须给出 **−d/2**，即远端低于当地地平线。这一项符号
   写反的话，远处地形会被抬高而不是压下去：150 km 处误差 4.95°，而极区
   太阳仰角全年只在 ±1.54° 之间，足以把结论整个翻过来。`selfcheck()` 专门
   守这一条。

2. **太阳和地球都是圆面，不是点。** 太阳视半径 0.266°，地球从月球看约
   0.951°。极区两者都贴着地平线，用中心还是用边缘会明显改变结果，所以
   判据必须显式给出，不能含糊。
"""

from __future__ import annotations

import pathlib

import numpy as np

import dem as demmod

R_MOON_M = 1737400.0

SUN_ANGULAR_RADIUS_DEG = 0.266
# 地球视半径 = atan(6378.137 km / 384400 km) ≈ 0.951°
EARTH_ANGULAR_RADIUS_DEG = float(np.degrees(np.arctan(6378.137 / 384400.0)))

# 射线追踪距离。取 150 km 而不是 50 km：实测（check_convergence.py）把范围从
# 50 km 放到 DEM 边界，极点的地平线会系统性抬高约 0.74°（最大 1.48°）。
# 极区太阳仰角只有 1–2°，这个偏差和信号本身同量级，不能忽略。
DEFAULT_MAX_RANGE_M = 150_000.0


# --------------------------------------------------------------------------- #
# 向量化的 DEM 读取
# --------------------------------------------------------------------------- #

class HeightGrid:
    """numpy 内存映射 + 双线性采样，公式与 dem.Projection 保持一致。"""

    def __init__(self, img_path: pathlib.Path, proj: demmod.Projection):
        self.proj = proj
        self.dn = np.memmap(img_path, dtype="<i2", mode="r",
                            shape=(proj.lines, proj.samples))
        self.scale_m = proj.scale_factor

    # -- 与 dem.Projection 等价的向量化版本 ------------------------------------

    def pixel_of(self, lat, lon, conv: demmod.Convention):
        p = self.proj
        r_m = (2.0 * p.radius_km * 1000.0
               * np.tan(np.radians((90.0 + np.asarray(lat, dtype=np.float64)) / 2.0)))
        theta = np.radians(conv.handed * (np.asarray(lon, dtype=np.float64) - conv.offset_deg))
        line = p.line_offset - r_m * np.sin(theta) / p.map_scale_m
        sample = p.sample_offset + r_m * np.cos(theta) / p.map_scale_m
        return line, sample

    def latlon_of(self, line, sample, conv: demmod.Convention):
        p = self.proj
        dx = (np.asarray(sample, dtype=np.float64) - p.sample_offset) * p.map_scale_m
        dy = (p.line_offset - np.asarray(line, dtype=np.float64)) * p.map_scale_m
        r_km = np.hypot(dx, dy) / 1000.0
        lat = 2.0 * np.degrees(np.arctan(r_km / (2.0 * p.radius_km))) + p.center_lat
        lon = (conv.handed * np.degrees(np.arctan2(dy, dx)) + conv.offset_deg) % 360.0
        return lat, lon

    def sample(self, lat, lon, conv: demmod.Convention):
        """双线性采样高程（米）。越界返回 NaN。"""
        line, sample = self.pixel_of(lat, lon, conv)
        n_lin, n_sam = self.proj.lines, self.proj.samples
        inside = ((line >= 0) & (line <= n_lin - 1)
                  & (sample >= 0) & (sample <= n_sam - 1))

        l0 = np.clip(np.floor(line), 0, n_lin - 2).astype(np.int64)
        s0 = np.clip(np.floor(sample), 0, n_sam - 2).astype(np.int64)
        fl = np.clip(line - l0, 0.0, 1.0)
        fs = np.clip(sample - s0, 0.0, 1.0)

        v = (self.dn[l0, s0] * (1 - fl) * (1 - fs)
             + self.dn[l0, s0 + 1] * (1 - fl) * fs
             + self.dn[l0 + 1, s0] * fl * (1 - fs)
             + self.dn[l0 + 1, s0 + 1] * fl * fs).astype(np.float64)

        return np.where(inside, v * self.scale_m, np.nan)

    # -- 自检 ------------------------------------------------------------------

    def selfcheck(self, n: int = 300, seed: int = 0) -> float:
        """与 dem.Projection 的标量实现比对，返回最大像素偏差。"""
        rng = np.random.default_rng(seed)
        conv = demmod.DEFAULT_CONVENTION
        lat = rng.uniform(-90.0, -83.0, n)
        lon = rng.uniform(0.0, 360.0, n)
        v_line, v_samp = self.pixel_of(lat, lon, conv)
        worst = 0.0
        for i in range(n):
            ln, sm = self.proj.latlon_to_pixel(float(lat[i]), float(lon[i]), conv)
            worst = max(worst, abs(ln - v_line[i]), abs(sm - v_samp[i]))
        return float(worst)


# --------------------------------------------------------------------------- #
# 球面几何
# --------------------------------------------------------------------------- #

def destination(lat0: float, lon0: float, az_deg, dist_m):
    """从 (lat0, lon0) 沿真方位角 az 走 dist 米（球面大圆），返回落点经纬度。"""
    d = np.asarray(dist_m, dtype=np.float64) / R_MOON_M
    la = np.radians(lat0)
    a = np.radians(np.asarray(az_deg, dtype=np.float64))

    sin_lat = np.sin(la) * np.cos(d) + np.cos(la) * np.sin(d) * np.cos(a)
    lat = np.arcsin(np.clip(sin_lat, -1.0, 1.0))
    lon = np.radians(lon0) + np.arctan2(
        np.sin(a) * np.sin(d) * np.cos(la),
        np.cos(d) - np.sin(la) * np.sin(lat),
    )
    return np.degrees(lat), np.degrees(lon) % 360.0


def elevation_angle(h_site: float, h_target, dist_m) -> np.ndarray:
    """目标点相对站点当地地平线的仰角（度），含月球曲率。

    推导：在过站点、目标与球心的大圆平面里，站点在 (R+h_s, 0)，目标在
    (R+h_t)·(cos d, sin d)。以站点半径方向为「上」，则

        上分量   = (R+h_t)·cos d − (R+h_s)
        水平分量 = (R+h_t)·sin d

    等高点时上分量 = (R+h)(cos d − 1) < 0，仰角 = −d/2，符合球面下沉。
    """
    r = np.asarray(dist_m, dtype=np.float64)
    ht = np.asarray(h_target, dtype=np.float64)
    d = r / R_MOON_M
    num = (R_MOON_M + ht) * np.cos(d) - (R_MOON_M + h_site)
    den = (R_MOON_M + ht) * np.sin(d)
    return np.degrees(np.arctan2(num, den))


def selfcheck() -> list[tuple[bool, str]]:
    """曲率项的符号与量级自检。这几条解析解不依赖 DEM，能在秒级跑完。

    存在的理由：控制站点（坑底）能验证整条链路通不通，但坑底由近处坑壁
    主导（21°），曲率项写反只差 0.1°；极区真正的信号在 1–2°，只有解析
    自检才抓得住。2026-11-11 修的就是这个符号。
    """
    out: list[tuple[bool, str]] = []

    def item(ok: bool, msg: str) -> None:
        out.append((bool(ok), f"{'PASS' if ok else 'FAIL'}  {msg}"))

    dists = np.array([1e3, 5e3, 20e3, 50e3, 150e3])
    equal = elevation_angle(0.0, np.zeros_like(dists), dists)
    expect = -np.degrees(dists / R_MOON_M / 2.0)
    worst = float(np.max(np.abs(equal - expect)))
    item(worst < 1e-9, f"等高点仰角 = −d/2（最大偏差 {worst:.2e}°，5 个距离）")
    item(bool(np.all(equal < 0.0)), "等高点全部低于当地地平线（曲率压下去，不是抬起来）")

    # 单调性：等高面随距离单调下沉
    far = np.array([1e3, 2e3, 5e3, 10e3, 20e3, 50e3, 100e3, 150e3])
    e = elevation_angle(0.0, np.zeros_like(far), far)
    item(bool(np.all(np.diff(e) < 0.0)), "等高面仰角随距离单调下降")

    # 与「平面 + 曲率下沉」近似式交叉核对（20 km，目标高 1 km）
    r = 20_000.0
    got = float(elevation_angle(0.0, np.array([1000.0]), np.array([r]))[0])
    approx = np.degrees(np.arctan((1000.0 - r * r / (2 * R_MOON_M)) / r))
    item(abs(got - approx) < 0.01, f"20 km/1 km 高地仰角 {got:+.3f}° 与近似式 {approx:+.3f}° 一致")

    # 目标在站点正上方（d→0）时仰角应为 +90°
    item(float(elevation_angle(0.0, np.array([1000.0]), np.array([1e-6]))[0]) > 89.9,
         "零距离高差 → 仰角接近 +90°")
    return out


# --------------------------------------------------------------------------- #
# 地平线剖面
# --------------------------------------------------------------------------- #

def horizon_profile(grid: HeightGrid, lat: float, lon: float, *,
                    az_step_deg: float = 1.0,
                    max_range_m: float = DEFAULT_MAX_RANGE_M,
                    step_m: float | None = None,
                    observer_height_m: float = 0.0) -> dict:
    """算出每个方位角的遮挡仰角。

    observer_height_m：观测点相对地面抬高多少米（着陆器桅杆、相机、天线）。
        极区太阳仰角极低，抬高 2 m 就能改变可见性，值得作为可调参数。
    """
    conv = demmod.DEFAULT_CONVENTION
    step = float(step_m if step_m is not None else grid.proj.map_scale_m)
    n_az = int(round(360.0 / az_step_deg))
    az = np.arange(n_az, dtype=np.float64) * az_step_deg + az_step_deg / 2.0
    r = np.arange(step, max_range_m + step, step)

    lat2d, lon2d = destination(lat, lon, az[:, None], r[None, :])
    h_t = grid.sample(lat2d, lon2d, conv)

    h_ground = float(grid.sample(np.array([lat]), np.array([lon]), conv)[0])
    if not np.isfinite(h_ground):
        raise ValueError(f"站点 ({lat}, {lon}) 落在 DEM 之外")
    h_site = h_ground + observer_height_m

    valid = np.isfinite(h_t)
    elev = elevation_angle(h_site, np.where(valid, h_t, h_site), r[None, :])
    elev = np.where(valid, elev, -np.inf)

    k = np.argmax(elev, axis=1)
    best = np.take_along_axis(elev, k[:, None], axis=1)[:, 0]
    horizon_terrain = np.where(np.isfinite(best), best, np.nan)
    # 局部水平面（仰角 0°）本身就是地平线：地形只会加遮挡，不会去掉它。
    # 若某一方位所有地形都在切平面之下（负仰角），该方位的有效地平线仍是 0°。
    # 不钳位会让「地形可见率 > 几何可见率」，违反单调性。
    horizon = np.maximum(horizon_terrain, 0.0)
    reached = np.where(valid, r[None, :], 0.0).max(axis=1)

    return {
        "azimuth_deg": az,
        "horizon_deg": horizon,
        "horizon_terrain_deg": horizon_terrain,
        "range_at_horizon_m": r[k],
        "max_range_reached_m": reached,
        "site_elevation_m": h_ground,
        "observer_height_m": observer_height_m,
        "az_step_deg": az_step_deg,
        "step_m": step,
        "max_range_m": max_range_m,
    }


def blocked_mask(elev_deg, az_deg, profile: dict, *, body_radius_deg: float,
                 use_limb: bool = False):
    """天体是否被地形挡住。

    use_limb=True  → 上边缘高于地平线即算可见（物理上更接近"有没有光"）
    use_limb=False → 中心必须高于地平线
    """
    hz = np.interp(np.asarray(az_deg, dtype=np.float64) % 360.0,
                   profile["azimuth_deg"], profile["horizon_deg"], period=360.0)
    margin = body_radius_deg if use_limb else 0.0
    return np.asarray(elev_deg, dtype=np.float64) + margin <= hz, hz
