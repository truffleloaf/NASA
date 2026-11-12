import { ArrowRight, Download } from "lucide-react";
import { formatTime, suggestRelaxation } from "@/lib/science";
import type { MissionState } from "./use-mission";
import { Card } from "../ui/card";
import { ProvenanceBadge } from "../ui/provenance-badge";
export function WindowsView({ mission: m, onExplore }: { mission: MissionState; onExplore: () => void }) {
  return (
    <div className="content-view">
      <div className="view-heading">
        <div>
          <span className="mono-caps">Operating windows</span>
          <h1>Time you can put to work.</h1>
          <p>
            {m.selected.name} · {m.config.start} to {m.config.end} UTC <ProvenanceBadge />
          </p>
        </div>
        <button className="action-outline" onClick={m.downloadCSV}>
          <Download />
          Download CSV
        </button>
      </div>
      <p className="muted">
        Ranked by duration, then Earth-link uptime. Sunlight stays continuous; communication gaps follow your blackout
        limit.
      </p>
      {!m.result.windows.length ? (
        <Card className="empty-state">
          <h2>No qualifying windows</h2>
          <p>{suggestRelaxation(m.result, m.config)}</p>
          <ProvenanceBadge />
          <button className="action-outline" onClick={onExplore}>
            Adjust mission limits
            <ArrowRight />
          </button>
        </Card>
      ) : (
        <div className="window-list">
          {m.result.windows.map((win, i) => (
            <Card className="window-row" key={win.id}>
              <span className="window-rank mono">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2>
                  {formatTime(m.config, win.start)} → {formatTime(m.config, win.end)} UTC
                </h2>
                <p>{win.why}</p>
                <ProvenanceBadge />
              </div>
              <dl>
                <div>
                  <dt>Duration</dt>
                  <dd>{win.end - win.start} h</dd>
                </div>
                <div>
                  <dt>Earth link</dt>
                  <dd>{win.uptime.toFixed(1)}%</dd>
                </div>
                <div>
                  <dt>Longest blackout</dt>
                  <dd>{win.blackout} h</dd>
                </div>
              </dl>
              <button
                className="action-outline"
                onClick={() => {
                  m.seek(win.start);
                  m.setSelectedWindow(win.id);
                  onExplore();
                }}
              >
                View on timeline
                <ArrowRight />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
