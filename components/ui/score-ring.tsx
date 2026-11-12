import { ProvenanceBadge } from "./provenance-badge";
export function ScoreRing({ available, required }: { available: number; required: number }) {
  const score = Math.min(100, Math.round((available / required) * 100));
  return (
    <div
      className="ui-score"
      aria-label={`${score}% of requested mission duration can be covered. Estimated, not a safety score.`}
    >
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="34" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle
          cx="40"
          cy="40"
          r="34"
          fill="none"
          stroke="var(--ok)"
          strokeWidth="4"
          strokeDasharray={`${score * 2.136} 213.6`}
          transform="rotate(-90 40 40)"
        />
      </svg>
      <span>
        {score}
        <small>%</small>
      </span>
      <ProvenanceBadge detail="Fraction of requested duration met, capped at 100%. Not a safety or scientific suitability score." />
    </div>
  );
}
