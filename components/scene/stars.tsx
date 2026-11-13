"use client";
import { useEffect, useMemo } from "react";
import { BackSide, BufferAttribute, BufferGeometry } from "three";
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
    <>
    <mesh><sphereGeometry args={[72,24,16]} /><shaderMaterial side={BackSide} depthWrite={false}
      vertexShader="varying vec3 point; void main(){point=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}"
      fragmentShader="varying vec3 point; void main(){vec3 p=normalize(point);float band=exp(-pow((p.y-.2*p.x)*7.,2.));float dust=.5+.5*sin(p.x*12.+sin(p.z*8.));gl_FragColor=vec4(vec3(.012,.018,.03)+vec3(.018,.02,.045)*band*dust,1.);}" /></mesh>
    <points geometry={geometry} raycast={() => {}}>
      <pointsMaterial size={0.025} color="#DDE3EE" transparent opacity={0.45} sizeAttenuation depthWrite={false} />
    </points>
    </>
  );
}
