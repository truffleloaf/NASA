import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { analyzeSite, DEFAULT_CONFIG, validSiteData, type Site, type SiteData } from "./science";
const manifest = JSON.parse(fs.readFileSync(new URL("../public/data/manifest.json", import.meta.url), "utf8"));
const data: SiteData[] = manifest.sites.map((site: Site) => ({
  site,
  ephemeris: JSON.parse(fs.readFileSync(new URL("../public" + site.ephemeris, import.meta.url), "utf8")),
  horizon: JSON.parse(fs.readFileSync(new URL("../public" + site.horizon, import.meta.url), "utf8")),
}));
test("bundled real data validates and mast never reduces Earth visibility", () => {
  for (const entry of data) {
    assert.ok(validSiteData(entry));
    const low = analyzeSite(entry, { ...DEFAULT_CONFIG, start: "2026-01-01", end: "2026-12-31", mast: 2 });
    const high = analyzeSite(entry, { ...DEFAULT_CONFIG, start: "2026-01-01", end: "2026-12-31", mast: 20 });
    assert.equal(low.status, "ready");
    assert.ok(high.uptime! >= low.uptime!);
    assert.deepEqual(high.solar, low.solar);
    for (const win of low.windows) {
      assert.equal(win.uptime, 100);
      assert.ok(win.end > win.start);
      assert.ok(win.end <= low.hours);
    }
  }
});
test("mast recalculation stays under 50 ms for the default planning period", () => {
  for (let i = 0; i < 5; i++) data.forEach((entry) => analyzeSite(entry, DEFAULT_CONFIG));
  const times: number[] = [];
  for (let i = 0; i < 20; i++) {
    const before = performance.now();
    data.forEach((entry) => analyzeSite(entry, { ...DEFAULT_CONFIG, mast: 2 + (i % 19) }));
    times.push(performance.now() - before);
  }
  times.sort((a, b) => a - b);
  assert.ok(times[18] < 50, `95th percentile ${times[18].toFixed(2)} ms`);
  console.log(`Bundled three-site mast recalculation p95: ${times[18].toFixed(2)} ms`);
});
