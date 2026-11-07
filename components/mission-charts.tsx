"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceDot,
} from "recharts";
import { Sun, Globe2, Check, Crosshair } from "lucide-react";
import {
  activeAt,
  horizon,
  timestamp,
  type Analysis,
  type SiteId,
  type Window,
} from "@/lib/mission";
export function VisibilityTimeline({
  data,
  start,
  hour,
  selected,
  onSelect,
  onSeek,
  expanded = false,
}: {
  data: Analysis;
  start: string;
  hour: number;
  selected?: string;
  onSelect: (window: Window) => void;
  onSeek: (hour: number) => void;
  expanded?: boolean;
}) {
  const tracks = [
    {
      label: "Solar availability",
      icon: Sun,
      color: "amber",
      values: data.solar,
    },
    {
      label: "Earth visibility",
      icon: Globe2,
      color: "blue",
      values: data.earth,
    },
    {
      label: "Operating windows",
      icon: Check,
      color: "green",
      values: data.windows,
    },
  ];
  return (
    <div className={`visibility-timeline ${expanded ? "expanded" : ""}`}>
      <div className="timeline-ticks">
        <span>UTC</span>
        <div>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i}>
              {timestamp(start, (Math.max(0, data.hours - 1) * i) / 4, true)}
            </span>
          ))}
        </div>
      </div>
      {tracks.map((track) => (
        <div className="timeline-row" key={track.label}>
          <div className="track-label">
            <track.icon size={13} />
            <span>{track.label}</span>
          </div>
          <div className="timeline-track">
            {track.values.map((v, i) => (
              <button
                key={i}
                className={`interval ${track.color} ${"id" in v && selected === v.id ? "chosen" : ""}`}
                style={{
                  left: `${(v.start / data.hours) * 100}%`,
                  width: `${((v.end - v.start) / data.hours) * 100}%`,
                }}
                aria-label={`${track.label}: ${timestamp(start, v.start)} to ${timestamp(start, v.end)} UTC, ${v.end - v.start} hours`}
                title={`${timestamp(start, v.start)} – ${timestamp(start, v.end)} UTC · ${v.end - v.start} h · ${track.label}`}
                onClick={() =>
                  "id" in v ? onSelect(v as Window) : onSeek(v.start)
                }
              >
                {expanded && v.end - v.start > 15 && (
                  <span>{v.end - v.start}h</span>
                )}
              </button>
            ))}
            <div
              className="playhead"
              style={{ left: `${(hour / Math.max(1, data.hours)) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="timeline-note">
        <span>
          <i className="status-dot green" /> {data.windows.length} qualifying
          windows
        </span>
        <span>Allowed communication gaps included · illustrative demo</span>
      </div>
    </div>
  );
}
export function HorizonVisualization({
  hour,
  site,
  data,
}: {
  hour: number;
  site: SiteId;
  data: Analysis;
}) {
  const bodies = horizon(hour, site);
  const terrain = Array.from({ length: 37 }, (_, i) => ({
    azimuth: i * 10,
    elevation: 1.5 + Math.sin(i * 1.4) * 1.5 + Math.cos(i * 0.7) * 1.2,
  }));
  return (
    <section className="horizon-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">LOCAL HORIZON · ILLUSTRATIVE</span>
          <h3>Travel through lunar time.</h3>
        </div>
        <Crosshair size={21} />
      </div>
      <div
        className="horizon-sky"
        role="img"
        aria-label="Illustrative terrain horizon with moving Sun and Earth; not an ephemeris"
      >
        <span className="horizon-direction">SOUTH POLE / LOCAL VIEW</span>
        <div
          className="horizon-body sun"
          style={{
            left: `${12 + (bodies.sunAzimuth / 360) * 76}%`,
            top: `${48 - bodies.sunElevation * 2}%`,
            opacity: activeAt(data.solar, hour) ? 1 : 0.25,
          }}
        >
          <Sun size={27} />
          <span>SUN</span>
        </div>
        <div
          className="horizon-body earth"
          style={{
            left: `${12 + (bodies.earthAzimuth / 360) * 76}%`,
            top: `${48 - bodies.earthElevation * 2}%`,
            opacity: activeAt(data.earth, hour) ? 1 : 0.25,
          }}
        >
          <Globe2 size={24} />
          <span>EARTH</span>
        </div>
        <svg
          viewBox="0 0 1000 160"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 80L45 64L85 78L140 32L190 58L250 18L300 52L355 75L420 50L470 81L540 55L600 24L650 48L700 40L750 68L810 22L860 60L925 47L1000 75V160H0Z"
            fill="#17202d"
            stroke="#536074"
            strokeWidth="1"
          />
          <path
            d="M0 115L110 93L180 115L290 82L360 107L460 93L590 115L700 80L820 115L900 90L1000 111V160H0Z"
            fill="#0c121c"
          />
        </svg>
        <div className="horizon-baseline">
          W <span>LOCAL TERRAIN HORIZON</span> E
        </div>
      </div>
      <div className="horizon-chart">
        <span className="chart-axis-label">Elevation (°)</span>
        <ResponsiveContainer width="100%" height={170}>
          <AreaChart
            data={terrain}
            margin={{ top: 16, left: -22, right: 14, bottom: 5 }}
          >
            <CartesianGrid stroke="#1e2838" strokeDasharray="3 5" />
            <XAxis
              dataKey="azimuth"
              type="number"
              domain={[0, 360]}
              ticks={[0, 90, 180, 270, 360]}
              stroke="#7f8ba0"
              fontSize={10}
              tickLine={false}
            />
            <YAxis
              domain={[-5, 15]}
              stroke="#7f8ba0"
              fontSize={10}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: "#111a28",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => `${v}° azimuth`}
              formatter={(v) => [
                `${Number(v).toFixed(1)}°`,
                "Terrain elevation",
              ]}
            />
            <Area
              dataKey="elevation"
              type="monotone"
              stroke="#7a899b"
              fill="#293645"
              fillOpacity={0.5}
              isAnimationActive={false}
            />
            <ReferenceDot
              x={bodies.sunAzimuth}
              y={bodies.sunElevation}
              r={5}
              fill="#ffc66d"
              stroke="#ffc66d"
            />
            <ReferenceDot
              x={bodies.earthAzimuth}
              y={bodies.earthElevation}
              r={4}
              fill="#4a9eff"
              stroke="#4a9eff"
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          <span>
            <i className="legend-line" /> Terrain
          </span>
          <span className="amber-text">● Sun</span>
          <span className="blue-text">● Earth</span>
          <span>Azimuth (°)</span>
        </div>
      </div>
    </section>
  );
}
