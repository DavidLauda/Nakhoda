import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { ApiError, assertDb, bbox, failure, identity, inBbox, json, pilotAreaId, reviewer, serviceDb, timestamp, validPilotPoint } from './server';
import { allowedRecipient, contentHash, emailMode, sendGmail } from './email';
import { PLAYBOOK_VERSION, recommendation } from './playbook';
import { snap250, presenceIsFresh } from './geo';

const uuid=z.string().uuid();
const reportSchema=z.object({clientId:uuid,category:z.enum(['coral_concern','mangrove_damage','shoreline_erosion','marine_waste','water_pollution','other']),lon:z.number(),lat:z.number(),locationMethod:z.enum(['gps','manual']),accuracyM:z.number().nonnegative().optional(),observedAt:z.string(),description:z.string().min(10).max(4000),textOnlyReason:z.string().max(500).optional()});
const tripPointSchema=z.object({clientId:uuid,lon:z.number(),lat:z.number(),recordedAt:z.string(),accuracyM:z.number().min(0).max(100000),gap:z.boolean().optional()});
const statuses=['new','reviewing','ready_for_referral','referred','acknowledged','in_progress','resolved','closed_without_resolution'] as const;

async function body<T extends z.ZodTypeAny>(request:NextRequest,schema:T):Promise<z.infer<T>> {
  let parsed:unknown;
  try { parsed=await request.json(); } catch { throw new ApiError(422,'invalid_json','Isi permintaan bukan JSON yang valid.'); }
  const result=schema.safeParse(parsed);
  if (!result.success) throw new ApiError(422,'invalid_input',result.error.issues.map(x=>x.path.join('.')+': '+x.message).join('; '));
  return result.data;
}
function dataOrThrow<T>(data:T,error:{message:string}|null,context:string):T { assertDb(error,context); return data; }
function ensureOwner(owner:string,user:string) { if(owner!==user) throw new ApiError(403,'owner_forbidden','Hanya pemilik yang dapat mengakses data ini.'); }
function safeDate(value:string) { return new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }

export async function handleApi(request:NextRequest,method:string,path:string[]):Promise<NextResponse> {
  try { return await dispatch(request,method,path); } catch(error) { return failure(error); }
}

