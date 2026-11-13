"use client";
import { useId } from "react";
import { ProvenanceBadge } from "./provenance-badge";
export function ScoreRing({ available, required }: { available: number; required: number }) {
  const score = Math.min(100, Math.round((available / required) * 100));
  const id = useId();
  return (
    <div
      className="ui-score"
      role="group"
      aria-label={`${score}% of the planning period in the best window. Estimated, not a safety score.`}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <defs><clipPath id={`${id}-reveal`}><rect className="score-sweep" width="80" height="80"/></clipPath><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--sun)" /><stop offset="1" stopColor="var(--ok)" /></linearGradient></defs>
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke={`url(#${id})`}
          clipPath={`url(#${id}-reveal)`}
          strokeLinecap="round"
          strokeWidth="4"
          strokeDasharray={`${score * 2.136} 213.6`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span>
        {score}
        <small>%</small>
      </span>
      <ProvenanceBadge detail="Best-window hours divided by planning-period hours. Not a safety or scientific suitability score." />
    </div>
  );
}
