'use client';
import { useEffect, useState } from 'react';
import { browserDb, api } from '@/lib/client';
import { ReportForm, ReportList, ReportDetail } from './Reports';
import { TripTracker, TripHistory } from './Trips';
import { CaseList, CaseDetail, DataHealth, AdminPanel } from './Review';
import { FisherPortal } from './FisherPortal';
import { GovernmentPortal } from './GovernmentPortal';
import { ReviewReportList, ReviewReportDetail } from './ReviewReports';

export type AppUser={id:string;role:'fisherman'|'reviewer'|'admin';displayName:string;isAnonymous:boolean;portal:'fisherman'|'government'};
const dt=(value?:string)=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))+' WIB':'Belum ada';
export function PesisirApp({route}:{route:string}) {
  const [user,setUser]=useState<AppUser|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  const configured=!!browserDb();
  useEffect(()=>{const db=browserDb();if(!db){setReady(true);return;}db.auth.getSession().then(async({data})=>{if(data.session){try{setUser((await api('me')).user);}catch(e){setError((e as Error).message);}}setReady(true);});const {data:sub}=db.auth.onAuthStateChange((_event,session)=>{if(!session)setUser(null);});return()=>sub.subscription.unsubscribe();},[]);
  useEffect(()=>{if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});},[]);
  if(route==='source-probe')return <SourceProbe/>;
  if(!configured)return <main className="setup-screen"><div className="brand large"><span className="brand-mark"><Icon name="compass" size={28}/></span>Nakhoda</div><h1>Konfigurasi backend diperlukan</h1><p>Tambahkan URL Supabase dan kunci <strong>publishable</strong> (<code>sb_publishable_...</code>) ke <code>.env.local</code>, jalankan migrasi, lalu mulai ulang aplikasi. Jangan masukkan <code>sb_secret_...</code> ke variabel <code>NEXT_PUBLIC_</code>.</p><a href="/source-probe">Lihat hasil NOAA asli yang diproses lokal</a><a href="/api/health">Lihat status integrasi</a></main>;
  if(!ready)return <main className="setup-screen"><p>Memuat sesi…</p></main>;
  if(!user)return <Login onLoggedIn={setUser} error={error}/>;
  const government=user.portal==='government';
  const home=government?'/government':'/map';
  const parts=route.split('/');
  let content:React.ReactNode;
  if(route==='' || route==='map' || route==='government') content=government?<GovernmentPortal/>:<FisherPortal/>;
  else if(route==='government/reports') content=government?<ReviewReportList/>:<FisherPortal/>;
  else if(parts[0]==='government'&&parts[1]==='reports'&&parts[2]) content=government?<ReviewReportDetail id={parts[2]}/>:<FisherPortal/>;
  else if(route==='dashboard') content=government?<GovernmentPortal/>:<FisherPortal/>;
  else if(route==='dashboard/cases') content=government?<CaseList/>:<FisherPortal/>;
  else if(parts[0]==='dashboard'&&parts[1]==='cases'&&parts[2]) content=<CaseDetail id={parts[2]} user={user}/>;
  else if(route==='dashboard/data-health') content=<DataHealth/>;
  else if(route==='admin') content=<AdminPanel user={user}/>;
  else if(route==='reports/new') content=<ReportForm user={user}/>;
  else if(route==='reports') content=<ReportList/>;
  else if(parts[0]==='reports'&&parts[1]) content=<ReportDetail id={parts[1]}/>;
  else if(parts[0]==='observations'&&parts[1]) content=<ObservationDetail id={parts[1]}/>;
  else if(route==='trips') content=<><TripTracker user={user}/><TripHistory/></>;
  else if(route==='settings') content=<Settings user={user}/>;
  else content=government?<GovernmentPortal/>:<FisherPortal/>;
  const current=route===''?home:`/${route}`;
  const links:[string,string,string,IconName][]=government?[['/government','Peta masalah','Peta','map'],['/government/reports','Laporan masuk','Laporan','inbox'],['/dashboard/data-health','Kesehatan data','Data','pulse']]:[['/map','Peta perairan','Peta','map'],['/reports/new','Buat laporan','Lapor','camera'],['/reports','Laporanku','Laporanku','list']];
  links.push(['/settings','Akun & keluar','Akun','user']);
  // The longest matching link is active, so /government/reports/x highlights "Laporan masuk", not "Peta masalah".
  const active=links.map(([href])=>href).filter(href=>current===href||current.startsWith(`${href}/`)).sort((a,b)=>b.length-a.length)[0];
  const online=typeof navigator==='undefined'||navigator.onLine;
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href={home}><span className="brand-mark"><Icon name="compass" size={22}/></span>Nakhoda</a><p className="sidebar-sub">{government?'Pemantauan ekosistem':'Peta untuk nelayan'} · <span className="status-pill">Pilot</span></p><nav aria-label="Navigasi utama">{links.map(([href,label,,icon])=><a key={href} href={href} aria-current={active===href?'page':undefined}><Icon name={icon} size={20}/>{label}</a>)}</nav><div className="sidebar-foot"><span className="role-chip">{government?'Pemerintah':'Nelayan'}</span><span>{user.displayName}</span></div></aside><main className="main"><header className="topbar"><a className="mobile-brand" href={home}>Nakhoda</a><span>Pilot · Teluk Jakarta & Kepulauan Seribu</span><span className={`online-indicator${online?'':' offline'}`} aria-live="polite">{online?'Online':'Offline'}</span></header>{content}</main><nav className="bottom-nav" aria-label="Navigasi ponsel">{links.map(([href,,short,icon])=><a key={href} href={href} aria-current={active===href?'page':undefined}><Icon name={icon}/>{short}</a>)}</nav></div>;
}

