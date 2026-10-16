'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { satelliteSignal } from '@/lib/review';
import { MapView, type MapAreaProperties, type MapAreas, type MapPin } from './MapView';
import { AccessError, ReportCards, ReportFilters, SatelliteEvidence, buildCells, categoryLabel, filterIndications, filterReports, useReviewData } from './ReviewReports';

type Source={id?:string;source_name:string;status:string;latest_check_at:string|null;latest_usable_observation_at:string|null;error_code?:string};
const SHORT_CATEGORY:Record<string,string>={coral_concern:'Karang',mangrove_damage:'Mangrove',shoreline_erosion:'Abrasi',marine_waste:'Sampah',water_pollution:'Pencemaran',other:'Lainnya'};
const when=(date?:string|null)=>date?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB':'Belum tersedia';

export function GovernmentPortal(){
  const {items,observations,cells,indications,error,loading}=useReviewData();
  const [sources,setSources]=useState<Source[]>([]),[category,setCategory]=useState(''),[status,setStatus]=useState('open'),[cellKey,setCellKey]=useState<string|null>(null);
  useEffect(()=>{api('data-health').then(h=>setSources(h.runs||h.sources||[])).catch(()=>setSources([]));},[]);
  const filtered=filterReports(items,category,status),shownIndications=filterIndications(indications,category,status);
  // The map follows the Jenis/Status filters, so choosing "Sampah laut" shows only waste cells.
  const mapCells=useMemo(()=>buildCells(filtered,!category||category==='satellite'?observations:[]),[filtered,category,observations]);
  const visibleCells=useMemo(()=>[...mapCells.values()].filter(c=>c.level),[mapCells]);
  const areas:MapAreas=useMemo(()=>({type:'FeatureCollection',features:visibleCells.map(c=>({type:'Feature' as const,geometry:{type:'Polygon' as const,coordinates:[[[c.west,c.south],[c.east,c.south],[c.east,c.north],[c.west,c.north],[c.west,c.south]]]},properties:{id:`problem-${c.key}`,kind:'problem' as const,level:c.level!,name:`Sel ${c.code}`}}))}),[visibleCells]);
  const extent=useMemo<[number,number,number,number]|null>(()=>visibleCells.length?[Math.min(...visibleCells.map(c=>c.west)),Math.min(...visibleCells.map(c=>c.south)),Math.max(...visibleCells.map(c=>c.east)),Math.max(...visibleCells.map(c=>c.north))]:null,[visibleCells]);
  const pins:MapPin[]=useMemo(()=>visibleCells.flatMap(c=>{
    const counts=new Map<string,number>();for(const r of c.reports)counts.set(r.category,(counts.get(r.category)||0)+1);
    // Text labels name the problem type, so the map needs no colour legend beyond severity.
    const labels:[string,string][]=[...counts.entries()].map(([cat,n])=>[cat,`${SHORT_CATEGORY[cat]||categoryLabel(cat)} ${n}`]);
    if(c.satellite.length)labels.push(['satellite','Satelit']);
    // Alternate top/bottom by column so labels of neighbouring cells don't collide.
    const step=(c.north-c.south)*0.22;
    return labels.map(([cat,text],i)=>({id:`count-${c.key}-${cat}`,lon:(c.west+c.east)/2,lat:Number(c.key.split(',')[0])%2?c.north-step*(i+1):c.south+step*(labels.length-i),kind:'report' as const,label:`Sel ${c.code}: ${cat==='satellite'?'indikasi satelit':`${counts.get(cat)} laporan ${categoryLabel(cat).toLowerCase()}`}`,text}));
  }),[visibleCells]);
  const selectCell=useCallback((p:MapAreaProperties)=>{if(p.kind==='problem')setCellKey(p.id.replace('problem-',''));},[]);
  const selectPin=useCallback((p:MapPin)=>setCellKey(p.id.replace('count-','').split('-')[0]),[]);
  const focusCell=cellKey?mapCells.get(cellKey)||cells.get(cellKey):undefined;
  const listed=focusCell?filtered.filter(r=>focusCell.reports.some(x=>x.id===r.id)):filtered;
  const open=items.filter(r=>['submitted','under_review','needs_information'].includes(r.status));
  const stats=[
    {label:'Laporan perlu tindak lanjut',value:open.length,note:'90 hari terakhir'},
    {label:'Dalam verifikasi',value:items.filter(r=>['under_review','needs_information'].includes(r.status)).length,note:'sedang dicek petugas'},
    {label:'Sel bermasalah',value:visibleCells.filter(c=>c.level==='problem').length,note:`${visibleCells.filter(c=>c.level==='watch').length} sel perlu dicek`},
    {label:'Terverifikasi',value:items.filter(r=>r.status==='corroborated').length,note:'oleh petugas'},
  ];
  return <section className="page government-page">
    <div className="page-heading"><div><h1>Peta masalah wilayah</h1><p>Area pilot · laporan nelayan dicocokkan dengan indikasi satelit</p></div><ReportFilters {...{category,setCategory,status,setStatus}}/></div>
    {loading&&<p role="status">Memuat laporan dan observasi…</p>}{error&&<AccessError message={error}/>}
    <div className="stats-row govt-stats">{stats.map(s=><div key={s.label}><strong>{s.value}</strong><span>{s.label}</span><small>{s.note}</small></div>)}</div>
    <div className="problem-layout">
      <div className="panel problem-map-panel">
        <div className="panel-head"><h2>Kondisi per sel</h2><div className="map-legend inline"><span><i className="legend-area core-area"/>Bermasalah</span><span><i className="legend-area use-area"/>Perlu dicek</span><span><b className="legend-label">Sampah 2</b>jenis &amp; jumlah laporan</span></div></div>
        <div className="map-frame govt-map"><MapView pins={pins} areas={areas} onSelect={selectPin} onAreaSelect={selectCell} selectedId={cellKey?`problem-${cellKey}`:undefined} bounds={extent}/></div>
        <p className="limitation">Sel 0,05° (±5,5 km). <strong>Bermasalah</strong>: ada laporan terverifikasi, ≥2 laporan terbuka, atau laporan yang didukung indikasi satelit. <strong>Perlu dicek</strong>: satu laporan, atau indikasi satelit saja. Kotak tanpa warna berarti belum ada laporan atau indikasi, bukan berarti kondisinya baik.</p>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>{focusCell?`Laporan · sel ${focusCell.code}`:'Laporan masuk'}</h2>{focusCell?<button className="text-button" onClick={()=>setCellKey(null)}>Semua sel</button>:<a href="/government/reports">Lihat semua</a>}</div>
        {focusCell&&focusCell.satellite.map(o=><SatelliteEvidence key={o.id} o={o}/>)}
        {!loading&&!error&&<ReportCards items={listed.slice(0,8)} cells={cells} indications={(focusCell?shownIndications.filter(x=>x.cell.key===focusCell.key):shownIndications).slice(0,4)}/>}
      </div>
    </div>
    <div className="panel source-panel">
      <div className="panel-head"><h2>Sumber satelit</h2><a href="/dashboard/data-health">Kesehatan data →</a></div>
      <p className="limitation">Satelit memberi indikasi, bukan bukti kerusakan. Panas karang NOAA dan perubahan optik Sentinel-2 hanya tersedia di beberapa titik studi; mangrove, abrasi, dan sampah bergantung pada laporan nelayan.</p>
      <div className="source-grid">
        <div><h3>Observasi 60 hari terakhir</h3>{observations.length===0?<p>Belum ada observasi terpublikasi.</p>:observations.slice(0,6).map(o=>{const s=satelliteSignal(o);return <p key={o.id}><a href={`/observations/${o.id}`}>{s.label}</a><br/><small>{when(o.observed_end)}{s.indication?' · dihitung sebagai indikasi':s.ignored?` · diabaikan: ${s.ignored}`:''}</small></p>;})}</div>
        <div><h3>Pemeriksaan sumber</h3>{sources.length===0?<p>Belum ada catatan pemeriksaan sumber.</p>:sources.slice(0,5).map((s,i)=><p key={s.id||i}><strong>{s.source_name}</strong> · {s.status}<br/><small>Data layak terakhir: {when(s.latest_usable_observation_at)}{s.error_code?` · ${s.error_code}`:''}</small></p>)}</div>
      </div>
    </div>
  </section>;
}

