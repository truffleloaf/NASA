"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Layers, RotateCcw, Earth, Sun } from "lucide-react";
import type { MissionState } from "./use-mission";
import { Card } from "../ui/card";
import { Segmented } from "../ui/segmented";
import { Skeleton } from "../ui/skeleton";
import { ProvenanceBadge } from "../ui/provenance-badge";
import { PolarFallback } from "../scene/polar-fallback";
const Scene = dynamic(() => import("../scene/scene"), {
  ssr: false,
  loading: () => <Skeleton className="scene-loading" label="Loading polar terrain" />,
});
export type LayersState = { shadows: boolean; heat: boolean; grid: boolean; cone: boolean; labels: boolean };
export function MapPanel({ mission: m }: { mission: MissionState }) {
  const [mode, setMode] = useState("polar"),
    [flat, setFlat] = useState(false),
    [reset, setReset] = useState(0),
    [exaggeration, setExaggeration] = useState(2);
  const [layers, setLayers] = useState<LayersState>({
    shadows: true,
    heat: false,
    grid: true,
    cone: false,
    labels: true,
  });
  const summary = m.sample
    ? `Sun elevation ${m.sample.sunEl.toFixed(2)} degrees, ${m.sample.sun ? "above" : "below"} estimated terrain. Earth elevation ${m.sample.earthEl.toFixed(2)} degrees, link ${m.sample.earth ? "visible" : "obstructed"}.`
    : "Waiting for local ephemeris and terrain data.";
  return (
    <Card className="map-panel">
      <div className="map-toolbar">
        <div>
          <span className="mono-caps">South-polar terrain</span>
          <h2>{m.selected.name}</h2>
        </div>
        <Segmented
          label="Terrain viewpoint"
          value={mode}
          options={[
            { value: "polar", label: "Polar" },
            { value: "surface", label: "Surface" },
          ]}
          onChange={setMode}
        />
      </div>
      <div className="scene-readout">
        <span className={m.sample?.sun && m.sample?.earth ? "tone-ok" : "muted"}>
          <i className="readout-dot" />
          {!m.sample ? "Loading conditions" : m.sample.sun && m.sample.earth ? "Sun and Earth visible" : "Visibility limited by terrain"}
        </span>
        <span>Selected hour · <ProvenanceBadge /></span>
      </div>
      {m.selectedWindow && <p className="selected-window-label">Selected operating window · <ProvenanceBadge /></p>}
      <div className="terrain-stage">
        {m.loading ? (
          <Skeleton className="scene-loading" label="Reading local ephemeris" />
        ) : flat ? (
          <><PolarFallback mission={m} /><button className="retry-terrain action-outline" onClick={() => setFlat(false)}>Retry 3D terrain</button></>
        ) : (
          <Scene
            mission={m}
            mode={mode}
            layers={layers}
            exaggeration={exaggeration}
            reset={reset}
            onFallback={() => setFlat(true)}
          />
        )}
        <div className="map-corner">
          <span className="mono-caps">LOLA / south-polar DEM</span>
          <ProvenanceBadge
            kind="Computed"
            detail="Real terrain, downsampled for display. Sun shadows on this coarse mesh are illustrative of lighting, not the horizon-based window calculation."
          />
        </div>
        <div className="map-tools">
          {mode === "polar" && <details className="layers-menu">
            <summary className="icon-control" aria-label="Map layers">
              <Layers />
            </summary>
            <div>
              <strong>Map layers</strong>
              <p className="small muted">Display controls. Window calculations stay unchanged.</p>
              {Object.entries({
                shadows: "Terrain shadows",
                heat: "Illumination tint",
                grid: "Graticule",
                cone: "Earth sight line",
                labels: "Site labels",
              }).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={layers[key as keyof LayersState]}
                    onChange={(e) => setLayers((v) => ({ ...v, [key]: e.target.checked }))}
                  />
                  {label}
                </label>
              ))}
              <label>
                <input type="checkbox" checked={flat} onChange={(e) => setFlat(e.target.checked)} />
                2D accessible map
              </label>
            </div>
          </details>}
          <button className="icon-control" aria-label="Reset terrain view" onClick={() => setReset((v) => v + 1)}>
            <RotateCcw />
          </button>
        </div>
        {!flat && mode === "polar" && <span className="scene-hint">Drag to orbit · scroll to zoom</span>}
        {mode === "polar" && (
          <label className="exaggeration">
            Relief{" "}
            <select
              aria-label="Vertical exaggeration"
              value={exaggeration}
              onChange={(e) => setExaggeration(Number(e.target.value))}
            >
              {[1, 2, 3].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
            <ProvenanceBadge
              kind="Illustrative"
              detail="Display-only vertical exaggeration. Calculations always use the unexaggerated DEM."
            />
          </label>
        )}
      </div>
      <div className="map-status" aria-label={summary}>
        <div className="tone-sun">
          <Sun />
          <span>
            Sun elevation<strong>{m.sample ? `${m.sample.sunEl.toFixed(2)}°` : "—"}</strong>
            <small>{m.sample ? (m.sample.sun ? "Above terrain" : "Terrain-obstructed") : "Data unavailable"}</small>
          </span>
        </div>
        <div className="tone-earth">
          <Earth />
          <span>
            Earth elevation<strong>{m.sample ? `${m.sample.earthEl.toFixed(2)}°` : "—"}</strong>
            <small>
              {m.sample ? (m.sample.earth ? "Line of sight visible" : "Terrain-obstructed") : "Data unavailable"}
            </small>
          </span>
        </div>
        <ProvenanceBadge detail="JPL directions are Computed; terrain clearance and visibility are Estimated." />
      </div>
      <details className="map-data">
        <summary>Position & horizon details</summary>
        <table>
          <caption>Current directions: Computed. Terrain horizon: Estimated.</caption>
          <thead>
            <tr>
              <th>Body</th>
              <th>Azimuth</th>
              <th>Elevation</th>
              <th>Horizon</th>
              <th>Disc diameter</th>
            </tr>
          </thead>
          <tbody>
            {m.sample && (
              <>
                <tr>
                  <th>Sun</th>
                  <td>{m.sample.sunAz.toFixed(2)}°</td>
                  <td>{m.sample.sunEl.toFixed(2)}°</td>
                  <td>{m.sample.sunHorizon.toFixed(2)}°</td>
                  <td>{m.sample.sunSize.toFixed(3)}°</td>
                </tr>
                <tr>
                  <th>Earth</th>
                  <td>{m.sample.earthAz.toFixed(2)}°</td>
                  <td>{m.sample.earthEl.toFixed(2)}°</td>
                  <td>{m.sample.earthHorizon.toFixed(2)}°</td>
                  <td>{m.sample.earthSize.toFixed(3)}°</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
