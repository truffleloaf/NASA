"use client";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry } from "three";
export function Stars() {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let i = 1; i < 260; i++) {
      const a = i * 2.399963,
        y = ((i * 0.618034) % 1) * 1.8 - 0.8,
        r = Math.sqrt(1 - y * y);
      points.push(Math.cos(a) * r * 60, y * 60, Math.sin(a) * r * 60);
    }
    return new BufferGeometry().setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <points geometry={geometry} raycast={() => {}}>
      <pointsMaterial size={0.025} color="#DDE3EE" transparent opacity={0.45} sizeAttenuation depthWrite={false} />
    </points>
  );
}
