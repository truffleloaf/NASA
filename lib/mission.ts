export type SiteId = "shackleton" | "malapert";
export type Requirements = {
  sunlight: number;
  blackout: number;
  duration: number;
};
export type Interval = { start: number; end: number };
export type Window = Interval & {
  id: string;
  blackout: number;
  sunlight: number;
};
export const sites = {
  shackleton: {
    id: "shackleton" as const,
    name: "Shackleton Crater Rim",
    short: "Shackleton",
    coordinates: "89.90° S · 0.00° E",
    lat: -89.9,
    lon: 0,
    description: "A ridge at the edge of the lunar south pole.",
    constraint: "Terrain obstruction interrupts direct Earth visibility.",
    color: "#73d9f5",
  },
  malapert: {
    id: "malapert" as const,
    name: "Malapert Massif",
    short: "Malapert",
    coordinates: "85.99° S · 2.30° E",
    lat: -85.99,
    lon: 2.3,
    description: "An elevated massif overlooking the southern horizon.",
    constraint: "Longer shadow periods limit continuous solar power.",
    color: "#ffc66d",
  },
};
export const defaults: Requirements = {
  sunlight: 12,
  blackout: 4,
  duration: 18,
};
const HOUR = 3600000;
const ANCHOR = Date.UTC(2026, 10, 1);
export function periodHours(start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
    return 0;
  const a = Date.parse(start + "T00:00:00Z"),
    b = Date.parse(end + "T00:00:00Z");
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    new Date(a).toISOString().slice(0, 10) !== start ||
    new Date(b).toISOString().slice(0, 10) !== end
  )
    return 0;
  const hours = (b - a) / HOUR + 24;
  return Number.isFinite(hours) && hours > 0 && hours <= 31 * 24 ? hours : 0;
}
export function analyze(
  site: SiteId,
  startDate: string,
  endDate: string,
  req: Requirements,
) {
  const hours = periodHours(startDate, endDate);
  const solar: Interval[] = [],
    earth: Interval[] = [],
    windows: Window[] = [];
  if (!hours)
    return {
      hours,
      solar,
      earth,
      windows,
      sunlight: 0,
      earthVisibility: 0,
      longest: 0,
    };
  const phase = ((Date.parse(startDate + "T00:00:00Z") - ANCHOR) / HOUR) % 72;
  const sunPattern =
    site === "shackleton"
      ? [
          [8, 48],
          [56, 70],
        ]
      : [
          [5, 35],
          [46, 64],
        ];
  const earthPattern =
    site === "shackleton"
      ? [
          [0, 25],
          [28, 60],
          [66, 72],
        ]
      : [
          [0, 19],
          [21, 53],
          [55, 72],
        ];
  for (let base = -72; base < hours + 72; base += 72) {
    for (const [a, b] of sunPattern) {
      const start = Math.max(0, base + a - phase),
        end = Math.min(hours, base + b - phase);
      if (end > start) solar.push({ start, end });
    }
    for (const [a, b] of earthPattern) {
      const start = Math.max(0, base + a - phase),
        end = Math.min(hours, base + b - phase);
      if (end > start) {
        const last = earth.at(-1);
        if (last && last.end === start) last.end = end;
        else earth.push({ start, end });
      }
    }
  }
  for (const sun of solar) {
    const visible = earth
      .map((e) => ({
        start: Math.max(sun.start, e.start),
        end: Math.min(sun.end, e.end),
      }))
      .filter((e) => e.end > e.start);
    let candidate: (Interval & { blackout: number }) | undefined;
    const finish = () => {
      if (
        candidate &&
        candidate.end - candidate.start >= Math.max(req.sunlight, req.duration)
      ) {
        windows.push({
          ...candidate,
          sunlight: candidate.end - candidate.start,
          id: `${site}-${candidate.start}-${candidate.end}`,
        });
      }
    };
    for (const e of visible) {
      if (candidate && e.start - candidate.end <= req.blackout) {
        candidate.blackout = Math.max(
          candidate.blackout,
          e.start - candidate.end,
        );
        candidate.end = e.end;
      } else {
        finish();
        candidate = { ...e, blackout: 0 };
      }
    }
    finish();
  }
  const total = (intervals: Interval[]) =>
    intervals.reduce((sum, v) => sum + v.end - v.start, 0);
  return {
    hours,
    solar,
    earth,
    windows,
    sunlight: Math.round((total(solar) / hours) * 100),
    earthVisibility: Math.round((total(earth) / hours) * 100),
    longest: Math.max(0, ...windows.map((w) => w.end - w.start)),
  };
}
export type Analysis = ReturnType<typeof analyze>;
export function timestamp(start: string, hour: number, compact = false) {
  const date = new Date(Date.parse(start + "T00:00:00Z") + hour * HOUR);
  if (Number.isNaN(date.valueOf())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    ...(compact ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
  }).format(date);
}
export function activeAt(intervals: Interval[], hour: number) {
  return intervals.some((i) => hour >= i.start && hour < i.end);
}
export function horizon(hour: number, site: SiteId) {
  const phase = hour / 12 + (site === "malapert" ? 1 : 0);
  return {
    sunAzimuth: (hour * 5 + 45) % 360,
    sunElevation: 8 * Math.sin(phase) + 4,
    earthAzimuth: 180 + 35 * Math.sin(phase / 2),
    earthElevation: 5 + 4 * Math.cos(phase),
  };
}
