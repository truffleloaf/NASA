"""LOLA 极区 DEM：投影换算（Phase 0）。

数据集：LDEM_85S_40M（PDS，LRO-L-LOLA-3-RDR-V1）
    7584 x 7584，16-bit little-endian 有符号整数，40 m/pixel
    height_m = DN * 0.5，相对参考半径 1737.4 km
    南半球极射赤面投影（spherical），投影中心 (-90, 0)，正东为正

这个文件负责「经纬度 <-> 像素 <-> 方位角」的换算，并且把每一步都做成
可证伪的。地形地平线在 Phase 1，不在这里。

投影的数学部分（半径、比例尺、投影偏移）由 PDS 标签唯一确定；
但「图上哪条辐射线是 0° 经线、经度往哪边增加」标签里没有直接写死，
只能用已知地标反推。2026-11-11 实测结论：

    lon = 90° - atan2(dy, dx)      即 Convention(handed=-1, offset_deg=90)

依据是 Shackleton 坑心落在 (89.654S, 128.31E)，与公开值 (89.6S, 128.2E)
差 0.19°；同一约定下 Malapert 是 +5174 m 的峰、Cabeus 是 -4298 m 的坑底。
换任何其他候选，这三条至少两条不成立。详见 `python dem.py report`。

用法：
    python dem.py check        数学自检（与经度约定无关）
    python dem.py convention   8 个候选约定，用地标证伪
    python dem.py sample       抽查几个点的经纬度/高程
    python dem.py report       跑全部检查并生成 markdown 报告
"""

from __future__ import annotations

import math
import mmap
import re
import struct
import sys
from array import array
from dataclasses import dataclass
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "dem"
IMG_PATH = DATA_DIR / "ldem_85s_40m.img"
LBL_PATH = DATA_DIR / "ldem_85s_40m.lbl"
REPORT_PATH = DATA_DIR / "projection_check.md"

# XML 里给出的左上角点，单位 m。两条独立的元数据必须自洽。
XML_UPPERLEFT_X = -151680.0
XML_UPPERLEFT_Y = 151680.0

# 反推约定时用的参考点。Shackleton 坑心，公开值 89.6°S / 128.2°E，直径 21 km。
SHACKLETON_LAT = -89.6
SHACKLETON_LON = 128.2


# --------------------------------------------------------------------------- #
# PDS 标签
# --------------------------------------------------------------------------- #

