"use client";
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PCFShadowMap } from "three";
import type { MissionState } from "../mission/use-mission";
import type { LayersState } from "../mission/map-panel";
import { PolarTerrain } from "./PolarTerrain";
import { PolarFallback } from "./polar-fallback";
import { SurfaceView } from "./SurfaceView";
import { Skeleton } from "../ui/skeleton";
import header from "@/public/data/terrain/polar-1024.json";
import type { TerrainReading } from "@/lib/terrain";
import { verifyBundledAsset } from "@/lib/verified-data";
export type SceneProps = {
  onTerrain: (reading: TerrainReading | null) => void;
  mission: MissionState;
  mode: string;
  layers: LayersState;
  exaggeration: number;
  reset: number;
  onFallback: () => void;
};
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function ContextLifecycle({ onFallback, description }: { onFallback: () => void; description: string }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.domElement.setAttribute("role","img"); gl.domElement.setAttribute("aria-label",description); }, [gl,description]);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", onFallback);
    return () => canvas.removeEventListener("webglcontextlost", onFallback);
  }, [gl, onFallback]);
  return null;
}
function FrameMeter({ report }: { report: (text: string) => void }) {
  const gl = useThree(s=>s.gl);
  const frames = useRef({ count: 0, start: 0 });
  useFrame(() => {
    const now = performance.now();
    if (!frames.current.start) frames.current.start = now;
    frames.current.count++;
    if (now - frames.current.start >= 1000) {
      report(`${Math.round((frames.current.count * 1000) / (now - frames.current.start))} rendered fps · ${gl.info.memory.geometries} geometries · ${gl.info.memory.textures} textures`);
      frames.current.start = now;
      frames.current.count = 0;
    }
  });
  return null;
}
export default function Scene(props: SceneProps) {
  const [heights, setHeights] = useState<Uint16Array | null>(null),
    [yaw, setYaw] = useState(0),
    [fps, setFps] = useState("On demand");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/terrain/polar-1024.bin", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Terrain unavailable");
        return r.arrayBuffer();
      })
      .then(async (buffer) => {
        await verifyBundledAsset("/data/terrain/polar-1024.bin", buffer);
        if (buffer.byteLength !== header.width * header.height * 2) throw new Error("Invalid terrain dimensions");
        const view = new DataView(buffer);
        const data = new Uint16Array(header.width * header.height);
        for (let i = 0; i < data.length; i++) data[i] = view.getUint16(i * 2, true);
        setHeights(data);
      })
      .catch((error) => {
        if (error.name !== "AbortError") props.onFallback();
      });
    return () => controller.abort();
  }, []);
  useEffect(() => setYaw(0), [props.reset, props.mission.config.site]);
  const sample = props.mission.sample;
  const description = sample
    ? `Lunar terrain. Sun ${sample.sunEl.toFixed(2)} degrees; Earth ${sample.earthEl.toFixed(2)} degrees; Earth ${sample.earth ? "visible" : "obstructed"} above estimated horizon. Full text data follows.`
    : "Terrain view; ephemeris unavailable. Full text data follows.";
  if (!heights) return <Skeleton className="scene-loading" label="Loading bundled LOLA terrain" />;
  return (
    <SceneBoundary onError={props.onFallback}>
      <Canvas
        className="terrain-arrival"
        role="group"
        aria-label={description}
        dpr={[1, 1.5]}
        frameloop={props.mission.playing ? "always" : "demand"}
        shadows={{ type: PCFShadowMap }}
        camera={{ position: [0, 15, 18], fov: 42, near: 0.01, far: 150 }}
        fallback={<PolarFallback mission={props.mission} />}
      >
        <color attach="background" args={["#05070C"]} />
        <ContextLifecycle onFallback={props.onFallback} description={description} />
        <Suspense fallback={null}>
          {props.mode === "surface" ? (
            <SurfaceView mission={props.mission} yaw={yaw} />
          ) : (
            <PolarTerrain {...props} heights={heights} />
          )}
        </Suspense>
        {process.env.NODE_ENV === "development" && <FrameMeter report={setFps} />}
      </Canvas>
      {props.mode === "surface" && (
        <div className="compass-control">
          <div className="surface-look">
            <button disabled={!sample} onClick={() => sample && setYaw(Math.round(sample.sunAz) % 360)}>Face Sun</button>
            <button disabled={!sample} onClick={() => sample && setYaw(Math.round(sample.earthAz) % 360)}>Face Earth</button>
          </div>
          <label htmlFor="surface-heading">Heading {yaw}° · Estimated</label>
          <input
            id="surface-heading"
            type="range"
            min={0}
            max={359}
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
          />
          <span className="mono small">N · E · S · W</span>
        </div>
      )}
      {process.env.NODE_ENV === "development" && (
        <span className="fps-meter mono">{props.mission.playing ? fps : "On demand · paused"}</span>
      )}
    </SceneBoundary>
  );
}
