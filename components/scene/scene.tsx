"use client";
import { Component, Suspense, useEffect, useState, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PCFSoftShadowMap } from "three";
import type { MissionState } from "../mission/use-mission";
import type { LayersState } from "../mission/map-panel";
import { PolarTerrain } from "./PolarTerrain";
import { SurfaceView } from "./SurfaceView";
import { Skeleton } from "../ui/skeleton";
import header from "@/public/data/terrain/polar-1024.json";
export type SceneProps = {
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
function FrameMeter({ report }: { report: (text: string) => void }) {
  let count = 0,
    start = 0;
  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    count++;
    if (now - start >= 1) {
      report(`${Math.round(count / (now - start))} rendered fps`);
      start = now;
      count = 0;
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
      .then((buffer) => {
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
        role="img"
        aria-label={description}
        dpr={[1, 2]}
        frameloop={props.mission.playing ? "always" : "demand"}
        shadows={{ type: PCFSoftShadowMap }}
        camera={{ position: [0, 15, 18], fov: 42, near: 0.01, far: 150 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", props.onFallback, { once: true });
        }}
        fallback={<p>WebGL unavailable. Use the 2D accessible map.</p>}
      >
        <color attach="background" args={["#0A0D12"]} />
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
          <label htmlFor="surface-heading">Heading {yaw}° · Estimated</label>
          <input
            id="surface-heading"
            type="range"
            min={0}
            max={359}
            value={yaw}
            onChange={(e) => setYaw(Number(e.target.value))}
          />
          <span className="mono small">N 0° · E 90° · S 180° · W 270°</span>
        </div>
      )}
      {process.env.NODE_ENV === "development" && (
        <span className="fps-meter mono">{props.mission.playing ? fps : "On demand · paused"}</span>
      )}
    </SceneBoundary>
  );
}
