"use client";
import { useMemo, useState } from 'react';
import { analyzeSite, type SiteId } from '@/lib/science';
import { dateError } from '@/lib/planning';
import { SITES, type MissionState } from './use-mission';
import { Card } from '../ui/card';
import { Segmented } from '../ui/segmented';
import { Track } from '../ui/track';
import { ProvenanceBadge } from '../ui/provenance-badge';
export function ComparePair({mission:m}:{mission:MissionState}) {
  const [mode,setMode]=useState('sites'),[site,setSite]=useState<SiteId>(SITES.find(s=>s.id!==m.config.site)!.id);
  const [dates,setDates]=useState({start:'2026-12-01',end:'2026-12-21'});
  const error=mode==='dates'?dateError(dates.start,dates.end):'';
  const configB={...m.config,...(mode==='dates'?dates:{site})};
  const b=useMemo(()=>analyzeSite(m.data[configB.site],configB),[m.data,configB.site,configB.start,configB.end,configB.sunlight,configB.duration,configB.blackout,configB.mast]);
  const a=m.result, sum=(intervals:typeof a.solar)=>intervals.reduce((n,v)=>n+v.end-v.start,0);
  const difference=sum(a.solar)-sum(b.solar);
  return <Card className="compare-pair">
    <div className="row-between"><h2>Compare the overlap</h2><Segmented label="Comparison type" value={mode} options={[{value:'sites',label:'Two sites'},{value:'dates',label:'Two periods'}]} onChange={setMode}/></div>
    <div className="paired-tracks">
      {[{name:'A',config:m.config,result:a},{name:'B',config:configB,result:b}].map(({name,config,result})=><section key={name}>
        <h3>{name} · {SITES.find(s=>s.id===config.site)?.name}</h3>
        <p className="small muted">{config.start} → {config.end} UTC</p>
        {name==='B'&&(mode==='sites'?<label className="compare-input">Reference site<select value={site} onChange={e=>setSite(e.target.value as SiteId)}>{SITES.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>:<div className="date-fields"><label>Reference start<input type="date" min="2026-01-01" max="2026-12-31" value={dates.start} onChange={e=>setDates(v=>({...v,start:e.target.value}))}/></label><label>Reference end<input type="date" min={dates.start} max="2026-12-31" value={dates.end} onChange={e=>setDates(v=>({...v,end:e.target.value}))}/></label></div>)}
        {name==='A'&&<div className="compare-input small muted">Current mission settings</div>}
        {error&&name==='B'?<p className="form-error" role="alert">{error}</p>:<>
          {(['sun','earth','ok'] as const).map((accent,i)=><Track key={accent} label={['Sunlight','Earth link','Windows'][i]} accent={accent} intervals={[result.solar,result.earth,result.windows][i]} total={Math.max(a.hours,b.hours)} hour={-1} onSelect={interval=>{m.update({...config,hour:interval.start});m.notify('Comparison period and selected hour applied. Open Explorer to inspect.');}}/>)}
          <p className="small muted">{sum(result.solar)} h sunlight · {sum(result.earth)} h Earth visibility <ProvenanceBadge /></p>
        </>}
      </section>)}
    </div>
    {!error&&a.status==='ready'&&b.status==='ready'&&<p className="diff-summary">A has {Math.abs(difference)} h {difference>=0?'more':'less'} sunlight than B. <ProvenanceBadge /></p>}
    <p className="small muted">Aligned by elapsed hours from each period's start. Shared scale; a shorter period leaves unused space. Same mast and operating limits.</p>
  </Card>;
}
