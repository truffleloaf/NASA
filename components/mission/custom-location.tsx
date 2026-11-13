"use client";
import { useState } from 'react';
import { coordinates } from '@/lib/planning';
import { distanceKm, polarForward, terrainAt, type TerrainReading } from '@/lib/terrain';
import type { Site } from '@/lib/science';
import { SITES, type MissionState } from './use-mission';
import { ProvenanceBadge } from '../ui/provenance-badge';
export function CustomLocation({mission:m}:{mission:MissionState}) {
  const [lat,setLat]=useState('-89.9'),[lon,setLon]=useState('0'),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [result,setResult]=useState<{site:Site;distance:number;terrain:TerrainReading|null}|null>(null);
  const inspect=async()=>{
    const a=Number(lat),b=Number(lon);
    if(!lat.trim()||!lon.trim()||!Number.isFinite(a+b)||a < -90||a > 90||b < -180||b > 180){setError('Use latitude −90 to 90 and longitude −180 to 180.');return;}
    setBusy(true);setError('');setResult(null);
    const nearest=SITES.map(site=>({site,distance:distanceKm(a,b,site.lat,site.lon)})).sort((a,b)=>a.distance-b.distance)[0];
    let terrain:TerrainReading|null=null;
    if(a<=-80)try{
      const response=await fetch('/data/terrain/polar-1024.bin');if(!response.ok)throw Error();
      const buffer=await response.arrayBuffer();if(buffer.byteLength!==1024*1024*2)throw Error();
      const view=new DataView(buffer),heights=new Uint16Array(1024*1024);
      for(let i=0;i<heights.length;i++)heights[i]=view.getUint16(i*2,true);
      terrain=terrainAt(heights,...polarForward(a,b));
    }catch{setError('Terrain readout unavailable. Retry when the bundled asset is available.');}
    setResult({...nearest,terrain});setBusy(false);
  };
  return <details className="custom-location"><summary>Custom coordinates</summary>
    <form onSubmit={e=>{e.preventDefault();void inspect();}}>
      <div className="date-fields"><label>Latitude<input type="number" step="any" min="-90" max="90" value={lat} onChange={e=>setLat(e.target.value)}/></label><label>Longitude<input type="number" step="any" min="-180" max="180" value={lon} onChange={e=>setLon(e.target.value)}/></label></div>
      <button className="action-outline full-width" disabled={busy}>{busy?'Reading terrain…':'Check coverage'}</button>
    </form>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {result&&<div className="custom-result" role="status">
      <p>{result.distance<=15 ? 'Nearby reference available. These coordinates have no independent horizon profile.' : 'Not covered by bundled horizon data.'}</p>
      <p>Nearest: {result.site.name} · {result.distance.toFixed(1)} km <ProvenanceBadge detail="Great-circle distance on a spherical Moon. Nearby-site results are not results at the entered coordinates." /></p>
      {result.terrain&&<p>{coordinates(result.terrain.lat,result.terrain.lon)} · {result.terrain.elevation.toFixed(0)} m · {result.terrain.slope.toFixed(1)}° slope <ProvenanceBadge kind="Computed" detail="Read from the bundled 594 m DEM; no visibility model exists at this point." /></p>}
      <button className="action-outline" onClick={()=>{m.update({site:result.site.id});m.notify('Using the named reference site, not the custom coordinates.');}}>{result.distance<=15?'Use nearest site':'Explore nearest reference'}</button>
    </div>}
  </details>;
}
