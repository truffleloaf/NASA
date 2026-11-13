"use client";
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, ShaderMaterial } from 'three';
import { seededRandom } from './galaxy-model';
import type { Atmosphere } from './use-atmosphere';

// Decorative galaxy, deliberately unrelated to the ephemeris.
export default function Galaxy({ atmosphere }: { atmosphere: Atmosphere }) {
  const group = useRef<Group>(null), material = useRef<ShaderMaterial>(null);
  const field = useMemo(() => {
    const random = seededRandom(603), count = atmosphere.mobile ? 6000 : 14000;
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), phases = new Float32Array(count);
    const core = new Color('#FFE9C8'), arms = new Color('#7C8CFF'), outer = new Color('#1B2A4A');
    for (let i = 0; i < count; i++) {
      const r = Math.pow(random(), .65) * 7, a = (i % 4) * Math.PI / 2 + Math.log(1 + r) * 3.7 + (random() - .5) * .65;
      const scatter = (random() - .5) * (.1 + r * .16);
      positions.set([Math.cos(a) * r + scatter, Math.sin(a) * r + scatter, (random() - .5) * .32], i * 3);
      const color = r < 1.5 ? core.clone().lerp(arms, r / 1.5) : arms.clone().lerp(outer, Math.min(1, (r-1.5)/6));
      colors.set(color.toArray(), i * 3); phases[i] = random() * Math.PI * 2;
    }
    return {positions, colors, phases};
  }, [atmosphere.mobile]);
  const uniforms = useMemo(() => ({time:{value:0}, pixelRatio:{value:Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)}}), []);
  useFrame((_, dt) => {
    if (!atmosphere.active || atmosphere.reduced) return;
    uniforms.time.value += Math.min(dt, .05);
    if (group.current) {
      group.current.rotation.z = uniforms.time.value * Math.PI * 2 / 240;
      group.current.position.x = atmosphere.pointer.current.x * .06;
      group.current.position.y = atmosphere.pointer.current.y * .06;
    }
  });
  return <group position={[1.4,.4,-4]} scale={.8} rotation={[.8,-.2,0]}>
    <group ref={group}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[field.positions,3]} />
          <bufferAttribute attach="attributes-color" args={[field.colors,3]} />
          <bufferAttribute attach="attributes-phase" args={[field.phases,1]} />
        </bufferGeometry>
        <shaderMaterial ref={material} uniforms={uniforms} transparent depthWrite={false} blending={AdditiveBlending}
          vertexShader={`attribute vec3 color; attribute float phase; varying vec3 tint; varying float alpha; uniform float time; uniform float pixelRatio;
          void main(){ tint=color; alpha=.5+.5*sin(time*.6+phase); vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=clamp((3.+sin(phase))*pixelRatio*14./-p.z,1.4,6.); }`}
          fragmentShader={`varying vec3 tint; varying float alpha; void main(){float d=length(gl_PointCoord-.5); if(d>.5)discard; gl_FragColor=vec4(tint,(1.-smoothstep(.08,.5,d))*(.35+alpha*.5));}`} />
      </points>
    </group>
    <ShootingStar time={uniforms.time} />
  </group>;
}
function ShootingStar({time}:{time:{value:number}}) {
  const streak = useRef<Group>(null);
  useFrame(() => { if(streak.current) { const phase=time.value%25; streak.current.visible=phase>23.8; streak.current.position.set(5-(phase-23.8)*8,3-(phase-23.8)*3,0); } });
  return <group ref={streak} visible={false} rotation-z={.36}><mesh scale={[.55,.003,1]}><planeGeometry /><meshBasicMaterial color="#DDE3EE" transparent opacity={.5} depthWrite={false}/></mesh></group>;
}
