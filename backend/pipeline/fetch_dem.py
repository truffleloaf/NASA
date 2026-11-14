"""下载 LOLA 极区 DEM（PDS Geosciences / MIT 镜像）。

两个产品，编码与基准相同，只是窗口不同：

- ``ldem_85s_40m`` —— 85°S–90°S，7584 × 7584，115 MB。年周期与收敛检查用。
- ``ldem_80s_40m`` —— 80°S–90°S，15200 × 15200，462 MB。六站 cross-product 用；
  85S 窗口装不下 Artemis 三站朝北的 150 km 射线，会把它们截断。

来源锁在 `backend/PROVENANCE.json`：每个文件的字节数和 SHA-256 都固定，
下载后和缓存命中时都会校验，避免截断的缓存静默改变地形。

支持断点续传：网络断了重跑同一条命令即可。已经完整的文件直接跳过；
若服务器对越界 Range 返回 416，也只有哈希正确时才当作完整。

用法：

    python backend/pipeline/fetch_dem.py                  # 两个都下
    python backend/pipeline/fetch_dem.py --product 80s    # 只下宽幅 DEM
    python backend/pipeline/fetch_dem.py --product 85s    # 只下窄幅 DEM
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

PDS = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
       "lrolol_1xxx/data/lola_gdr/polar/img/")
MIT = "https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/"

PRODUCTS = {
    "85s": dict(name="ldem_85s_40m", bases=(PDS, MIT), expected=7584 * 15168),
    "80s": dict(name="ldem_80s_40m", bases=(MIT,), expected=15200 * 30400),
}

OUT_DIR = pathlib.Path(__file__).resolve().parents[1] / "data" / "dem"
PROVENANCE = pathlib.Path(__file__).resolve().parents[1] / "PROVENANCE.json"


def load_sources(key: str) -> dict:
    with PROVENANCE.open(encoding="utf-8") as fh:
        return json.load(fh)["dem"]["products"][key]["files"]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify(name: str, dest: pathlib.Path, sources: dict) -> bool:
    expected = sources.get(name)
    if not expected:
        raise SystemExit(f"{PROVENANCE} 里没有 {name} 的哈希；先更新来源锁。")
    actual = sha256(dest)
    if actual == expected["sha256"]:
        return True
    print(f"[fail] {name} sha256 不匹配：{actual} != {expected['sha256']}", file=sys.stderr)
    return False


def download(key: str, suffix: str) -> pathlib.Path:
    product = PRODUCTS[key]
    name = product["name"] + suffix
    expected = product["expected"] if suffix == ".img" else None
    sources = load_sources(key)
    dest = OUT_DIR / name

    partial = 0
    if dest.exists():
        partial = dest.stat().st_size
        if expected is not None and partial < expected:
            print(f"[resume] {name} 已有 {partial:,}/{expected:,} 字节，继续")
        elif verify(name, dest, sources):
            print(f"[skip] {name} 已完整且 sha256 匹配（{partial:,} 字节）")
            return dest
        else:
            print(f"[redo] {name} 校验失败，删除后重新下载")
            dest.unlink()
            partial = 0

    resp = None
    errors = []
    for base in product["bases"]:
        req = urllib.request.Request(base + name)
        if partial:
            req.add_header("Range", f"bytes={partial}-")
        try:
            resp = urllib.request.urlopen(req, timeout=120)
            break
        except urllib.error.HTTPError as exc:
            # 从 EOF 起的 Range 会被拒绝为 416；只有哈希正确才算完整，避免把
            # 损坏的缓存当成下载成功。
            if exc.code == 416 and partial and verify(name, dest, sources):
                print(f"[skip] {name} 已完整（{partial:,} 字节）")
                return dest
            errors.append(f"{base}: HTTP {exc.code}")
        except (urllib.error.URLError, OSError) as exc:
            errors.append(f"{base}: {exc}")
            print(f"[retry] {base.split('/')[2]} 不可用，换镜像", flush=True)
    if resp is None:
        raise SystemExit(f"{name} 下载失败：\n  " + "\n  ".join(errors))

    t0 = time.time()
    with resp:
        total = expected or partial + int(resp.headers.get("Content-Length", 0))
        mode = "ab" if partial else "wb"
        done = partial
        with open(dest, mode) as fh:
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                fh.write(chunk)
                done += len(chunk)
                if done % (8 << 20) < (1 << 20):
                    rate = (done - partial) / max(time.time() - t0, 1e-6) / 1e6
                    pct = 100 * done / total if total else 0
                    print(f"  {name}: {done/1e6:6.1f}/{total/1e6:6.1f} MB "
                          f"({pct:5.1f}%) {rate:4.1f} MB/s", flush=True)
    print(f"[ok] {name} {dest.stat().st_size:,} 字节")

    if not verify(name, dest, sources):
        dest.unlink()
        raise SystemExit(
            f"{name} 下载完成但 sha256 与 {PROVENANCE.name} 不一致，已删除；"
            "如果 PDS 更新了产品，请显式更新来源锁。"
        )
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(description="下载 LOLA 极区 40 m DEM")
    parser.add_argument("--product", choices=["85s", "80s", "all"], default="all",
                        help="85s = 窄幅年周期用，80s = 宽幅六站交叉验证用（默认两个）")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"目标目录 {OUT_DIR}")
    print(f"来源锁 {PROVENANCE}")

    keys = ["85s", "80s"] if args.product == "all" else [args.product]
    for key in keys:
        download(key, ".img")
        download(key, ".lbl")

    # 尺寸按 .LBL 的 RECORD_BYTES × FILE_RECORDS 校验
    for key in keys:
        product = PRODUCTS[key]
        img = OUT_DIR / (product["name"] + ".img")
        if img.stat().st_size != product["expected"]:
            print(f"❌ 尺寸不对：{img.stat().st_size} != {product['expected']}", file=sys.stderr)
            raise SystemExit(1)
    print("✅ 尺寸与 SHA-256 校验通过")


if __name__ == "__main__":
    main()
