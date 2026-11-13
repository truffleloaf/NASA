# Visual upgrade and verification — 13 November 2026

## Scope and phases

This pass starts at `503e0ed`. The science engine, share codec, `public/data/`,
`scripts/`, and `docs/DATA.md` are unchanged. GitHub integration is based on newer
main `7fad9fd`, preserving its backend pipeline and documentation.

0. Valid starting window; guarded restoration, debounced URL updates, scoped keyboard
   controls, date validation, useful empty-state advice, selection and provenance popovers.
1. Bundled Geist / Geist Mono, semantic night palette, quieter labels, flat cards,
   amber actions, numeric transitions, gradient tracks and interactive horizon chart.
2. One lazy R3F canvas for the Moon and 14,000-particle galaxy (6,000 on mobile),
   restrained parallax, rare shooting stars, entrance and south-pole dive transition.
3. Bundled NASA albedo/displacement and Earth imagery; illustrative lunar response,
   earthshine, libration, a selected-site marker and Earth sight line. See ASSETS.md.
4. Actual LOLA terrain with slope/elevation/lit-now layers, terrain inspection,
   site fly-to, tour, orbit/reset controls and surface sky paths. Shadow maps use a
   tight frustum; updates are capped at 15 Hz while the light eases between samples.
5. Power/comms/overlap summaries, countdowns, date presets, local + UTC time,
   two-site/two-period comparison, Guided/Expert controls and honest coordinate coverage.
6. Mobile overflow fixes, accessible canvas/popovers, reduced-motion fallbacks,
   refreshed screenshots, final checks and the measurements below.

## Measurements

- Initial JavaScript: **231,005 bytes gzip**, including legacy polyfills, before the
  lazy 3D chunks. Below the 250 kB budget. Sum of gzip sizes of index.html script assets.
- Conservative muted-text contrast over the protected hero copy area: **6.46:1**.
- Three-site mast recalculation: **0.58 ms p95** in the bundled benchmark (default
  seven-day period). This is computation only, not end-to-end browser paint time.
- Explorer playback: **22 rendered fps** in the visible desktop in-app browser,
  development build, 1440×900, 24 h/s. Before shadow refresh throttling: 20 fps.
  **The 55/60 fps acceptance target has not been met in this environment.** This is
  neither a representative mid-range laptop benchmark nor a production FPS guarantee.
- That playback sample reported 7 geometries and 4 textures. Twenty consecutive
  Polar/Surface switches completed without observed context-loss errors. This checks
  stability; it is not a full GPU memory-leak proof. Resources dispose on unmount.
- Terrain DPR is capped at 1.5; landing DPR at 2. Terrain pauses on demand and ambient
  landing animation pauses offscreen. CPU relief preparation yields in short batches.

Chrome Lighthouse on the local static production build, 4× CPU throttling,
DPR 1, desktop preset with 1440×900 or 390×844 screen emulation. Single-run observations:

| Screen | Performance | Accessibility | Best practices | CLS |
| --- | ---: | ---: | ---: | ---: |
| landing-1440 | 84 | 100 | 100 | 0.000 |
| landing-390 | 84 | 100 | 100 | 0.000 |
| landing-390-reduced | 100 | 100 | 100 | 0.000 |
| explorer-1440 | 70 | 100 | 100 | 0.008 |
| explorer-390 | 72 | 100 | 100 | 0.000 |
| compare-1440 | 100 | 100 | 100 | 0.043 |
| compare-390 | 99 | 100 | 100 | 0.000 |

Accessibility and best-practices targets pass for these audited views. Motion-enabled
landing (84) and Explorer (70/72) miss the performance target of 85. Explorer startup
includes main-thread Three.js/shader/geometry work; the two largest observed tasks were
495 ms and 466 ms under 4× throttling. Compare reaches 99–100. Do not describe this pass
as having passed every performance requirement. Reduced-motion landing is static and
scores 100; it retains the same content and provenance.

## Verification evidence

- `npm run typecheck`, all **18 tests**, and `npm run build` pass.
- New tests cover starting-window validity, malformed dates/restoration, signed
  coordinates, countdown boundaries, texture coordinates and inverse polar projection.
- Browser-checked: mobile comparison document width 390 at viewport 390; mobile
  Explorer and landing composition; two-period differences; window selection jumps to
  its start and marks the track; provenance popover; expert controls; printable brief
  including west longitude; browser Back restores Explorer.
- Unit tests verify exact share round-trips and CSV provenance. The in-app clipboard
  did not return copied text during QA, so native clipboard delivery is not certified.
- Date validation is covered by unit tests and source inspection. Browser automation
  of native date inputs did not reliably dispatch React changes; do not count that as
  a completed keyboard-only flow. An exhaustive keyboard/screen-reader pass remains.
- Screens in `docs/screens/` are final production Lighthouse captures, cropped to
  1440×900 / 390×844, with an additional full-height mobile landing capture.

## Deliberate limits

- Dark terrain is shadowed at the selected time. **Permanent** shadow classification
  needs long-term illumination data and is not inferred from a picture.
- Photo albedo, ambient occlusion, exaggerated relief, galaxy, landing positions and
  accelerated libration are visual approximations. Scientific values keep their own
  Computed/Estimated badges; presentation never changes the engine results.
- Terrain is a 256-subdivision rendering of the bundled 1024 DEM, not a landing hazard
  model. No extra procedural crater noise is presented as terrain measurement.
- Site previews use the real horizon silhouette rather than additional mini canvases.
- Arbitrary-coordinate visibility and Apollo/CLPS coverage require new data; see BACKLOG.md.
- No new external runtime requests. All fonts and imagery are bundled. No backend
  pipeline changes are part of this visual update.
