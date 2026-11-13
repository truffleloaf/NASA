"use client";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { formatTime, dateMs, HOUR } from "@/lib/science";
import type { MissionState } from "./use-mission";
import { Card } from "../ui/card";
import { SectionLabel } from "../ui/section-label";
import { Track } from "../ui/track";
import { ProvenanceBadge } from "../ui/provenance-badge";
export function TimePanel({ mission: m }: { mission: MissionState }) {
  const jump = (hour: number) => {
    m.setPlaying(false);
    m.seek(hour);
  };
  return (
    <Card className="time-panel">
      <div className="row-between">
        <SectionLabel>Time & operating windows</SectionLabel>
        <ProvenanceBadge />
      </div>
      <div className="time-controls">
        <div className="play-buttons">
          <button className="icon-control" aria-label="Back one hour" onClick={() => jump(m.config.hour - 1)}>
            <SkipBack />
          </button>
          <button
            className="icon-control play-control"
            aria-label={m.playing ? "Pause timeline" : "Play timeline"}
            disabled={m.reduced || m.result.status !== "ready"}
            onClick={() => m.setPlaying(!m.playing)}
          >
            {m.playing ? <Pause /> : <Play />}
          </button>
          <button className="icon-control" aria-label="Forward one hour" onClick={() => jump(m.config.hour + 1)}>
            <SkipForward />
          </button>
          <label className="speed-label">
            <span className="sr-only">Playback speed</span>
            <select value={m.speed} onChange={(e) => m.setSpeed(Number(e.target.value))}>
              {[1, 6, 24, 168].map((n) => (
                <option key={n} value={n}>
                  {{1:"1 h/s",6:"6 h/s",24:"1 d/s",168:"1 wk/s"}[n]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <time className="mono">{formatTime(m.config, m.config.hour)} UTC</time>
        <span className="small muted" suppressHydrationWarning>Local: {new Date(dateMs(m.config.start)+m.config.hour*HOUR).toLocaleString(undefined,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",timeZoneName:"short"})}</span>
      </div>
      <label className="sr-only" htmlFor="time-scrubber">
        Selected hour in planning period
      </label>
      <input
        id="time-scrubber"
        className="time-scrubber"
        type="range"
        min={0}
        max={Math.max(1, m.result.hours - 1)}
        value={m.config.hour}
        onChange={(e) => jump(Number(e.target.value))}
      />
      <div className="time-axis mono">
        <span>{formatTime(m.config, 0, true)}</span>
        <span>{formatTime(m.config, m.result.hours - 1, true)}</span>
      </div>
      <Track
        label="Sunlight"
        accent="sun"
        intervals={m.result.solar}
        total={m.result.hours}
        hour={m.config.hour}
        onSelect={(v) => jump(v.start)}
      />
      <Track
        label="Earth link"
        accent="earth"
        intervals={m.result.earth}
        total={m.result.hours}
        hour={m.config.hour}
        onSelect={(v) => jump(v.start)}
      />
      <Track
        selected={m.result.windows.find(w => w.id === m.selectedWindow)}
        label="Windows"
        accent="ok"
        intervals={m.result.windows}
        total={m.result.hours}
        hour={m.config.hour}
        onSelect={(v) => { jump(v.start); m.setSelectedWindow(m.result.windows.find(w => w.start === v.start)?.id ?? null); }}
      />
      <p className="small muted">
        {m.reduced
          ? "Reduced motion: use the scrubber or arrow buttons."
          : "Space to play · arrows step an hour · Shift + arrows step a day."}{" "}
        Tracks use hourly samples.
      </p>
    </Card>
  );
}