def read_label(path: Path = LBL_PATH) -> dict[str, str]:
    """把 PDS 标签读成扁平字典。只认 `KEY = VALUE`，续行和注释跳过。

    值里的 `<pix>` `<deg>` 单位和引号都去掉 —— 单位由字段名本身表达。
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    # /* ... */ 是 PDS 块注释，先整体剥掉，免得里面的 "KEY = VALUE" 被误读
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    out: dict[str, str] = {}
    for line in text.splitlines():
        m = re.match(r"^\s*\^?([A-Z][A-Z0-9_]*)\s*=\s*(.+?)\s*$", line)
        if not m:
            continue
        val = re.sub(r"<[^>]*>", "", m.group(2))
        out.setdefault(m.group(1), val.strip().strip('"').strip("'"))
    return out


# --------------------------------------------------------------------------- #
# 投影
# --------------------------------------------------------------------------- #

@dataclass(frozen=True)
class Convention:
    """地图平面角 -> 经度的约定：lon = (handed * atan2(dy, dx) + offset) % 360。

    handed=+1 / -1 对应镜像，offset 对应整体旋转。极射投影的半径与比例尺
    由标签唯一确定，只有这个「朝向」需要用地标反推。
    """

    handed: int = -1
    offset_deg: float = 90.0

    def describe(self) -> str:
        return f"handed={self.handed:+d} offset={self.offset_deg:5.1f}°"


DEFAULT_CONVENTION = Convention()


@dataclass(frozen=True)
class Projection:
    lines: int
    samples: int
    map_scale_m: float
    line_offset: float
    sample_offset: float
    radius_km: float
    center_lat: float
    center_lon: float
    scale_factor: float
    offset_m: float

    @classmethod
    def from_label(cls, path: Path = LBL_PATH) -> "Projection":
        lb = read_label(path)
        def num(key: str) -> float:
            if key not in lb:
                raise KeyError(f"PDS 标签里找不到 {key}")
            return float(lb[key])
        return cls(
            lines=int(num("LINES")),
            samples=int(num("LINE_SAMPLES")),
            map_scale_m=num("MAP_SCALE"),
            line_offset=num("LINE_PROJECTION_OFFSET"),
            sample_offset=num("SAMPLE_PROJECTION_OFFSET"),
            radius_km=num("A_AXIS_RADIUS"),
            center_lat=num("CENTER_LATITUDE"),
            center_lon=num("CENTER_LONGITUDE"),
            scale_factor=num("SCALING_FACTOR"),
            offset_m=num("OFFSET"),
        )

    # -- 像素 <-> 经纬度 -------------------------------------------------------

    def pixel_to_latlon(self, line: float, sample: float,
                        conv: Convention = DEFAULT_CONVENTION) -> tuple[float, float]:
        dx = (sample - self.sample_offset) * self.map_scale_m
        dy = (self.line_offset - line) * self.map_scale_m   # 向上为 +y
        r_km = math.hypot(dx, dy) / 1000.0
        # r = 2R tan((90+lat)/2)  =>  lat = 2 atan(r/2R) - 90
        lat = 2.0 * math.degrees(math.atan(r_km / (2.0 * self.radius_km))) + self.center_lat
        if r_km == 0.0:
            return lat, self.center_lon % 360.0
        lon = (conv.handed * math.degrees(math.atan2(dy, dx)) + conv.offset_deg) % 360.0
        return lat, lon

    def latlon_to_pixel(self, lat: float, lon: float,
                        conv: Convention = DEFAULT_CONVENTION) -> tuple[float, float]:
        if lat < self.center_lat or lat > self.center_lat + 90.0:
            raise ValueError(f"纬度 {lat} 超出该投影的有效范围")
        r_m = 2.0 * self.radius_km * math.tan(math.radians((90.0 + lat) / 2.0)) * 1000.0
        theta = math.radians(conv.handed * (lon - conv.offset_deg))
        return (self.line_offset - r_m * math.sin(theta) / self.map_scale_m,
                self.sample_offset + r_m * math.cos(theta) / self.map_scale_m)

    def radius_px(self, lat: float) -> float:
        """某纬度圈在图上离图心多少像素。"""
        r_m = 2.0 * self.radius_km * math.tan(math.radians((90.0 + lat) / 2.0)) * 1000.0
        return r_m / self.map_scale_m

    # -- 方位角 ---------------------------------------------------------------

    def step_bearing(self, lat: float, lon: float, bearing_deg: float,
                     distance_km: float,
                     conv: Convention = DEFAULT_CONVENTION) -> tuple[float, float]:
        """从 (lat, lon) 沿罗盘方位角走 distance_km，返回落点。

        极区最容易搞错的一步。在本图上：
            北（方位 0）= 远离极点 = 沿半径向外
            东（方位 90）= 经度增加的方向 = 地图平面角 θ 减小的方向
        """
        line0, sample0 = self.latlon_to_pixel(lat, lon, conv)
        dy = self.line_offset - line0
        dx = sample0 - self.sample_offset
        theta = math.atan2(dy, dx)
        # 单位向量：径向向外，以及经度增加方向
        nx, ny = math.cos(theta), math.sin(theta)
        ex, ey = math.sin(theta), -math.cos(theta)
        b = math.radians(bearing_deg)
        ux = math.cos(b) * nx + math.sin(b) * ex
        uy = math.cos(b) * ny + math.sin(b) * ey
        d = distance_km * 1000.0 / self.map_scale_m
        return self.pixel_to_latlon(line0 - uy * d, sample0 + ux * d, conv)


# --------------------------------------------------------------------------- #
# 数据读取
# --------------------------------------------------------------------------- #

class Dem:
    """内存映射的 DEM。115 MB 不整块读进来。"""

    def __init__(self, img: Path = IMG_PATH, lbl: Path = LBL_PATH):
        self.proj = Projection.from_label(lbl)
        self.path = img
        self._file = open(img, "rb")
        self._mm = mmap.mmap(self._file.fileno(), 0, access=mmap.ACCESS_READ)
        expected = self.proj.lines * self.proj.samples * 2
        if len(self._mm) != expected:
            raise ValueError(f"DEM 大小不对：{len(self._mm)} != {expected}")

    def close(self) -> None:
        self._mm.close()
        self._file.close()

    def __enter__(self) -> "Dem":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # -- 取数 ----------------------------------------------------------------

    def row(self, line: int) -> array:
        n = self.proj.samples
        a = array("h")
        a.frombytes(self._mm[line * n * 2:(line + 1) * n * 2])
        return a

    def dn(self, line: int, sample: int) -> int:
        if not (0 <= line < self.proj.lines and 0 <= sample < self.proj.samples):
            raise IndexError(f"像素越界：line={line} sample={sample}")
        return struct.unpack_from("<h", self._mm, (line * self.proj.samples + sample) * 2)[0]

    def height_m(self, line: int, sample: int) -> float:
        return self.dn(line, sample) * self.proj.scale_factor

    def height_at(self, lat: float, lon: float,
                  conv: Convention = DEFAULT_CONVENTION) -> float | None:
        line, sample = self.proj.latlon_to_pixel(lat, lon, conv)
        ln, sm = int(round(line)), int(round(sample))
        if not (0 <= ln < self.proj.lines and 0 <= sm < self.proj.samples):
            return None
        return self.height_m(ln, sm)

    def stats(self, stride: int = 32) -> dict[str, float]:
        """抽样统计。5700 万点没必要全扫，stride=32 已够判断量级。"""
        lo, hi, n, nodata = 1e9, -1e9, 0, 0
        for line in range(0, self.proj.lines, stride):
            a = self.row(line)
            for sample in range(0, self.proj.samples, stride):
                dn = a[sample]
                if dn == -32768:
                    nodata += 1
                    continue
                h = dn * self.proj.scale_factor
                lo, hi, n = min(lo, h), max(hi, h), n + 1
        return {"min_m": lo, "max_m": hi, "n": n, "nodata": nodata}

    # -- 局部地形 ------------------------------------------------------------

    def deepest_near(self, line: float, sample: float, radius_km: float,
                     stride: int = 1) -> tuple[float, int, int]:
        p, r_px = self.proj, radius_km * 1000.0 / self.proj.map_scale_m
        best = (1e9, 0, 0)
        for y in range(max(0, int(line - r_px)), min(p.lines, int(line + r_px) + 1), stride):
            a = self.row(y)
            dy = y - line
            for x in range(max(0, int(sample - r_px)), min(p.samples, int(sample + r_px) + 1), stride):
                if (x - sample) ** 2 + dy * dy > r_px ** 2:
                    continue
                h = a[x] * p.scale_factor
                if h < best[0]:
                    best = (h, y, x)
        return best

    def floor_centroid(self, line: float, sample: float, radius_km: float,
                       threshold_m: float) -> tuple[float, float, int]:
        """指定圆内低于阈值的高程像素质心。返回 (line, sample, 像素数)。"""
        p, r_px = self.proj, radius_km * 1000.0 / self.proj.map_scale_m
        sy = sx = n = 0
        for y in range(max(0, int(line - r_px)), min(p.lines, int(line + r_px) + 1)):
            a = self.row(y)
            for x in range(max(0, int(sample - r_px)), min(p.samples, int(sample + r_px) + 1)):
                if (x - sample) ** 2 + (y - line) ** 2 > r_px ** 2:
                    continue
                if a[x] * p.scale_factor < threshold_m:
                    sy += y
                    sx += x
                    n += 1
        return (sy / n, sx / n, n) if n else (float("nan"), float("nan"), 0)


# --------------------------------------------------------------------------- #
# 自检
# --------------------------------------------------------------------------- #

def check(proj: Projection, dem: Dem) -> list[tuple[bool, str]]:
    """与经度约定无关的数学自检。过了只说明投影半径/比例尺对，
    不说明经度朝向对 —— 那个交给 convention()。"""
    conv = DEFAULT_CONVENTION
    out: list[tuple[bool, str]] = []

    def item(ok: bool, msg: str, detail: str = "") -> None:
        out.append((bool(ok), f"{'PASS' if ok else 'FAIL'}  {msg}" + (f"   {detail}" if detail else "")))

    line, sample = proj.latlon_to_pixel(-90.0, 0.0, conv)
    item(abs(line - proj.line_offset) < 1e-9 and abs(sample - proj.sample_offset) < 1e-9,
         "极点落在投影中心",
         f"({line:.6f}, {sample:.6f})")

    r85, half = proj.radius_px(-85.0), proj.samples / 2.0
    item(abs(r85 - half) < 1.0, "85°S 纬圈半径 ≈ 图半宽",
         f"{r85:.2f} px vs {half:.0f} px（差 {r85 - half:+.2f} px）")

    radii = [math.hypot(*[v - o for v, o in zip(proj.latlon_to_pixel(-87.0, k * 22.5, conv),
                                                (proj.line_offset, proj.sample_offset))][::-1])
             for k in range(16)]
    item(max(radii) - min(radii) < 1e-9, "纬圈各向同性",
         f"半径离散 {max(radii) - min(radii):.3e} px")

    worst = 0.0
    for k in range(2000):
        lat = -90.0 + 5.0 * ((k * 0.6180339887) % 1.0) * 0.999
        lon = (k * 137.5077641) % 360.0
        lat2, lon2 = proj.pixel_to_latlon(*proj.latlon_to_pixel(lat, lon, conv), conv)
        dlon = abs((lon2 - lon) + 180.0) % 360.0 - 180.0
        worst = max(worst, abs(lat2 - lat), abs(dlon))
    item(worst < 1e-9, "2000 点往返换算", f"最大误差 {worst:.3e}°")

    d_x = abs((0 - proj.sample_offset) * proj.map_scale_m - proj.map_scale_m / 2 - XML_UPPERLEFT_X)
    d_y = abs((proj.line_offset - 0) * proj.map_scale_m + proj.map_scale_m / 2 - XML_UPPERLEFT_Y)
    item(d_x < 1e-6 and d_y < 1e-6, "标签 offset 与 XML 角点自洽",
         f"Δx={d_x:.3f} m Δy={d_y:.3f} m")

    item(len(dem._mm) == proj.lines * proj.samples * 2, "文件字节数 = 行×列×2",
         f"{len(dem._mm):,} B")

    # 方位角换算：北 = 纬度增加，东 = 经度增加。
    # 注意：在保角投影上，图上的一条直线不等于球面上的大圆。沿正东走 1 km，
    # 半径会被切线「抬」起 47 m（= L²/2r），所以纬度有 +0.0016° 的漂移是
    # 几何上正确的，不是 bug。正因如此，Phase 1 的地平线必须用 step_bearing
    # 沿大圆逐步走，不能在像素空间里拉一条直线。
    lat0, lon0 = -89.65, 128.3
    dn = proj.step_bearing(lat0, lon0, 0.0, 1.0, conv)
    de = proj.step_bearing(lat0, lon0, 90.0, 1.0, conv)
    item(dn[0] > lat0 and abs(dn[1] - lon0) < 1e-6, "方位 0° = 纬度增加（远离极点）",
         f"Δlat={dn[0] - lat0:+.6f}° Δlon={dn[1] - lon0:+.2e}°")
    dlon = (de[1] - lon0 + 180) % 360 - 180
    item(dlon > 0 and abs(de[0] - lat0) < 5e-3, "方位 90° = 经度增加（正东）",
         f"Δlon={dlon:+.6f}° Δlat={de[0] - lat0:+.2e}°（径向漂移，属预期）")

    return out


def convention_test(dem: Dem) -> tuple[Convention, list[tuple[Convention, float, float]]]:
    """用 Shackleton 坑心反推经度约定。

    坑心在图上的位置与约定无关，只有给它贴的经纬度标签跟约定有关。
    所以：先在图上找到坑心，再问每个候选「这个点叫什么经度」，与
    公开值 (89.6S, 128.2E) 对得上的那个就是答案。
    """
    p = dem.proj
    _, dy, dx = dem.deepest_near(p.line_offset, p.sample_offset, 30.0)
    cy, cx, n = dem.floor_centroid(dy, dx, 14.0, -2000.0)
    rows: list[tuple[Convention, float, float]] = []
    best = (99.0, DEFAULT_CONVENTION)
    for handed in (+1, -1):
        for off in (0.0, 90.0, 180.0, 270.0):
            c = Convention(handed, off)
            lat, lon = p.pixel_to_latlon(cy, cx, c)
            d = math.hypot(abs(lat - SHACKLETON_LAT), min(abs(lon - SHACKLETON_LON),
                                                          360 - abs(lon - SHACKLETON_LON)))
            rows.append((c, lat, lon))
            if d < best[0]:
                best = (d, c)
    return best[1], rows


LANDMARKS = [
    ("Shackleton 坑心", SHACKLETON_LAT, SHACKLETON_LON, "坑底约 -2.9 km，直径 21 km"),
    ("Malapert 山", -85.99, 2.30, "高地，约 +5 km"),
    ("Cabeus 坑心", -85.33, 317.87, "永久阴影坑底，应很低"),
]


# --------------------------------------------------------------------------- #
# 报告
# --------------------------------------------------------------------------- #

def build_report(dem: Dem) -> tuple[str, bool]:
    p, conv = dem.proj, DEFAULT_CONVENTION
    checks = check(p, dem)
    ok = all(c[0] for c in checks)
    chosen, rows = convention_test(dem)
    ok &= chosen == DEFAULT_CONVENTION

    _, dy, dx = dem.deepest_near(p.line_offset, p.sample_offset, 30.0)
    cy, cx, n = dem.floor_centroid(dy, dx, 14.0, -2000.0)
    r_pole = math.hypot(cy - p.line_offset, cx - p.sample_offset) * p.map_scale_m / 1000.0
    area = n * (p.map_scale_m / 1000.0) ** 2

    rim = []
    for k in range(36):
        a = 2 * math.pi * k / 36
        best_h, best_r = -1e9, 0.0
        for i in range(60):
            r_km = 6.0 + i * 0.5
            rr = r_km * 1000.0 / p.map_scale_m
            yy, xx = int(round(cy + rr * math.sin(a))), int(round(cx + rr * math.cos(a)))
            if 0 <= yy < p.lines and 0 <= xx < p.samples:
                h = dem.height_m(yy, xx)
                if h > best_h:
                    best_h, best_r = h, r_km
        rim.append(best_r)

    st = dem.stats()
    L: list[str] = []
    L.append("# LDEM_85S_40M 投影自检（Phase 0）")
    L.append("")
    L.append("由 `python backend/pipeline/dem.py report` 生成，不要手改。")
    L.append("")
    L.append("## 数据")
    L.append("")
    L.append(f"- 文件：`{dem.path.name}`，{len(dem._mm):,} B")
    L.append(f"- 栅格：{p.lines} × {p.samples}，16-bit LSB 整数，{p.map_scale_m:g} m/pixel")
    L.append(f"- 高程：`h = DN × {p.scale_factor:g}`，相对参考半径 {p.offset_m / 1000:g} km")
    L.append(f"- 投影：球面极射赤面，中心 ({p.center_lat:g}, {p.center_lon:g})，"
             f"偏移 ({p.line_offset}, {p.sample_offset})，R = {p.radius_km} km")
    L.append(f"- 抽样高程范围：{st['min_m']:+.0f} .. {st['max_m']:+.0f} m，"
             f"无效点 {st['nodata']}（抽样 {st['n']:,}）")
    L.append("")
    L.append("## 数学自检")
    L.append("")
    for good, msg in checks:
        L.append(f"- `{msg}`")
    L.append("")
    L.append(f"结论：{'全部通过' if ok else '有失败项'}")
    L.append("")
    L.append("## 经度约定（地标反推）")
    L.append("")
    L.append(f"先在图上定位 Shackleton 坑心（与约定无关）："
             f"距极点 {r_pole:.2f} km，坑底面积 {area:.0f} km²。")
    L.append("")
    L.append("| 候选约定 | 坑心纬度 | 坑心经度 | 与公开值偏差 |")
    L.append("| --- | --- | --- | --- |")
    for c, lat, lon in rows:
        d = math.hypot(abs(lat - SHACKLETON_LAT),
                       min(abs(lon - SHACKLETON_LON), 360 - abs(lon - SHACKLETON_LON)))
        mark = " **← 选中**" if c == chosen else ""
        L.append(f"| `{c.describe()}` | {lat:+.3f} | {lon:7.2f} | {d:.2f}°{mark} |")
    L.append("")
    L.append(f"选中 `{chosen.describe()}`，即 `lon = {chosen.offset_deg:.0f}° "
             f"{'-' if chosen.handed < 0 else '+'} θ`。")
    L.append("")
    L.append(f"坑缘半径中位数 {sorted(rim)[18]:.1f} km（公开直径 21 km → 半径 10.5 km）。")
    L.append("")
    L.append("## 地标高程（选定约定下）")
    L.append("")
    L.append("| 地标 | 纬度 | 经度 | 高程 | 预期 |")
    L.append("| --- | --- | --- | --- | --- |")
    for name, la, lo_, note in LANDMARKS:
        h = dem.height_at(la, lo_, chosen)
        L.append(f"| {name} | {la:+.2f} | {lo_:7.2f} | "
                 f"{'越界' if h is None else f'{h:+.0f} m'} | {note} |")
    L.append("")
    L.append("## 仍未验证的")
    L.append("")
    L.append("1. **方位角约定的最终检验**要等地形遮挡做出来：Shackleton 坑底应当全年"
             "近黑暗、坑缘高度受光。若方位角被镜像，阴影图案会整体错，那条检查会失败。")
    L.append("2. **太阳/地球的圆面约定**（中心 vs 上边缘）尚未写入，影响极点附近"
             "0.1° 量级的判定，Phase 1 必须先定。")
    L.append("3. 这张图是球面假设，未做大地水准面（geoid）与地形起伏的区分；"
             "`h` 是相对 1737.4 km 参考球的半径差，不是「海拔」。遮挡判定只用高差，"
             "所以不影响 Phase 1，但 METHOD.md 必须写清楚。")
    return "\n".join(L) + "\n", ok


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #

def cmd_check() -> None:
    with Dem() as dem:
        p = dem.proj
        print(f"DEM  {dem.path.name}  {len(dem._mm):,} B")
        print(f"投影 {p.lines}x{p.samples}  {p.map_scale_m:g} m/px  "
              f"offset ({p.line_offset}, {p.sample_offset})  R={p.radius_km} km")
        ok = True
        for good, msg in check(p, dem):
            print("  " + msg)
            ok &= good
        st = dem.stats()
        print(f"  高程抽样 {st['min_m']:+.0f} .. {st['max_m']:+.0f} m，"
              f"无效点 {st['nodata']}，抽样 {st['n']:,}")
        print("\n结论：" + ("全部通过" if ok else "有失败项，先别往下走"))
        sys.exit(0 if ok else 1)


def cmd_convention() -> None:
    with Dem() as dem:
        chosen, rows = convention_test(dem)
        print("\n8 个候选约定：坑心经纬度 vs 公开值 89.6S / 128.2E")
        print(f"{'约定':<26}{'纬度':>10}{'经度':>10}{'偏差':>10}")
        for c, lat, lon in rows:
            d = math.hypot(abs(lat - SHACKLETON_LAT),
                           min(abs(lon - SHACKLETON_LON), 360 - abs(lon - SHACKLETON_LON)))
            flag = "  <<<" if c == chosen else ""
            print(f"{c.describe():<26}{lat:>10.3f}{lon:>10.2f}{d:>9.2f}°{flag}")
        print(f"\n选中 {chosen.describe()}；与代码里的 DEFAULT_CONVENTION "
              f"{'一致' if chosen == DEFAULT_CONVENTION else '不一致，要改'}")


def cmd_sample() -> None:
    with Dem() as dem:
        print(f"{'地标':<16}{'纬度':>8}{'经度':>9}{'高程':>10}")
        for name, la, lo_, _ in LANDMARKS:
            h = dem.height_at(la, lo_)
            print(f"{name:<16}{la:>8.2f}{lo_:>9.2f}"
                  f"{'越界' if h is None else f'{h:>9.0f} m'}")


def cmd_report() -> None:
    with Dem() as dem:
        text, ok = build_report(dem)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(text, encoding="utf-8")
    print(text)
    print(f"已写入 {REPORT_PATH}")
    sys.exit(0 if ok else 1)


COMMANDS = {"check": cmd_check, "convention": cmd_convention,
            "sample": cmd_sample, "report": cmd_report}

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd not in COMMANDS:
        print(f"未知命令 {cmd}；可用：{', '.join(COMMANDS)}")
        sys.exit(2)
    COMMANDS[cmd]()