type IconName='map'|'chart'|'list'|'user'|'compass'|'boat'|'camera'|'inbox'|'pulse';
const iconPaths:Record<IconName,React.ReactNode>={
  map:<path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Zm0 0v13m6-10v13"/>,
  chart:<path d="M4 20V10m6 10V4m6 16v-7m4 7H3"/>,
  list:<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>,
  user:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  compass:<><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></>,
  boat:<path d="M3 15h18l-2.5 5h-13L3 15Zm9-12v12m0-12 6 9h-6"/>,
  camera:<><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3.2"/></>,
  inbox:<path d="M4 13h4l1.5 3h5L16 13h4M4 13l2.5-8h11l2.5 8v6H4v-6Z"/>,
  pulse:<path d="M3 12h4l2-6 4 12 2-6h6"/>
};
function Icon({name,size=24}:{name:IconName;size?:number}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;}

function SourceProbe(){const [record,setRecord]=useState<Record<string,any>|null>(null),[error,setError]=useState('');useEffect(()=>{fetch('/verified-noaa-snapshot.json').then(r=>r.json()).then(setRecord).catch(e=>setError(e.message));},[]);return <main className="source-probe page"><a className="brand" href="/"><span className="brand-mark"><Icon name="compass" size={22}/></span>Nakhoda</a><p className="eyebrow">PROBE SUMBER ASLI · TERPISAH DARI PETA LIVE</p><h1>NOAA Coral Reef Watch</h1>{error&&<p className="error">{error}</p>}{!record?<p>Memuat catatan sumber…</p>:<><p className="notice">{record.notice}</p><p>Produk: {record.source_product_id} · Diamati {record.acquisition_date} · Diproses {dt(record.processed_at)}. Belum diterbitkan ke Supabase.</p><div className="content-grid">{record.areas?.map((a:Record<string,any>)=><div className="panel" key={a.area}><h2>{a.area==='pari'?'Area studi Pari':'Area studi Pramuka'}</h2><p>Sel NOAA terdekat: {a.metrics.sst.native_lat.toFixed(3)}, {a.metrics.sst.native_lon.toFixed(3)} · resolusi 0,05°.</p><dl><dt>SST</dt><dd>{a.metrics.sst.value} °C</dd><dt>HotSpot</dt><dd>{a.metrics.hotspot.value} °C</dd><dt>DHW</dt><dd>{a.metrics.dhw.value} °C-weeks</dd><dt>Kode alert resmi, maksimum 7 hari</dt><dd>{a.metrics.alert_7day.value}</dd><dt>Interval alert</dt><dd>{dt(a.observed_start)} – {dt(a.observed_end)}</dd></dl><p>{a.limitations}</p><details><summary>ID sumber & checksum</summary><p>{a.source_asset_ids.join(', ')}</p>{Object.entries(record.source_sha256||{}).map(([id,hash])=><p key={id}><small>{id}: {String(hash)}</small></p>)}</details></div>)}</div></>}</main>;}

