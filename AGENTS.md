# Project: Lunar Mission Navigator (NASA Space Apps 2026)

A static Next.js (App Router, `output: "export"`) tool that shows when a lunar south-pole
site has BOTH sunlight and a line of sight to Earth, so a mission planner can pick a site and
an operating window. Stack: TypeScript, Tailwind, React Three Fiber/drei, Motion, Recharts,
Radix. Hosting serves the `out/` directory. Before using any Next.js API, read the matching
guide in node_modules/next/dist/docs/.

## Non-negotiable rules
1. Honesty first. Every number on screen must carry a provenance badge:
   "Computed" (from ephemeris + terrain data), "Illustrative" (placeholder), or "Estimated".
   Never present illustrative numbers as computed. If a dataset is missing, show a clear empty
   state, not a fake value.
2. No new runtime network calls. All data ships in `public/data/` as compact JSON/binary.
3. Keep `npm run typecheck`, `npm test` and `npm run build` green after every change.
4. Accessibility: WCAG AA contrast, visible focus rings, keyboard access to every control,
   `prefers-reduced-motion` respected, 3D canvas has a text alternative, and all key
   information is also available as text or a table (not only in the canvas).
5. Performance: first load under 250 kB JS before the 3D chunk; lazy-load the 3D scene;
   60 fps on a mid laptop; cap devicePixelRatio at 2; dispose of Three.js resources on unmount.
6. Small, reviewable commits. Do not rewrite unrelated files.

## Design system
Mood: calm mission control. Dark, precise, quiet. Colour carries meaning, not decoration.

Colour tokens (define as CSS variables in app/globals.css and map them in Tailwind):
  --bg:            #0A0D12   page background
  --surface:       #11151C   cards and panels
  --surface-2:     #1C2430   selected or raised
  --surface-3:     #232A36   tracks, segmented controls
  --line:          rgba(255,255,255,0.08)   hairlines; strong: rgba(255,255,255,0.18)
  --text:          #ECE9E3
  --text-muted:    #9AA3B2
  --sun:           #F4B860   sunlight ONLY
  --earth:         #62B6FF   Earth / comms link ONLY
  --ok:            #5FD8A4   operating windows, selected site, success
  --shadow-ink:    #05060A   terrain shadow
  --warn:          #F4B860 (same as sun, used with a text label, never colour alone)
Rules: sun = amber, Earth = blue, windows = green, everywhere (map, timeline, cards, charts).
Do not introduce other accent colours. No gradients on UI chrome, no glassmorphism blur,
no glow except the single pulse ring on the selected site.

Typography (actually load and use the fonts that are already installed):
  Display / headings / big numbers: Space Grotesk, weights 500 and 600
  Body / UI: Inter variable (add @fontsource-variable/inter if missing) or Geist Variable
  Data / labels / coordinates / times: JetBrains Mono (or Geist Mono), tabular-nums
  Scale (px): 11 label caps (+0.12em tracking), 12, 13, 14 body, 17, 20, 22, 32, 64 hero.
  Remove every `font-family: monospace` and `Arial` in globals.css and use the tokens above.

Spacing and shape: 4 px base grid (4, 8, 12, 16, 20, 24, 28). Card radius 16, control radius
10 to 12, pill 999. Cards are flat: 1 px --line border, no shadow. Minimum tap target 44 px.

Motion: 150 ms for hover and press, 240 ms for panels, 600 ms for camera moves, easing
cubic-bezier(0.2, 0, 0, 1). Animate transform and opacity only. Under reduced motion: no
camera fly-ins, no autoplay, no pulse; state changes are instant.

Icons: lucide-react, 16 px, stroke 1.8. No emoji anywhere.

Layout (desktop >= 1200): header, then three columns:
  left 292 px "Mission setup" | centre fluid (map 560 px tall + time and windows card) |
  right 340 px "Insights" (best window, site ranking, horizon).
Tablet 768 to 1199: two columns, setup collapses into a drawer.
Mobile < 768: single column; site chips scroll horizontally; map 300 px tall; time scrubber
and tracks below; bottom bar with "Limits" (opens a sheet) and "Find windows".

Components to build once and reuse (components/ui/): Card, SectionLabel (mono caps),
Segmented, Chip, Slider (label, value, accent), StatTile, ScoreRing, ProvenanceBadge, Track
(horizontal timeline row with bars and playhead), Sheet (mobile drawer), Toast, Skeleton.

## Atmosphere exception

A decorative space background is allowed on the landing hero and as a faint star backdrop
in the 3D scene. Never place it behind cards, tables, forms, or Windows, Compare, Brief,
or Methods pages. Decorative tokens are --galaxy-core #2A3850, --galaxy-arm #1B2433,
and --starlight #DDE3EE; never use them for UI chrome or data meaning.
Decorative layers are aria-hidden and pointer-events none. Sun remains amber, Earth blue,
and windows green. No glassmorphism or emoji. DOM/CSS animation changes only transform
and opacity; only the star canvas and Three.js scenes use per-frame JavaScript animation.
Use cubic-bezier(0.2, 0, 0, 1) and 150 / 240 / 600 ms for UI transitions. The specified
slow galaxy rotation is linear. Reduced motion makes the atmosphere and entrances static.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
