export type Provenance = "Computed" | "Illustrative" | "Estimated";
export type SiteId = "shackleton" | "malapert" | "de-gerlache";
export type MissionConfig = {
  site: SiteId;
  start: string;
  end: string;
  sunlight: number;
  blackout: number;
  duration: number;
  mast: number;
  hour: number;
};
export type EphemerisRow = [number, number, number, number, number, number];
export type Ephemeris = { start: string; stepHours: number; rows: EphemerisRow[]; source?: unknown };
export type HorizonData = {
  azimuthStepDegrees: number;
  mastHeightsMeters: number[];
  profiles: Record<string, number[]>;
  provenance: "Estimated";
  source?: unknown;
};
export type Site = {
  id: SiteId;
  name: string;
  lat: number;
  lon: number;
  elevationMeters?: number;
  ephemeris: string;
  horizon: string;
};
export type SiteData = { site: Site; ephemeris: Ephemeris; horizon: HorizonData };
export type Manifest = { sites: Site[]; [key: string]: unknown };
export type Interval = { start: number; end: number };
export type OperatingWindow = Interval & { id: string; uptime: number; blackout: number; why: string };
export type Sample = {
  sun: boolean;
  earth: boolean;
  sunAz: number;
  sunEl: number;
  sunSize: number;
  earthAz: number;
  earthEl: number;
  earthSize: number;
  sunHorizon: number;
  earthHorizon: number;
};
export type Analysis = {
  status: "ready" | "missing" | "invalid";
  reason?: string;
  hours: number;
  solar: Interval[];
  earth: Interval[];
  windows: OperatingWindow[];
  sunlight: number | null;
  uptime: number | null;
  baselineUptime: number | null;
  longest: number | null;
  dailyHours: number[];
};
export const DEFAULT_CONFIG: MissionConfig = {
  site: "shackleton",
  start: "2026-11-07",
  end: "2026-11-13",
  sunlight: 12,
  blackout: 0,
  duration: 18,
  mast: 2,
  hour: 12,
};
export const HOUR = 3_600_000;
export const SITE_IDS: SiteId[] = ["shackleton", "malapert", "de-gerlache"];
export function dateMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : NaN;
}
export function hoursInPeriod(start: string, end: string): number {
  const hours = (dateMs(end) - dateMs(start)) / HOUR + 24;
  return Number.isFinite(hours) && hours > 0 && hours <= 366 * 24 ? hours : 0;
}
export function horizonAt(data: HorizonData, azimuth: number, mast: number): number {
  const heights = data.mastHeightsMeters;
  const lo = heights[0],
    hi = heights.at(-1)!;
  const at = (profile: number[]) => {
    const index = (((azimuth % 360) + 360) % 360) / data.azimuthStepDegrees;
    const left = Math.floor(index) % profile.length,
      fraction = index - Math.floor(index);
    return profile[left] * (1 - fraction) + profile[(left + 1) % profile.length] * fraction;
  };
  const a = at(data.profiles[String(lo)]),
    b = at(data.profiles[String(hi)]);
  return a + (b - a) * Math.max(0, Math.min(1, (mast - lo) / (hi - lo || 1)));
}
export function sampleAt(data: SiteData | undefined, timeMs: number, mast: number): Sample | null {
  if (!data) return null;
  const index = Math.floor((timeMs - Date.parse(data.ephemeris.start)) / HOUR / data.ephemeris.stepHours);
  const row = data.ephemeris.rows[index];
  if (!row) return null;
  const [sunAz, sunEl, sunSize, earthAz, earthEl, earthSize] = row;
  const sunHorizon = horizonAt(data.horizon, sunAz, 2),
    earthHorizon = horizonAt(data.horizon, earthAz, mast);
  return {
    sun: sunEl > sunHorizon,
    earth: earthEl > earthHorizon,
    sunAz,
    sunEl,
    sunSize,
    earthAz,
    earthEl,
    earthSize,
    sunHorizon,
    earthHorizon,
  };
}
export function intervals(values: boolean[]): Interval[] {
  const out: Interval[] = [];
  let start = -1;
  for (let i = 0; i <= values.length; i++) {
    if (values[i] && start < 0) start = i;
    if (!values[i] && start >= 0) {
      out.push({ start, end: i });
      start = -1;
    }
  }
  return out;
}
function empty(status: Analysis["status"], reason: string, hours = 0): Analysis {
  return {
    status,
    reason,
    hours,
    solar: [],
    earth: [],
    windows: [],
    sunlight: null,
    uptime: null,
    baselineUptime: null,
    longest: null,
    dailyHours: [],
  };
}
export function analyzeSite(data: SiteData | undefined, config: MissionConfig): Analysis {
  const hours = hoursInPeriod(config.start, config.end),
    startMs = dateMs(config.start);
  if (!hours) return empty("invalid", "Choose a valid date range of up to one year.");
  if (!data) return empty("missing", "Ephemeris or terrain horizon data is unavailable for this site.", hours);
  const first = (startMs - Date.parse(data.ephemeris.start)) / HOUR;
  if (first < 0 || first + hours > data.ephemeris.rows.length * data.ephemeris.stepHours)
    return empty("missing", "This period is outside the bundled ephemeris. Choose dates in 2026.", hours);
  if (!Number.isFinite(config.mast) || config.mast < 2 || config.mast > 20)
    return empty("invalid", "Choose a mast height between 2 m and 20 m.", hours);
  const sun: boolean[] = [],
    earth: boolean[] = [],
    baseline: boolean[] = [];
  for (let i = 0; i < hours; i++) {
    const sample = sampleAt(data, startMs + i * HOUR, config.mast)!;
    sun.push(sample.sun);
    earth.push(sample.earth);
    baseline.push(sample.earthEl > horizonAt(data.horizon, sample.earthAz, 2));
  }
  const solar = intervals(sun),
    earthIntervals = intervals(earth),
    windows: OperatingWindow[] = [];
  const linked = (a: number, b: number) => earth.slice(a, b).filter(Boolean).length;
  for (const solarRun of solar) {
    const runs = earthIntervals
      .map((v) => ({ start: Math.max(v.start, solarRun.start), end: Math.min(v.end, solarRun.end) }))
      .filter((v) => v.end > v.start);
    let current: (Interval & { blackout: number }) | undefined;
    const finish = () => {
      if (!current || current.end - current.start < Math.max(config.sunlight, config.duration)) return;
      const why =
        current.end === hours
          ? "The selected planning period ends."
          : !sun[current.end]
            ? "The Sun’s centre drops below the estimated terrain horizon."
            : "Earth becomes terrain-obstructed beyond the allowed blackout.";
      windows.push({
        ...current,
        id: `${data.site.id}:${config.start}:${current.start}:${current.end}`,
        uptime: (linked(current.start, current.end) / (current.end - current.start)) * 100,
        why,
      });
    };
    for (const run of runs) {
      if (current && run.start - current.end <= config.blackout) {
        current.blackout = Math.max(current.blackout, run.start - current.end);
        current.end = run.end;
      } else {
        finish();
        current = { ...run, blackout: 0 };
      }
    }
    finish();
  }
  windows.sort((a, b) => b.end - b.start - (a.end - a.start) || b.uptime - a.uptime || a.start - b.start);
  const dailyHours = Array.from({ length: Math.ceil(hours / 24) }, () => 0);
  for (const win of windows) for (let i = win.start; i < win.end; i++) dailyHours[Math.floor(i / 24)]++;
  const percentage = (values: boolean[]) => (values.filter(Boolean).length / hours) * 100;
  return {
    status: "ready",
    hours,
    solar,
    earth: earthIntervals,
    windows,
    sunlight: percentage(sun),
    uptime: percentage(earth),
    baselineUptime: percentage(baseline),
    longest: windows[0] ? windows[0].end - windows[0].start : 0,
    dailyHours,
  };
}
export function suggestRelaxation(result: Analysis, config: MissionConfig): string {
  if (result.status !== "ready") return result.reason!;
  const longestSun = Math.max(0, ...result.solar.map((v) => v.end - v.start));
  if (!longestSun) return "Try another month: this period has no sampled sunlight above the terrain horizon.";
  if (longestSun < Math.max(config.sunlight, config.duration))
    return `Shorten the mission duration or minimum sunlight to ${longestSun} hours or less, or extend the dates.`;
  return config.blackout === 0
    ? "Allow a short communication blackout, shorten the mission, or try a different month."
    : "Shorten the mission, increase the allowed blackout, or choose another period.";
}
export function formatTime(config: Pick<MissionConfig, "start">, hour: number, dateOnly = false): string {
  const value = dateMs(config.start) + hour * HOUR;
  if (!Number.isFinite(value)) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    ...(dateOnly ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
  }).format(value);
}
export function validSiteData(value: SiteData): boolean {
  const { ephemeris: e, horizon: h } = value;
  return (
    !!e &&
    Number.isFinite(Date.parse(e.start)) &&
    e.stepHours === 1 &&
    e.rows.length > 0 &&
    e.rows.every((row) => row.length === 6 && row.every(Number.isFinite)) &&
    !!h &&
    h.azimuthStepDegrees > 0 &&
    h.mastHeightsMeters[0] === 2 &&
    h.mastHeightsMeters.at(-1) === 20 &&
    h.mastHeightsMeters.every(
      (m) =>
        h.profiles[String(m)]?.length === Math.round(360 / h.azimuthStepDegrees) &&
        h.profiles[String(m)].every(Number.isFinite),
    )
  );
}
