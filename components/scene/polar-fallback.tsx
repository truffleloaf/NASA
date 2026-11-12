import { SITES, type MissionState } from "../mission/use-mission";
export function PolarFallback({ mission: m }: { mission: MissionState }) {
  return (
    <div className="polar-fallback">
      <svg
        viewBox="0 0 600 460"
        role="img"
        aria-label={`Two-dimensional polar locator. Selected region: ${m.selected.name}. Sun and Earth elevation data are available below the map.`}
      >
        <defs>
          <clipPath id="polar-disc">
            <circle cx="300" cy="230" r="200" />
          </clipPath>
        </defs>
        <image
          href="/data/terrain/polar-preview.svg"
          x="100"
          y="30"
          width="400"
          height="400"
          clipPath="url(#polar-disc)"
        />
        {[50, 100, 150, 200].map((r) => (
          <circle key={r} cx="300" cy="230" r={r} fill="none" stroke="#9AA3B2" opacity=".25" />
        ))}
        {[0, 45, 90, 135].map((a) => (
          <path key={a} d="M100 230H500" stroke="#9AA3B2" opacity=".25" transform={`rotate(${a} 300 230)`} />
        ))}
        {SITES.map((s) => {
          const r = (90 + s.lat) * 20,
            lon = (s.lon * Math.PI) / 180,
            x = 300 + r * Math.sin(lon),
            y = 230 - r * Math.cos(lon);
          return (
            <g key={s.id}>
              <circle
                cx={x}
                cy={y}
                r={s.id === m.config.site ? 7 : 4}
                fill="none"
                stroke={s.id === m.config.site ? "#5FD8A4" : "#ECE9E3"}
                strokeWidth="2"
              />
              <text x={x + 12} y={y + (s.id === "shackleton" ? 18 : -8)} fill="#ECE9E3" fontSize="12">
                {s.name}
              </text>
            </g>
          );
        })}
        <text x="300" y="20" textAnchor="middle" fill="#9AA3B2" fontSize="11">
          0° E
        </text>
      </svg>
      <p className="small muted">2D polar locator · use site controls to select a region.</p>
    </div>
  );
}
