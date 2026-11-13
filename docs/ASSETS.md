# Bundled visual assets

No external assets load at runtime. Landing positions, lighting, the 30-second libration and the galaxy are **Illustrative**, not a simulation for a mission date.

- Moon: [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/), Ernie Wright, NASA Scientific Visualization Studio. LRO LROC color and LOLA displacement maps, downloaded November 2026. `moon-albedo.webp` and `moon-displacement.webp` are 2048×1024 derivatives. `moon-color-4k.webp` is retained for the explorer's polar UV mapping. Original inputs: `lroc_color_16bit_srgb_4k.tif`, `ldem_16_uint.tif`. Polar albedo is lower-resolution; this photographic texture is not used in scientific calculations.
- Earth: [NASA SVS Blue Marble](https://svs.gsfc.nasa.gov/2915/), NASA/Goddard SVS, Reto Stockli and NASA Earth Observatory. `earth.webp` is a 1024×512 derivative of `bluemarble-1024.png`. Composite imagery, not current weather.
- NASA-produced imagery is used under NASA media-use guidance with attribution; no NASA endorsement is implied.
- Galaxy: deterministic procedural shader particles, original code; no external imagery or measured galaxy positions.
- Fonts: bundled Geist and Geist Mono from `@fontsource-variable`, SIL Open Font License. Package licenses remain in node_modules.

Lommel–Seeliger-style response, relief, blue earthshine and the thin lit rim are artistic approximations. There is no atmospheric shell around the Moon. Neither the illustrative relief texture nor photographic albedo changes the bundled DEM or window calculations.
