"use client";
import { useMemo } from 'react';
import { dateMs, HOUR, sampleAt } from '@/lib/science';
import { countdown } from '@/lib/planning';
import type { MissionState } from './use-mission';
import { Card } from '../ui/card';
import { StatTile } from '../ui/stat-tile';
import { ProvenanceBadge } from '../ui/provenance-badge';
export function ConditionsPanel({mission:m}:{mission:MissionState}) {
  const solar=countdown(m.result.solar,m.config.hour),earth=countdown(m.result.earth,m.config.hour);
  const hours=(intervals:typeof m.result.solar)=>intervals.reduce((n,v)=>n+v.end-v.start,0);
  return <Card className="conditions-panel">
    <div className="countdown-row">
      <span className="tone-sun">{solar ? `Sun ${solar.kind} in ${solar.hours} h` : 'No further Sun transition in period'}</span>
      <span className="tone-earth">{earth ? earth.kind==='sets' ? `Earth sets in ${earth.hours} h` : `Next Earth window in ${earth.hours} h` : 'No further Earth transition in period'}</span>
      <ProvenanceBadge detail="Hourly horizon crossings, bounded by the selected period. A countdown at the period end is a coverage boundary, not necessarily a physical setting." />
    </div>
    <div className="power-stats">
      <StatTile label="Power · sunlight" value={m.result.status==='ready'?hours(m.result.solar):null} unit="h" accent="sun" />
      <StatTile label="Comms · longest link" value={m.result.status==='ready'?Math.max(0,...m.result.earth.map(v=>v.end-v.start)):null} unit="h" accent="earth" />
      <StatTile label="Work · overlap" value={m.result.status==='ready'?hours(m.result.windows):null} unit="h" accent="ok" />
    </div>
  </Card>;
}
export function ElevationSparkline({mission:m,body}:{mission:MissionState;body:'sun'|'earth'}) {
  const values=useMemo(()=>Array.from({length:24},(_,i)=>{
    const s=sampleAt(m.siteData,dateMs(m.config.start)+(Math.floor(m.config.hour/24)*24+i)*HOUR,m.config.mast);
    return s ? body==='sun'?s.sunEl:s.earthEl : null;
  }),[m.siteData,m.config.start,Math.floor(m.config.hour/24),m.config.mast,body]);
  if(values.some(v=>v===null))return null;
  const nums=values as number[],min=Math.min(...nums)-.5,max=Math.max(...nums)+.5;
  const y=(v:number)=>32-(v-min)/(max-min)*28;
  return <svg className={`elevation-spark tone-${body}`} viewBox="0 0 120 36" role="img" aria-label={`${body} elevation today, ${Math.min(...nums).toFixed(2)} to ${Math.max(...nums).toFixed(2)} degrees. Computed.`}>
    <path d={`M0 ${y(0)}H120`} stroke="currentColor" opacity=".15" strokeDasharray="2 4" />
    <path d={nums.map((n,i)=>`${i?'L':'M'}${i/23*120} ${y(n)}`).join(' ')} stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M0 35H120" stroke="currentColor" opacity=".12" strokeWidth="2" />
    <circle cx={(m.config.hour%24)/23*120} cy={y(nums[m.config.hour%24])} r="2.5" fill="currentColor" />
  </svg>;
}
