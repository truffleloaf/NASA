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

### Approved visual refinement — November 2026

This section supersedes the original palette, typography and decorative restrictions above.
Background #05070C, surface #0B1018, raised #121A26, text #F2F4F8, muted #8C97A8,
hairlines white at 8%. Sun #FFC46B / #E8903A, Earth #5CC8FF / #3A7BFF,
windows #4FE0B0, labelled warning #FF8A6B. Violet #7C8CFF is for galaxy/focus only.
Geist is the only display/body family (400/500/600); Geist Mono is for numeric data.
Both are bundled @fontsource-variable fonts. Sentence-case 13px labels, 12px captions,
8px spacing grid, 16px cards, 56–72px hero. Primary actions are amber with dark text.
Gradients are allowed in charts and tracks. Soft glow is allowed ONLY on Sun/Earth markers
and the Moon limb. No glassmorphism. Cards stay flat with hairline highlights.
The landing hero may contain a decorative GPU galaxy; explorer skies may contain faint
stars. Never put decoration behind forms, charts or tables. Mask copy to AA contrast.
Decorative motion, compressed libration and landing body positions are Illustrative.
Use 150/240/600ms cubic-bezier(0.2,0,0,1); transform and opacity for DOM motion.
Reduced motion and save-data use static landing visuals. Pause offscreen scenes.
Scientific text updates immediately; lighting may ease to the selected Sun direction.
No science engine, share codec, data, scripts or DATA.md edits in this visual pass.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
