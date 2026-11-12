import { DEFAULT_CONFIG, hoursInPeriod, SITE_IDS, type MissionConfig, type OperatingWindow } from "./science";
export function encodeConfig(config: MissionConfig): string {
  return (
    "#" +
    new URLSearchParams({
      v: "1",
      site: config.site,
      start: config.start,
      end: config.end,
      sun: String(config.sunlight),
      gap: String(config.blackout),
      duration: String(config.duration),
      mast: String(config.mast),
      hour: String(config.hour),
    }).toString()
  );
}
export function decodeConfig(hash: string): MissionConfig | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const config = {
    site: p.get("site"),
    start: p.get("start"),
    end: p.get("end"),
    sunlight: Number(p.get("sun")),
    blackout: Number(p.get("gap")),
    duration: Number(p.get("duration")),
    mast: Number(p.get("mast")),
    hour: Number(p.get("hour")),
  };
  if (p.get("v") !== "1" || !SITE_IDS.includes(config.site as MissionConfig["site"]) || !config.start || !config.end)
    return null;
  const hours = hoursInPeriod(config.start, config.end);
  const ranges = [
    [config.sunlight, 1, 168],
    [config.blackout, 0, 24],
    [config.duration, 1, 336],
    [config.mast, 2, 20],
    [config.hour, 0, hours - 1],
  ];
  if (
    !hours ||
    ranges.some(
      ([value, min, max]) => !Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max,
    )
  )
    return null;
  return config as MissionConfig;
}
export function initialConfig(hash: string): MissionConfig {
  return decodeConfig(hash) ?? { ...DEFAULT_CONFIG };
}
export function windowsCSV(windows: OperatingWindow[], config: MissionConfig): string {
  const cell = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const startMs = Date.parse(config.start + "T00:00:00Z");
  return [
    "Site,Start UTC,End UTC,Duration h,Earth uptime percent,Max blackout h,Why it ends,Provenance",
    ...windows.map((w) =>
      [
        config.site,
        new Date(startMs + w.start * 3600000).toISOString(),
        new Date(startMs + w.end * 3600000).toISOString(),
        String(w.end - w.start),
        w.uptime.toFixed(2),
        String(w.blackout),
        w.why,
        "Estimated: hourly JPL ephemeris and LOLA horizon",
      ]
        .map(cell)
        .join(","),
    ),
  ].join("\r\n");
}
