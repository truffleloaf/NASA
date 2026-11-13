import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { START_CONFIG, dateError, restoreSettings, coordinates, adviceFor, countdown } from './planning';
import { analyzeSite, type SiteData } from './science';
import { encodeConfig } from './share';
test('start config has a real window at its selected hour', () => {
  const site = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')).sites.find((s: {id: string}) => s.id === START_CONFIG.site);
  const data: SiteData = {site, ephemeris: JSON.parse(readFileSync('public'+site.ephemeris,'utf8')), horizon: JSON.parse(readFileSync('public'+site.horizon,'utf8'))};
  const result = analyzeSite(data, START_CONFIG);
  assert.ok(result.windows.some(w => w.start <= START_CONFIG.hour && w.end > START_CONFIG.hour));
  assert.match(adviceFor({...result, earth: []}, START_CONFIG), /Earth stays/);
});
test('date, coordinate and storage boundaries', () => {
  assert.ok(dateError('2026-02-30','2026-03-01'));
  assert.ok(dateError('2026-03-01','2026-02-01'));
  assert.equal(restoreSettings(encodeConfig({...START_CONFIG, start:'2025-11-10'})), null);
  assert.deepEqual(restoreSettings(encodeConfig(START_CONFIG)), START_CONFIG);
  assert.equal(coordinates(-88.7,-68.7), '88.70° S · 68.70° W');
});
test('countdowns use interval boundaries, including gaps and end of coverage', () => {
  const intervals = [{start: 3, end: 8}, {start: 12, end: 14}];
  assert.deepEqual(countdown(intervals, 3), {kind:'sets', hours:5});
  assert.deepEqual(countdown(intervals, 8), {kind:'rises', hours:4});
  assert.equal(countdown(intervals, 14), null);
});
