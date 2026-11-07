# Lunar Mission Navigator

An interactive, frontend-only lunar mission planning concept for NASA Space Apps Challenge 2026. All mission results are labeled simulated. This independent concept is not an official NASA product.

## Run

Requires Node.js 20.9+.

```sh
npm ci
npm run dev
```

Open http://localhost:3000.

```sh
npm test
npm run typecheck
npm run build
```

The production build exports a static site to `out/`. Serve that directory with any static host. There is no backend, authentication, database, or scientific API integration.

## Experience

- Cinematic landing and a textured 3D Moon with orbit, zoom, south-pole focus, selectable markers, and illustrative overlays.
- Shared site, UTC dates, and requirements across Explorer, Site Comparison, Mission Windows, and Mission Brief.
- Deterministic visibility intervals, qualifying-window selection, playback, and an illustrative horizon chart.
- Keyboard controls, onboarding, mobile configuration sheet, reduced motion, and static fallback.
- Print-to-PDF mission brief through the browser print dialog.

## Demo model

`lib/mission.ts` defines a fixed 72-hour repeating solar/Earth schedule for each site. UTC dates shift and clip the intervals; the range includes both selected dates and is limited to 31 days. Windows require uninterrupted sunlight, meet the required duration, and merge adjacent Earth-visible intervals only when their gap is within the allowed blackout. A 48-hour duration produces no matches.

Lighting, horizon positions, coverage, and elevation grid are visual demonstrations, not scientific results. Marker labels are offset for readability. No safety score or NASA-derived forecast is produced. Future scientific implementation would require validated terrain and ephemeris calculations.

## Stack

Next.js App Router, React, TypeScript, Tailwind CSS, shadcn-style Radix UI foundations, Motion, Three.js, React Three Fiber, Drei, Recharts, Lucide, Geist, and Space Grotesk.

## Imagery

Moon textures: **NASA’s Scientific Visualization Studio, CGI Moon Kit**, visualizer Ernie Wright; LRO LROC and LOLA source data.

Source: https://svs.gsfc.nasa.gov/4720/

- `public/moon-color.jpg`: `lroc_color_2k.jpg` (2025 color map)
- `public/moon-height.jpg`: `ldem_3_8bit.jpg`

Used for visualization only. The CGI color map is optimized for aesthetics, not scientific measurement.
