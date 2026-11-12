"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, Vector3 } from "three";
export function DirectionMarker({
  target,
  origin,
  body,
  reduced,
  showLine = true,
}: {
  target: Vector3;
  origin: Vector3;
  body: "sun" | "earth";
  reduced: boolean;
  showLine?: boolean;
}) {
  const group = useRef<Group>(null),
    position = useRef(target.clone());
  const invalidate = useThree((state) => state.invalidate),
    color = body === "sun" ? "#F4B860" : "#62B6FF";
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
    invalidate();
  }, [target.x, target.y, target.z, reduced, invalidate]);
  useFrame((_, delta) => {
    const moving = !reduced && position.current.distanceToSquared(target) > 0.000001;
    if (moving) {
      position.current.lerp(target, 1 - Math.exp(-12 * Math.min(delta, 0.05)));
      invalidate();
    } else position.current.copy(target);
    group.current?.position.copy(position.current);
    const points = line.geometry.attributes.position as BufferAttribute;
    points.setXYZ(0, origin.x, origin.y, origin.z);
    points.setXYZ(1, position.current.x, position.current.y, position.current.z);
    points.needsUpdate = true;
    line.geometry.computeBoundingSphere();
  });
  return (
    <>
      {showLine && <primitive object={line} />}
      <group ref={group} position={position.current}>
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
