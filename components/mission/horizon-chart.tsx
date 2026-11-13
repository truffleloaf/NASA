"use client";
import { useId, useState } from "react";
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
  const gradient=useId(), [azimuth,setAzimuth]=useState<number|null>(null);
  if (!horizon || !sample) return <p className="muted">Horizon data unavailable.</p>;
  const values = Array.from({ length: 361 }, (_, az) => horizonAt(horizon, az, mast));
  const min = Math.min(-5, ...values, sample.sunEl, sample.earthEl),
    max = Math.max(8, ...values, sample.sunEl, sample.earthEl);
  const y = (v: number) => 80 - ((v - min) / (max - min)) * 68;
  return (
    <>
      <svg
        className="horizon-chart"
        onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect();setAzimuth(Math.max(0,Math.min(359,Math.round((e.clientX-rect.left)/rect.width*360))));}}
        viewBox="0 0 360 100"
        role="img"
        aria-label="Estimated terrain horizon around the selected site; Sun is amber and Earth is blue."
      >
        <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop stopColor="var(--text-muted)" stopOpacity=".28"/><stop offset="1" stopColor="var(--text-muted)" stopOpacity="0"/></linearGradient></defs>
        <path
          d={`M0 88 ${values.map((v, i) => `L${i} ${y(v)}`).join(" ")} L360 88Z`}
          fill={`url(#${gradient})`}
          stroke="var(--text-muted)"
          strokeWidth="1.5"
        />
        <path d={`M0 ${y(0)}H360`} stroke="var(--line-strong)" strokeDasharray="3 4" />
        <path d={`M${sample.sunAz} ${y(sample.sunEl)}V88`} stroke="var(--sun)" opacity="0.4" strokeDasharray="2 3" />
        <path d={`M${sample.earthAz} ${y(sample.earthEl)}V88`} stroke="var(--earth)" opacity="0.4" strokeDasharray="2 3" />
        <circle cx={sample.sunAz} cy={y(sample.sunEl)} r="4" fill="var(--sun)"><title>Sun: {sample.sunEl.toFixed(2)}° elevation, {sample.sunAz.toFixed(2)}° azimuth · Computed</title></circle>
        <circle cx={sample.earthAz} cy={y(sample.earthEl)} r="4" fill="var(--earth)"><title>Earth: {sample.earthEl.toFixed(2)}° elevation, {sample.earthAz.toFixed(2)}° azimuth · Computed</title></circle>
        {azimuth!==null && <path d={`M${azimuth} 0V88`} stroke="var(--text-muted)" strokeDasharray="2 4"/>}
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
      <label className="horizon-inspect">Inspect bearing<input type="range" min="0" max="359" aria-label="Inspect horizon bearing" value={azimuth??0} onChange={e=>setAzimuth(Number(e.target.value))}/></label>
      {azimuth!==null&&<p className="chart-tooltip" role="status">{azimuth}° bearing · {values[azimuth].toFixed(2)}° horizon · Estimated</p>}
      <div className="small muted">
        <span className="tone-sun">Sun</span> · <span className="tone-earth">Earth</span> · terrain skyline <ProvenanceBadge />
      </div>
    </>
  );
}
