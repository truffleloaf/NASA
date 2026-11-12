"use client";
import { useId } from "react";
import { ProvenanceBadge } from "./provenance-badge";
export function Slider({
  label,
  value,
  unit = "h",
  min,
  max,
  onChange,
  accent = "neutral",
  description,
  fresh = false,
}: {
  label: string;
  value: number;
  unit?: string;
  min: number;
  max: number;
  onChange: (value: number) => void;
  accent?: "sun" | "earth" | "ok" | "neutral";
  description?: string;
  fresh?: boolean;
}) {
  const id = useId();
  return (
    <div className={`ui-slider tone-${accent}`}>
      <div className="slider-heading">
        <label htmlFor={id}>
          {label}
          {fresh && <span className="new-label">NEW</span>}
        </label>
        <output htmlFor={id}>
          {value}
          <span>{unit}</span>
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-describedby={description ? `${id}-help` : undefined}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="slider-foot">
        <span id={`${id}-help`}>{description}</span>
        <ProvenanceBadge detail="User-selected planning assumption; resulting visibility is estimated." />
      </div>
    </div>
  );
}
