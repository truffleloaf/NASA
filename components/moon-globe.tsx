"use client";
import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useTexture } from "@react-three/drei";
import { Group, SRGBColorSpace, Vector3 } from "three";
import type { OrbitControls as OrbitControlsType } from "three-stdlib";
import { sites, type SiteId } from "@/lib/mission";
export type Layers = {
  terrain: boolean;
  sites: boolean;
  sunlight: boolean;
  earth: boolean;
  elevation: boolean;
};
export type CameraAction = {
  type: "reset" | "south" | "in" | "out" | "site";
  seq: number;
};
type Props = {
  hero?: boolean;
  selected?: SiteId;
  onSelect?: (id: SiteId) => void;
  layers?: Layers;
  hour?: number;
  action?: CameraAction;
  reduced?: boolean;
  lowQuality?: boolean;
  onReady?: () => void;
  markerRefs?: RefObject<Record<SiteId, HTMLButtonElement | null>>;
};
export function MoonFallback() {
  return (
    <div
      className="moon-fallback"
      role="img"
      aria-label="Textured lunar globe preview"
    >
      <div />
    </div>
  );
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <MoonFallback /> : this.props.children;
  }
}
function CameraRig({ action, hero, reduced, selected }: Props) {
  const controls = useRef<OrbitControlsType>(null);
  const { camera } = useThree();
  const destination = useRef<Vector3 | null>(null);
  useEffect(() => {
    if (!action) return;
    if (action.type === "in" || action.type === "out")
      destination.current = camera.position
        .clone()
        .multiplyScalar(action.type === "in" ? 0.82 : 1.22)
        .clampLength(2.2, 6);
    else if (action.type === "south" || action.type === "site")
      destination.current = new Vector3(
        selected === "malapert" ? 0.32 : -0.15,
        -3,
        1.25,
      );
    else destination.current = new Vector3(0, -1.7, 3.4);
  }, [action, camera, selected]);
  useFrame((_, delta) => {
    if (destination.current) {
      camera.position.lerp(
        destination.current,
        reduced ? 1 : 1 - Math.exp(-delta * 4),
      );
      controls.current?.update();
      if (camera.position.distanceTo(destination.current) < 0.005)
        destination.current = null;
    }
  });
  return (
    <OrbitControls
      ref={controls}
      enablePan={false}
      enableZoom={!hero}
      enableRotate={!hero}
      minDistance={2.2}
      maxDistance={6}
      enableDamping
      dampingFactor={0.07}
      autoRotate={!!hero && !reduced}
      autoRotateSpeed={0.16}
      onStart={() => {
        destination.current = null;
      }}
    />
  );
}
function LunarSurface({
  hero,
  selected,
  onSelect,
  layers,
  hour = 0,
  reduced,
  onReady,
  markerRefs,
}: Props) {
  const [color, height] = useTexture(["/moon-color.jpg", "/moon-height.jpg"]);
  color.colorSpace = SRGBColorSpace;
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  const group = useRef<Group>(null);
  const markers = useMemo(
    () =>
      Object.values(sites).map((site) => {
        const lat = (site.lat * Math.PI) / 180,
          lon = (site.lon * Math.PI) / 180;
        return {
          ...site,
          position: new Vector3(
            Math.cos(lat) * Math.sin(lon),
            Math.sin(lat),
            Math.cos(lat) * Math.cos(lon),
          ).multiplyScalar(1.025),
        };
      }),
    [],
  );
  const overlay = useRef<Group>(null);
  const { camera, size } = useThree();
  const projection = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    for (const marker of markers) {
      const element = markerRefs?.current[marker.id];
      if (!element) continue;
      projection.copy(marker.position).project(camera);
      element.style.left = `${((projection.x + 1) / 2) * size.width}px`;
      element.style.top = `${((-projection.y + 1) / 2) * size.height}px`;
      element.style.visibility =
        marker.position.dot(camera.position) > 1 ? "visible" : "hidden";
    }
    if (overlay.current)
      overlay.current.scale.lerp(
        new Vector3(1, 1, 1).multiplyScalar(
          layers?.sunlight || layers?.earth ? 1 : 0.001,
        ),
        reduced ? 1 : 1 - Math.exp(-delta * 5),
      );
  });
  return (
    <>
      <ambientLight intensity={0.17} />
      <directionalLight
        position={[4 * Math.cos(hour / 18), 2.5, 4 * Math.sin(hour / 18) + 3]}
        intensity={3.1}
        color="#fff3df"
      />
      <directionalLight
        position={[-4, -1, -3]}
        intensity={0.18}
        color="#6d8ca8"
      />
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[1, 128, 96]} />
          <meshStandardMaterial
            map={layers?.terrain === false ? null : color}
            bumpMap={layers?.terrain === false ? null : height}
            bumpScale={0.035}
            roughness={0.98}
            metalness={0}
            color={layers?.elevation ? "#8098a5" : "#e8e6e3"}
          />
        </mesh>
        {layers?.elevation && (
          <mesh scale={1.003}>
            <sphereGeometry args={[1, 40, 28]} />
            <meshBasicMaterial
              wireframe
              color="#73d9f5"
              transparent
              opacity={0.13}
            />
          </mesh>
        )}
        <group ref={overlay} scale={0.001}>
          {layers?.sunlight && (
            <mesh rotation={[0, hour / 30, 0.3]}>
              <sphereGeometry args={[1.008, 48, 32, 0, Math.PI]} />
              <meshBasicMaterial
                color="#ffc66d"
                transparent
                opacity={0.14}
                depthWrite={false}
              />
            </mesh>
          )}
          {layers?.earth && (
            <mesh rotation={[0, 2.3 + hour / 50, -0.5]}>
              <sphereGeometry args={[1.012, 48, 32, 0, Math.PI * 0.8]} />
              <meshBasicMaterial
                color="#4a9eff"
                transparent
                opacity={0.2}
                depthWrite={false}
              />
            </mesh>
          )}
        </group>
        {!hero &&
          layers?.sites &&
          markers.map((site, i) => (
            <group key={site.id} position={site.position}>
              <mesh>
                <sphereGeometry args={[0.014, 16, 16]} />
                <meshBasicMaterial color={site.color} />
              </mesh>
            </group>
          ))}
      </group>
    </>
  );
}
function SceneContent(props: Props) {
  return (
    <>
      <Suspense fallback={null}>
        <LunarSurface {...props} />
      </Suspense>
      <CameraRig {...props} />
    </>
  );
}
export default function MoonGlobe(props: Props) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);
  const markerRefs = useRef<Record<SiteId, HTMLButtonElement | null>>({
    shackleton: null,
    malapert: null,
  });
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setSupported(!!canvas.getContext("webgl2"));
    } catch {
      setSupported(false);
    }
  }, []);
  if (supported === false || props.lowQuality) return <MoonFallback />;
  return (
    <SceneBoundary>
      <div className="moon-canvas">
        {!ready && <MoonFallback />}
        {supported && (
          <Canvas
            camera={{
              position: props.hero ? [0, 0.1, 3.1] : [0, -1.7, 3.4],
              fov: props.hero ? 43 : 38,
            }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true }}
            fallback={<MoonFallback />}
            style={{ position: "absolute", inset: 0 }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
            }}
          >
            <SceneContent
              {...props}
              markerRefs={markerRefs}
              onReady={() => setReady(true)}
            />
          </Canvas>
        )}
        {ready &&
          !props.hero &&
          props.layers?.sites &&
          Object.values(sites).map((site, i) => (
            <button
              key={site.id}
              ref={(element) => {
                markerRefs.current[site.id] = element;
              }}
              className={`site-marker marker-${i} ${props.selected === site.id ? "selected" : ""}`}
              title={`${site.name} · ${site.coordinates} · schematic marker`}
              onClick={() => props.onSelect?.(site.id)}
              aria-label={`Select ${site.name}`}
            >
              <span className="marker-dot" />
              <span>
                {site.short}
                <small>{site.coordinates}</small>
              </span>
            </button>
          ))}
      </div>
    </SceneBoundary>
  );
}
