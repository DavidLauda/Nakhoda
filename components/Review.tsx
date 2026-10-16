'use client';
import { LoadingIndicator } from './LoadingIndicator';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { caseDestination } from '@/lib/case-review';
import type { AppUser } from './PesisirApp';

const dt=(x?:string)=>x?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(x))+' WIB':'Belum tersedia';
/** Resolve old case bookmarks to the evidence page that now owns the review. */
export function LegacyCaseRedirect({id}:{id:string}){
  const [error,setError]=useState('');
  useEffect(()=>{api(`cases/${id}`).then(data=>window.location.replace(caseDestination(data.evidence||[]))).catch(e=>setError((e as Error).message));},[id]);
  return <section className="page">{error?<p className="error" role="alert">{error}</p>:<LoadingIndicator label="Membuka halaman peninjauan…"/>}<a href="/government/reports">Kembali ke laporan masuk</a></section>;
}
export function DataHealth(){const [runs,setRuns]=useState<Array<Record<string,any>>>([]),[message,setMessage]=useState(''),[loading,setLoading]=useState(true);useEffect(()=>{api('data-health').then(x=>{setRuns(x.runs||x.sources||[]);setMessage(x.message||'');}).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));},[]);return <section className="page"><p className="eyebrow">PROVENANS SUMBER</p><h1>Kesehatan data</h1><p>Waktu pemeriksaan dan waktu pengamatan berbeda. Jadwal GitHub Actions dapat terlambat atau terlewat.</p>{loading&&<LoadingIndicator label="Memuat kesehatan data…"/>}{message&&<div className="empty">{message}</div>}{runs.map((r,i)=><div className="data-card" key={r.id||i}><strong>{r.source_name}</strong><span>Status: {r.status}</span><small>Diperiksa {dt(r.latest_check_at)} · Pengamatan layak terbaru {dt(r.latest_usable_observation_at)}</small>{r.error_code&&<small>Kesalahan: {r.error_code}</small>}</div>)}</section>;}
export function AdminPanel({user}:{user:AppUser}){
  const [userId,setUserId]=useState(''),[role,setRole]=useState('reviewer'),[message,setMessage]=useState('');
  if(user.role!=='admin')return <section className="page"><h1>Akses ditolak</h1></section>;
  async function assign(){try{await api('admin/roles',{method:'POST',body:JSON.stringify({userId,role})});setMessage('Peran dan keanggotaan area pilot diperbarui.');}catch(e){setMessage((e as Error).message);}}
  return <section className="page"><p className="eyebrow">KONFIGURASI PILOT</p><h1>Administrasi</h1><p role="status">{message}</p><div className="panel"><h2>Peran dan area</h2><p>Gunakan UUID pengguna Supabase Auth untuk menetapkan peran dan area pilot.</p><label>UUID pengguna<input value={userId} onChange={e=>setUserId(e.target.value)} placeholder="UUID dari Supabase Auth"/></label><label>Peran<select value={role} onChange={e=>setRole(e.target.value)}><option value="reviewer">Peninjau</option><option value="fisherman">Nelayan</option><option value="admin">Administrator</option></select></label><button className="secondary" disabled={!userId} onClick={assign}>Tetapkan peran</button></div></section>;
}
