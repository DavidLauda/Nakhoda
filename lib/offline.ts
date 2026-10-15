'use client';
import Dexie, { type EntityTable } from 'dexie';
import { api } from './client';

export type LocalPhoto={clientId:string;blob:Blob;name:string};
export type Draft={clientId:string;ownerId:string;category:string;lon:number|null;lat:number|null;locationMethod:'gps'|'manual';accuracyM?:number;observedAt:string;description:string;textOnlyReason?:string;photos:LocalPhoto[];observationId?:string;stance?:'similar'|'not_observed'|'cannot_assess';state:'local'|'pending'|'failed'|'sent';serverId?:string;error?:string;attempts?:number;nextRetryAt?:number;updatedAt:number};
export type LocalTrip={clientId:string;ownerId:string;serverId?:string;startedAt:string;endedAt?:string;active:boolean;share:boolean;updatedAt:number};
export type LocalPoint={clientId:string;tripClientId:string;ownerId:string;lon:number;lat:number;recordedAt:string;accuracyM:number;gap:boolean;synced:boolean};
class PesisirDB extends Dexie {
  drafts!:EntityTable<Draft,'clientId'>;
  trips!:EntityTable<LocalTrip,'clientId'>;
  points!:EntityTable<LocalPoint,'clientId'>;
  constructor(){super('pesisir-local-v1');this.version(1).stores({drafts:'clientId,ownerId,state,updatedAt',trips:'clientId,ownerId,active',points:'clientId,ownerId,tripClientId,synced'});}
}
export const localDb=new PesisirDB();
export async function syncDraft(draft:Draft,currentUserId:string) {
  if(draft.ownerId!==currentUserId) throw new Error('Draf milik akun lain.');
  if(draft.lon===null||draft.lat===null||draft.description.trim().length<10) throw new Error('Lengkapi lokasi dan deskripsi.');
  await localDb.drafts.update(draft.clientId,{state:'pending',error:undefined});
  try {
    const result=await api('reports',{method:'POST',body:JSON.stringify({clientId:draft.clientId,category:draft.category,lon:draft.lon,lat:draft.lat,locationMethod:draft.locationMethod,accuracyM:draft.accuracyM,observedAt:draft.observedAt,description:draft.description,textOnlyReason:draft.textOnlyReason})});
    const reportId=result.item.id as string;
    await localDb.drafts.update(draft.clientId,{serverId:reportId});
    if(result.item.status==='pending_upload') {
      for(const photo of draft.photos) {
        const form=new FormData();form.set('clientId',photo.clientId);form.set('file',photo.blob,photo.name);
        await api(`reports/${reportId}/media`,{method:'POST',body:form});
      }
      await api(`reports/${reportId}/submit`,{method:'POST',body:JSON.stringify({expectedRevision:result.item.revision})});
    }
    if(draft.observationId && draft.stance) await api('field-evidence',{method:'POST',body:JSON.stringify({reportId,observationId:draft.observationId,stance:draft.stance})});
    await localDb.drafts.update(draft.clientId,{state:'sent',error:undefined,attempts:0,nextRetryAt:undefined});
  } catch(error) {
    const attempts=(draft.attempts||0)+1;
    const delay=Math.min(3600000,5000*2**Math.min(attempts-1,10));
    await localDb.drafts.update(draft.clientId,{state:'failed',error:error instanceof Error?error.message:'Gagal dikirim',attempts,nextRetryAt:Date.now()+delay});
    throw error;
  }
}
export async function syncTrip(trip:LocalTrip,currentUserId:string) {
  if(trip.ownerId!==currentUserId) throw new Error('Perjalanan milik akun lain.');
  let serverId=trip.serverId;
  if(!serverId) { const created=await api('trips',{method:'POST',body:JSON.stringify({clientId:trip.clientId,startedAt:trip.startedAt})});serverId=created.item.id;await localDb.trips.update(trip.clientId,{serverId}); }
  const points=await localDb.points.where('tripClientId').equals(trip.clientId).filter(p=>p.ownerId===currentUserId&&!p.synced).sortBy('recordedAt');
  for(let i=0;i<points.length;i+=30) {
    const batch=points.slice(i,i+30);
    await api(`trips/${serverId}/points`,{method:'POST',body:JSON.stringify({points:batch.map(p=>({clientId:p.clientId,lon:p.lon,lat:p.lat,recordedAt:p.recordedAt,accuracyM:p.accuracyM,gap:p.gap}))})});
    await localDb.points.bulkPut(batch.map(p=>({...p,synced:true})));
  }
  if(!trip.active) await api(`trips/${serverId}/stop`,{method:'POST'});
  return serverId;
}
export async function syncOwnQueue(userId:string,force=false) {
  if(!navigator.onLine) return;
  for(const trip of await localDb.trips.where('ownerId').equals(userId).toArray()) { try { await syncTrip(trip,userId); } catch {/* show pending in trip view */} }
  for(const draft of await localDb.drafts.where('ownerId').equals(userId).toArray()) if((draft.state==='pending'||draft.state==='failed') && (force||!draft.nextRetryAt||draft.nextRetryAt<=Date.now())) { try { await syncDraft(draft,userId); } catch {/* visible retry */} }
}
