"use client";
import { coordinates } from "@/lib/planning";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { analyzeSite, type SiteId } from "@/lib/science";
import { SITES, type MissionState } from "./use-mission";
import { Card } from "../ui/card";
import { Segmented } from "../ui/segmented";
import { ProvenanceBadge } from "../ui/provenance-badge";
import { StatTile } from "../ui/stat-tile";
export function CompareView({ mission: m, onExplore }: { mission: MissionState; onExplore: () => void }) {
  const [heatSite, setHeatSite] = useState<SiteId>(m.config.site),
    [tooltip, setTooltip] = useState("Select a day to explore its full month.");
  const annual = useMemo(
    () => analyzeSite(m.data[heatSite], { ...m.config, site: heatSite, start: "2026-01-01", end: "2026-12-31" }),
    [m.data, heatSite, m.config.mast, m.config.sunlight, m.config.blackout, m.config.duration],
  );
  const ranking = [...SITES].sort((a, b) => (m.results[b.id].longest ?? -1) - (m.results[a.id].longest ?? -1));
  let offset = 0;
  return (
    <div className="content-view">
      <div className="view-heading">
        <div>
          <span className="mono-caps">Site comparison</span>
          <h1>Same mission. Different horizons.</h1>
          <p>Fit is ranked by the longest window under your current limits.</p>
        </div>
        <div>
          <Segmented
            label="Compare antenna mast height"
            value={String(m.config.mast)}
            options={[
              { value: "2", label: "2 m mast" },
              { value: "20", label: "20 m mast" },
              ...(![2,20].includes(m.config.mast) ? [{ value: String(m.config.mast), label: `Custom · ${m.config.mast} m` }] : []),
            ]}
            onChange={(v) => m.update({ mast: Number(v) })}
          />
          <ProvenanceBadge detail="Mast benefits are exploratory estimates; the DEM cannot resolve metre-scale obstacles." />
        </div>
      </div>
      <div className="comparison-grid">
        {ranking.map((site, i) => (
          <Card key={site.id} className={site.id === m.config.site ? "chosen-card" : ""}>
            <div className="row-between">
              <span className="mono-caps">Fit rank {i + 1}</span>
              <ProvenanceBadge />
            </div>
            <h2>{site.name}</h2>
            <p className="mono small muted">
              {coordinates(site.lat, site.lon)}
            </p>
            <div className="comparison-stats">
              <StatTile label="Longest window" value={m.results[site.id].longest} unit="h" accent="ok" />
              <StatTile
                label="Earth link"
                value={m.results[site.id].uptime?.toFixed(1) ?? null}
                unit="%"
                accent="earth"
              />
            </div>
            <p className="small muted">{m.results[site.id].windows.length} qualifying windows in your period.</p>
            <button
              className="action-outline full-width"
              onClick={() => {
                m.update({ site: site.id });
                onExplore();
              }}
            >
              Explore this region
              <ArrowRight />
            </button>
          </Card>
        ))}
      </div>
      <Card className="heatmap-panel">
        <div className="view-heading">
          <div>
            <h2>Best-month finder</h2>
            <p>
              Hours inside qualifying windows, for each day of the bundled year. <ProvenanceBadge />
            </p>
          </div>
          <select aria-label="Heatmap site" value={heatSite} onChange={(e) => setHeatSite(e.target.value as SiteId)}>
            {SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {annual.status !== "ready" ? (
          <p>{annual.reason}</p>
        ) : (
          <>
            <div className="heatmap" role="group" aria-label="2026 operating hours by day, estimated">
              {Array.from({ length: 12 }, (_, month) => {
                const days = new Date(Date.UTC(2026, month + 1, 0)).getUTCDate(),
                  start = offset;
                offset += days;
                return (
                  <div className="heatmap-row" key={month} style={{ animationDelay: `${month * 20}ms` }}>
                    <span className="mono">
                      {new Date(Date.UTC(2026, month, 1)).toLocaleString("en", { month: "short", timeZone: "UTC" })}
                    </span>
                    {Array.from({ length: 31 }, (_, day) => {
                      if (day >= days) return <span key={day} />;
                      const hours = annual.dailyHours[start + day] || 0,
                        date = `2026-${String(month + 1).padStart(2, "0")}-${String(day + 1).padStart(2, "0")}`,
                        label = `${date}: ${hours} qualifying hours · Estimated`;
                      return (
                        <button
                          key={day}
                          className={`heat-cell heat-${Math.ceil(hours / 6)}`}
                          aria-label={label}
                          title={label}
                          onFocus={() => setTooltip(label)}
                          onPointerEnter={() => setTooltip(label)}
                          onClick={() => {
                            m.update({
                              site: heatSite,
                              start: date.slice(0, 8) + "01",
                              end: date.slice(0, 8) + days,
                              hour: day * 24,
                            });
                            onExplore();
                          }}
                        >
                          <span className="sr-only">{day + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="heatmap-caption">
              <p role="status">{tooltip}</p>
              <span className="mono small">
                0 → 24 h <ProvenanceBadge />
              </span>
            </div>
            <details>
              <summary>Read the heatmap as a table</summary>
              <div className="table-scroll">
                <table>
                  <caption>Estimated qualifying hours per day</caption>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {annual.dailyHours.map((hours, i) => (
                      <tr key={i}>
                        <td>{new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10)}</td>
                        <td>{hours}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </Card>
    </div>
  );
}
