'use client';
import { LoadingIndicator } from './LoadingIndicator';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/client';
import { CASE_PRIORITIES, CASE_STATES, CASE_STATUS, type CaseAudit, type CaseReview } from '@/lib/case-review';

const when=(date:string)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(date))+' WIB';

export function IndicationReview({id,onSaved}:{id:string;onSaved:(item:CaseReview)=>void}){
  const [item,setItem]=useState<CaseReview|null>(null),[audit,setAudit]=useState<CaseAudit[]>([]);
  const [status,setStatus]=useState('reviewing'),[priority,setPriority]=useState('routine');
  const [publicNote,setPublicNote]=useState(''),[privateNote,setPrivateNote]=useState(''),[reason,setReason]=useState('');
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const data=await api(`review/indications/${id}/case`) as {item:CaseReview|null;audit:CaseAudit[]};
      setItem(data.item);setAudit(data.audit);
      setStatus(data.item?.status||'reviewing');setPriority(data.item?.priority||'routine');
      setPublicNote(data.item?.public_note||'');setPrivateNote(data.item?.private_note||'');setReason('');
    }catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[id]);
  useEffect(()=>{void load();},[load]);
  async function save(event:FormEvent){
    event.preventDefault();if(reason.trim().length<3||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      let current=item;
      if(!current){
        const created=await api(`review/indications/${id}/case`,{method:'POST'});
        if(created.alreadyExisted)throw new Error('Penilaian sudah dibuat petugas lain. Muat ulang penilaian sebelum menyimpan.');
        current=created.item as CaseReview;setItem(current);
      }
      const updated=await api(`cases/${current.id}`,{method:'PATCH',body:JSON.stringify({expectedRevision:current.revision,status,priority,publicNote,privateNote,reason})});
      setItem(updated.item);setReason('');onSaved(updated.item);
      setMessage('Penilaian tersimpan. Status, catatan, dan alasan perubahan sudah diperbarui.');
      // Refresh history without replacing the values the officer just entered.
      const history=await api(`review/indications/${id}/case`);
      setAudit(history.audit);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  if(loading)return <div className="panel"><LoadingIndicator compact label="Memuat penilaian…"/></div>;
  return <>
    <form className="panel action-panel indication-review" onSubmit={save}>
      <h2>Penilaian indikasi</h2>
      <p className="sheet-note">Perbarui penanganan berdasarkan bukti dan hasil pemeriksaan.</p>
      <fieldset disabled={busy||!!error}>
        <label>Update status<select value={status} onChange={e=>setStatus(e.target.value)}>{CASE_STATES.map(value=><option key={value} value={value}>{CASE_STATUS[value]}</option>)}</select></label>
        <label>Prioritas<select value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(CASE_PRIORITIES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Catatan untuk nelayan<textarea rows={3} maxLength={2000} value={publicNote} onChange={e=>setPublicNote(e.target.value)} placeholder="Contoh: hindari area ini sementara petugas melakukan pemeriksaan."/><small>Dapat dibaca nelayan pada detail observasi dan laporan yang terhubung.</small></label>
        <label>Catatan internal<textarea rows={3} maxLength={4000} value={privateNote} onChange={e=>setPrivateNote(e.target.value)} placeholder="Rencana pemeriksaan atau koordinasi petugas."/><small>Hanya dapat diakses petugas pemerintah.</small></label>
        <label>Alasan perubahan<textarea rows={2} required minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Jelaskan alasan status, prioritas, atau catatan diperbarui."/></label>
        <button className="primary" disabled={reason.trim().length<3} type="submit">{busy?'Menyimpan…':'Simpan perubahan'}</button>
      </fieldset>
      {message&&<p className="sheet-note" role="status">{message}</p>}
      {error&&<div><p className="error" role="alert">{error}</p><button className="secondary" type="button" disabled={busy} onClick={()=>void load()}>Muat ulang penilaian</button></div>}
    </form>
    <div className="panel"><h2>Riwayat perubahan</h2>{audit.length?<ol className="timeline">{audit.map(entry=><li key={entry.id}><strong>{entry.action==='review_update'?`Penilaian diperbarui${typeof entry.metadata.to==='string'?` · ${CASE_STATUS[entry.metadata.to]||entry.metadata.to}`:''}`:entry.action==='created_from_observation'?'Peninjauan dimulai':'Perubahan kasus'}</strong>{entry.reason&&<span>{entry.reason}</span>}<small>{when(entry.created_at)}</small></li>)}</ol>:<p>Belum ada perubahan penilaian.</p>}</div>
  </>;
}
