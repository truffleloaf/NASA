import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSite, DEFAULT_CONFIG, horizonAt, hoursInPeriod, type SiteData } from "./science";
import { decodeConfig, encodeConfig, windowsCSV } from "./share";
const fixture: SiteData = {
  site: { id: "shackleton", name: "Test fixture", lat: -89, lon: 0, ephemeris: "", horizon: "" },
  ephemeris: {
    start: "2026-11-07T00:00:00Z",
    stepHours: 1,
    rows: Array.from({ length: 168 }, (_, i) => [0, i < 48 ? 5 : -5, 0.5, 0, i === 20 ? 0 : 5, 2]),
  },
  horizon: {
    azimuthStepDegrees: 90,
    mastHeightsMeters: [2, 20],
    profiles: { "2": [1, 1, 1, 1], "20": [-1, -1, -1, -1] },
    provenance: "Estimated",
  },
};
test("missing data never becomes a fabricated zero", () => {
  const r = analyzeSite(undefined, DEFAULT_CONFIG);
  assert.equal(r.status, "missing");
  assert.equal(r.uptime, null);
  assert.equal(r.longest, null);
});
test("dates reject invalid, reversed, and over-year ranges", () => {
  assert.equal(hoursInPeriod("2026-02-31", "2026-03-05"), 0);
  assert.equal(hoursInPeriod("2026-11-09", "2026-11-07"), 0);
  assert.equal(hoursInPeriod("2026-11-07", "2026-11-13"), 168);
  assert.equal(hoursInPeriod("2026-01-01", "2027-01-02"), 0);
});
test("zero blackout splits windows and mast changes only Earth visibility", () => {
  const a = analyzeSite(fixture, DEFAULT_CONFIG);
  const b = analyzeSite(fixture, { ...DEFAULT_CONFIG, mast: 20 });
  assert.deepEqual(a.solar, b.solar);
  assert.equal(a.windows.length, 2);
  assert.equal(b.windows.length, 1);
  assert.ok(b.uptime! > a.uptime!);
  assert.equal(b.longest, 48);
  assert.ok(a.windows.every((w) => w.blackout === 0));
});
test("allowed gaps join windows and report real link uptime", () => {
  const r = analyzeSite(fixture, { ...DEFAULT_CONFIG, blackout: 1 });
  assert.equal(r.windows.length, 1);
  assert.equal(r.windows[0].blackout, 1);
  assert.equal(r.windows[0].uptime, (47 / 48) * 100);
  assert.match(r.windows[0].why, /Sun/);
});
test("out of coverage and impossible limits return explicit states", () => {
  assert.equal(analyzeSite(fixture, { ...DEFAULT_CONFIG, start: "2025-01-01", end: "2025-01-02" }).status, "missing");
  assert.equal(analyzeSite(fixture, { ...DEFAULT_CONFIG, duration: 100 }).windows.length, 0);
});
test("horizon wraps azimuth and mast interpolation is bounded", () => {
  assert.equal(horizonAt(fixture.horizon, 360, 2), 1);
  assert.equal(horizonAt(fixture.horizon, -90, 11), 0);
  assert.equal(horizonAt(fixture.horizon, 0, 100), -1);
});
test("share URLs round-trip exactly and reject hostile or malformed values", () => {
  assert.deepEqual(decodeConfig(encodeConfig(DEFAULT_CONFIG)), DEFAULT_CONFIG);
  assert.equal(decodeConfig("#v=1&site=bad"), null);
  assert.equal(decodeConfig(encodeConfig({ ...DEFAULT_CONFIG, mast: Infinity })), null);
  assert.equal(decodeConfig(encodeConfig({ ...DEFAULT_CONFIG, hour: 9999 })), null);
});
test("CSV carries provenance and no formula execution", () => {
  const csv = windowsCSV(analyzeSite(fixture, DEFAULT_CONFIG).windows, DEFAULT_CONFIG);
  assert.match(csv, /Estimated/);
  assert.match(csv, /2026-11-07T00:00:00.000Z/);
  assert.ok(!csv.includes("undefined"));
});
