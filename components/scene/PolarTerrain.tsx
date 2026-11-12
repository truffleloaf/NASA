"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, InstancedMesh, Object3D, Vector3 } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import header from "@/public/data/terrain/polar-1024.json";
import { SITES } from "../mission/use-mission";
import type { SceneProps } from "./scene";
import { Stars } from "./stars";
import { DirectionMarker } from "./direction-marker";
const SCALE = 25,
  RADIUS = 304 / SCALE,
  DEG = Math.PI / 180;
export function sitePoint(lat: number, lon: number): [number, number] {
  const radius = (2 * 1737.4 * Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / SCALE;
  return [radius * Math.sin(lon * DEG), -radius * Math.cos(lon * DEG)];
}
export function PolarTerrain({
  heights,
  mission: m,
  layers,
  exaggeration,
  reset,
}: SceneProps & { heights: Uint16Array }) {
  const { camera, invalidate } = useThree(),
    controls = useRef<Controls>(null),
    markers = useRef<InstancedMesh>(null);
  const heightAt = (x: number, z: number) => {
    const col = Math.max(0, Math.min(1023, Math.round((x / (RADIUS * 2) + 0.5) * 1023))),
      row = Math.max(0, Math.min(1023, Math.round((z / (RADIUS * 2) + 0.5) * 1023)));
    return ((header.minMeters + heights[row * 1024 + col] * header.scaleMeters) / 1000 / SCALE) * exaggeration;
  };
  const geometry = useMemo(() => {
    const size = 256,
      positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= size; row++)
      for (let col = 0; col <= size; col++) {
        const x = (col / size - 0.5) * RADIUS * 2,
          z = (row / size - 0.5) * RADIUS * 2;
        positions.push(x, heightAt(x, z), z);
        const color = new Color(layers.heat ? "#F4B860" : "#999B9B");
        colors.push(color.r, color.g, color.b);
      }
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        const x = ((col + 0.5) / size - 0.5) * 2,
          z = ((row + 0.5) / size - 0.5) * 2;
        if (x * x + z * z > 1) continue;
        const i = row * (size + 1) + col;
        indices.push(i, i + size + 1, i + 1, i + 1, i + size + 1, i + size + 2);
      }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [heights, exaggeration, layers.heat]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const points = SITES.map((site) => {
      const [x, z] = sitePoint(site.lat, site.lon);
      return new Vector3(x, heightAt(x, z) + 0.05, z);
    }),
    selectedIndex = SITES.findIndex((s) => s.id === m.config.site),
    selected = points[selectedIndex];
  useEffect(() => {
    if (!markers.current) return;
    const obj = new Object3D();
    points.forEach((point, i) => {
      obj.position.copy(point);
      obj.rotation.set(-Math.PI / 2, 0, 0);
      obj.updateMatrix();
      markers.current!.setMatrixAt(i, obj.matrix);
      markers.current!.setColorAt(i, new Color(i === selectedIndex ? "#5FD8A4" : "#ECE9E3"));
    });
    markers.current.instanceMatrix.needsUpdate = true;
    if (markers.current.instanceColor) markers.current.instanceColor.needsUpdate = true;
    invalidate();
  }, [m.config.site, exaggeration]);
  const fly = useRef<{ start: number; from: Vector3; target: Vector3; position: Vector3 } | null>(null);
  useEffect(() => {
    const target = reset ? new Vector3(0, 0, 0) : selected.clone();
    const destination = target.clone().add(new Vector3(0, 14, 17));
    if (m.reduced) {
      camera.position.copy(destination);
      controls.current?.target.copy(target);
      controls.current?.update();
    } else fly.current = { start: performance.now(), from: camera.position.clone(), target, position: destination };
    invalidate();
  }, [m.config.site, reset, m.reduced]);
  useFrame(() => {
    if (!fly.current) return;
    const t = Math.min(1, (performance.now() - fly.current.start) / 600),
      eased = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(fly.current.from, fly.current.position, eased);
    controls.current?.target.lerp(fly.current.target, eased);
    controls.current?.update();
    if (t < 1) invalidate();
    else fly.current = null;
  });
  const direction = (az: number, el: number, distance: number) => {
    const a = (az + m.selected.lon) * DEG,
      e = el * DEG;
    return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)).multiplyScalar(distance);
  };
  const sun = direction(m.sample?.sunAz ?? 0, m.sample?.sunEl ?? -90, 40),
    rimSun = direction(m.sample?.sunAz ?? 0, 8, RADIUS),
    earth = direction(m.sample?.earthAz ?? 0, 8, RADIUS);
  return (
    <>
      <Stars />
      <ambientLight intensity={0.14} />
      {m.sample && (
        <directionalLight
          position={sun}
          intensity={2.8}
          castShadow={layers.shadows}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-16}
          shadow-camera-right={16}
          shadow-camera-top={16}
          shadow-camera-bottom={-16}
          shadow-camera-near={0.1}
          shadow-camera-far={85}
          shadow-bias={-0.00006}
          shadow-normalBias={0.006}
        />
      )}
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} side={DoubleSide} />
      </mesh>
      <instancedMesh
        ref={markers}
        args={[undefined, undefined, SITES.length]}
        onClick={(event) => {
          event.stopPropagation();
          if (event.instanceId !== undefined) m.update({ site: SITES[event.instanceId].id });
        }}
      >
        <ringGeometry args={[0.09, 0.14, 32]} />
        <meshBasicMaterial side={DoubleSide} />
      </instancedMesh>
      {layers.labels &&
        points.map((point, i) => (
          <Html key={SITES[i].id} position={point} center distanceFactor={25} zIndexRange={[8, 0]}>
            <button
              className={`terrain-label ${i === selectedIndex ? "selected" : ""}`}
              onClick={() => m.update({ site: SITES[i].id })}
            >
              {SITES[i].name}
            </button>
          </Html>
        ))}
      {layers.grid &&
        [3, 6, 9, 12].map((radius) => (
          <Line
            key={radius}
            points={Array.from({ length: 97 }, (_, i) => {
              const angle = (i / 96) * Math.PI * 2;
              const x = radius * Math.sin(angle),
                z = radius * Math.cos(angle);
              return [x, heightAt(x, z) + 0.015, z] as [number, number, number];
            })}
            color="#9AA3B2"
            transparent
            opacity={0.22}
            lineWidth={0.5}
          />
        ))}
      {m.sample && (
        <>
          <DirectionMarker target={rimSun} origin={selected} body="sun" reduced={m.reduced} />
          <DirectionMarker target={earth} origin={selected} body="earth" reduced={m.reduced} showLine={layers.cone} />
        </>
      )}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping={!m.reduced}
        dampingFactor={0.12}
        minDistance={5}
        maxDistance={42}
        minPolarAngle={0.15}
        maxPolarAngle={Math.PI / 2.15}
        onStart={() => {
          fly.current = null;
        }}
      />
    </>
  );
}
