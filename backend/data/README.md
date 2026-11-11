# Generated data — not committed

Everything in this directory is produced by the scripts in `../pipeline/`.

| Path | Produced by | Size | Committed |
| --- | --- | --- | --- |
| `horizons/` | `pipeline/horizons.py` (on first fetch) | ~830 kB | no |
| `dem/` | `pipeline/fetch_dem.py` | ~115 MB | **no** — exceeds repository limits |
| `out/` | future exporter | — | no |

To rebuild from scratch:

```sh
python backend/pipeline/fetch_dem.py
python backend/pipeline/demo_geometric.py
```

Both are safe to re-run; the DEM download resumes from a partial file and Horizons
responses are reused from cache when present.
