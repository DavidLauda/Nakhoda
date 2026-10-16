'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { satelliteSignal } from '@/lib/review';
import { MapView, type MapAreaProperties, type MapAreas, type MapPin } from './MapView';
import { AccessError, ReportCards, ReportFilters, filterReports, useReviewData } from './ReviewReports';

type Source={id?:string;source_name:string;status:string;latest_check_at:string|null;latest_usable_observation_at:string|null;error_code?:string};
const when=(date?:string|null)=>date?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB':'Belum tersedia';

export function GovernmentPortal(){
  const {items,observations,cells,error,loading}=useReviewData();
  const [sources,setSources]=useState<Source[]>([]),[category,setCategory]=useState(''),[status,setStatus]=useState('open'),[cellKey,setCellKey]=useState<string|null>(null);
  useEffect(()=>{api('data-health').then(h=>setSources(h.runs||h.sources||[])).catch(()=>setSources([]));},[]);
  const filtered=filterReports(items,category,status);
  const visibleCells=useMemo(()=>[...cells.values()].filter(c=>c.level),[cells]);
  const areas:MapAreas=useMemo(()=>({type:'FeatureCollection',features:visibleCells.map(c=>({type:'Feature' as const,geometry:{type:'Polygon' as const,coordinates:[[[c.west,c.south],[c.east,c.south],[c.east,c.north],[c.west,c.north],[c.west,c.south]]]},properties:{id:`problem-${c.key}`,kind:'problem' as const,level:c.level!,name:`Sel ${c.code}`}}))}),[visibleCells]);
  const pins:MapPin[]=useMemo(()=>visibleCells.filter(c=>c.open>0).map(c=>({id:`count-${c.key}`,lon:(c.west+c.east)/2,lat:(c.south+c.north)/2,kind:'report',label:`Sel ${c.code}: ${c.open} laporan terbuka`,count:c.open})),[visibleCells]);
  const selectCell=useCallback((p:MapAreaProperties)=>{if(p.kind==='problem')setCellKey(p.id.replace('problem-',''));},[]);
  const selectPin=useCallback((p:MapPin)=>setCellKey(p.id.replace('count-','')),[]);
  const focusCell=cellKey?cells.get(cellKey):undefined;
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
        <div className="panel-head"><h2>Kondisi per sel</h2><div className="map-legend inline"><span><i className="legend-area core-area"/>Bermasalah</span><span><i className="legend-area use-area"/>Perlu dicek</span><span><i className="legend-dot count-dot"/>Laporan terbuka</span></div></div>
        <div className="map-frame govt-map"><MapView pins={pins} areas={areas} onSelect={selectPin} onAreaSelect={selectCell} selectedId={cellKey?`problem-${cellKey}`:undefined}/></div>
        <p className="limitation">Sel 0,05° (±5,5 km). <strong>Bermasalah</strong>: ada laporan terverifikasi, ≥2 laporan terbuka, atau laporan yang didukung indikasi satelit. <strong>Perlu dicek</strong>: satu laporan, atau indikasi satelit saja. Kotak tanpa warna berarti belum ada laporan atau indikasi, bukan berarti kondisinya baik.</p>
      </div>
      <div className="panel">
        <div className="panel-head"><h2>{focusCell?`Laporan · sel ${focusCell.code}`:'Laporan masuk'}</h2>{focusCell?<button className="text-button" onClick={()=>setCellKey(null)}>Semua sel</button>:<a href="/government/reports">Lihat semua</a>}</div>
        {focusCell&&focusCell.satellite.length>0&&<p className="notice">{focusCell.satellite.map(o=>satelliteSignal(o).label).join(' · ')}</p>}
        {!loading&&!error&&<ReportCards items={listed.slice(0,8)} cells={cells}/>}
      </div>
    </div>
    <div className="panel source-panel">
      <div className="panel-head"><h2>Sumber satelit</h2><a href="/dashboard/data-health">Kesehatan data →</a></div>
      <p className="limitation">Satelit memberi indikasi, bukan bukti kerusakan. Panas karang NOAA dan perubahan optik Sentinel-2 hanya tersedia di beberapa titik studi; mangrove, abrasi, dan sampah bergantung pada laporan nelayan.</p>
      <div className="source-grid">
        <div><h3>Observasi 60 hari terakhir</h3>{observations.length===0?<p>Belum ada observasi terpublikasi.</p>:observations.slice(0,6).map(o=>{const s=satelliteSignal(o);return <p key={o.id}><a href={`/observations/${o.id}`}>{s.label}</a><br/><small>{when(o.observed_end)}{s.indication?' · ada indikasi':''}</small></p>;})}</div>
        <div><h3>Pemeriksaan sumber</h3>{sources.length===0?<p>Belum ada catatan pemeriksaan sumber.</p>:sources.slice(0,5).map((s,i)=><p key={s.id||i}><strong>{s.source_name}</strong> · {s.status}<br/><small>Data layak terakhir: {when(s.latest_usable_observation_at)}{s.error_code?` · ${s.error_code}`:''}</small></p>)}</div>
      </div>
    </div>
  </section>;
}
