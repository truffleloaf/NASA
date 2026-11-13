import { adviceFor } from "@/lib/planning";
import { Earth, Sun, ArrowUpRight } from "lucide-react";
import { formatTime } from "@/lib/science";
import { SITES, type MissionState } from "./use-mission";
import { Card } from "../ui/card";
import { SectionLabel } from "../ui/section-label";
import { StatTile } from "../ui/stat-tile";
import { ScoreRing } from "../ui/score-ring";
import { ProvenanceBadge } from "../ui/provenance-badge";
import { HorizonChart } from "./horizon-chart";
export function InsightsPanel({ mission: m, onCompare }: { mission: MissionState; onCompare: () => void }) {
  const best = m.result.windows[0],
    delta = (m.result.uptime ?? 0) - (m.result.baselineUptime ?? 0);
  const ranking = [...SITES].sort((a, b) => (m.results[b.id].longest ?? -1) - (m.results[a.id].longest ?? -1));
  return (
    <aside className="insights-panel" aria-label="Insights">
      <Card>
        <div className="row-between">
          <SectionLabel>Best operating window</SectionLabel>
          <ArrowUpRight />
        </div>
        {best ? (
          <>
            <div className="best-summary">
              <div>
                <span className="hero-stat">
                  {best.end - best.start}
                  <small> hours</small>
                </span>
                <p className="mono small">
                  {formatTime(m.config, best.start)}
                  <br />→ {formatTime(m.config, best.end)} UTC
                </p>
              </div>
              <ScoreRing available={best.end - best.start} required={m.result.hours} />
            </div>
            <span className="success-label">of the planning period in the best window</span>
            <div className="why-end">
              <SectionLabel>Why it ends</SectionLabel>
              <p>{best.why}</p>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>{m.loading ? "Reading local data…" : "No qualifying window"}</h3>
            <p>{adviceFor(m.result, m.config)}</p>
            <ProvenanceBadge />
            {!m.loading && <button className="action-outline" onClick={onCompare}>Explore other dates <ArrowUpRight /></button>}
          </div>
        )}
      </Card>
      <div className="insight-stats">
        <StatTile
          label="Earth link uptime"
          value={m.result.uptime?.toFixed(1) ?? null}
          unit="%"
          accent="earth"
          icon={<Earth />}
          note={m.result.uptime === null ? "Awaiting horizon data" : `+${delta.toFixed(1)} pts versus a 2 m mast`}
        />
        <StatTile
          label="Qualifying windows"
          value={m.result.status === "ready" ? m.result.windows.length : null}
          accent="ok"
          note="Within this planning period"
        />
      </div>
      <Card>
        <div className="row-between">
          <SectionLabel>Site ranking</SectionLabel>
          <ProvenanceBadge />
        </div>
        <p className="small muted">Sorted by longest qualifying window</p>
        <div className="ranking-list">
          {ranking.map((site) => (
            <button
              className="ranking-row"
              key={site.id}
              aria-pressed={site.id === m.config.site}
              onClick={() => m.update({ site: site.id })}
            >
              <span>
                {site.name}
                <small>{m.results[site.id].longest ?? "—"} h</small>
              </span>
              <span className="ranking-bars">
                <i className="sun-bar" style={{ width: `${m.results[site.id].sunlight ?? 0}%` }} />
                <i className="earth-bar" style={{ width: `${m.results[site.id].uptime ?? 0}%` }} />
              </span>
              <span className="sr-only">
                Sunlight {m.results[site.id].sunlight?.toFixed(1) ?? "unavailable"} percent, Earth link{" "}
                {m.results[site.id].uptime?.toFixed(1) ?? "unavailable"} percent. Estimated.
              </span>
            </button>
          ))}
        </div>
        <div className="legend">
          <span className="tone-sun">
            <Sun />
            Sunlight
          </span>
          <span className="tone-earth">
            <Earth />
            Earth link
          </span>
        </div>
      </Card>
      <Card>
        <SectionLabel>Local horizon</SectionLabel>
        <HorizonChart horizon={m.siteData?.horizon} sample={m.sample} mast={m.config.mast} />
      </Card>
    </aside>
  );
}
