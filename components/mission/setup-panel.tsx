"use client";
import { ArrowRight, SlidersHorizontal } from "lucide-react";
import type { MissionState } from "./use-mission";
import { SITES } from "./use-mission";
import { Chip } from "../ui/chip";
import { Slider } from "../ui/slider";
import { SectionLabel } from "../ui/section-label";
import { ProvenanceBadge } from "../ui/provenance-badge";
export function SetupPanel({ mission: m, onFind }: { mission: MissionState; onFind: () => void }) {
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
            {site.name}
          </Chip>
        ))}
      </div>
      <p className="coordinates">
        {Math.abs(m.selected.lat).toFixed(2)}° S / {Math.abs(m.selected.lon).toFixed(2)}°{" "}
        {m.selected.lon < 0 ? "W" : "E"}{" "}
        <ProvenanceBadge detail="Selected representative coordinates, not a certified landing site." />
      </p>
      <div className="form-divider" />
      <SectionLabel>Planning period · UTC</SectionLabel>
      <div className="date-fields">
        <label>
          Start
          <input
            type="date"
            min="2026-01-01"
            max="2026-12-31"
            value={m.config.start}
            onChange={(e) => m.update({ start: e.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="date"
            min={m.config.start || "2026-01-01"}
            max="2026-12-31"
            value={m.config.end}
            onChange={(e) => m.update({ end: e.target.value })}
          />
        </label>
      </div>
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
      <button className="action-primary full-width" onClick={onFind}>
        Find operating windows
        <ArrowRight />
      </button>
      <p className="small muted">Changes recalculate locally. No mission settings leave your browser.</p>
    </div>
  );
}
