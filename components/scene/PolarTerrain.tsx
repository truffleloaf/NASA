"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, useTexture } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Color, DoubleSide, DirectionalLight, InstancedMesh, Object3D, SRGBColorSpace, Vector3 } from "three";
import type { OrbitControls as Controls } from "three-stdlib";
import header from "@/public/data/terrain/polar-1024.json";
import { SITES } from "../mission/use-mission";
import type { SceneProps } from "./scene";
import { Stars } from "./stars";
import { DirectionMarker } from "./direction-marker";
import { elevationAt, polarForward, terrainAt } from "@/lib/terrain";
import { dateMs, HOUR, sampleAt } from "@/lib/science";
import { polarTextureUV } from "@/lib/scene-geometry";
const SCALE = 25,
  RADIUS = 304 / SCALE,
  DEG = Math.PI / 180;
export function sitePoint(lat: number, lon: number): [number, number] {
  const [x,z] = polarForward(lat,lon); return [x/SCALE,z/SCALE];
}
export function PolarTerrain({
  heights,
  mission: m,
  layers,
  exaggeration,
  reset,
  onTerrain,
}: SceneProps & { heights: Uint16Array }) {
  const { camera, invalidate, gl } = useThree(),
    controls = useRef<Controls>(null),
    markers = useRef<InstancedMesh>(null);
  const colorMap = useTexture("/moon-color-4k.webp");
  colorMap.colorSpace = SRGBColorSpace;
  colorMap.anisotropy = 4;
  useEffect(() => () => { colorMap.dispose(); useTexture.clear("/moon-color-4k.webp"); }, [colorMap]);
  const [hovered,setHovered] = useState<number | null>(null);
  const lamp = useRef<DirectionalLight>(null), lightTarget = useMemo(()=>new Object3D(),[]);
  const heightAt = (x:number,z:number) => ((elevationAt(heights,x*SCALE,z*SCALE)??0)/1000/SCALE)*exaggeration;
  const [relief,setRelief] = useState<{h:number;slope:number;ao:number}[]>([]);
  useEffect(() => {
    let cancelled=false, timer=0, index=0;
    const values:{h:number;slope:number;ao:number}[]=[];
    const work=()=>{
      const deadline=performance.now()+8;
      while(index<257*257 && performance.now()<deadline) {
        const row=Math.floor(index/257),col=index%257;
        const x=(col/256-.5)*608,z=(row/256-.5)*608;
        const value=terrainAt(heights,x,z),h=value?.elevation??0;
        let cavity=0;
        for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]) cavity+=Math.max(0,(elevationAt(heights,x+dx,z+dz)??h)-h);
        values.push({h,slope:value?.slope??0,ao:Math.max(.45,1-cavity/6000)});index++;
      }
      if(cancelled)return;
      if(index<257*257)timer=window.setTimeout(work,0);else {setRelief(values);invalidate();}
    };
    timer=window.setTimeout(work,0);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[heights,invalidate]);
  const geometry = useMemo(() => {
    if(!relief.length)return new BufferGeometry();
    const size = 256,
      positions: number[] = [],
      uvs: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    for (let row = 0; row <= size; row++)
      for (let col = 0; col <= size; col++) {
        const x = (col / size - 0.5) * RADIUS * 2,
          z = (row / size - 0.5) * RADIUS * 2;
        const field=relief[row*(size+1)+col];
        positions.push(x, field.h/1000/SCALE*exaggeration, z);
        uvs.push(...polarTextureUV(x * SCALE, z * SCALE));
        const level = layers.style === 'slope' ? .12+Math.min(1,field.slope/45)*.88 : layers.style === 'elevation' ? .15+(field.h-header.minMeters)/(header.maxMeters-header.minMeters)*.85 : field.ao*.88;
        const color = new Color().setRGB(level,level,level);
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
    geo.setAttribute("uv", new BufferAttribute(new Float32Array(uvs), 2));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [relief, exaggeration, layers.style]);
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
      markers.current!.setColorAt(i, new Color(i === selectedIndex ? "#4FE0B0" : "#F2F4F8"));
    });
    markers.current.instanceMatrix.needsUpdate = true;
    if (markers.current.instanceColor) markers.current.instanceColor.needsUpdate = true;
    invalidate();
  }, [m.config.site, exaggeration]);
  const fly = useRef<{ start: number; from: Vector3; fromTarget: Vector3; target: Vector3; position: Vector3 } | null>(null);
  const lastShadow = useRef(0);
  useEffect(()=>{gl.shadowMap.autoUpdate=false;return ()=>{gl.shadowMap.autoUpdate=true;};},[gl]);
  useEffect(()=>{gl.shadowMap.needsUpdate=true;invalidate();},[gl,relief,exaggeration,layers.shadows,layers.style,invalidate]);
  const lastReset = useRef(reset);
  useEffect(() => {
    const overview = reset !== lastReset.current;
    lastReset.current = reset;
    const target = overview ? new Vector3(0, 0, 0) : selected.clone();
    const destination = target.clone().add(overview ? new Vector3(0, 15, 18) : new Vector3(0, 6, 8));
    if (m.reduced) {
      camera.position.copy(destination);
      controls.current?.target.copy(target);
      controls.current?.update();
    } else fly.current = { start: performance.now(), from: camera.position.clone(), fromTarget: controls.current?.target.clone() ?? new Vector3(), target, position: destination };
    invalidate();
  }, [m.config.site, reset, m.reduced]);
  useFrame(() => {
    if (lamp.current) {
      const desired=sun.clone().add(selected);
      const moving=lamp.current.position.distanceTo(desired)>.001 || lightTarget.position.distanceTo(selected)>.001;
      lamp.current.position.lerp(desired,m.reduced ? 1 : .18);
      lightTarget.position.copy(selected); lightTarget.updateMatrixWorld();
      const remaining=lamp.current.position.distanceTo(desired);
      // Shadow-map refreshes are capped; camera and marker motion keep full frame rate.
      if(moving && (performance.now()-lastShadow.current>66 || remaining<=.001)) {gl.shadowMap.needsUpdate=true;lastShadow.current=performance.now();}
      if(remaining>.001) invalidate();
    }
    if (!fly.current) return;
    const t = Math.min(1, (performance.now() - fly.current.start) / 600),
      eased = 1 - (1 - t) ** 3;
    camera.position.lerpVectors(fly.current.from, fly.current.position, eased);
    controls.current?.target.lerpVectors(fly.current.fromTarget, fly.current.target, eased);
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
      {!relief.length && <Html center><span className="terrain-label">Shaping terrain…</span></Html>}
      <fog attach="fog" args={["#05070C",22,48]} />
      <ambientLight intensity={layers.style === "slope" || layers.style === "elevation" ? 1.5 : .075} />
      <primitive object={lightTarget} />
      {m.sample && (
        <directionalLight
          ref={lamp}
          target={lightTarget}
          intensity={layers.style === "slope" || layers.style === "elevation" ? 0 : 3}
          castShadow={layers.shadows || layers.style === "lit"}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-7}
          shadow-camera-right={7}
          shadow-camera-top={7}
          shadow-camera-bottom={-7}
          shadow-camera-near={0.1}
          shadow-camera-far={85}
          shadow-bias={-0.00006}
          shadow-normalBias={0.006}
        />
      )}
      <mesh geometry={geometry} receiveShadow castShadow onClick={e=>{e.stopPropagation();onTerrain(terrainAt(heights,e.point.x*SCALE,e.point.z*SCALE));}}>
        <meshStandardMaterial map={layers.style === "hillshade" ? colorMap : null} vertexColors roughness={1} metalness={0} side={DoubleSide} />
      </mesh>
      <instancedMesh
        ref={markers}
        args={[undefined, undefined, SITES.length]}
        onPointerOver={e=>setHovered(e.instanceId ?? null)} onPointerOut={()=>setHovered(null)}
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
          <Html key={SITES[i].id} position={point} center zIndexRange={[8, 0]}>
            <button
              className={`terrain-label ${i === selectedIndex ? "selected" : ""}`}
              onFocus={()=>setHovered(i)} onBlur={()=>setHovered(null)} onPointerEnter={()=>setHovered(i)} onPointerLeave={()=>setHovered(null)}
              onClick={() => m.update({ site: SITES[i].id })}
            >
              {SITES[i].name}
              {hovered===i && <span className="site-tooltip">{(()=>{const s=sampleAt(m.data[SITES[i].id],dateMs(m.config.start)+m.config.hour*HOUR,m.config.mast);return s ? `Sun ${s.sunEl.toFixed(1)}° · Earth ${s.earthEl.toFixed(1)}° · ${m.results[SITES[i].id].windows.some(w=>w.start<=m.config.hour&&w.end>m.config.hour) ? 'In operating window' : 'Outside windows'} · Estimated` : 'Data unavailable';})()}</span>}
            </button>
          </Html>
        ))}
      {m.selectedWindow && <mesh position={selected} rotation-x={-Math.PI/2}><ringGeometry args={[.18,.21,48]} /><meshBasicMaterial color="#4FE0B0" side={DoubleSide} depthTest={false} /></mesh>}
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
            color="#8C97A8"
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
