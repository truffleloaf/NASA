"use client";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from "three";
import { horizonAt } from "@/lib/science";
import type { MissionState } from "../mission/use-mission";
const DEG = Math.PI / 180;
export function SurfaceView({ mission: m, yaw }: { mission: MissionState; yaw: number }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, 0);
    camera.lookAt(Math.sin(yaw * DEG), 0, -Math.cos(yaw * DEG));
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, yaw, invalidate]);
  const geometry = useMemo(() => {
    const geo = new BufferGeometry(),
      points: number[] = [],
      indices: number[] = [];
    for (let az = 0; az <= 360; az++) {
      const angle = az * DEG,
        height = m.siteData ? horizonAt(m.siteData.horizon, az, m.config.mast) : 0;
      points.push(
        Math.sin(angle) * 10,
        Math.tan(height * DEG) * 10,
        -Math.cos(angle) * 10,
        Math.sin(angle) * 10,
        -25,
        -Math.cos(angle) * 10,
      );
      if (az < 360) {
        const i = az * 2;
        indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
      }
    }
    geo.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    geo.setIndex(indices);
    return geo;
  }, [m.siteData, m.config.mast]);
  const stars = useMemo(() => {
    const geo = new BufferGeometry(),
      points: number[] = [];
    for (let i = 1; i < 260; i++) {
      const a = i * 2.399963,
        y = ((i * 0.618034) % 1) * 1.8 - 0.8,
        r = Math.sqrt(1 - y * y);
      points.push(Math.cos(a) * r * 60, y * 60, Math.sin(a) * r * 60);
    }
    geo.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return geo;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => stars.dispose(), [stars]);
  const position = (az: number, el: number) =>
    new Vector3(
      Math.sin(az * DEG) * Math.cos(el * DEG),
      Math.sin(el * DEG),
      -Math.cos(az * DEG) * Math.cos(el * DEG),
    ).multiplyScalar(30);
  return (
    <>
      <points geometry={stars}>
        <pointsMaterial size={0.025} color="#9AA3B2" sizeAttenuation />
      </points>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#232A36" side={DoubleSide} />
      </mesh>
      {m.sample && (
        <>
          {[
            { az: m.sample.sunAz, el: m.sample.sunEl, size: m.sample.sunSize, color: "#F4B860" },
            { az: m.sample.earthAz, el: m.sample.earthEl, size: m.sample.earthSize, color: "#62B6FF" },
          ].map((body) => (
            <Billboard key={body.color} position={position(body.az, body.el)}>
              <mesh>
                <circleGeometry args={[30 * Math.tan((body.size * DEG) / 2), 48]} />
                <meshBasicMaterial color={body.color} side={DoubleSide} />
              </mesh>
            </Billboard>
          ))}
        </>
      )}
    </>
  );
}
