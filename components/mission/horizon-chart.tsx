import { horizonAt, type HorizonData, type Sample } from "@/lib/science";
import { ProvenanceBadge } from "../ui/provenance-badge";
export function HorizonChart({
  horizon,
  sample,
  mast,
}: {
  horizon?: HorizonData;
  sample: Sample | null;
  mast: number;
}) {
  if (!horizon || !sample) return <p className="muted">Horizon data unavailable.</p>;
  const values = Array.from({ length: 361 }, (_, az) => horizonAt(horizon, az, mast));
  const min = Math.min(-5, ...values, sample.sunEl, sample.earthEl),
    max = Math.max(8, ...values, sample.sunEl, sample.earthEl);
  const y = (v: number) => 80 - ((v - min) / (max - min)) * 68;
  return (
    <>
      <svg
        className="horizon-chart"
        viewBox="0 0 360 100"
        role="img"
        aria-label="Estimated terrain horizon around the selected site; Sun is amber and Earth is blue."
      >
        <path
          d={`M0 88 ${values.map((v, i) => `L${i} ${y(v)}`).join(" ")} L360 88Z`}
          fill="var(--surface-3)"
          stroke="var(--text-muted)"
          strokeWidth="1"
        />
        <path d={`M0 ${y(0)}H360`} stroke="var(--line-strong)" strokeDasharray="3 4" />
        <circle cx={sample.sunAz} cy={y(sample.sunEl)} r="4" fill="var(--sun)" />
        <circle cx={sample.earthAz} cy={y(sample.earthEl)} r="4" fill="var(--earth)" />
        {["N", "E", "S", "W", "N"].map((label, i) => (
          <text
            key={i}
            x={i * 89 + 2}
            y="99"
            fill="var(--text-muted)"
            fontSize="10"
            textAnchor={i === 4 ? "end" : "start"}
          >
            {label}
          </text>
        ))}
      </svg>
      <div className="small muted">
        Terrain skyline at the selected mast height. <ProvenanceBadge />
      </div>
    </>
  );
}
