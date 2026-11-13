"""JPL Horizons：月球表面某点的站心方位角/高度角。

2026-11-11 实测可用的调用方式（HTTP 200）：
    CENTER='coord@301'  COORD_TYPE='GEODETIC'  SITE_COORD='lon,lat,alt_km'
    QUANTITIES='4'      APPARENT='AIRLESS'     CSV_FORMAT='YES'

返回的是 airless apparent azimuth/elevation，已经包含光行时、光行差、
引力偏折。月球没有大气，所以不需要折射改正 —— 这一点很重要，省掉一整个
容易出错的环节。

约定：
    az  从正北起算，顺时针（北0 -> 东90 -> 南180 -> 西270），单位度
    el  相对当地地平的高度角，单位度
    时间一律 UTC
"""

from __future__ import annotations

import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://ssd.jpl.nasa.gov/api/horizons.api"

# Horizons 的天体编号
BODY_ID = {
    "sun": "10",
    "earth": "399",
    "moon": "301",
}

# 月球半径（Horizons 的 coord@301 用球体 1737.4 km，扁率为 0）
R_MOON_KM = 1737.4

CACHE_DIR = Path(__file__).resolve().parents[1] / "data" / "horizons"


def _cache_path(kind: str, body: str, site: str, start: str, stop: str, step: str) -> Path:
    safe = f"{body}_{site}_{start[:10]}_{stop[:10]}_{step}".replace(" ", "").replace(":", "")
    return CACHE_DIR / f"{kind}_{safe}.txt"


def build_url(body: str, lon: float, lat: float, alt_km: float,
              start: str, stop: str, step: str) -> str:
    """拼出 Horizons API 的 URL。参数名和取值都很挑剔，别自己简化。"""
    params = {
        "format": "text",
        "COMMAND": f"'{BODY_ID[body]}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon},{lat},{alt_km}'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
        "QUANTITIES": "'4'",
        "ANG_FORMAT": "'DEG'",
        "CSV_FORMAT": "'YES'",
        "APPARENT": "'AIRLESS'",
    }
    query = "&".join(
        f"{k}={urllib.parse.quote(v, safe='')}" for k, v in params.items()
    )
    return f"{API}?{query}"


def parse_samples(text: str) -> list[tuple[datetime, float, float]]:
    """从 Horizons 的 CSV 输出里取出 (UTC时间, 方位角, 高度角)。

    输出形如：
        2026-Dec-01 00:00,*,i,   6.669263,    -1.510879,
    第 1 列时间，第 2/3 列是太阳/干扰天体的地平线符号（忽略），
    第 4 列方位角，第 5 列高度角。
    """
    rows: list[tuple[datetime, float, float]] = []
    inside = False
    for line in text.splitlines():
        s = line.strip()
        if s == "$$SOE":
            inside = True
            continue
        if s == "$$EOE":
            break
        if not inside or not s:
            continue
        parts = [p.strip() for p in s.split(",")]
        if len(parts) < 5:
            continue
        t = datetime.strptime(parts[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        rows.append((t, float(parts[3]), float(parts[4])))
    return rows


def fetch(body: str, site: str, lon: float, lat: float,
          start: str, stop: str, step: str = "10 m",
          alt_km: float = 0.0, refresh: bool = False) -> list[tuple[datetime, float, float]]:
    """取一条方位角/高度角时间序列，带磁盘缓存（黑客松现场断网也能重跑）。"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache = _cache_path("azel", body, site, start, stop, step)

    if cache.exists() and not refresh:
        text = cache.read_text(encoding="utf-8", errors="replace")
    else:
        url = build_url(body, lon, lat, alt_km, start, stop, step)
        with urllib.request.urlopen(url, timeout=120) as resp:
            text = resp.read().decode("utf-8", errors="replace")
        cache.write_text(text, encoding="utf-8")
        time.sleep(1.0)  # 对 JPL 客气一点，别把限流惹出来

    rows = parse_samples(text)
    if not rows:
        raise RuntimeError(f"Horizons 没有返回数据：body={body} site={site}\n{text[:600]}")
    if len(rows) < 10:
        raise RuntimeError("返回的数据太少，可能日期/步长写错了")
    return rows
