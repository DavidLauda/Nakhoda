'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { bearingDeg, cellZoneTypes, compassId, distanceKm, zoneAt, type AreaGeometry } from '@/lib/geo';
import { MapView, type MapAreaProperties, type MapAreas, type MapPin } from './MapView';

type Cell={id:string;lon:number;lat:number;observed_end:string;sst_c:number|null;chlorophyll_mg_m3:number|null;currentScore:number|null;quality_flags:unknown;exclusion:string|null;zoning_verified:boolean;legalNote:string|null;resolution:string};
type Position={lon:number;lat:number;accuracy:number;at:number};
const when=(date:string)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB';
const noPins:MapPin[]=[];
const halfOf=(c:Cell)=>{const r=Number(c.resolution.match(/^([\d.]+)\s*degree/)?.[1]);return Number.isFinite(r)&&r>0?r/2:null;};
const km=(v:number)=>v.toLocaleString('id-ID',{maximumFractionDigits:1});

export function FisherPortal(){
  const [cells,setCells]=useState<Cell[]>([]),[selected,setSelected]=useState<string|null>(null),[selectedZone,setSelectedZone]=useState<MapAreaProperties|null>(null),[conservation,setConservation]=useState<MapAreas>({type:'FeatureCollection',features:[]}),[zoneError,setZoneError]=useState(''),[error,setError]=useState(''),[location,setLocation]=useState<Position|null>(null),[gpsError,setGpsError]=useState(''),[tracking,setTracking]=useState(false),[focus,setFocus]=useState<{lon:number;lat:number}|null>(null);
  const watch=useRef<number|null>(null);
  const load=useCallback(()=>api('environment-cells').then(x=>{setCells(x.items||[]);setError('');}).catch(e=>setError((e as Error).message)),[]);
  useEffect(()=>{load();const id=window.setInterval(load,300000);return()=>window.clearInterval(id);},[load]);
  useEffect(()=>{let alive=true;fetch('/conservation-north-big.geojson').then(r=>{if(!r.ok)throw new Error('Lapisan zonasi gagal dimuat.');return r.json();}).then(x=>{if(!x||x.type!=='FeatureCollection'||!Array.isArray(x.features))throw new Error('Format lapisan zonasi tidak sesuai.');if(alive){setConservation(x as MapAreas);setZoneError('');}}).catch(e=>{if(alive)setZoneError((e as Error).message);});return()=>{alive=false;};},[]);
  useEffect(()=>()=>{if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);},[]);
  function startGps(){if(!navigator.geolocation){setGpsError('GPS tidak tersedia di browser ini.');return;}setGpsError('');setTracking(true);watch.current=navigator.geolocation.watchPosition(p=>{setLocation({lon:p.coords.longitude,lat:p.coords.latitude,accuracy:p.coords.accuracy,at:p.timestamp});setGpsError('');},e=>{setGpsError(e.message);setTracking(false);setLocation(null);if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null;},{enableHighAccuracy:true,maximumAge:15000,timeout:20000});}
  function stopGps(){if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null;setTracking(false);setLocation(null);}
  const latestCells=useMemo(()=>{const seen=new Set<string>();return cells.filter(c=>{const key=`${c.lon.toFixed(5)},${c.lat.toFixed(5)}`;if(seen.has(key))return false;seen.add(key);return true;});},[cells]);
  const ranked=useMemo(()=>latestCells.filter(c=>c.currentScore!==null&&!c.exclusion).sort((a,b)=>(b.currentScore??0)-(a.currentScore??0)),[latestCells]);
  const zones=useMemo(()=>conservation.features.map(f=>({geometry:f.geometry as AreaGeometry,properties:f.properties})),[conservation]);
  const cellZones=useMemo(()=>new Map(latestCells.map(c=>{const half=halfOf(c);return [c.id,half===null?new Set<string>():cellZoneTypes(c,half,zones)] as const;})),[latestCells,zones]);
  // Cells touching a core zone stay on the map but are never recommended.
  const recommended=useMemo(()=>ranked.filter(c=>!cellZones.get(c.id)?.has('Inti')),[ranked,cellZones]);
  const priorityIds=useMemo(()=>new Set(recommended.slice(0,Math.max(1,Math.ceil(recommended.length*0.4))).map(c=>c.id)),[recommended]);
  const areas:MapAreas=useMemo(()=>({type:'FeatureCollection',features:[...latestCells.flatMap(c=>{const half=halfOf(c);if(c.currentScore===null||c.exclusion||half===null)return [];return [{type:'Feature' as const,geometry:{type:'Polygon' as const,coordinates:[[[c.lon-half,c.lat-half],[c.lon+half,c.lat-half],[c.lon+half,c.lat+half],[c.lon-half,c.lat+half],[c.lon-half,c.lat-half]]]},properties:{id:c.id,kind:'environment' as const,name:'Sel kondisi perairan',score:c.currentScore,priority:priorityIds.has(c.id),observedEnd:c.observed_end}}];}),...conservation.features]}),[latestCells,priorityIds,conservation]);
  const active=latestCells.find(c=>c.id===selected)||recommended[0]||ranked[0];
  const selectArea=useCallback((area:MapAreaProperties)=>{if(area.kind==='conservation')setSelectedZone(area);else{setSelected(area.id);setSelectedZone(null);}},[]);
  const choose=useCallback((c:Cell)=>{setSelected(c.id);setSelectedZone(null);setFocus({lon:c.lon,lat:c.lat});},[]);
  const rank=active?recommended.findIndex(c=>c.id===active.id):-1;
  const activeZones=active?cellZones.get(active.id):undefined;
  const myZone=location?zoneAt(location.lon,location.lat,zones)?.properties:undefined;
  const nearest=useMemo(()=>location?recommended.slice(0,Math.max(3,Math.ceil(recommended.length*0.2))).map(c=>({c,d:distanceKm(location,c)})).sort((a,b)=>a.d-b.d)[0]:undefined,[location,recommended]);
  const kkp=<a href="https://sidako.kkp.go.id/sidako/map" target="_blank" rel="noreferrer">peta KKP</a>;
  return <section className="fisher-app">
    <div className="fisher-map-wrap">
      <div className="map-frame fisher-map"><MapView pins={noPins} areas={areas} userLocation={location} onAreaSelect={selectArea} selectedId={selectedZone?undefined:active?.id} focus={focus}/></div>
      <div className="map-legend floating" aria-label="Legenda peta"><span><i className="legend-area priority-area"/>Skor Tinggi</span><span><i className="legend-area measured-area"/>Skor Sedang</span><span><i className="legend-area zone-area"/>Konservasi</span>{location&&<span><i className="legend-dot gps-dot"/>Saya</span>}</div>
    </div>
    <div className="fisher-sheet">
      {error&&<p className="error" role="alert">{error}</p>}
      {zoneError&&<p className="error" role="alert">{zoneError} Periksa {kkp} sebelum berangkat.</p>}
      {myZone&&<div className={`zone-alert${myZone.zoneType==='Inti'?' danger':''}`} role="alert"><strong>Anda berada di Zona {myZone.zoneType} {myZone.name}</strong><span>{myZone.zoneType==='Inti'?'Zona inti umumnya tertutup untuk penangkapan.':'Aturan memancing di zona ini berbeda.'} Rujukan BIG, belum diverifikasi; cek {kkp}.</span></div>}
      {selectedZone?<div className="sheet-zone">
        <div className="sheet-head"><div><p className="sheet-kicker">Zona konservasi</p><h2>{selectedZone.zoneType}</h2></div><button className="secondary sheet-close" onClick={()=>setSelectedZone(null)}>Tutup</button></div>
        <p>{selectedZone.name}. Aturan memancing berbeda tiap zona dan belum diverifikasi di aplikasi ini.</p>
        <a className="secondary link-button" href="https://sidako.kkp.go.id/sidako/map" target="_blank" rel="noreferrer">Cek aturan di peta KKP ↗</a>
      </div>:active?<>
        <div className="sheet-head"><div><p className="sheet-kicker">{rank===0?'Kondisi relatif tertinggi':rank>0?`Peringkat ${rank+1} dari ${recommended.length}`:'Sel terpilih'}</p><h2>{coord(active.lat,'LS','LU')} · {coord(active.lon,'BB','BT')}</h2></div><span className={`score-pill${priorityIds.has(active.id)?' high':''}`}>Skor {active.currentScore??'—'}</span></div>
        {location&&<p className="distance-line">{km(distanceKm(location,active))} km · arah {compassId(bearingDeg(location,active))} dari posisi Anda</p>}
        {activeZones?.has('Inti')?<div className="zone-alert danger"><strong>Bertumpuk dengan Zona Inti</strong><span>Tidak direkomendasikan. Zona inti umumnya tertutup untuk penangkapan.</span></div>:activeZones&&activeZones.size>0&&<div className="zone-alert"><strong>Bertumpuk dengan Zona {[...activeZones].join(' / ')}</strong><span>Cek aturan memancing di {kkp}.</span></div>}
        <div className="sheet-stats">
          <div><span>Suhu laut</span><strong>{active.sst_c===null?'—':`${active.sst_c.toFixed(1)} °C`}</strong></div>
          <div><span>Klorofil</span><strong>{active.chlorophyll_mg_m3===null?'—':active.chlorophyll_mg_m3.toFixed(2)}</strong></div>
          <div><span>Data</span><strong>{short(active.observed_end)}</strong></div>
          <div><span>Zonasi</span><strong>{active.zoning_verified?'Terverifikasi':'Belum dicek'}</strong></div>
        </div>
        {active.exclusion&&<p className="error">Dikecualikan: {active.exclusion}</p>}
        {recommended.length>1&&<div className="top-picks" role="group" aria-label="Area teratas">{recommended.slice(0,3).map((c,i)=><button key={c.id} className={c.id===active.id?'active':''} aria-pressed={c.id===active.id} onClick={()=>choose(c)}>#{i+1} · {c.currentScore}</button>)}</div>}
        {nearest&&nearest.c.id!==active.id&&<button className="secondary nearest-button" onClick={()=>choose(nearest.c)}>Terdekat yang bagus · {km(nearest.d)} km · skor {nearest.c.currentScore}</button>}
      </>:<div className="empty">Belum ada data suhu laut dan klorofil terbaru. Lokasi memancing tidak dapat direkomendasikan saat ini.</div>}
      <button className="primary sheet-cta" onClick={tracking?stopGps:startGps}>{tracking?'Hentikan GPS':'Tampilkan lokasi saya'}</button>
      {gpsError?<p className="error" role="alert">GPS: {gpsError}</p>:location&&<p className="sheet-note">Lokasi ±{Math.round(location.accuracy)} m · {new Date(location.at).toLocaleTimeString('id-ID')} · hanya di perangkat ini</p>}
      <p className="sheet-note">Skor membandingkan suhu laut dan klorofil, bukan izin memancing atau prediksi tangkapan. Cek {kkp} sebelum berangkat.</p>
      <details className="sheet-more"><summary>Tentang data & keselamatan</summary>
        <h3>Sebelum memancing</h3>
        <ol><li>Periksa zona konservasi dan aturan penangkapan pada sumber resmi.</li><li>Periksa cuaca, gelombang, arus, dan keselamatan pelayaran dari layanan resmi.</li><li>Gunakan GPS sebagai orientasi; akurasinya bisa berubah dan peta ini bukan alat navigasi.</li></ol>
        <h3>Zonasi</h3>
        <p>Lapisan konservasi dari <a href="https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/33" target="_blank" rel="noreferrer">peta zonasi BIG</a> hanya mencakup bagian utara Taman Nasional Kepulauan Seribu (enam fitur; tanggal pemutakhiran tidak tercantum). Kawasan Kepulauan Seribu Selatan yang ditetapkan KKP pada 2026 belum memiliki poligon di lapisan ini.</p>
        <h3>Sel perairan</h3>
        <p>Sel hanya ditampilkan bila suhu laut dan klorofil terbaru tersedia dan sel tidak tumpang tindih dengan daratan pada mask Natural Earth 1:10m. Mask ini berskala umum dan bukan peta navigasi. Area tanpa warna belum diklasifikasikan, bukan berarti aman atau boleh dipancing.</p>
        {active&&<><h3>Sel terpilih</h3><p>Diamati {when(active.observed_end)} · Resolusi {active.resolution}{active.legalNote?` · ${active.legalNote}`:''}</p><details><summary>Flag kualitas</summary><pre>{JSON.stringify(active.quality_flags,null,2)}</pre></details><a href={`https://www.openstreetmap.org/?mlat=${active.lat}&mlon=${active.lon}#map=13/${active.lat}/${active.lon}`} target="_blank" rel="noreferrer">Buka koordinat di peta luar ↗</a></>}
      </details>
    </div>
  </section>;
}
const coord=(v:number,neg:string,pos:string)=>`${Math.abs(v).toFixed(3).replace('.',',')}° ${v<0?neg:pos}`;
const short=(date:string)=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(date));
