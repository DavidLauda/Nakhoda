'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { MapView, type MapPin } from './MapView';

type Cell={id:string;lon:number;lat:number;observed_end:string;sst_c:number|null;chlorophyll_mg_m3:number|null;currentScore:number|null;quality_flags:unknown;exclusion:string|null;zoning_verified:boolean;legalNote:string|null;resolution:string};
type Position={lon:number;lat:number;accuracy:number;at:number};
const when=(date:string)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB';

export function FisherPortal(){
  const [cells,setCells]=useState<Cell[]>([]),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[location,setLocation]=useState<Position|null>(null),[gpsError,setGpsError]=useState(''),[tracking,setTracking]=useState(false);
  const watch=useRef<number|null>(null);
  const load=useCallback(()=>api('environment-cells').then(x=>{setCells(x.items||[]);setError('');}).catch(e=>setError((e as Error).message)),[]);
  useEffect(()=>{load();const id=window.setInterval(load,60000);return()=>window.clearInterval(id);},[load]);
  useEffect(()=>()=>{if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);},[]);
  function startGps(){if(!navigator.geolocation){setGpsError('GPS tidak tersedia di browser ini.');return;}setGpsError('');setTracking(true);watch.current=navigator.geolocation.watchPosition(p=>{setLocation({lon:p.coords.longitude,lat:p.coords.latitude,accuracy:p.coords.accuracy,at:p.timestamp});setGpsError('');},e=>{setGpsError(e.message);setTracking(false);setLocation(null);if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null;},{enableHighAccuracy:true,maximumAge:15000,timeout:20000});}
  function stopGps(){if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null;setTracking(false);setLocation(null);}
  const ranked=useMemo(()=>cells.filter(c=>c.currentScore!==null&&!c.exclusion).sort((a,b)=>(b.currentScore??0)-(a.currentScore??0)),[cells]);
  const pins:MapPin[]=useMemo(()=>cells.map(c=>({id:c.id,lon:c.lon,lat:c.lat,kind:'cell',label:`Indeks kondisi perairan ${c.currentScore===null?'belum tersedia':`${c.currentScore}/100`}; zonasi ${c.zoning_verified?'terverifikasi':'belum terverifikasi'}`})),[cells]);
  const active=cells.find(c=>c.id===selected)||ranked[0];
  return <section className="page fisher-page"><div className="page-heading"><div><p className="eyebrow">NELAYAN · PETA PERAIRAN</p><h1>Cari kondisi perairan, kenali batasnya</h1><p>Lihat posisi Anda dan bandingkan kondisi laut terbaru di area pilot Kepulauan Seribu.</p></div></div>
    <div className="notice safety-banner"><strong>Zona konservasi belum dipetakan di aplikasi.</strong> Indeks di bawah bukan izin memancing atau prediksi hasil tangkapan. Periksa <a href="https://sidako.kkp.go.id/sidako/map" target="_blank" rel="noreferrer">peta kawasan konservasi KKP</a> dan aturan setempat sebelum berangkat.</div>
    <div className="fisher-map-controls"><button className="primary" onClick={tracking?stopGps:startGps}>{tracking?'Hentikan GPS':'Tampilkan lokasi saya'}</button><span>{location?`Lokasi GPS ±${Math.round(location.accuracy)} m · ${new Date(location.at).toLocaleTimeString('id-ID')}`:'Lokasi hanya ditampilkan di perangkat ini setelah Anda mengizinkan GPS.'}</span></div>
    {gpsError&&<p className="error" role="alert">GPS: {gpsError}</p>}
    <div className="map-frame fisher-map"><MapView pins={pins} userLocation={location} onSelect={pin=>setSelected(pin.id)}/></div>
    <div className="map-legend"><span><i className="legend-dot gps-dot"/> Posisi saya</span><span><i className="legend-dot cell-dot"/> Data perairan</span><span>● Batas konservasi: belum tersedia</span></div>
    {error&&<p className="error" role="alert">{error}</p>}
    <div className="content-grid"><div><h2>Kondisi perairan yang terukur</h2>{ranked.length===0?<div className="empty">Belum ada data SST dan klorofil terbaru yang layak ditampilkan. Lokasi memancing tidak dapat direkomendasikan dari data saat ini.</div>:ranked.slice(0,8).map((c,i)=><button className={`data-card full-button ${active?.id===c.id?'selected-card':''}`} onClick={()=>setSelected(c.id)} key={c.id}><span className="eyebrow">{i===0?'INDEKS RELATIF TERTINGGI':'DATA PERAIRAN'}</span><strong>{c.currentScore}/100 · {c.lat.toFixed(3)}, {c.lon.toFixed(3)}</strong><span>Diamati {when(c.observed_end)}</span><small>SST {c.sst_c??'—'} °C · Klorofil-a {c.chlorophyll_mg_m3??'—'} mg/m³</small><small>{c.legalNote||'Zonasi terverifikasi'} · Bukan peluang hasil tangkap</small></button>)}</div>
      <div><h2>Detail titik terpilih</h2>{active?<div className="panel"><strong>{active.lat.toFixed(4)}, {active.lon.toFixed(4)}</strong><p>Indeks lingkungan: {active.currentScore??'belum tersedia'}/100. Ini hanya perbandingan SST dan klorofil antar sel pada waktu pengamatan.</p><p>Diamati: {when(active.observed_end)} · Resolusi: {active.resolution}</p><p><strong>Status zonasi:</strong> {active.legalNote||'Terverifikasi pada sumber data'}</p>{active.exclusion&&<p className="error">Dikecualikan: {active.exclusion}</p>}<details><summary>Flag kualitas</summary><pre>{JSON.stringify(active.quality_flags,null,2)}</pre></details><a href={`https://www.openstreetmap.org/?mlat=${active.lat}&mlon=${active.lon}#map=13/${active.lat}/${active.lon}`} target="_blank" rel="noreferrer">Buka koordinat di peta luar ↗</a></div>:<div className="empty">Pilih titik data pada peta untuk melihat waktu, kualitas, dan status zonasinya.</div>}
      <div className="panel"><h2>Sebelum memancing</h2><ol><li>Periksa zona konservasi dan aturan penangkapan pada sumber resmi.</li><li>Periksa cuaca, gelombang, arus, dan keselamatan pelayaran dari layanan resmi.</li><li>Gunakan GPS sebagai orientasi; akurasinya bisa berubah dan peta ini bukan alat navigasi.</li></ol></div></div></div>
  </section>;
}
