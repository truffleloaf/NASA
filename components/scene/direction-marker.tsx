"use client";
import { useEffect, useMemo } from "react";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Line, LineBasicMaterial, Vector3 } from "three";
export function DirectionMarker({
  target,
  origin,
  body,
  showLine = true,
}: {
  target: Vector3;
  origin: Vector3;
  body: "sun" | "earth";
  reduced: boolean;
  showLine?: boolean;
}) {
  const color = body === "sun" ? "#FFC46B" : "#5CC8FF";
  const line = useMemo(
    () =>
      new Line(
        new BufferGeometry().setAttribute("position", new BufferAttribute(new Float32Array(6), 3)),
        new LineBasicMaterial({ color, transparent: true, opacity: 0.45 }),
      ),
    [color],
  );
  useEffect(
    () => () => {
      line.geometry.dispose();
      line.material.dispose();
    },
    [line],
  );
  useEffect(() => {
    const points = line.geometry.attributes.position as BufferAttribute;
    points.setXYZ(0, origin.x, origin.y, origin.z);
    points.setXYZ(1, target.x, target.y, target.z);
    points.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  }, [origin.x, origin.y, origin.z, target.x, target.y, target.z, line]);
  return (
    <>
      {showLine && <primitive object={line} />}
      <group position={target}>
        <mesh>
          <sphereGeometry args={[0.12, 16, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <Html center>
          <span className={`rim-label tone-${body}`}>{body.toUpperCase()}</span>
        </Html>
      </group>
    </>
  );
}
