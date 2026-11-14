"use client";
import { useEffect, useState, useId } from "react";
import { coordinates, dateError } from "@/lib/planning";
import { CustomLocation } from "./custom-location";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { MissionState } from "./use-mission";
import { SITES } from "./use-mission";
import { Chip } from "../ui/chip";
import { Slider } from "../ui/slider";
import { SectionLabel } from "../ui/section-label";
import { ProvenanceBadge } from "../ui/provenance-badge";
export function SetupPanel({ mission: m, onFind }: { mission: MissionState; onFind: () => void }) {
  const id = useId();
  const [dates, setDates] = useState({ start: m.config.start, end: m.config.end });
  useEffect(() => setDates({ start: m.config.start, end: m.config.end }), [m.config.start, m.config.end]);
  const error = dateError(dates.start, dates.end);
  const changeDate = (patch: Partial<typeof dates>) => {
    const next = { ...dates, ...patch }; setDates(next);
    if (!dateError(next.start, next.end)) m.update(next);
  };
  return (
    <div className="setup-content">
      <div className="panel-heading">
        <SlidersHorizontal />
        <h2>Mission setup</h2>
      </div>
      <SectionLabel>Choose a landing region</SectionLabel>
      <div className="site-chips">
        {SITES.map((site) => (
          <Chip key={site.id} selected={m.config.site === site.id} onClick={() => m.update({ site: site.id })}>
            <span title={site.kind === "artemis-candidate" ? "NASA Artemis III candidate landing region" : "Reference planning point"}>
              {site.name}
            </span>
          </Chip>
        ))}
      </div>
      <p className="coordinates">
        {coordinates(m.selected.lat, m.selected.lon)}{ " " }
        <ProvenanceBadge detail="Selected representative coordinates, not a certified landing site." />
      </p>
      <CustomLocation mission={m} />
      <div className="form-divider" />
      <SectionLabel>Planning period · UTC</SectionLabel>
      <label className="period-preset">Quick period<select aria-label="Planning period preset" defaultValue="custom" onChange={e=>{
        if(e.target.value==='custom')return;
        const start=e.target.value==='week'?new Date().toISOString().slice(0,10):m.config.start.slice(0,8)+'01';
        const date=new Date(start+'T00:00:00Z');
        if(e.target.value==='week')date.setUTCDate(date.getUTCDate()+6);else date.setUTCMonth(date.getUTCMonth()+1,0);
        changeDate({start,end:date.toISOString().slice(0,10)});
      }}><option value="week">Next 7 days</option><option value="month">Selected month</option><option value="custom">Custom dates</option></select></label>
      <div className="date-fields">
        <label>
          Start
          <input
            type="date"
            min="2026-01-01"
            max="2026-12-31"
            value={dates.start}
            aria-invalid={!!error}
            aria-describedby={error ? id : undefined}
            onChange={(e) => changeDate({ start: e.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="date"
            min={m.config.start || "2026-01-01"}
            max="2026-12-31"
            value={dates.end}
            aria-invalid={!!error}
            aria-describedby={error ? id : undefined}
            onChange={(e) => changeDate({ end: e.target.value })}
          />
        </label>
      </div>
      {error && <p id={id} className="form-error" role="alert">{error}</p>}
      <ProvenanceBadge detail="User-selected period within the bundled ephemeris year." />
      <div className="form-divider" />
      <SectionLabel>Operating limits</SectionLabel>
      <Slider
        label="Minimum sunlight"
        value={m.config.sunlight}
        min={1}
        max={168}
        accent="sun"
        onChange={(sunlight) => m.update({ sunlight })}
      />
      <Slider
        label="Maximum blackout"
        value={m.config.blackout}
        min={0}
        max={24}
        accent="earth"
        description="Longest tolerated link interruption"
        onChange={(blackout) => m.update({ blackout })}
      />
      <Slider
        label="Mission duration"
        value={m.config.duration}
        min={1}
        max={168}
        accent="ok"
        onChange={(duration) => m.update({ duration })}
      />
      <div className="form-divider" />
      <Slider
        label="Antenna mast height"
        fresh
        value={m.config.mast}
        min={2}
        max={20}
        unit="m"
        accent="earth"
        description="Exploratory terrain estimate"
        onChange={(mast) => m.update({ mast })}
      />
      <button className="action-primary full-width" onClick={onFind} disabled={!!error}>
        Find operating windows
        <ArrowRight />
      </button>
      <p className="small muted">Changes recalculate locally. No mission settings leave your browser.</p>
    </div>
  );
}
