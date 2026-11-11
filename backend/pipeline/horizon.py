"""局部地形地平线：给定站点，算出每个方位角上的最大遮挡仰角。

在 dem.py（Phase 0，投影换算）之上做 Phase 1。不修改 dem.py：
这里把它的标量公式做了一份向量化拷贝，并用 `selfcheck()` 逐点比对，
任何一侧改了都会立刻报错。

物理要点
--------
1. **月球曲率必须算进去。** 距离 r 处的点因为球面弯曲，比平面模型低约
   r²/(2R)：r = 20 km 时约 115 m。极区太阳仰角只有 0–2°，这点差别足以
   改变可见性判断。这里用精确球面公式，不用小角近似：

       elev = atan2( (R+h_t) - (R+h_s)·cos(d) , (R+h_s)·sin(d) ),  d = r/R

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
    """目标点相对站点当地地平线的仰角（度），含月球曲率。"""
    r = np.asarray(dist_m, dtype=np.float64)
    d = r / R_MOON_M
    num = (R_MOON_M + h_target) - (R_MOON_M + h_site) * np.cos(d)
    den = (R_MOON_M + h_site) * np.sin(d)
    return np.degrees(np.arctan2(num, den))


# --------------------------------------------------------------------------- #
# 地平线剖面
# --------------------------------------------------------------------------- #

def horizon_profile(grid: HeightGrid, lat: float, lon: float, *,
                    az_step_deg: float = 1.0,
                    max_range_m: float = 50_000.0,
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
