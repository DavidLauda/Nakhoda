'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/client';
import { bearingDeg, compassId, distanceKm, zoneAt, type AreaGeometry } from '@/lib/geo';
import { buildFisherGrid, fisherZoneCategory, HIGH_SCORE_MINIMUM, type ConservationGrid, type SeaGrid } from '@/lib/conservation-grid';
import { MapView, type MapAreaProperties, type MapAreas, type MapPin } from './MapView';

type Cell={id:string;lon:number;lat:number;observed_end:string;sst_c:number|null;chlorophyll_mg_m3:number|null;currentScore:number|null;quality_flags:unknown;exclusion:string|null;zoning_verified:boolean;legalNote:string|null;resolution:string};
type Position={lon:number;lat:number;accuracy:number;at:number};
const when=(date:string)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB';
const noPins:MapPin[]=[];
const noCells:Cell[]=[];
const noAreas:MapAreas={type:'FeatureCollection',features:[]};
const km=(v:number)=>v.toLocaleString('id-ID',{maximumFractionDigits:1});

export function FisherPortal(){
  const [cells,setCells]=useState<Cell[]>([]),[selected,setSelected]=useState<string|null>(null),[overlaySelection,setSelectedOverlay]=useState<MapAreaProperties|null>(null),[conservation,setConservation]=useState<MapAreas>(noAreas),[zoneGrid,setZoneGrid]=useState<ConservationGrid|null>(null),[seaGrid,setSeaGrid]=useState<SeaGrid|null>(null),[zoneError,setZoneError]=useState(''),[error,setError]=useState(''),[location,setLocation]=useState<Position|null>(null),[gpsError,setGpsError]=useState(''),[tracking,setTracking]=useState(false),[focus,setFocus]=useState<{lon:number;lat:number}|null>(null);
  const watch=useRef<number|null>(null);
  const load=useCallback(()=>api('environment-cells').then(x=>{setCells([...(x.items||[]),...(x.fallbackItems||[])]);setError('');}).catch(e=>{setCells([]);setError((e as Error).message);}),[]);
  useEffect(()=>{load();const id=window.setInterval(load,300000);return()=>window.clearInterval(id);},[load]);
  useEffect(()=>{let alive=true;Promise.all(['/conservation-north-big.geojson','/conservation-south-kkp-2026.geojson','/conservation-grid.json','/sea-grid.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw new Error('Grid laut atau zonasi gagal dimuat.');return r.json();}))).then(([source,south,grid,sea])=>{if([source,south].some(x=>x?.type!=='FeatureCollection'||!Array.isArray(x.features))||!Array.isArray(grid?.resolutions?.['0.01'])||!Array.isArray(sea?.cells)||sea.step!==.01||!Array.isArray(sea.origin)||sea.origin.some((v:number,i:number)=>Math.abs(v-grid.origin[i])>1e-8))throw new Error('Format grid laut atau zonasi tidak sesuai.');if(alive){setConservation({type:'FeatureCollection',features:[...source.features,...south.features]} as MapAreas);setZoneGrid(grid as ConservationGrid);setSeaGrid(sea as SeaGrid);setZoneError('');}}).catch(e=>{if(alive)setZoneError((e as Error).message);});return()=>{alive=false;};},[]);
  useEffect(()=>()=>{if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);},[]);
  function startGps(){if(!navigator.geolocation){setGpsError('GPS tidak tersedia di browser ini.');return;}setGpsError('');setTracking(true);watch.current=navigator.geolocation.watchPosition(p=>{setLocation({lon:p.coords.longitude,lat:p.coords.latitude,accuracy:p.coords.accuracy,at:p.timestamp});setGpsError('');},e=>{setGpsError(e.message);setTracking(false);setLocation(null);if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null;},{enableHighAccuracy:true,maximumAge:15000,timeout:20000});}
  function stopGps(){if(watch.current!==null)navigator.geolocation.clearWatch(watch.current);watch.current=null;setTracking(false);setLocation(null);}
  const zones=useMemo(()=>conservation.features.map(f=>({geometry:f.geometry as AreaGeometry,properties:f.properties})),[conservation]);
  const gridModel=useMemo(()=>zoneGrid&&seaGrid?buildFisherGrid(cells,zoneGrid,seaGrid):null,[cells,zoneGrid,seaGrid]);
  const recommended=gridModel?.recommended||noCells;
  const areas=gridModel?.areas||noAreas;
  const selectedOverlay=overlaySelection?areas.features.find(f=>f.properties.id===overlaySelection.id)?.properties:null;
  const active=recommended.find(c=>c.id===selected)||recommended[0];
  const overlaySource=cells.find(c=>c.id===selectedOverlay?.sourceCellId);
  const selectArea=useCallback((area:MapAreaProperties)=>{if(area.kind==='conservation'||area.coverage!=='measured')setSelectedOverlay(area);else{setSelected(area.id);setSelectedOverlay(null);}},[]);
  const choose=useCallback((c:Cell)=>{setSelected(c.id);setSelectedOverlay(null);setFocus({lon:c.lon,lat:c.lat});},[]);
  const rank=active?recommended.findIndex(c=>c.id===active.id):-1;
  const myZone=location?zoneAt(location.lon,location.lat,zones)?.properties:undefined;
  const nearest=useMemo(()=>location?recommended.slice(0,Math.max(3,Math.ceil(recommended.length*0.2))).map(c=>({c,d:distanceKm(location,c)})).sort((a,b)=>a.d-b.d)[0]:undefined,[location,recommended]);
  const kkp=<a href="https://sidako.kkp.go.id/sidako/map" target="_blank" rel="noreferrer">peta KKP</a>;
  return <section className="fisher-app">
    <div className="fisher-map-wrap">
      <div className="map-frame fisher-map"><MapView pins={noPins} areas={areas} userLocation={location} onAreaSelect={selectArea} selectedId={selectedOverlay?.id||active?.id} focus={focus}/></div>
      <div className="map-legend floating" aria-label="Legenda peta"><span><i className="legend-area priority-area"/>Skor Tinggi</span><span><i className="legend-area measured-area"/>Skor Sedang</span><span><i className="legend-area caution-area"/>Periksa dulu</span><span><i className="legend-area avoid-area"/>Hindari memancing</span><span><i className="legend-area no-data-area"/>Belum ada data</span>{location&&<span><i className="legend-dot gps-dot"/>Saya</span>}</div>
    </div>
    <div className="fisher-sheet">
      {error&&<p className="error" role="alert">{error}</p>}
      {zoneError&&<p className="error" role="alert">{zoneError} Periksa {kkp} sebelum berangkat.</p>}
      {myZone&&<div className={`zone-alert${fisherZoneCategory(myZone.zoneType)==='avoid'?' danger':''}`} role="alert"><strong>Anda berada di Zona {myZone.zoneType} {myZone.name}</strong><span>{fisherZoneCategory(myZone.zoneType)==='avoid'?'Hindari memancing di area ini.':'Periksa aturan zona pemanfaatan sebelum memancing.'} Rujukan {zoneRef(myZone.name)}; cek {kkp}.</span></div>}
      {selectedOverlay?.kind==='conservation'?<div className="sheet-zone">
        <div className="sheet-head"><div><p className="sheet-kicker">{selectedOverlay.category==='avoid'?'Merah · Hindari memancing':'Kuning · Periksa aturan dahulu'}</p><h2>{selectedOverlay.zoneType}</h2></div><button className="secondary sheet-close" onClick={()=>setSelectedOverlay(null)}>Tutup</button></div>
        <p>{selectedOverlay.name} (rujukan {zoneRef(selectedOverlay.name)}). {selectedOverlay.category==='avoid'?'Aplikasi menyarankan menghindari penangkapan di zona inti dan perlindungan bahari.':'Zona pemanfaatan memiliki aturan kegiatan dan alat tangkap yang perlu diperiksa.'} Kotak ini menyentuh poligon konservasi. Batas hukum tetap mengikuti poligon asli; cek aturan setempat pada sumber resmi.</p>
        <a className="secondary link-button" href="https://sidako.kkp.go.id/sidako/map" target="_blank" rel="noreferrer">Cek aturan di peta KKP ↗</a>
      </div>:selectedOverlay?<div className="sheet-zone">
        <div className="sheet-head"><div><p className="sheet-kicker">{selectedOverlay.coverage==='estimate'?'Perkiraan kondisi perairan':'Belum ada data layak'}</p><h2>{coord(selectedOverlay.lat!,'LS','LU')} · {coord(selectedOverlay.lon!,'BB','BT')}</h2></div><button className="secondary sheet-close" onClick={()=>setSelectedOverlay(null)}>Tutup</button></div>
        {selectedOverlay.coverage==='estimate'&&overlaySource?<><p><span className={`score-pill${selectedOverlay.priority?' high':''}`}>Skor perkiraan {selectedOverlay.score}</span></p><p>Skor, suhu, dan klorofil memakai data Marine asal dengan resolusi ±5,5 km. Warna hijaunya mengikuti kategori skor yang sama dengan data detail. Nilai ini masih perkiraan dan tidak masuk Top 3.</p><div className="sheet-stats"><div><span>Suhu laut perkiraan</span><strong>{overlaySource.sst_c?.toFixed(1)} °C</strong></div><div><span>Klorofil perkiraan</span><strong>{overlaySource.chlorophyll_mg_m3?.toFixed(2)}</strong></div><div><span>Waktu data</span><strong>{short(overlaySource.observed_end)}</strong></div><div><span>Resolusi sumber</span><strong>±5,5 km</strong></div></div></>:<p>Abu-abu menandakan belum ada data layak. Pengukuran detail dan data cadangan terbaru belum cukup untuk kotak ini, sehingga belum ada skor atau rekomendasi memancing.</p>}
      </div>:active?<>
        <div className="sheet-head"><div><p className="sheet-kicker">{rank===0?'Kondisi terukur relatif tertinggi':rank>0?`Peringkat ${rank+1} dari ${recommended.length}`:'Sel terukur'}</p><h2>{coord(active.lat,'LS','LU')} · {coord(active.lon,'BB','BT')}</h2></div><span className={`score-pill${gridModel?.priorityIds.has(active.id)?' high':''}`}>Skor {active.currentScore??'—'}</span></div>
        {location&&<p className="distance-line">{km(distanceKm(location,active))} km · arah {compassId(bearingDeg(location,active))} dari posisi Anda</p>}
        <div className="sheet-stats">
          <div><span>Suhu laut</span><strong>{active.sst_c===null?'—':`${active.sst_c.toFixed(1)} °C`}</strong></div>
          <div><span>Klorofil</span><strong>{active.chlorophyll_mg_m3===null?'—':active.chlorophyll_mg_m3.toFixed(2)}</strong></div>
          <div><span>Data</span><strong>{short(active.observed_end)}</strong></div>
          <div><span>Zonasi</span><strong>{active.zoning_verified?'Terverifikasi':'Belum dicek'}</strong></div>
        </div>
        {active.exclusion&&<p className="error">Dikecualikan: {active.exclusion}</p>}
        {recommended.length>1&&<div className="top-picks" role="group" aria-label="Area teratas">{recommended.slice(0,3).map((c,i)=><button key={c.id} className={c.id===active.id?'active':''} aria-pressed={c.id===active.id} onClick={()=>choose(c)}>#{i+1} · {c.currentScore}</button>)}</div>}
        {nearest&&nearest.c.id!==active.id&&<button className="secondary nearest-button" onClick={()=>choose(nearest.c)}>Terdekat yang bagus · {km(nearest.d)} km · skor {nearest.c.currentScore}</button>}
      </>:<div className="empty">{zoneGrid?'Belum ada sel suhu laut dan klorofil terbaru di luar konservasi. Lokasi memancing tidak dapat direkomendasikan saat ini.':'Grid konservasi belum tersedia. Lokasi memancing belum dapat direkomendasikan.'}</div>}
      <button className="primary sheet-cta" onClick={tracking?stopGps:startGps}>{tracking?'Hentikan GPS':'Tampilkan lokasi saya'}</button>
      {gpsError?<p className="error" role="alert">GPS: {gpsError}</p>:location&&<p className="sheet-note">Lokasi ±{Math.round(location.accuracy)} m · {new Date(location.at).toLocaleTimeString('id-ID')} · hanya di perangkat ini</p>}
      <p className="sheet-note">Hijau: kondisi perairan berskor. Kuning: periksa aturan pemanfaatan. Merah: hindari memancing. Abu-abu: belum ada data layak. Klik kotak untuk melihat sumber data dan alasannya. Cek aturan di {kkp} sebelum berangkat.</p>
      <details className="sheet-more"><summary>Tentang data & keselamatan</summary>
        <h3>Sebelum memancing</h3>
        <ol><li>Periksa zona konservasi dan aturan penangkapan pada sumber resmi.</li><li>Periksa cuaca, gelombang, arus, dan keselamatan pelayaran dari layanan resmi.</li><li>Gunakan GPS sebagai orientasi; akurasinya bisa berubah dan peta ini bukan alat navigasi.</li></ol>
        <h3>Zonasi</h3>
        <p>Lapisan konservasi dari <a href="https://kspservices.big.go.id/satupeta/rest/services/PUBLIK/SUMBER_DAYA_ALAM_DAN_LINGKUNGAN/MapServer/33" target="_blank" rel="noreferrer">peta zonasi BIG</a> hanya mencakup bagian utara Taman Nasional Kepulauan Seribu (enam fitur; tanggal pemutakhiran tidak tercantum). Poligon BIG diubah menjadi kotak pada grid yang sama dengan data laut. Kawasan Kepulauan Seribu Selatan diambil dari titik koordinat <a href="https://jdih.kkp.go.id/Homedev/DetailPeraturan/7029" target="_blank" rel="noreferrer">Kepmen KP 28/2026</a> (Lampiran I); zona lain seperti jalur kapal dan instalasi laut belum dimasukkan, dan bentuk Area III (Pulau Bokor) masih perkiraan karena tabel koordinatnya tidak cocok dengan petanya. Bila kotak menyentuh lebih dari satu zona, urutannya Inti, Perlindungan Bahari, lalu Pemanfaatan. Warna kotak dapat melampaui batas poligon asli dan tidak menetapkan batas hukum.</p>
        <h3>Sel perairan</h3>
        <p>Hijau tua menunjukkan skor {HIGH_SCORE_MINIMUM}–100; hijau muda menunjukkan skor di bawah {HIGH_SCORE_MINIMUM}. Ini kategori tampilan dari indeks relatif suhu dan klorofil, bukan peluang mendapat ikan atau izin memancing. Data Marine cadangan memakai skor dari wilayah sumbernya (±5,5 km), dengan label perkiraan pada detail. Top 3 hanya memakai pengukuran detail di luar konservasi. Kuning menandai zona pemanfaatan yang perlu dicek aturannya. Abu-abu menandai kotak tanpa data layak. Merah menyatukan zona Inti dan Perlindungan Bahari sebagai area yang disarankan dihindari.</p>
        <p>Grid laut 0,01° (±1,1 km) dipotong mengikuti garis pantai <a href="https://github.com/GenericMappingTools/gshhg-gmt/releases/tag/2.3.7" target="_blank" rel="noreferrer">{seaGrid?.source||'GSHHG'}</a> (<a href="/gshhg-license.txt">lisensi</a>). Kotak pesisir mengikuti daratan pada sumber ini; pulau kecil dan perubahan pantai dapat belum terwakili dengan tepat. Data lebih dari tujuh hari tidak dipakai. Skor terukur dapat memakai tetangga satu sisi, dengan flag kualitas. Peta ini bukan alat navigasi.</p>
        {active&&!selectedOverlay&&<><h3>Sel terpilih</h3><p>Diamati {when(active.observed_end)} · Resolusi {active.resolution}{active.legalNote?` · ${active.legalNote}`:''}</p><details><summary>Flag kualitas</summary><pre>{JSON.stringify(active.quality_flags,null,2)}</pre></details><a href={`https://www.openstreetmap.org/?mlat=${active.lat}&mlon=${active.lon}#map=13/${active.lat}/${active.lon}`} target="_blank" rel="noreferrer">Buka koordinat di peta luar ↗</a></>}
      </details>
    </div>
  </section>;
}
const zoneRef=(name?:string)=>name?.startsWith('Taman Perairan Kepulauan Seribu Selatan')?'Kepmen KP 28/2026':'BIG';
const coord=(v:number,neg:string,pos:string)=>`${Math.abs(v).toFixed(3).replace('.',',')}° ${v<0?neg:pos}`;
const short=(date:string)=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(date));
