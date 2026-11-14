# Bundled data contract

`public/data/` is the only interface between the Python data pipeline and the Next.js
frontend. There is no HTTP API: the browser fetches or statically imports these files.
`schema/data-contract.schema.json` turns that interface into a machine-readable contract.

## Entry points

| Bundled file | `$defs` definition | Written by |
| --- | --- | --- |
| `manifest.json` | `manifest` | `scripts/terrain.py`, completed by `scripts/ephemeris.py` |
| `ephemeris/<site>.json` | `ephemeris` | `scripts/ephemeris.py` |
| `horizon/<site>.json` | `horizon` | `scripts/terrain.py` |
| `terrain/polar-1024.json` | `terrainHeader` | `scripts/terrain.py` |
| `validation.json` | `validationReport` | `scripts/validate_ephemeris.py` |
| `terrain/polar-1024-lroc.json` | `imagery` | `scripts/imagery.py` |

`public/data/terrain/polar-1024.bin` is described by the `terrainHeader` byte layout
(`1024 × 1024` uint16 little-endian). `ephemerisRow`, `site`, `terrainSource`,
`validationEvent` and `validationRow` are building blocks referenced by the entry points.

`manifest.status` is `terrain-ready` only between `terrain.py` and `ephemeris.py`; a
shipped manifest is `ready` and carries `ephemerisProvenance` and `visibilityProvenance`.

## Source of truth

The schema is the single source for:

- `lib/data-types.ts` — generated TypeScript types, checked by `node scripts/generate-types.mjs --check`.
- `scripts/contract.py` — dependency-free validator used by the writers, `check_schema.py`
  and `check_data.py`.

Do not hand-edit `lib/data-types.ts`. Change the schema first, then run:

```sh
node scripts/generate-types.mjs
python scripts/check_schema.py
```

## What the schema asserts

The validator intentionally supports a small, explicit JSON Schema 2020-12 subset:
`$ref` (local `#/$defs/...` only), `type`, `const`, `enum`, `required`, `properties`,
`additionalProperties`, `items`, `prefixItems`, `minItems`, `maxItems`, `minimum`,
`maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `minLength`, `maxLength`, `pattern`,
`oneOf`, `anyOf`, `allOf`, and `format` for `date-time` and `uri`. Unknown keywords are
an error rather than silently ignored, so a schema change cannot quietly weaken
validation. If the contract needs more of the standard, add the keyword to
`scripts/contract.py` and to the generator's type mapping together.

`format` is an assertion here, not an annotation: `date-time` must parse as RFC 3339 and
`uri` must have an `http`/`https` scheme. Timestamps in the contract also carry a `Z`
pattern, so UTC is explicit.

## Invariants that stay in Python

A single-file schema cannot express everything the contract depends on. These live in
`scripts/check_schema.py` (linkage) and `scripts/check_data.py` (physical invariants):

- every `manifest.sites[].ephemeris` / `.horizon` path resolves under `public/data/`;
- a site id matches the `siteId` in both of its files, and its elevation matches
  `horizon.siteElevationMeters`;
- ephemeris rows equal `(end − start) / stepHours + 1`;
- the terrain binary is exactly `width × height × 2` bytes and matches `binarySha256`;
- a shipped manifest is `status: "ready"` and carries both provenance fields;
- a taller mast never raises a skyline angle.

## Scope

The schema describes the 2026 shipped product. `year`, site coordinates and the terrain
resolution are contract values, not arbitrary application settings. Adding a site or
changing a resolution is a contract change: update the schema, regenerate types, regenerate
data, and run the full check suite.
