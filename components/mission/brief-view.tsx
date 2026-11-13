"use client";
import { Printer, Download, Link as LinkIcon } from "lucide-react";
import { coordinates } from "@/lib/planning";
import { formatTime } from "@/lib/science";
import type { MissionState } from "./use-mission";
import { Card } from "../ui/card";
import { ProvenanceBadge } from "../ui/provenance-badge";
import { Track } from "../ui/track";
export function BriefView({ mission: m }: { mission: MissionState }) {
  return (
    <div className="content-view brief-view">
      <div className="view-heading no-print">
        <div>
          <span className="mono-caps">Mission brief</span>
          <h1>Ready for the next conversation.</h1>
          <p>Print a single-page brief or save it as a PDF in your browser.</p>
        </div>
        <div className="button-row">
          <button className="action-outline" onClick={m.copyLink}>
            <LinkIcon />
            Copy link
          </button>
          <button className="action-outline" onClick={m.downloadCSV}>
            <Download />
            CSV
          </button>
          <button
            className="action-primary"
            onClick={() => {
              m.notify("Print brief opened. Choose Save as PDF to export.");
              window.print();
            }}
          >
            <Printer />
            Print / save PDF
          </button>
        </div>
      </div>
      <Card className="print-brief">
        <div className="row-between">
          <span className="mono-caps">Lunar / Mission Navigator</span>
          <ProvenanceBadge />
        </div>
        <h2>{m.selected.name}</h2>
        <p className="mono">
          {m.config.start} — {m.config.end} · UTC
        </p>
        <p>
          {coordinates(m.selected.lat,m.selected.lon)} · Representative coordinate, not a certified landing site.
        </p>
        <h3>
          Planning assumptions <ProvenanceBadge />
        </h3>
        <dl className="brief-limits">
          <div>
            <dt>Sunlight</dt>
            <dd>≥ {m.config.sunlight} h</dd>
          </div>
          <div>
            <dt>Blackout</dt>
            <dd>≤ {m.config.blackout} h</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>≥ {m.config.duration} h</dd>
          </div>
          <div>
            <dt>Mast height</dt>
            <dd>{m.config.mast} m</dd>
          </div>
        </dl>
        <h3>
          Highest-ranked windows <ProvenanceBadge />
        </h3>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Start / end UTC</th>
                <th>Duration</th>
                <th>Earth link</th>
                <th>Why it ends</th>
              </tr>
            </thead>
            <tbody>
              {m.result.windows.slice(0, 3).map((w) => (
                <tr key={w.id}>
                  <td>
                    {formatTime(m.config, w.start)}
                    <br />
                    {formatTime(m.config, w.end)}
                  </td>
                  <td>{w.end - w.start} h</td>
                  <td>{w.uptime.toFixed(1)}%</td>
                  <td>{w.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!m.result.windows.length && <p>No qualifying windows for these limits.</p>}
        <div className="brief-tracks">
          <Track
            label="Sunlight"
            accent="sun"
            intervals={m.result.solar}
            total={m.result.hours}
            hour={m.config.hour}
            onSelect={() => {}}
          />
          <Track
            label="Earth link"
            accent="earth"
            intervals={m.result.earth}
            total={m.result.hours}
            hour={m.config.hour}
            onSelect={() => {}}
          />
          <Track
            label="Windows"
            accent="ok"
            intervals={m.result.windows}
            total={m.result.hours}
            hour={m.config.hour}
            onSelect={() => {}}
          />
        </div>
        <h3>Sources & interpretation</h3>
        <p>
          NASA/JPL Horizons DE441 airless apparent directions; LRO LOLA south-polar DEM. Visibility uses estimated
          terrain horizons and hourly centre-of-disc tests. Sunlight is evaluated at the baseline observer; mast changes
          affect Earth visibility only.
        </p>
        <p className="small muted">
          Exploratory planning, not flight operations. Terrain resolution, reference-frame differences and distant
          terrain limit accuracy. Earth visibility does not guarantee a communications link budget. Full sources,
          formulas and checks: <a href="/methods/">/methods</a>.
        </p>
      </Card>
    </div>
  );
}
