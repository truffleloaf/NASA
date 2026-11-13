"""下载 LOLA 极区 DEM（PDS Geosciences Node）。

产品：LDEM_85S_40M —— 覆盖 85°S 至 90°S，40 米/像素，极射赤面投影。
选择理由：Shackleton(89.90°S) 和 Malapert(85.99°S) 都在范围内；
40 m/像素 对"几公里内的地平线"足够（一个 1 km 的坑缘跨 25 个像素）。

来源锁在 `backend/PROVENANCE.json`：每个文件的字节数和 SHA-256 都固定，
下载后和缓存命中时都会校验，避免截断的缓存静默改变地形。

支持断点续传：网络断了重跑同一条命令即可。已经完整的文件直接跳过；
若服务器对越界 Range 返回 416，也只有哈希正确时才当作完整。
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

BASE = ("https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/"
        "lrolol_1xxx/data/lola_gdr/polar/img/")
PRODUCT = "ldem_85s_40m"
OUT_DIR = pathlib.Path(__file__).resolve().parents[1] / "data" / "dem"
PROVENANCE = pathlib.Path(__file__).resolve().parents[1] / "PROVENANCE.json"


def load_sources() -> dict:
    with PROVENANCE.open(encoding="utf-8") as fh:
        return json.load(fh)["dem"]["files"]


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


def download(name: str, expected: int | None = None) -> pathlib.Path:
    sources = load_sources()
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

    req = urllib.request.Request(BASE + name)
    if partial:
        req.add_header("Range", f"bytes={partial}-")

    try:
        resp = urllib.request.urlopen(req, timeout=120)
    except urllib.error.HTTPError as exc:
        # 从 EOF 起的 Range 会被拒绝为 416；只有哈希正确才算完整，避免把
        # 损坏的缓存当成下载成功。
        if exc.code == 416 and partial and verify(name, dest, sources):
            print(f"[skip] {name} 已完整（{partial:,} 字节）")
            return dest
        raise

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
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"目标目录 {OUT_DIR}")
    print(f"来源锁 {PROVENANCE}")

    # 尺寸来自 .LBL：FILE_RECORDS=7584, RECORD_BYTES=15168
    download(f"{PRODUCT}.img", expected=7584 * 15168)
    download(f"{PRODUCT}.lbl")

    img = OUT_DIR / f"{PRODUCT}.img"
    if img.stat().st_size != 7584 * 15168:
        print(f"❌ 尺寸不对：{img.stat().st_size} != {7584*15168}", file=sys.stderr)
        raise SystemExit(1)
    print("✅ 尺寸与 SHA-256 校验通过")


if __name__ == "__main__":
    main()
