'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client';
import { OPEN_STATUSES, REPORT_CATEGORIES, REPORT_STATUS, cellLevel, confidence, problemCell, satelliteSignal, type ReviewAction, type SatelliteObservation } from '@/lib/review';
import { ObservationImages } from './ObservationImages';
import { IndicationReview } from './IndicationReview';
import { CASE_STATUS } from '@/lib/case-review';

export type ReviewReport={id:string;category:string;lon:number;lat:number;observed_at:string;submitted_at:string;status:string;description:string;text_only_reason:string|null;location_method:string;accuracy_m:number|null;reviewer_note_public:string|null;revision:number;photoCount?:number};
export type ProblemCell=ReturnType<typeof problemCell>&{reports:ReviewReport[];open:number;verified:number;satellite:SatelliteObservation[];level:'problem'|'watch'|null};
const when=(date?:string|null)=>date?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB':'—';
export const categoryLabel=(c:string)=>REPORT_CATEGORIES[c]||c;
export const statusLabel=(s:string)=>REPORT_STATUS[s]||s;
export type FollowUp={caseId:string;status:string};
const shortSignal=(label:string)=>label.replace(/^Perubahan optik Sentinel-2: (.*?) berubah.*$/,'Perubahan warna dasar laut · $1').replace(/^Panas karang NOAA: /,'Panas karang · ');
export type Indication={o:SatelliteObservation;cell:ReturnType<typeof problemCell>;label:string;followUp?:FollowUp};
const CASE_CLOSED=['resolved','closed_without_resolution'];

/** Groups reports and counted satellite indications into 0.05° cells with a level. */
export function buildCells(items:ReviewReport[],observations:SatelliteObservation[]){
  const map=new Map<string,ProblemCell>();
  const at=(lon:number,lat:number)=>{const c=problemCell(lon,lat);if(!map.has(c.key))map.set(c.key,{...c,reports:[],open:0,verified:0,satellite:[],level:null});return map.get(c.key)!;};
  for(const r of items){const c=at(r.lon,r.lat);c.reports.push(r);if(OPEN_STATUSES.includes(r.status))c.open++;if(r.status==='corroborated')c.verified++;}
  for(const o of observations)if(satelliteSignal(o).indication)at(o.lon,o.lat).satellite.push(o);
  for(const c of map.values())c.level=cellLevel({open:c.open,verified:c.verified,satellite:c.satellite.length>0});
  return map;
}
export function useReviewData(){
  const [items,setItems]=useState<ReviewReport[]>([]),[observations,setObservations]=useState<SatelliteObservation[]>([]),[followUps,setFollowUps]=useState<Record<string,FollowUp>>({}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{api('review/reports').then(x=>{setItems(x.items||[]);setObservations(x.observations||[]);setFollowUps(x.followUps||{});setError('');}).catch(e=>setError((e as Error).message)).finally(()=>setLoading(false));},[]);
  const cells=useMemo(()=>buildCells(items,observations),[items,observations]);
  // Satellite-only indications become queue items of their own, newest first.
  const indications=useMemo<Indication[]>(()=>observations.map(o=>({o,s:satelliteSignal(o)})).filter(x=>x.s.indication).map(({o,s})=>({o,cell:problemCell(o.lon,o.lat),label:s.label,followUp:followUps[o.id]})).sort((a,b)=>Date.parse(b.o.observed_end)-Date.parse(a.o.observed_end)),[observations,followUps]);
  return {items,observations,cells,indications,followUps,error,loading};
}

