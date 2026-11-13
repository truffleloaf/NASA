import { analyzeSite, dateMs, type SiteData, type Analysis, type MissionConfig, type Interval } from './science';
import { decodeConfig } from './share';

export const START_CONFIG: MissionConfig = { site: 'de-gerlache', start: '2026-11-10', end: '2026-11-30', sunlight: 12, blackout: 0, duration: 18, mast: 2, hour: 360 };
export function dateError(start: string, end: string): string {
  if (![start, end].every(v => Number.isFinite(dateMs(v)))) return 'Enter both valid dates.';
  if (start < '2026-01-01' || end > '2026-12-31') return 'Bundled data covers January–December 2026.';
  if (start > end) return 'End date must be on or after start date.';
  return '';
}
export function restoreSettings(hash: string): MissionConfig | null {
  const parameters = new URLSearchParams(hash.replace(/^#/, ""));
  if (!["v","site","start","end","sun","gap","duration","mast","hour"].every(k=>parameters.has(k))) return null;
  const parsed = decodeConfig(hash);
  return parsed && !dateError(parsed.start, parsed.end) ? parsed : null;
}
export function coordinates(lat: number, lon: number) {
  return `${Math.abs(lat).toFixed(2)}° ${lat < 0 ? 'S' : 'N'} · ${Math.abs(lon).toFixed(2)}° ${lon < 0 ? 'W' : 'E'}`;
}
export function adviceFor(result: Analysis, config: MissionConfig, data?: SiteData): string {
  if (result.status !== 'ready') return result.reason || 'Data is unavailable.';
  if (!result.solar.length) return 'No sunlight in this period. Choose another month or site.';
  if (!result.earth.length) return 'Earth stays below the terrain horizon. Choose another period or site.';
  const longest = Math.max(...result.solar.map(v => v.end - v.start));
  const limits = [];
  if (config.sunlight > longest) limits.push('minimum sunlight');
  if (config.duration > longest) limits.push('mission duration');
  if (limits.length) return `Reduce ${limits.join(' and ')} to ${longest} hours or less, or extend the period.`;
  const overlap = result.solar.some(s => result.earth.some(e => Math.min(s.end, e.end) > Math.max(s.start, e.start)));
  if (overlap && data) {
    const relaxed = analyzeSite(data, {...config,sunlight:1,duration:1});
    const available = relaxed.longest ?? 0;
    const failing = [...(config.sunlight > available ? ['minimum sunlight'] : []), ...(config.duration > available ? ['mission duration'] : [])];
    if (available && failing.length) return `Reduce ${failing.join(' and ')} to ${available} hours or less, increase blackout tolerance, or change the period.`;
  }
  return overlap ? 'The overlap is too short or interrupted. Shorten the duration and minimum sunlight, or allow a longer blackout.' : 'Sunlight and Earth visibility do not overlap. Choose another period or site.';
}
export function countdown(intervals: Interval[], hour: number): { kind: 'sets' | 'rises'; hours: number } | null {
  const active = intervals.find(v => v.start <= hour && hour < v.end);
  if (active) return { kind: 'sets', hours: active.end - hour };
  const next = intervals.find(v => v.start > hour);
  return next ? { kind: 'rises', hours: next.start - hour } : null;
}
