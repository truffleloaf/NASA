import type { Interval } from "@/lib/science";
export function Track({
  label,
  intervals,
  total,
  hour,
  accent,
  onSelect,
  selected,
}: {
  selected?: Interval;
  label: string;
  intervals: Interval[];
  total: number;
  hour: number;
  accent: "sun" | "earth" | "ok";
  onSelect: (interval: Interval) => void;
}) {
  return (
    <div className={`ui-track tone-${accent}`}>
      <span className="track-name">
        <i />
        {label}
      </span>
      <div className="track-rail">
        {selected && <i className="selected-window-band" aria-hidden="true" style={{left:`${selected.start/total*100}%`,width:`${(selected.end-selected.start)/total*100}%`}} />}
        {intervals.map((v, i) => (
          <button
            type="button"
            aria-pressed={selected?.start === v.start}
            className={selected?.start === v.start ? "selected-window" : ""}
            key={`${v.start}:${v.end}`}
            style={{
              left: `${(v.start / (total || 1)) * 100}%`,
              width: `${((v.end - v.start) / (total || 1)) * 100}%`,
            }}
            onClick={() => onSelect(v)}
            aria-label={`${label}, ${v.start} to ${v.end} hours after period start, ${v.end - v.start} hours, estimated`}
            data-caption={`Hour ${v.start} → ${v.end} · ${v.end - v.start} h · Estimated`}
            title={`Hour ${v.start} → ${v.end} · ${v.end - v.start} hours · Estimated`}
          >
            <span />
          </button>
        ))}
        {hour >= 0 && <span
          className="track-cursor"
          style={{ left: `${(hour / (total || 1)) * 100}%` }}
          aria-hidden="true"
        />}
      </div>
    </div>
  );
}