export function ReportFilters({category,setCategory,status,setStatus}:{category:string;setCategory:(v:string)=>void;status:string;setStatus:(v:string)=>void}){
  return <div className="filter-row"><label>Jenis<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Semua</option>{Object.entries(REPORT_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}<option value="satellite">Indikasi satelit</option></select></label><label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="open">Perlu ditindaklanjuti</option><option value="">Semua</option><option value="corroborated">Terverifikasi</option><option value="closed">Ditutup</option></select></label></div>;
}
export function filterIndications(items:Indication[],category:string,status:string){
  if(category&&category!=='satellite')return [];
  return items.filter(x=>{const closed=!!x.followUp&&CASE_CLOSED.includes(x.followUp.status);return !status||(status==='open'?!closed:status==='closed'?closed:false);});
}
export function filterReports(items:ReviewReport[],category:string,status:string){
  if(category==='satellite')return [];
  return items.filter(r=>(!category||r.category===category)&&(!status||(status==='open'?OPEN_STATUSES.includes(r.status):status==='closed'?['unsubstantiated','duplicate','closed'].includes(r.status):r.status===status)));
}

export function ReportCards({items,cells,indications=[]}:{items:ReviewReport[];cells:Map<string,ProblemCell>;indications?:Indication[]}){
  if(!items.length&&!indications.length)return <div className="empty">Belum ada laporan yang cocok. Laporan dari menu <strong>Lapor</strong> di aplikasi nelayan akan muncul di sini.</div>;
  return <div className="review-cards">{indications.map(x=><a key={x.o.id} className="review-card satellite" href={`/government/indications/${x.o.id}`}>
    <div><strong>Indikasi satelit · {x.cell.code}</strong><small>{shortSignal(x.label)} · {when(x.o.observed_end)}</small></div>
    <span className={`status-pill ${x.followUp?`case-${x.followUp.status}`:'status-satellite'}`}>{x.followUp?CASE_STATUS[x.followUp.status]||x.followUp.status:'Baru'}</span></a>)}{items.map(r=>{const c=cells.get(problemCell(r.lon,r.lat).key);const others=(c?.reports.length||1)-1;return <a key={r.id} className={`review-card${r.status==='submitted'?' fresh':''}`} href={`/government/reports/${r.id}`}>
    <div><strong>{categoryLabel(r.category)} · {c?.code}</strong><small>{others?`${others+1} laporan di sel ini`:'1 laporan di sel ini'} · {when(r.submitted_at)}{c?.satellite.length?' · ada indikasi satelit':''}</small></div>
    <span className={`status-pill status-${r.status}`}>{statusLabel(r.status)}</span></a>;})}</div>;
}

export function ReviewReportList(){
  const {items,cells,indications,error,loading}=useReviewData(),[category,setCategory]=useState(''),[status,setStatus]=useState('open');
  const shown=filterReports(items,category,status),shownIndications=filterIndications(indications,category,status);
  return <section className="page review-page"><div className="page-heading"><div><h1>Laporan masuk</h1><p>Laporan nelayan 90 hari terakhir dan indikasi satelit 60 hari terakhir. Identitas pelapor tidak ditampilkan.</p></div><ReportFilters {...{category,setCategory,status,setStatus}}/></div>
    {loading&&<p role="status">Memuat laporan…</p>}{error&&<AccessError message={error}/>}
    {!loading&&!error&&<ReportCards items={shown} cells={cells} indications={shownIndications}/>}
  </section>;
}

export function AccessError({message}:{message:string}){
  return <p className="error" role="alert">{message}{/peninjau|ditugaskan/i.test(message)?' Sesi Masuk Cepat pemerintah hanya bisa meninjau bila QUICK_LOGIN_FULL_ACCESS=true di server.':''}</p>;
}

type Detail={item:ReviewReport;cell:ReturnType<typeof problemCell>;media:{id:string}[];fieldValidation:{stance:string;distance_m:number;time_separation_hours:number}|null;case:{id:string;status:string}|null;sameCell:{id:string;category:string;status:string;observed_at:string}[];observations:(SatelliteObservation&{source_name:string})[];history:{entity_type:string;action:string;reason:string|null;metadata:Record<string,string>;created_at:string}[]};
const STANCE:Record<string,string>={similar:'Nelayan melihat kondisi serupa dengan observasi satelit',not_observed:'Nelayan tidak melihat kondisi pada observasi satelit',cannot_assess:'Nelayan tidak dapat menilai observasi satelit'};

export function ReviewReportDetail({id}:{id:string}){
  const [data,setData]=useState<Detail|null>(null),[photos,setPhotos]=useState<string[]>([]),[error,setError]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const load=useCallback(()=>api(`review/reports/${id}`).then(async(x:Detail)=>{setData(x);setError('');setPhotos((await Promise.all(x.media.map(m=>api(`reports/${id}/media/${m.id}`).then(r=>r.url as string).catch(()=>'')))).filter(Boolean));}).catch(e=>setError((e as Error).message)),[id]);
  useEffect(()=>{load();},[load]);
  async function act(status:ReviewAction){
    if(!data)return;
    if(status==='needs_information'&&!note.trim()){setMessage('Tulis informasi apa yang diminta dari nelayan.');return;}
    setBusy(true);setMessage('');
    try{await api(`review/reports/${id}/status`,{method:'POST',body:JSON.stringify({status,note:note.trim()||undefined,expectedRevision:data.item.revision})});setNote('');setMessage(`Status diubah menjadi ${statusLabel(status)}.`);await load();}
    catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  if(error)return <section className="page review-page"><a href="/government/reports">← Laporan masuk</a><AccessError message={error}/></section>;
  if(!data)return <section className="page review-page"><p role="status">Memuat laporan…</p></section>;
  const r=data.item,signals=data.observations.map(o=>({o,...satelliteSignal(o)})),indicated=signals.some(s=>s.indication);
  const others=data.sameCell.filter(x=>!['unsubstantiated','duplicate','closed'].includes(x.status));
  const conf=confidence({photo:data.media.length>0,neighbours:others.length,satellite:indicated});
  const missing=[!data.media.length&&'foto',!others.length&&'laporan lain di sel ini',!indicated&&'indikasi satelit'].filter(Boolean).join(', ');
  const steps=[{label:'Laporan diterima',at:r.submitted_at,tone:'done'},...data.history.filter(h=>h.action==='report_status_changed').map(h=>({label:`Status: ${statusLabel(h.metadata?.to)}${h.reason?` · “${h.reason}”`:''}`,at:h.created_at,tone:'done'})),...(OPEN_STATUSES.includes(r.status)?[{label:'Menunggu keputusan petugas',at:'',tone:'now'}]:[])];
  return <section className="page review-page">
    <a href="/government/reports">← Laporan masuk</a>
    <div className="page-heading"><div><h1>{categoryLabel(r.category)} · Sel {data.cell.code}</h1><p>Diterima {when(r.submitted_at)} · diamati {when(r.observed_at)}</p></div><div className="button-row"><span className={`status-pill status-${r.status}`}>{statusLabel(r.status)}</span>{indicated&&<span className="status-pill status-satellite">Ada indikasi satelit</span>}</div></div>
    <div className="review-detail">
      <div className="review-main">
        <div className="panel report-body">
          <div className="report-photos">{photos.length?photos.map((u,i)=><img key={u} src={u} alt={`Foto laporan ${i+1}`}/>):<div className="photo-placeholder">{data.media.length?'Memuat foto…':'Tanpa foto'}{r.text_only_reason&&<small>Alasan: {r.text_only_reason}</small>}</div>}</div>
          <dl className="report-facts"><dt>Jenis</dt><dd>{categoryLabel(r.category)}</dd><dt>Lokasi</dt><dd>Sel {data.cell.code} · {r.lat.toFixed(5)}, {r.lon.toFixed(5)} · {r.location_method==='gps'?`GPS ±${Math.round(r.accuracy_m??0)} m`:'diisi manual'}</dd><dt>Catatan nelayan</dt><dd>{r.description}</dd><dt>Pelapor</dt><dd>Disembunyikan. Petugas hanya melihat lokasi, foto, dan catatan.</dd></dl>
        </div>
        <div className="panel">
          <h2>Validasi vs satelit</h2>
          <div className="compare-boxes">
            <div className={indicated?'compare-box warn':'compare-box'}><span>Satelit · sel {data.cell.code} dan sekitarnya, ±30 hari</span>{signals.length?signals.map(s=><p key={s.o.id}><strong>{s.indication?'Ada indikasi':'Tidak ada indikasi'}</strong> · {s.label} · {when(s.o.observed_end)} <a href={`/observations/${s.o.id}`}>detail</a></p>):<p><strong>Tidak ada data</strong> · belum ada observasi satelit untuk lokasi dan waktu ini. Ini bukan berarti kondisi baik.</p>}</div>
            <div className={others.length?'compare-box warn':'compare-box'}><span>Laporan nelayan · sel {data.cell.code}, 60 hari</span><p><strong>{others.length+1} laporan</strong>{others.length?` · ${others.map(x=>categoryLabel(x.category)).join(', ')}`:' · belum ada laporan lain di sel ini'}</p>{data.fieldValidation&&<p>{STANCE[data.fieldValidation.stance]} (jarak {Math.round(data.fieldValidation.distance_m)} m, selisih {data.fieldValidation.time_separation_hours.toFixed(0)} jam).</p>}</div>
          </div>
          <div className="confidence"><div><strong>Tingkat keyakinan: {conf.label}</strong><small>{missing?`Belum ada: ${missing}.`:'Foto, laporan lain, dan indikasi satelit tersedia.'} Satelit dan laporan tetap perlu dicek di lapangan.</small></div><div className="confidence-bars" aria-hidden="true">{[1,2,3].map(i=><i key={i} className={i<=Math.max(1,conf.score)?'on':''}/>)}</div></div>
        </div>
      </div>
      <aside className="review-side">
        <div className="panel action-panel">
          <h2>Tindakan petugas</h2>
          <label>Catatan untuk nelayan (opsional)<textarea rows={2} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="Contoh: mohon kirim foto dari jarak dekat."/></label>
          <button className="primary" disabled={busy||r.status==='corroborated'} onClick={()=>act('corroborated')}>Tandai terverifikasi</button>
          {r.status==='submitted'&&<button className="secondary" disabled={busy} onClick={()=>act('under_review')}>Mulai verifikasi</button>}
          <button className="secondary" disabled={busy} onClick={()=>act('needs_information')}>Minta foto / info tambahan</button>
          <button className="secondary" disabled={busy||r.status==='unsubstantiated'} onClick={()=>act('unsubstantiated')}>Tidak terbukti</button>
          <button className="danger" disabled={busy||r.status==='closed'} onClick={()=>act('closed')}>Tutup laporan</button>
          {message&&<p className="sheet-note" role="status">{message}</p>}
        </div>
        <div className="panel"><h2>Riwayat</h2><ol className="timeline">{steps.map((s,i)=><li key={i} className={s.tone}><strong>{s.label}</strong>{s.at&&<small>{when(s.at)}</small>}</li>)}</ol></div>
      </aside>
    </div>
  </section>;
}

/** What a satellite indication is made of, so an officer can judge it before acting. */
export function SatelliteEvidence({o}:{o:SatelliteObservation}){
  const s=satelliteSignal(o),optical=o.type==='optical_change';
  return <div className="evidence-card">
    <strong>{optical?'Perubahan warna dasar laut':'Tekanan panas karang'}</strong>
    <span>{shortSignal(s.label)} · {when(o.observed_end)}</span>
    <small>Indikasi dari satelit, belum bukti kerusakan.</small>
    <a href={`/government/indications/${o.id}`}>Lihat citra dan penjelasan →</a>
  </div>;
}

type FullObservation=SatelliteObservation&{source_name:string;source_product_id:string;source_asset_ids:string[];limitations:string;manifest:Record<string,unknown>};
/** Detail page for an indication that comes only from satellite data. */
export function IndicationDetail({id}:{id:string}){
  const {cells,followUps,error:listError}=useReviewData(),[item,setItem]=useState<FullObservation|null>(null),[error,setError]=useState(''),[saved,setSaved]=useState<FollowUp|null>(null);
  useEffect(()=>{api(`observations/${id}`).then(x=>setItem(x.item)).catch(e=>setError((e as Error).message));},[id]);
  if(error||listError)return <section className="page review-page"><a href="/government/reports">← Laporan masuk</a><AccessError message={error||listError}/></section>;
  if(!item)return <section className="page review-page"><p role="status">Memuat indikasi…</p></section>;
  const cell=problemCell(item.lon,item.lat),reports=cells.get(cell.key)?.reports||[],s=satelliteSignal(item),assessment=saved||followUps[id];
  return <section className="page review-page">
    <a href="/government/reports">← Laporan masuk</a>
    <div className="page-heading"><div><h1>Indikasi satelit · Sel {cell.code}</h1><p>{item.type==='optical_change'?'Perubahan warna dasar laut · Sentinel-2':'Tekanan panas karang · NOAA'}</p></div><span className={`status-pill ${assessment?`case-${assessment.status}`:s.indication?'status-satellite':''}`}>{assessment?CASE_STATUS[assessment.status]||assessment.status:s.indication?'Perlu dicek':'Tidak dihitung'}</span></div>
    <div className="review-detail indication-layout">
      <div className="review-main">
        <IndicationSummary o={item}/>
        {item.type==='optical_change'&&<div className="panel"><h2>Citra yang dibandingkan</h2><ObservationImages manifest={item.manifest}/></div>}
        <div className="panel plain-text"><h2>Apa artinya?</h2>
          {item.type==='optical_change'?<><p>Warna sebagian area di kotak ini berubah di antara dua tanggal. Ini <strong>belum bukti kerusakan</strong>; perubahan warna lebih sering disebabkan oleh:</p><ul><li>pantulan matahari atau buih di permukaan air,</li><li>pasang surut yang membuat rataan terumbu lebih atau kurang terendam,</li><li>air yang lebih keruh atau lebih jernih,</li><li>sisa awan tipis atau bayangannya.</li></ul><p>Bandingkan citra sebelum dan sesudah. Bila perubahan hanya ada di permukaan air atau di seluruh kotak, kemungkinan besar bukan perubahan dasar laut.</p></>:<p>Suhu laut di sekitar kotak ini di atas normal. Ini tanda risiko pemutihan karang di wilayah sekitar 5 km, <strong>belum bukti</strong> karang sudah memutih.</p>}
        </div>
        <details className="panel tech-details"><summary>Detail teknis</summary><TechDetails o={item}/></details>
        <div className="panel"><h2>Laporan nelayan di sel {cell.code}</h2>{reports.length?<ReportCards items={reports} cells={cells}/>:<p>Belum ada laporan nelayan di sel ini. Indikasi satelit saja belum cukup untuk menyimpulkan kondisi; minta pengecekan lapangan atau tunggu laporan nelayan.</p>}</div>
      </div>
      <aside className="review-side"><IndicationReview key={id} id={id} onSaved={review=>setSaved({caseId:review.id,status:review.status})}/></aside>
    </div>
  </section>;
}

const pct=(v:unknown)=>`${(Number(v)*100).toLocaleString('id-ID',{maximumFractionDigits:1})}%`;
/** The three numbers an officer needs first, as large tiles. */
function IndicationSummary({o}:{o:FullObservation}){
  const m=(o.metrics||{}) as Record<string,unknown>,optical=o.type==='optical_change';
  const pixels=Number(m.candidate_pixel_count)||0,size=Number(m.pixel_size_m)||10;
  const cloud=m.square_cloud_fraction_before!=null?`${pct(Math.max(Number(m.square_cloud_fraction_before),Number(m.square_cloud_fraction_after)))}`:`${Math.round(Math.max(Number(m.current_cloud_percent)||0,Number(m.baseline_cloud_percent)||0))}% (citra)`;
  const alert=Number((m.alert_7day as {value?:unknown}|undefined)?.value);
  const tiles=optical?[[`${(pixels*size*size/1e4).toLocaleString('id-ID',{maximumFractionDigits:1})} ha`,'area yang warnanya berubah'],[cloud,'awan di kotak studi'],[`${o.observed_start?new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short'}).format(new Date(o.observed_start))+'–':''}${new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short'}).format(new Date(o.observed_end))}`,'tanggal citra dibandingkan']]
    :[[['Tidak ada','Watch','Warning','Alert 1','Alert 2','Alert 3','Alert 4','Alert 5'][alert]||'—','status peringatan NOAA'],[`${String((m.dhw as {value?:unknown}|undefined)?.value??'—')}`,'DHW (°C-minggu)'],[when(o.observed_end),'data terakhir']];
  return <div className="summary-tiles">{tiles.map(([v,l])=><div key={l}><strong>{v}</strong><span>{l}</span></div>)}</div>;
}
const FLAG_PLAIN:Record<string,string>={habitat_mask_unavailable:'Belum ada peta habitat terumbu untuk kotak ini',tide_depth_turbidity_unresolved:'Pasang surut, kedalaman, dan kekeruhan belum dikoreksi',low_valid_overlap:'Area yang bisa dibandingkan sedikit',cloud_in_study_area:'Ada awan di kotak studi'};
function TechDetails({o}:{o:FullObservation}){
  const m=(o.metrics||{}) as Record<string,unknown>,flags=Array.isArray(o.quality_flags)?o.quality_flags as string[]:[];
  return <dl className="tech-list">
    <dt>Sumber</dt><dd>{o.source_name} · {o.source_product_id}</dd>
    {o.type==='optical_change'&&<><dt>Awan seluruh citra</dt><dd>{Math.round(Number(m.baseline_cloud_percent)||0)}% sebelum, {Math.round(Number(m.current_cloud_percent)||0)}% sesudah</dd>
    {m.square_cloud_fraction_before!=null&&<><dt>Awan di kotak</dt><dd>{pct(m.square_cloud_fraction_before)} sebelum, {pct(m.square_cloud_fraction_after)} sesudah; tepi awan sudah disaring</dd></>}
    <dt>Area terbanding</dt><dd>{o.coverage_fraction!=null?`${Math.round(o.coverage_fraction*100)}% dari kotak`:'—'}</dd>
    <dt>Piksel berubah</dt><dd>{String(m.candidate_pixel_count??0)} piksel {String(m.pixel_size_m??10)} m</dd></>}
    <dt>Keterbatasan</dt><dd><ul>{flags.map(f=><li key={f}>{FLAG_PLAIN[f]||f}</li>)}</ul></dd>
    <dt>ID citra</dt><dd className="mono">{o.source_asset_ids.join(', ')}</dd>
    <dt>Catatan pipeline</dt><dd>{o.limitations}</dd>
  </dl>;
}