async function dispatch(request:NextRequest,method:string,path:string[]):Promise<NextResponse> {
  if(path.join('/')==='health' && method==='GET') return json({configured:{supabase:!!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),gmail:!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.EMAIL_SENDER),emailTestRecipients:(process.env.EMAIL_TEST_ALLOWLIST||'').split(',').filter(Boolean).length},emailMode:emailMode()});
  const user=await identity(request), db=serviceDb();
  if(path.join('/')==='me' && method==='GET') return json({user});

  if(path[0]==='observations' && method==='GET') {
    if(path.length===1) {
      const b=bbox(request.nextUrl.searchParams.get('bbox'));
      const q=await db.from('observations').select('id,type,lon,lat,source_name,source_product_id,source_asset_ids,source_url,observed_start,observed_end,processed_at,published_at,native_resolution,output_resolution,algorithm_version,quality_flags,coverage_fraction,metrics,limitations,state,manifest').eq('state','published').order('observed_end',{ascending:false}).limit(100);
      return json({items:dataOrThrow(q.data,q.error,'Observasi')?.filter(x=>inBbox(x.lon,x.lat,b))||[]});
    }
    const q=await db.from('observations').select('*').eq('id',path[1]).eq('state','published').maybeSingle();
    assertDb(q.error,'Observasi'); if(!q.data) throw new ApiError(404,'not_found','Observasi tidak ditemukan.');
    const manifest={...(q.data.manifest||{})};
    for(const [kind,key] of Object.entries((manifest.artifact_keys||{}) as Record<string,string>)) {
      const signed=await db.storage.from('analysis-artifacts').createSignedUrl(key,300);
      if(!signed.error) manifest[`${kind}_url`]=signed.data.signedUrl;
    }
    return json({item:{...q.data,manifest}});
  }
  if(path[0]==='environment-cells' && method==='GET') {
    const b=bbox(request.nextUrl.searchParams.get('bbox'));
    const q=await db.from('environment_cells').select('id,lon,lat,observed_start,observed_end,source_asset_ids,sst_c,chlorophyll_mg_m3,front_rank,chlorophyll_component,index_score,algorithm_version,resolution,quality_flags,exclusion,zoning_verified,published_at').order('observed_end',{ascending:false}).limit(200);
    const counts=await db.rpc('cell_presence_counts',{p_viewer:user.id});assertDb(counts.error,'Jumlah peserta');
    const countMap=new Map((counts.data||[]).map((x:{cell_id:string,participant_count:number})=>[x.cell_id,Number(x.participant_count)]));
    const items=(dataOrThrow(q.data,q.error,'Sel lingkungan')||[]).filter(x=>inBbox(x.lon,x.lat,b)).map(x=>({...x,participantCount:countMap.get(x.id)||0,currentScore:!x.exclusion && x.index_score!==null && Date.now()-Date.parse(x.observed_end)<=7*86400000 ? x.index_score:null,legalNote:x.zoning_verified?null:'Aturan penangkapan di lokasi ini belum diverifikasi'}));
    return json({items,unavailableReason:items.length?'': 'Skor belum tersedia: SST dan klorofil-a yang cocok belum diproses.'});
  }
  if(path.join('/')==='data-health' && method==='GET') {
    const q=await db.from('analysis_runs').select('*').order('started_at',{ascending:false}).limit(30);
    if(user.role==='fisherman') return json({sources:(q.data||[]).map(x=>({source_name:x.source_name,status:x.status,latest_check_at:x.latest_check_at,latest_usable_observation_at:x.latest_usable_observation_at})),message:q.data?.length?'':'Belum ada pemeriksaan sumber yang dipublikasikan.'});
    return json({runs:dataOrThrow(q.data,q.error,'Kesehatan data')});
  }
  if(path[0]==='trips') {
    if(method==='GET' && path.length===1) {
      const q=await db.from('trips').select('id,client_id,started_at,ended_at,status').eq('owner_id',user.id).order('started_at',{ascending:false}).limit(50);
      return json({items:dataOrThrow(q.data,q.error,'Perjalanan')});
    }
    if(method==='POST' && path.length===1) {
      const input=await body(request,z.object({clientId:uuid,startedAt:z.string()}));
      const startedAt=timestamp(input.startedAt);
      const q=await db.from('trips').upsert({owner_id:user.id,client_id:input.clientId,started_at:startedAt},{onConflict:'owner_id,client_id',ignoreDuplicates:true}).select('id,client_id,started_at,ended_at,status');
      assertDb(q.error,'Mulai perjalanan');
      const existing=q.data?.[0] || dataOrThrow((await db.from('trips').select('id,client_id,started_at,ended_at,status').eq('owner_id',user.id).eq('client_id',input.clientId).single()).data,null,'Perjalanan');
      return json({item:existing},201);
    }
    const q=await db.from('trips').select('*').eq('id',path[1]).maybeSingle(); assertDb(q.error,'Perjalanan');
    if(!q.data) throw new ApiError(404,'not_found','Perjalanan tidak ditemukan.'); ensureOwner(q.data.owner_id,user.id);
    if(method==='GET' && path.length===2) {
      const points=await db.from('trip_points').select('client_id,lon,lat,recorded_at,accuracy_m,quality').eq('trip_id',path[1]).order('recorded_at',{ascending:true}).limit(1000);
      return json({item:q.data,points:dataOrThrow(points.data,points.error,'Titik perjalanan')});
    }
    if(method==='POST' && path[2]==='points') {
      if(q.data.status!=='active') throw new ApiError(409,'trip_ended','Perjalanan telah berhenti.');
      const input=await body(request,z.object({points:z.array(tripPointSchema).min(1).max(30)}));
      const rows=input.points.map(p=>{validPilotPoint(p.lon,p.lat);return {trip_id:path[1],client_id:p.clientId,lon:p.lon,lat:p.lat,recorded_at:timestamp(p.recordedAt),accuracy_m:p.accuracyM,quality:p.gap?'gap':p.accuracyM>100?'uncertain':'accepted'};});
      const inserted=await db.from('trip_points').upsert(rows,{onConflict:'trip_id,client_id',ignoreDuplicates:true}); assertDb(inserted.error,'Titik perjalanan');
      return json({accepted:rows.length});
    }
    if(method==='POST' && path[2]==='stop') {
      if(q.data.status==='active') { const stopped=await db.from('trips').update({status:'ended',ended_at:new Date().toISOString()}).eq('id',path[1]).eq('status','active');assertDb(stopped.error,'Berhenti perjalanan'); }
      await db.from('shared_presence').delete().eq('user_id',user.id);
      return json({stopped:true});
    }
  }
  if(path[0]==='presence') {
    if(method==='GET') {
      if(user.role!=='fisherman' && !user.isAnonymous) return json({items:[],expiresAfterSeconds:180,reviewerNote:'Peninjau melihat kepadatan agregat per sel, bukan penanda nelayan perorangan.'});
      const b=bbox(request.nextUrl.searchParams.get('bbox'));
      const cutoff=new Date(Date.now()-180000).toISOString();
      const q=await db.from('shared_presence').select('user_id,pseudonym,approximate_lon,approximate_lat,heartbeat_at').eq('sharing_enabled',true).gte('heartbeat_at',cutoff).limit(200);
      assertDb(q.error,'Posisi bersama');
      return json({items:(q.data||[]).filter(x=>presenceIsFresh(x.heartbeat_at,Date.now())&&inBbox(x.approximate_lon,x.approximate_lat,b)).map(x=>({pseudonym:x.pseudonym,lon:x.approximate_lon,lat:x.approximate_lat,lastSeenAt:x.heartbeat_at,isSelf:x.user_id===user.id})),expiresAfterSeconds:180});
    }
    if(method==='DELETE') { await db.from('shared_presence').delete().eq('user_id',user.id);return json({sharing:false}); }
    if(method==='POST') {
      const input=await body(request,z.object({tripId:uuid,lon:z.number(),lat:z.number(),recordedAt:z.string(),accuracyM:z.number().min(0).max(1000)}));
      validPilotPoint(input.lon,input.lat);
      const age=Date.now()-Date.parse(input.recordedAt);
      if(!Number.isFinite(age)||age< -30000||age>120000) throw new ApiError(422,'stale_location','Perlu lokasi baru untuk berbagi.');
      const trip=await db.from('trips').select('owner_id,status').eq('id',input.tripId).maybeSingle();assertDb(trip.error,'Perjalanan');
      if(!trip.data || trip.data.owner_id!==user.id || trip.data.status!=='active') throw new ApiError(403,'trip_forbidden','Perjalanan aktif milik akun ini diperlukan.');
      const snapped=snap250(input.lon,input.lat);
      const write=await db.from('shared_presence').upsert({user_id:user.id,trip_id:input.tripId,pseudonym:`Nelayan-${user.id.slice(0,6)}`,approximate_lon:snapped.lon,approximate_lat:snapped.lat,heartbeat_at:new Date().toISOString(),sharing_enabled:true});assertDb(write.error,'Berbagi posisi');
      return json({sharing:true,approximatePosition:snapped,expiresAfterSeconds:180});
    }
  }
  if(path[0]==='reports') {
    if(method==='GET' && path.length===1) {
      const q=await db.from('reports').select('id,client_id,category,lon,lat,observed_at,description,status,reviewer_note_public,created_at,submitted_at').eq('author_id',user.id).order('created_at',{ascending:false}).limit(100);
      return json({items:dataOrThrow(q.data,q.error,'Laporan')});
    }
    if(method==='POST' && path.length===1) {
      const x=await body(request,reportSchema);validPilotPoint(x.lon,x.lat);
      const existing=await db.from('reports').select('*').eq('author_id',user.id).eq('client_id',x.clientId).maybeSingle();assertDb(existing.error,'Laporan');
      if(existing.data) return json({item:existing.data,alreadyExisted:true});
      const areaId=await pilotAreaId();
      const count=await db.from('reports').select('id',{count:'exact',head:true}).eq('author_id',user.id).gte('created_at',new Date(Date.now()-3600000).toISOString());
      if((count.count||0)>=10) throw new ApiError(429,'report_rate_limit','Batas sepuluh laporan per jam tercapai.');
      const q=await db.from('reports').insert({author_id:user.id,client_id:x.clientId,area_id:areaId,category:x.category,lon:x.lon,lat:x.lat,location_method:x.locationMethod,accuracy_m:x.accuracyM,observed_at:timestamp(x.observedAt),description:x.description,text_only_reason:x.textOnlyReason,status:'pending_upload'}).select('*').single();
      assertDb(q.error,'Buat laporan');return json({item:q.data},201);
    }
    const q=await db.from('reports').select('*').eq('id',path[1]).maybeSingle();assertDb(q.error,'Laporan');
    if(!q.data) throw new ApiError(404,'not_found','Laporan tidak ditemukan.');
    const isOwner=q.data.author_id===user.id;
    if(!isOwner) await reviewer(user,q.data.area_id);
    if(method==='GET' && path.length===2) {
      const m=await db.from('report_media').select('id,mime,size_bytes,upload_status,created_at').eq('report_id',path[1]);
      const f=await db.from('field_validations').select('*').eq('report_id',path[1]).maybeSingle();
      const link=await db.from('case_evidence').select('case_id').eq('report_id',path[1]).maybeSingle();
      const followUp=link.data?.case_id ? await db.from('cases').select('status,public_note,updated_at').eq('id',link.data.case_id).maybeSingle() : null;
      return json({item:q.data,media:dataOrThrow(m.data,m.error,'Foto'),fieldValidation:f.data,followUp:followUp?.data||null});
    }
    if(method==='POST' && path[2]==='media') {
      if(!isOwner || q.data.status!=='pending_upload') throw new ApiError(403,'report_locked','Hanya penulis dapat melengkapi laporan yang belum dikirim.');
      const form=await request.formData(), file=form.get('file'), clientId=form.get('clientId');
      if(!(file instanceof File) || typeof clientId!=='string' || !uuid.safeParse(clientId).success) throw new ApiError(422,'invalid_media','Foto atau ID foto tidak valid.');
      const old=await db.from('report_media').select('id').eq('report_id',path[1]).eq('client_id',clientId).maybeSingle();
      if(old.data) return json({item:old.data,alreadyExisted:true});
      const count=await db.from('report_media').select('id',{count:'exact',head:true}).eq('report_id',path[1]);
      if((count.count||0)>=3) throw new ApiError(422,'photo_limit','Maksimal tiga foto.');
      if(file.size>5000000) throw new ApiError(422,'photo_too_large','Foto awal maksimal 5 MB.');
      let output:Buffer;
      try { output=await sharp(Buffer.from(await file.arrayBuffer()),{failOn:'error'}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer(); }
      catch { throw new ApiError(422,'invalid_image','Isi berkas bukan gambar yang didukung.'); }
      if(output.length>1500000) throw new ApiError(422,'photo_too_large','Foto hasil kompresi masih lebih dari 1,5 MB.');
      const storagePath=`${user.id}/${path[1]}/${clientId}.jpg`;
      const upload=await db.storage.from('report-media').upload(storagePath,output,{contentType:'image/jpeg',upsert:false});
      if(upload.error && !upload.error.message.includes('already exists')) throw new ApiError(500,'upload_failed','Unggah foto gagal.',true);
      const saved=await db.from('report_media').upsert({report_id:path[1],client_id:clientId,storage_path:storagePath,mime:'image/jpeg',size_bytes:output.length,upload_status:'complete'},{onConflict:'report_id,client_id',ignoreDuplicates:true}).select('id');assertDb(saved.error,'Simpan foto');
      return json({item:saved.data?.[0]||null},201);
    }
    if(method==='GET' && path[2]==='media' && path[3]) {
      const m=await db.from('report_media').select('storage_path').eq('id',path[3]).eq('report_id',path[1]).maybeSingle();assertDb(m.error,'Foto');if(!m.data) throw new ApiError(404,'not_found','Foto tidak ditemukan.');
      const signed=await db.storage.from('report-media').createSignedUrl(m.data.storage_path,60);assertDb(signed.error,'Tautan foto');
      return json({url:signed.data!.signedUrl,expiresInSeconds:60});
    }
    if(method==='POST' && path[2]==='submit') {
      if(!isOwner) throw new ApiError(403,'owner_forbidden','Hanya penulis dapat mengirim laporan.');
      if(q.data.status!=='pending_upload') return json({item:q.data,alreadySubmitted:true});
      const input=await body(request,z.object({expectedRevision:z.number().int().positive()}));
      if(input.expectedRevision!==q.data.revision) throw new ApiError(409,'revision_conflict','Laporan telah berubah. Muat ulang.');
      const count=await db.from('report_media').select('id',{count:'exact',head:true}).eq('report_id',path[1]).eq('upload_status','complete');
      if(!count.count && !q.data.text_only_reason) throw new ApiError(422,'photo_required','Tambahkan foto atau alasan laporan teks saja.');
      const submitted=await db.from('reports').update({status:'submitted',submitted_at:new Date().toISOString(),revision:q.data.revision+1}).eq('id',path[1]).eq('status','pending_upload').eq('revision',input.expectedRevision).select('*');assertDb(submitted.error,'Kirim laporan');
      if(!submitted.data?.length) throw new ApiError(409,'revision_conflict','Laporan telah dikirim dari perangkat lain.');
      return json({item:submitted.data[0]});
    }
  }
  if(path[0]==='field-evidence' && method==='POST') {
    const x=await body(request,z.object({reportId:uuid,observationId:uuid,stance:z.enum(['similar','not_observed','cannot_assess'])}));
    const r=await db.from('reports').select('author_id,lon,lat,observed_at,status').eq('id',x.reportId).single();assertDb(r.error,'Laporan');if(r.data!.author_id!==user.id || r.data!.status==='pending_upload') throw new ApiError(403,'report_forbidden','Kirim laporan sendiri terlebih dahulu.');
    const o=await db.from('observations').select('lon,lat,observed_end').eq('id',x.observationId).eq('state','published').single();assertDb(o.error,'Observasi');
    const rad=Math.PI/180, a=Math.sin((r.data!.lat-o.data!.lat)*rad/2)**2+Math.cos(r.data!.lat*rad)*Math.cos(o.data!.lat*rad)*Math.sin((r.data!.lon-o.data!.lon)*rad/2)**2;
    const distance=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    const time=Math.abs(Date.parse(r.data!.observed_at)-Date.parse(o.data!.observed_end))/3600000;
    const saved=await db.from('field_validations').upsert({report_id:x.reportId,observation_id:x.observationId,stance:x.stance,distance_m:distance,time_separation_hours:time},{onConflict:'report_id',ignoreDuplicates:true}).select('*');assertDb(saved.error,'Pengamatan lapangan');
    return json({item:saved.data?.[0]||null},201);
  }
  if(path[0]==='cases') {
    if(method==='GET' && path.length===1) {
      if(user.role==='fisherman') throw new ApiError(403,'role_forbidden','Akses peninjau diperlukan.');
      const q=await db.from('cases').select('*').order('updated_at',{ascending:false}).limit(100);assertDb(q.error,'Kasus');
      const items=[];for(const item of q.data||[]) { try { await reviewer(user,item.area_id);items.push(item); } catch {/* other area */} }
      return json({items});
    }
    const c=await db.from('cases').select('*').eq('id',path[1]).maybeSingle();assertDb(c.error,'Kasus');if(!c.data) throw new ApiError(404,'not_found','Kasus tidak ditemukan.');await reviewer(user,c.data.area_id);
    if(method==='GET' && path.length===2) {
      const staleBefore=new Date(Date.now()-120000).toISOString();
      const stale=await db.from('email_outbox').update({state:'unknown',error_code:'stale_sending_requires_reconciliation'}).eq('case_id',path[1]).eq('state','sending').lt('last_attempt_at',staleBefore).select('id');
      assertDb(stale.error,'Pulihkan status email');
      for(const row of stale.data||[]) await db.from('audit_events').insert({actor_id:user.id,entity_type:'case',entity_id:path[1],action:'email_send_state_unknown',metadata:{outbox_id:row.id}});
      const e=await db.from('case_evidence').select('*').eq('case_id',path[1]);assertDb(e.error,'Bukti kasus');
      const reports=[] as unknown[], observations=[] as unknown[];
      for(const item of e.data||[]) {
        if(item.report_id) { const r=await db.from('reports').select('*').eq('id',item.report_id).single();if(r.data) reports.push(r.data); }
        if(item.observation_id) { const o=await db.from('observations').select('*').eq('id',item.observation_id).single();if(o.data) observations.push(o.data); }
      }
      const outbox=await db.from('email_outbox').select('id,case_revision,recipient_address,sender,subject,body,content_hash,state,provider_message_id,attempts,error_code,created_at').eq('case_id',path[1]).order('created_at',{ascending:false});
      const audit=await db.from('audit_events').select('*').eq('entity_type','case').eq('entity_id',path[1]).order('created_at',{ascending:false});
      return json({item:c.data,evidence:e.data,reports,observations,outbox:outbox.data||[],audit:audit.data||[]});
    }
    if(method==='PATCH' && path.length===2) {
      const x=await body(request,z.object({expectedRevision:z.number().int().positive(),status:z.enum(statuses),priority:z.enum(['routine','priority_review','urgent_review']),publicNote:z.string().max(2000).optional(),privateNote:z.string().max(4000).optional(),reason:z.string().min(3).max(1000)}));
      if(c.data.revision!==x.expectedRevision) throw new ApiError(409,'revision_conflict','Kasus telah berubah. Muat ulang.');
      if(['resolved','closed_without_resolution'].includes(x.status) && !x.reason.trim()) throw new ApiError(422,'reason_required','Alasan penutupan diperlukan.');
      const q=await db.from('cases').update({status:x.status,priority:x.priority,public_note:x.publicNote,private_note:x.privateNote,revision:x.expectedRevision+1,updated_at:new Date().toISOString()}).eq('id',path[1]).eq('revision',x.expectedRevision).select('*');assertDb(q.error,'Perbarui kasus');
      if(!q.data?.length) throw new ApiError(409,'revision_conflict','Kasus telah berubah.');
      await db.from('audit_events').insert({actor_id:user.id,entity_type:'case',entity_id:path[1],action:'review_update',reason:x.reason,metadata:{from:c.data.status,to:x.status,revision:q.data[0].revision}});
      const links=await db.from('case_evidence').select('report_id').eq('case_id',path[1]).not('report_id','is',null);
      assertDb(links.error,'Bukti laporan');
      const reportStatus=x.status==='new'?'submitted':x.status==='resolved'||x.status==='closed_without_resolution'?'closed':'under_review';
      for(const link of links.data||[]) {
        if(!link.report_id) continue;
        const updated=await db.from('reports').update({status:reportStatus,reviewer_note_public:x.publicNote||null}).eq('id',link.report_id);
        assertDb(updated.error,'Tindak lanjut laporan');
      }
      return json({item:q.data[0]});
    }
    if(method==='POST' && path[2]==='email-preview') {
      const x=await body(request,z.object({recipientId:uuid}));
      if(c.data.status!=='ready_for_referral') throw new ApiError(409,'case_not_ready','Tandai kasus siap dirujuk sebelum membuat email.');
      const recipient=await db.from('agency_recipients').select('*').eq('id',x.recipientId).eq('enabled',true).single();assertDb(recipient.error,'Penerima');
      if(!allowedRecipient(recipient.data!.address,!!recipient.data!.verified_at,recipient.data!.is_test)) throw new ApiError(403,'recipient_not_approved','Alamat belum disetujui untuk mode email ini.');
      const ev=await db.from('case_evidence').select('report_id,observation_id').eq('case_id',path[1]);
      const lines=[`Kasus Nakhoda: ${c.data.title}`,`ID kasus: ${c.data.id}`,`Kategori: ${c.data.category}`,`Status: ${c.data.status}`,`Prioritas tinjauan: ${c.data.priority}`,''];
      let hasOptical=false,hasHeat=false,hasField=false,qualityGood=true;
      for(const item of ev.data||[]) {
        if(item.report_id) {
          const r=await db.from('reports').select('id,lon,lat,observed_at,description,category').eq('id',item.report_id).single();
          if(r.data) { const approx=snap250(r.data.lon,r.data.lat);lines.push(`Laporan ${r.data.id}: ${safeDate(r.data.observed_at)} WIB, sekitar ${approx.lat.toFixed(3)}, ${approx.lon.toFixed(3)}. ${r.data.description}`); }
          const f=await db.from('field_validations').select('stance').eq('report_id',item.report_id).maybeSingle();hasField ||=!!f.data;
        }
        if(item.observation_id) {
          const o=await db.from('observations').select('id,type,source_name,source_product_id,source_asset_ids,observed_start,observed_end,limitations,quality_flags,state').eq('id',item.observation_id).single();
          if(o.data) { hasOptical ||=o.data.type==='optical_change';hasHeat ||=o.data.type==='heat_stress';qualityGood &&= o.data.state==='published';lines.push(`Observasi ${o.data.id}: ${o.data.source_name} / ${o.data.source_product_id}, ${safeDate(o.data.observed_start)}–${safeDate(o.data.observed_end)} WIB. ID sumber: ${o.data.source_asset_ids.join(', ')}. Batasan: ${o.data.limitations}`); }
        }
      }
      const rec=recommendation(c.data.category,hasOptical,hasField,hasHeat,qualityGood);
      lines.push('',`Saran tinjauan (${PLAYBOOK_VERSION}, aturan ${rec.rule}): ${rec.text}`,'',`Catatan peninjau: ${c.data.public_note||'Belum ada.'}`,'','Bukti satelit dan laporan lapangan memerlukan penilaian; perbedaan optik tidak membuktikan kerusakan karang. Balasan/konfirmasi lembaga dicatat terpisah dari penerimaan Gmail.','Email ini berasal dari tim pilot Nakhoda, bukan pernyataan resmi lembaga.');
      const subject=`${emailMode()==='test'?'[DEMO] ':''}Nakhoda — ${c.data.title} (${c.data.id.slice(0,8)})`;
      const text=lines.join('\n'),sender=process.env.EMAIL_SENDER||'';
      if(!sender) throw new ApiError(503,'gmail_unconfigured','Alamat pengirim belum dikonfigurasi.');
      const hash=contentHash(subject,text,recipient.data!.address);
      const old=await db.from('email_outbox').select('*').eq('case_id',path[1]).eq('case_revision',c.data.revision).eq('recipient_id',x.recipientId).maybeSingle();
      if(old.data) {if(old.data.content_hash!==hash) throw new ApiError(409,'preview_conflict','Isi email pada revisi ini telah berubah. Perbarui kasus dahulu.');return json({preview:old.data});}
      const out=await db.from('email_outbox').insert({case_id:path[1],case_revision:c.data.revision,recipient_id:x.recipientId,sender,recipient_address:recipient.data!.address,subject,body:text,content_hash:hash,state:'draft'}).select('*').single();assertDb(out.error,'Pratinjau email');
      return json({preview:out.data});
    }
    if(method==='POST' && path[2]==='email-send') {
      const x=await body(request,z.object({outboxId:uuid,contentHash:z.string().length(64)}));
      const o=await db.from('email_outbox').select('*').eq('id',x.outboxId).eq('case_id',path[1]).single();assertDb(o.error,'Kotak keluar');
      if(o.data!.state==='provider_accepted') return json({item:o.data,alreadySent:true});
      if(o.data!.state!=='draft' && o.data!.state!=='failed') throw new ApiError(409,'send_state_conflict','Status email perlu ditinjau sebelum dikirim ulang.');
      if(o.data!.case_revision!==c.data.revision || o.data!.content_hash!==x.contentHash || c.data.status!=='ready_for_referral') throw new ApiError(409,'preview_stale','Pratinjau tidak cocok dengan revisi kasus saat ini.');
      const recipient=await db.from('agency_recipients').select('*').eq('id',o.data!.recipient_id).single();assertDb(recipient.error,'Penerima');
      if(!recipient.data!.enabled || !allowedRecipient(o.data!.recipient_address,!!recipient.data!.verified_at,recipient.data!.is_test)) throw new ApiError(403,'recipient_not_approved','Penerima tidak lagi disetujui.');
      const count=await db.from('email_outbox').select('id',{count:'exact',head:true}).eq('approved_by',user.id).gte('last_attempt_at',new Date(Date.now()-3600000).toISOString());
      if((count.count||0)>=5) throw new ApiError(429,'email_rate_limit','Batas lima email per jam tercapai.');
      const lock=await db.from('email_outbox').update({state:'sending',approved_by:user.id,approved_at:new Date().toISOString(),attempts:o.data!.attempts+1,last_attempt_at:new Date().toISOString(),error_code:null}).eq('id',x.outboxId).eq('state',o.data!.state).select('*');assertDb(lock.error,'Kunci email');
      if(!lock.data?.length) throw new ApiError(409,'send_in_progress','Email sedang dikirim dari sesi lain.');
      await db.from('audit_events').insert({actor_id:user.id,entity_type:'case',entity_id:path[1],action:'email_approved',metadata:{outbox_id:x.outboxId,recipient:o.data!.recipient_address,hash:x.contentHash}});
      try {
        const messageId=await sendGmail(o.data!.recipient_address,o.data!.subject,o.data!.body);
        const saved=await db.from('email_outbox').update({state:'provider_accepted',provider_message_id:messageId}).eq('id',x.outboxId).eq('state','sending').select('*');assertDb(saved.error,'Status Gmail');
        await db.from('audit_events').insert({actor_id:user.id,entity_type:'case',entity_id:path[1],action:'gmail_provider_accepted',metadata:{outbox_id:x.outboxId,message_id:messageId}});
        return json({item:saved.data?.[0],receipt:'Gmail menerima pesan; pengiriman ke kotak masuk belum terverifikasi.'});
      } catch(error) {
        const code=error instanceof ApiError?error.code:'gmail_send_unknown';
        const state=code==='gmail_send_unknown'?'unknown':'failed';
        await db.from('email_outbox').update({state,error_code:code}).eq('id',x.outboxId).eq('state','sending');
        throw error;
      }
    }
  }
  if(path.join('/')==='admin/recipients') {
    if(user.role!=='admin') throw new ApiError(403,'admin_required','Administrator diperlukan.');
    if(method==='GET') { const q=await db.from('agency_recipients').select('*').order('created_at',{ascending:false});return json({items:dataOrThrow(q.data,q.error,'Penerima')}); }
    if(method==='POST') {
      const x=await body(request,z.object({address:z.email(),isTest:z.boolean(),verificationSource:z.string().max(500).optional()}));
      if(!x.isTest && !x.verificationSource) throw new ApiError(422,'verification_required','Sumber verifikasi alamat resmi diperlukan.');
      const q=await db.from('agency_recipients').insert({address:x.address.toLowerCase(),is_test:x.isTest,verification_source:x.verificationSource||'team-controlled test inbox',verified_at:new Date().toISOString(),verified_by:user.id,enabled:true}).select('*').single();assertDb(q.error,'Tambah penerima');return json({item:q.data},201);
    }
  }
  if(path.join('/')==='admin/roles' && method==='POST') {
    if(user.role!=='admin') throw new ApiError(403,'admin_required','Administrator diperlukan.');
    const x=await body(request,z.object({userId:uuid,role:z.enum(['fisherman','reviewer','admin'])}));
    const profile=await db.from('profiles').select('id').eq('id',x.userId).maybeSingle();assertDb(profile.error,'Profil');
    if(!profile.data) throw new ApiError(404,'not_found','Pengguna tidak ditemukan.');
    const changed=await db.from('profiles').update({role:x.role}).eq('id',x.userId);assertDb(changed.error,'Tetapkan peran');
    const areaId=await pilotAreaId();
    if(x.role==='reviewer') { const membership=await db.from('area_memberships').upsert({user_id:x.userId,area_id:areaId},{onConflict:'user_id,area_id'});assertDb(membership.error,'Area peninjau'); }
    else await db.from('area_memberships').delete().eq('user_id',x.userId);
    await db.from('audit_events').insert({actor_id:user.id,entity_type:'profile',entity_id:x.userId,action:'role_assigned',metadata:{role:x.role,area_id:areaId}});
    return json({assigned:true});
  }
  if(path.join('/')==='recipients' && method==='GET') {
    if(user.role==='fisherman') throw new ApiError(403,'role_forbidden','Akses peninjau diperlukan.');
    const q=await db.from('agency_recipients').select('id,address,is_test,verified_at,enabled').eq('enabled',true);
    return json({items:(dataOrThrow(q.data,q.error,'Penerima')||[]).filter(x=>allowedRecipient(x.address,!!x.verified_at,x.is_test))});
  }
  throw new ApiError(404,'route_not_found','Rute tidak ditemukan.');
}