function Login({onLoggedIn,error}:{onLoggedIn:(user:AppUser)=>void;error:string}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(error);
  async function enterQuickly(portal:'fisherman'|'government'){setBusy(true);setMessage('');try{const db=browserDb()!;const r=await db.auth.signInAnonymously({options:{data:{display_name:portal==='fisherman'?'Akses Nelayan':'Akses Pemerintah',portal}}});if(r.error)throw r.error;onLoggedIn((await api('me')).user);window.location.href=portal==='fisherman'?'/map':'/government';}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  return <main className="login-screen"><div className="login-card portal-login"><div className="brand large"><span className="brand-mark"><Icon name="compass" size={28}/></span>Nakhoda</div><p className="eyebrow">PILOT TELUK JAKARTA</p><h1>Satu pesisir, dua cara bertindak.</h1><p>Pilih ruang kerja Anda. Masuk cepat tanpa email atau kata sandi.</p><div className="portal-choices"><button className="portal-choice" disabled={busy} onClick={()=>enterQuickly('fisherman')}><span className="portal-icon"><Icon name="boat"/></span><strong>Masuk sebagai Nelayan</strong><span>Peta kondisi perairan, lokasi GPS, dan pemeriksaan zonasi.</span><b>Buka peta →</b></button><button className="portal-choice" disabled={busy} onClick={()=>enterQuickly('government')}><span className="portal-icon"><Icon name="chart"/></span><strong>Masuk sebagai Pemerintah</strong><span>Dasbor ekosistem, ringkasan bukti, dan tindak lanjut.</span><b>Buka dasbor →</b></button></div><p className="quick-hint">Untuk berganti ruang kerja, keluar dahulu dari menu Akun.</p>{message&&<p className="notice" role="status">{message}</p>}</div></main>;
}

type Observation={id:string;type:string;lon:number;lat:number;source_name:string;source_product_id:string;source_asset_ids:string[];source_url:string;observed_start:string;observed_end:string;processed_at:string;published_at:string;quality_flags:unknown;coverage_fraction:number|null;metrics:Record<string,unknown>;limitations:string;algorithm_version:string;state:string;manifest:Record<string,unknown>};
function ObservationDetail({id}:{id:string}) {
  const [item,setItem]=useState<Observation|null>(null),[error,setError]=useState('');
  useEffect(()=>{api(`observations/${id}`).then(x=>setItem(x.item)).catch(e=>setError(e.message));},[id]);
  if(error)return <section className="page"><h1>Observasi</h1><p className="error">{error}</p></section>;
  if(!item)return <section className="page"><p>Memuat observasi…</p></section>;
  const manifest=(item.manifest||{}) as Record<string,string>;
  return <section className="page detail"><a href="/government">← Kembali ke dasbor</a><p className="eyebrow">{item.type==='heat_stress'?'KONTEKS PANAS KARANG':'PERUBAHAN OPTIK DI AREA STUDI TERUMBU'}</p><h1>{item.source_name}</h1><div className="panel"><h2>Apa yang diamati?</h2><p>{item.type==='heat_stress'?'Pengukuran panas laut NOAA pada resolusi produk. Ini bukan bukti pemutihan di lokasi.':'Perbedaan tampilan optik dua tanggal citra. Ini bukan bukti kerusakan karang.'}</p><dl><dt>Lokasi</dt><dd>{item.lat.toFixed(3)}, {item.lon.toFixed(3)}</dd><dt>Waktu pengamatan</dt><dd>{dt(item.observed_start)} – {dt(item.observed_end)}</dd><dt>Sumber / produk</dt><dd><a href={item.source_url} target="_blank" rel="noreferrer">{item.source_name} · {item.source_product_id}</a></dd><dt>ID aset</dt><dd>{item.source_asset_ids.join(', ')}</dd><dt>Diproses</dt><dd>{dt(item.processed_at)}</dd><dt>Algoritme</dt><dd>{item.algorithm_version}</dd><dt>Cakupan valid</dt><dd>{item.coverage_fraction===null?'Belum tersedia':`${Math.round(item.coverage_fraction*100)}%`}</dd><dt>Flag kualitas</dt><dd>{JSON.stringify(item.quality_flags)}</dd><dt>Metrik</dt><dd><pre>{JSON.stringify(item.metrics,null,2)}</pre></dd></dl></div>{(manifest.before_url||manifest.after_url)&&<div className="compare"><figure>{manifest.before_url&&<img src={String(manifest.before_url)} alt="Citra sebelum, tanggal sumber tercantum"/>}<figcaption>Sebelum · {String(manifest.before_at||'tanggal pada sumber')}</figcaption></figure><figure>{manifest.after_url&&<img src={String(manifest.after_url)} alt="Citra sesudah, tanggal sumber tercantum"/>}<figcaption>Sesudah · {String(manifest.after_at||'tanggal pada sumber')}</figcaption></figure></div>}<div className="panel"><h2>Apa yang bisa membuatnya keliru?</h2><p>{item.limitations}</p><h2>Langkah berikutnya</h2><p>Bandingkan indikasi ini dengan seri data lain dan verifikasi lapangan oleh petugas berwenang sebelum menetapkan tindakan pemulihan.</p></div></section>;
}
function Settings({user}:{user:AppUser}) {
  return <section className="page"><p className="eyebrow">AKUN & PERANGKAT</p><h1>Pengaturan</h1><div className="panel"><h2>{user.displayName}</h2><p>Ruang kerja: {user.portal==='government'?'Pemerintah':'Nelayan'}</p>{user.isAnonymous&&<p className="notice">Sesi Masuk Cepat tidak dapat dipulihkan setelah keluar atau menghapus data browser.</p>}<p>Untuk berganti ruang kerja, keluar lalu pilih pintu masuk lain. Izin lokasi GPS hanya dipakai pada peta nelayan selama tombol GPS aktif; posisi tidak dikirim ke server.</p></div><div className="panel"><h2>Pasang aplikasi</h2><p>Di Android Chrome, buka menu browser lalu pilih “Tambahkan ke layar utama” atau “Instal aplikasi” jika tersedia. Akses GPS memerlukan HTTPS atau localhost.</p></div><button className="secondary" onClick={async()=>{await browserDb()!.auth.signOut();window.location.href='/';}}>Keluar dan pilih ruang kerja</button></section>;
}
