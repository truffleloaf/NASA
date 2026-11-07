import test from "node:test";
import assert from "node:assert/strict";
import { analyze, defaults, periodHours, activeAt } from "./mission";
test("date bounds and inclusive UTC dates", () => {
  assert.equal(periodHours("2026-11-07", "2026-11-13"), 168);
  assert.equal(periodHours("2026-11-14", "2026-11-13"), 0);
  assert.equal(periodHours("", "2026-11-13"), 0);
  assert.equal(periodHours("2026-02-31", "2026-03-05"), 0);
  assert.equal(periodHours("2026-11-01", "2026-12-15"), 0);
});
test("deterministic windows obey all constraints and period bounds", () => {
  for (const site of ["shackleton", "malapert"] as const) {
    const result = analyze(site, "2026-11-07", "2026-11-13", defaults);
    assert.deepEqual(
      result,
      analyze(site, "2026-11-07", "2026-11-13", defaults),
    );
    assert.ok(result.windows.length > 0);
    for (const w of result.windows) {
      assert.ok(w.start >= 0 && w.end <= result.hours);
      assert.ok(w.end - w.start >= defaults.duration);
      assert.ok(
        w.sunlight >= defaults.sunlight && w.blackout <= defaults.blackout,
      );
      assert.ok(result.solar.some((s) => s.start <= w.start && s.end >= w.end));
    }
  }
});
test("strict blackout splits windows; impossible duration gives empty state", () => {
  const strict = analyze("shackleton", "2026-11-07", "2026-11-13", {
    ...defaults,
    blackout: 0,
  });
  assert.ok(strict.windows.every((w) => w.blackout === 0));
  assert.equal(
    analyze("shackleton", "2026-11-07", "2026-11-13", {
      ...defaults,
      duration: 48,
    }).windows.length,
    0,
  );
  assert.equal(activeAt([{ start: 1, end: 2 }], 2), false);
});
test("changing dates and sites updates the schedule", () => {
  const a = analyze("shackleton", "2026-11-07", "2026-11-13", defaults);
  assert.notDeepEqual(
    a,
    analyze("malapert", "2026-11-07", "2026-11-13", defaults),
  );
  assert.notDeepEqual(
    a.solar,
    analyze("shackleton", "2026-11-08", "2026-11-14", defaults).solar,
  );
});
