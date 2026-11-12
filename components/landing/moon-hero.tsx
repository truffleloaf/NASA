"use client";
import { Component, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from "three";
import type { Atmosphere } from "./use-atmosphere";
import { MoonFallback } from "./moon-fallback";
class MoonBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <MoonFallback /> : this.props.children;
  }
}
function MoonModel({
  atmosphere,
  onReady,
  onError,
  portal,
}: {
  atmosphere: Atmosphere;
  onReady: () => void;
  onError: () => void;
  portal: RefObject<HTMLDivElement>;
}) {
  const group = useRef<Group>(null),
    sphere = useRef<Mesh>(null!),
    marker = useRef<Mesh>(null),
    earth = useRef<Mesh>(null),
    pulse = useRef<Mesh>(null),
    material = useRef<MeshStandardMaterial>(null);
  const { gl, camera, size, invalidate } = useThree();
  const elapsed = useRef(0),
    ready = useRef(false);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", onError);
    return () => canvas.removeEventListener("webglcontextlost", onError);
  }, [gl, onError]);
  const line = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(6), 3));
    return new Line(
      geometry,
      new LineBasicMaterial({ color: "#62B6FF", transparent: true, opacity: 0, depthTest: false }),
    );
  }, []);
  const pole = useMemo(() => new Vector3(), []),
    endpoint = useMemo(() => new Vector3(), []);
  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );
  useEffect(() => {
    let cancelled = false,
      loaded = 0;
    const loader = new TextureLoader();
    const done = () => {
      if (cancelled) return;
      if (++loaded === 2) {
        ready.current = true;
        onReady();
        invalidate();
      }
    };
    const failed = () => {
      if (!cancelled) onError();
    };
    const map = loader.load("/moon-color.jpg", done, undefined, failed),
      bump = loader.load("/moon-height.jpg", done, undefined, failed);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = bump.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    if (material.current) {
      material.current.map = map;
      material.current.bumpMap = bump;
      material.current.needsUpdate = true;
    }
    return () => {
      cancelled = true;
      map.dispose();
      bump.dispose();
    };
  }, [gl, invalidate, onReady, onError]);
  useEffect(() => {
    if ("zoom" in camera) {
      camera.zoom = size.width / 3.08;
      camera.updateProjectionMatrix();
    }
    invalidate();
  }, [camera, size.width, invalidate]);
  useFrame((_, delta) => {
    if (!group.current || !sphere.current || !marker.current || !earth.current || !pulse.current) return;
    const moving = atmosphere.active && !atmosphere.reduced;
    if (moving && ready.current) elapsed.current += Math.min(delta, 0.05);
    sphere.current.rotation.y = atmosphere.reduced ? 0 : elapsed.current * 0.02;
    group.current.rotation.x +=
      ((atmosphere.reduced ? 0 : atmosphere.pointer.current.y * 0.02618) - group.current.rotation.x) *
      (atmosphere.reduced ? 1 : 0.05);
    group.current.rotation.y +=
      ((atmosphere.reduced ? 0 : atmosphere.pointer.current.x * 0.02618) - group.current.rotation.y) *
      (atmosphere.reduced ? 1 : 0.05);
    earth.current.position.x =
      (atmosphere.mobile ? 0.36 : 0.9) +
      (atmosphere.reduced ? 0 : (Math.sin((elapsed.current * Math.PI * 2) / 90) * 6 * 3.08) / size.width);
    const phase = elapsed.current % 2,
      progress = Math.min(1, phase / 0.6);
    pulse.current.scale.setScalar(1 + (1 - (1 - progress) ** 3) * 1.5);
    (pulse.current.material as MeshBasicMaterial).opacity = moving ? (1 - progress) * 0.7 : 0;
    marker.current.getWorldPosition(pole);
    earth.current.getWorldPosition(endpoint);
    const positions = line.geometry.attributes.position as BufferAttribute;
    positions.setXYZ(0, pole.x, pole.y, pole.z);
    positions.setXYZ(1, endpoint.x, endpoint.y, endpoint.z);
    positions.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.material.opacity = atmosphere.reduced
      ? 0.45
      : Math.max(0, Math.min(0.45, ((elapsed.current - 0.6) / 0.6) * 0.45));
  });
  return (
    <>
      <ambientLight intensity={0.04} />
      <hemisphereLight args={["#DDE3EE", "#05060A", 0.03]} />
      <directionalLight position={[-3, 2.5, 1.5]} intensity={3} />
      <group ref={group}>
        <group rotation-x={-0.9}>
          <mesh ref={sphere}>
            <sphereGeometry args={[1, 96, 96]} />
            <meshStandardMaterial
              ref={material}
              bumpScale={0.6}
              roughness={1}
              onBeforeCompile={(shader) => {
                shader.fragmentShader = shader.fragmentShader.replace(
                  "#include <map_fragment>",
                  "#include <map_fragment>\nfloat lunarLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(lunarLuma), 0.85);",
                );
              }}
            />
          </mesh>
          <mesh ref={marker} position={[0, -1.003, 0]} rotation-x={Math.PI / 2}>
            <ringGeometry args={[0.017, 0.022, 32]} />
            <meshBasicMaterial color="#5FD8A4" side={DoubleSide} depthTest={false} />
          </mesh>
          <Html
            portal={portal}
            center
            occlude={[sphere]}
            position={[0, -1.011, 0]}
            zIndexRange={[4, 0]}
            style={{ pointerEvents: "none" }}
          >
            <div className="hero-site-label" aria-hidden="true">
              Shackleton region<small>South-pole candidate</small>
            </div>
          </Html>
          <mesh ref={pulse} position={[0, -1.006, 0]} rotation-x={Math.PI / 2}>
            <ringGeometry args={[0.024, 0.027, 32]} />
            <meshBasicMaterial color="#5FD8A4" side={DoubleSide} transparent opacity={0} depthTest={false} />
          </mesh>
        </group>
      </group>
      <primitive object={line} />
      <mesh ref={earth} position={[atmosphere.mobile ? 0.36 : 0.9, atmosphere.mobile ? 1.15 : 0.95, 0]}>
        <circleGeometry args={[(9 * 3.08) / size.width, 32]} />
        <meshBasicMaterial color="#62B6FF" />
        <Html portal={portal} center position={[0, 0.09, 0]} style={{ pointerEvents: "none" }}>
          <span className="hero-body-label tone-earth" aria-hidden="true">
            EARTH
          </span>
        </Html>
      </mesh>
      <mesh position={[-1.07, 0.96, 0]}>
        <circleGeometry args={[0.013, 20]} />
        <meshBasicMaterial color="#F4B860" />
        <Html portal={portal} center position={[0, 0.08, 0]} style={{ pointerEvents: "none" }}>
          <span className="hero-body-label tone-sun" aria-hidden="true">
            SUN
          </span>
        </Html>
      </mesh>
    </>
  );
}
function MoonCanvas({ atmosphere }: { atmosphere: Atmosphere }) {
  const portal = useRef<HTMLDivElement>(null!);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const callbacks = useMemo(() => ({ ready: () => setReady(true), error: () => setFailed(true) }), []);
  if (failed) return <MoonFallback />;
  return (
    <>
      {!ready && <MoonFallback />}
      <div ref={portal} className="hero-moon-canvas" data-ready={ready} aria-hidden="true">
        <Canvas
          orthographic
          gl={{ alpha: true, antialias: true }}
          dpr={[1, atmosphere.mobile ? 1.5 : 2]}
          camera={{ position: [0, 0, 6], near: 0.1, far: 20 }}
          frameloop={atmosphere.active && !atmosphere.reduced ? "always" : "demand"}
          onCreated={({ gl }) => {
            gl.setClearColor(0, 0);
          }}
          fallback={<MoonFallback />}
        >
          <MoonModel atmosphere={atmosphere} portal={portal} onReady={callbacks.ready} onError={callbacks.error} />
        </Canvas>
      </div>
    </>
  );
}
export default function MoonHero({ atmosphere }: { atmosphere: Atmosphere }) {
  return (
    <MoonBoundary>
      <MoonCanvas atmosphere={atmosphere} />
    </MoonBoundary>
  );
}
