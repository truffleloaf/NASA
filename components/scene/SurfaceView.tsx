"use client";
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { Billboard, Line } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, DoubleSide, Vector3 } from "three";
import { horizonAt, sampleAt, dateMs, HOUR, hoursInPeriod } from "@/lib/science";
import type { MissionState } from "../mission/use-mission";
import { Stars } from "./stars";
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
  useEffect(() => () => geometry.dispose(), [geometry]);
  const position = (az: number, el: number) =>
    new Vector3(
      Math.sin(az * DEG) * Math.cos(el * DEG),
      Math.sin(el * DEG),
      -Math.cos(az * DEG) * Math.cos(el * DEG),
    ).multiplyScalar(30);
  const paths = useMemo(() => {
    const n=hoursInPeriod(m.config.start,m.config.end), start=dateMs(m.config.start);
    const sun:Vector3[]=[],earth:Vector3[]=[];
    for(let h=0;h<n;h+=Math.max(1,Math.ceil(n/720))) { const s=sampleAt(m.siteData,start+h*HOUR,m.config.mast); if(s){sun.push(position(s.sunAz,s.sunEl));earth.push(position(s.earthAz,s.earthEl));} }
    const ticks = [...m.result.solar.flatMap(v=>[v.start,v.end]).map(h=>({h,body:'sun'})),...m.result.earth.flatMap(v=>[v.start,v.end]).map(h=>({h,body:'earth'}))].flatMap(({h,body})=>{const s=sampleAt(m.siteData,start+h*HOUR,m.config.mast); if(!s)return [];const az=body==='sun'?s.sunAz:s.earthAz,el=body==='sun'?s.sunEl:s.earthEl;return [{points:[position(az,el-.3),position(az,el+.3)],color:body==='sun'?'#FFC46B':'#5CC8FF'}];});
    return {sun,earth,ticks};
  }, [m.siteData,m.config.start,m.config.end,m.config.mast,m.result]);
  return (
    <>
      <Stars />
      {paths.sun.length>1 && <Line points={paths.sun} color="#FFC46B" transparent opacity={.22} lineWidth={1} />}
      {paths.earth.length>1 && <Line points={paths.earth} color="#5CC8FF" transparent opacity={.22} lineWidth={1} />}
      {paths.ticks.map((tick,i)=><Line key={i} points={tick.points} color={tick.color} transparent opacity={.5} lineWidth={1} />)}
      <mesh geometry={geometry}>
        <shaderMaterial side={DoubleSide} vertexShader="varying float height;void main(){height=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}" fragmentShader="varying float height;void main(){gl_FragColor=vec4(mix(vec3(.008,.012,.02),vec3(.12,.15,.2),smoothstep(-4.,1.,height)),1.);}" />
      </mesh>
      <Line points={Array.from({ length: 361 }, (_, az) => {
        const el = m.siteData ? horizonAt(m.siteData.horizon, az, m.config.mast) : 0;
        return [Math.sin(az * DEG) * 9.99, Math.tan(el * DEG) * 10, -Math.cos(az * DEG) * 9.99] as [number, number, number];
      })} color="#7E8996" transparent opacity={0.5} lineWidth={1} />
      {m.sample && (
        <>
          {[
            { az: m.sample.sunAz, el: m.sample.sunEl, size: m.sample.sunSize, color: "#FFC46B" },
            { az: m.sample.earthAz, el: m.sample.earthEl, size: m.sample.earthSize, color: "#5CC8FF" },
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
