import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { z } from 'zod';
import { ApiError, assertDb, bbox, failure, identity, inBbox, json, pilotAreaId, reviewer, serviceDb, timestamp, validPilotPoint } from './server';
import { snap250, presenceIsFresh } from './geo';
import { OPEN_STATUSES, REVIEW_ACTIONS, problemCell } from './review';
import { caseReviewSchema } from './case-review';

const uuid=z.string().uuid();
const reportSchema=z.object({clientId:uuid,category:z.enum(['coral_concern','mangrove_damage','shoreline_erosion','marine_waste','water_pollution','other']),lon:z.number(),lat:z.number(),locationMethod:z.enum(['gps','manual']),accuracyM:z.number().nonnegative().optional(),observedAt:z.string(),description:z.string().min(10).max(4000),textOnlyReason:z.string().max(500).optional()});
const tripPointSchema=z.object({clientId:uuid,lon:z.number(),lat:z.number(),recordedAt:z.string(),accuracyM:z.number().min(0).max(100000),gap:z.boolean().optional()});

async function body<T extends z.ZodTypeAny>(request:NextRequest,schema:T):Promise<z.infer<T>> {
  let parsed:unknown;
  try { parsed=await request.json(); } catch { throw new ApiError(422,'invalid_json','Isi permintaan bukan JSON yang valid.'); }
  const result=schema.safeParse(parsed);
  if (!result.success) throw new ApiError(422,'invalid_input',result.error.issues.map(x=>x.path.join('.')+': '+x.message).join('; '));
  return result.data;
}
function dataOrThrow<T>(data:T,error:{message:string}|null,context:string):T { assertDb(error,context); return data; }
function ensureOwner(owner:string,user:string) { if(owner!==user) throw new ApiError(403,'owner_forbidden','Hanya pemilik yang dapat mengakses data ini.'); }

export async function handleApi(request:NextRequest,method:string,path:string[]):Promise<NextResponse> {
  try { return await dispatch(request,method,path); } catch(error) { return failure(error); }
}

async function dispatch(request:NextRequest,method:string,path:string[]):Promise<NextResponse> {
  if(path.join('/')==='health' && method==='GET') return json({configured:{supabase:!!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}});
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
    const link=await db.from('case_evidence').select('case_id').eq('observation_id',q.data.id).limit(1).maybeSingle();
    assertDb(link.error,'Penilaian observasi');
    const review=link.data?await db.from('cases').select('status,priority,public_note,updated_at').eq('id',link.data.case_id).maybeSingle():null;
    if(review)assertDb(review.error,'Catatan untuk nelayan');
    return json({item:{...q.data,manifest},review:review?.data||null});
  }
  if(path[0]==='environment-cells' && method==='GET') {
    const b=bbox(request.nextUrl.searchParams.get('bbox'));
    const columns='id,lon,lat,observed_start,observed_end,source_asset_ids,sst_c,chlorophyll_mg_m3,front_rank,chlorophyll_component,index_score,algorithm_version,resolution,quality_flags,exclusion,zoning_verified,published_at';
    const [completed,coarse]=await Promise.all([
      db.from('analysis_runs').select('counts').eq('source_name','Copernicus Marine + CDSE Sentinel-3').eq('status','success').order('latest_published_result_at',{ascending:false}).limit(1),
      db.from('environment_cells').select(columns).not('algorithm_version','like','environment-index-highres-%').order('observed_end',{ascending:false}).order('published_at',{ascending:false}).limit(1),
    ]);
    assertDb(completed.error,'Publikasi sel detail');assertDb(coarse.error,'Sel lingkungan');
    const manifest=completed.data?.[0]?.counts as {observed_end?:string;algorithm_version?:string;source_asset_ids?:string[]}|undefined;
    const highres=manifest?.observed_end && ['environment-index-highres-v0.1','environment-index-highres-v0.2'].includes(manifest.algorithm_version||'') && Array.isArray(manifest.source_asset_ids)
      ? await db.from('environment_cells').select(columns).eq('observed_end',manifest.observed_end).eq('algorithm_version',manifest.algorithm_version).contains('source_asset_ids',manifest.source_asset_ids).limit(1)
      : null;
    if(highres) assertDb(highres.error,'Sel detail');
    const fine=highres?.data?.[0];
    type EnvironmentRow=NonNullable<typeof fine>;
    const readBatch=async(latest:EnvironmentRow|undefined)=>{
      if(!latest)return [];
      const age=Date.now()-Date.parse(latest.observed_start),endAge=Date.now()-Date.parse(latest.observed_end);
      if(!Number.isFinite(age)||age<0||age>7*86400000||!Number.isFinite(endAge)||endAge<0)return [];
      const rows:EnvironmentRow[]=[];
      for(let offset=0;offset<6000;offset+=1000){
        const q=await db.from('environment_cells').select(columns)
          .eq('observed_end',latest.observed_end).eq('algorithm_version',latest.algorithm_version)
          .contains('source_asset_ids',latest.source_asset_ids)
          .gte('lon',b[0]-.025).lte('lon',b[2]+.025).gte('lat',b[1]-.025).lte('lat',b[3]+.025)
          .order('id',{ascending:true}).range(offset,offset+999);
        const page=dataOrThrow(q.data,q.error,'Sel lingkungan')||[];
        rows.push(...page.filter(x=>JSON.stringify(x.source_asset_ids)===JSON.stringify(latest.source_asset_ids)));
        if(page.length<1000)break;
        if(offset===5000)throw new ApiError(503,'too_many_cells','Jumlah sel melebihi batas tampilan pilot.');
      }
      return rows.map(x=>({...x,currentScore:!x.exclusion&&x.index_score!==null?x.index_score:null,legalNote:x.zoning_verified?null:'Aturan penangkapan di lokasi ini belum diverifikasi'}));
    };
    const [fineItems,coarseItems]=await Promise.all([readBatch(fine),readBatch(coarse.data?.[0])]);
    const items=fineItems.length?fineItems:coarseItems;
    return json({items,fallbackItems:fineItems.length?coarseItems:[],unavailableReason:items.length?'':'Skor belum tersedia di area ini.'});
  }
  if(path.join('/')==='data-health' && method==='GET') {
    const q=await db.from('analysis_runs').select('id,source_name,status,latest_check_at,latest_usable_observation_at,error_code').order('started_at',{ascending:false}).limit(30);
    if(user.portal==='fisherman') return json({sources:(q.data||[]).map(x=>({source_name:x.source_name,status:x.status,latest_check_at:x.latest_check_at,latest_usable_observation_at:x.latest_usable_observation_at})),message:q.data?.length?'':'Belum ada pemeriksaan sumber yang dipublikasikan.'});
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
      if(user.role!=='fisherman') return json({items:[],expiresAfterSeconds:180,reviewerNote:'Peninjau melihat kepadatan agregat per sel, bukan penanda nelayan perorangan.'});
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
  if(path[0]==='review' && path[1]==='indications' && path[2] && path[3]==='case' && path.length===4 && ['GET','POST'].includes(method)) {
    const areaId=await pilotAreaId();
    await reviewer(user,areaId);
    const o=await db.from('observations').select('id,type,lon,lat,observed_end,area_id').eq('id',path[2]).eq('state','published').maybeSingle();
    assertDb(o.error,'Observasi');
    if(!o.data||o.data.area_id!==areaId) throw new ApiError(404,'not_found','Observasi tidak ditemukan.');
    const existing=await db.from('case_evidence').select('case_id').eq('observation_id',o.data.id).limit(1).maybeSingle();
    assertDb(existing.error,'Kasus');
    if(existing.data){
      const record=await db.from('cases').select('*').eq('id',existing.data.case_id).single();
      assertDb(record.error,'Penilaian');await reviewer(user,record.data!.area_id);
      if(method==='POST')return json({caseId:existing.data.case_id,item:record.data,alreadyExisted:true});
      const audit=await db.from('audit_events').select('id,action,reason,metadata,created_at').eq('entity_type','case').eq('entity_id',existing.data.case_id).in('action',['review_update','created_from_observation','created_from_report']).order('created_at',{ascending:false});
      assertDb(audit.error,'Riwayat penilaian');
      return json({item:record.data,audit:audit.data||[]});
    }
    if(method==='GET')return json({item:null,audit:[]});
    const cell=problemCell(o.data.lon,o.data.lat);
    const created=await db.from('cases').upsert({id:o.data.id,area_id:areaId,category:o.data.type==='heat_stress'?'coral_concern':'satellite_optical_change',title:`Indikasi satelit · sel ${cell.code} · ${o.data.type==='heat_stress'?'panas karang':'perubahan optik'}`,status:'reviewing',recommendation_rule:'manual_review'},{onConflict:'id',ignoreDuplicates:true}).select('*').maybeSingle();
    assertDb(created.error,'Buat kasus');
    const record=created.data?created:await db.from('cases').select('*').eq('id',o.data.id).single();
    assertDb(record.error,'Penilaian');
    const evidence=await db.from('case_evidence').upsert({case_id:record.data!.id,observation_id:o.data.id},{onConflict:'case_id,observation_id',ignoreDuplicates:true});
    assertDb(evidence.error,'Bukti kasus');
    if(created.data){
      const audit=await db.from('audit_events').insert({actor_id:user.id,entity_type:'case',entity_id:record.data!.id,action:'created_from_observation',metadata:{observation_id:o.data.id}});
      assertDb(audit.error,'Riwayat penilaian');
    }
    return json({caseId:record.data!.id,item:record.data,alreadyExisted:!created.data},created.data?201:200);
  }
  if(path[0]==='review' && path[1]==='reports') {
    const areaId=await pilotAreaId();
    await reviewer(user,areaId);
    const fields='id,category,lon,lat,observed_at,submitted_at,status,description,text_only_reason,location_method,accuracy_m,reviewer_note_public,revision';
    if(method==='GET' && path.length===2) {
      const since=new Date(Date.now()-90*86400000).toISOString();
      const [r,o]=await Promise.all([
        db.from('reports').select(fields).eq('area_id',areaId).neq('status','pending_upload').gte('submitted_at',since).order('submitted_at',{ascending:false}).limit(300),
        db.from('observations').select('id,type,lon,lat,observed_start,observed_end,metrics,quality_flags,coverage_fraction').eq('state','published').gte('observed_end',new Date(Date.now()-60*86400000).toISOString()).limit(200),
      ]);
      const items=dataOrThrow(r.data,r.error,'Laporan')||[];
      const media=items.length?await db.from('report_media').select('report_id').in('report_id',items.map(x=>x.id)).eq('upload_status','complete'):{data:[],error:null};
      assertDb(media.error,'Foto');
      const photos=new Map<string,number>();for(const m of media.data||[])photos.set(m.report_id,(photos.get(m.report_id)||0)+1);
      const observations=dataOrThrow(o.data,o.error,'Observasi')||[];
      const links=observations.length?await db.from('case_evidence').select('observation_id,case_id,cases(status)').in('observation_id',observations.map(x=>x.id)):{data:[],error:null};
      assertDb(links.error,'Kasus satelit');
      const followUps=Object.fromEntries((links.data||[]).map(l=>[l.observation_id,{caseId:l.case_id,status:(l.cases as unknown as {status:string}|null)?.status||'new'}]));
      return json({items:items.map(x=>({...x,photoCount:photos.get(x.id)||0})),observations,followUps});
    }
    const q=await db.from('reports').select('*').eq('id',path[2]).maybeSingle();
    assertDb(q.error,'Laporan');
    if(!q.data||q.data.area_id!==areaId||q.data.status==='pending_upload') throw new ApiError(404,'not_found','Laporan tidak ditemukan.');
    const report=q.data;
    if(method==='GET' && path.length===3) {
      const cell=problemCell(report.lon,report.lat),observed=Date.parse(report.observed_at);
      const [m,f,link,near,obs]=await Promise.all([
        db.from('report_media').select('id').eq('report_id',report.id).eq('upload_status','complete'),
        db.from('field_validations').select('stance,distance_m,time_separation_hours,observation_id').eq('report_id',report.id).maybeSingle(),
        db.from('case_evidence').select('case_id').eq('report_id',report.id).maybeSingle(),
        db.from('reports').select('id,category,status,observed_at').eq('area_id',areaId).neq('id',report.id).neq('status','pending_upload').gte('lon',cell.west).lt('lon',cell.east).gte('lat',cell.south).lt('lat',cell.north).gte('observed_at',new Date(observed-60*86400000).toISOString()),
        db.from('observations').select('id,type,lon,lat,observed_end,metrics,source_name').eq('state','published').gte('lon',cell.west-0.05).lte('lon',cell.east+0.05).gte('lat',cell.south-0.05).lte('lat',cell.north+0.05).gte('observed_end',new Date(observed-30*86400000).toISOString()).lte('observed_end',new Date(observed+30*86400000).toISOString()),
      ]);
      const caseId=link.data?.case_id as string|undefined;
      const kase=caseId?await db.from('cases').select('id,status,updated_at').eq('id',caseId).maybeSingle():null;
      const history=await db.from('audit_events').select('entity_type,action,reason,metadata,created_at').in('entity_id',caseId?[report.id,caseId]:[report.id]).order('created_at',{ascending:true}).limit(50);
      const item=Object.fromEntries(Object.entries(report).filter(([k])=>!['author_id','area_id','client_id'].includes(k))); // reviewers never see who reported
      return json({item,cell,media:dataOrThrow(m.data,m.error,'Foto')||[],fieldValidation:f.data,case:kase?.data||null,sameCell:dataOrThrow(near.data,near.error,'Laporan sekitar')||[],observations:dataOrThrow(obs.data,obs.error,'Observasi')||[],history:dataOrThrow(history.data,history.error,'Riwayat')||[]});
    }
    if(method==='POST' && path[3]==='status') {
      const x=await body(request,z.object({status:z.enum(REVIEW_ACTIONS),note:z.string().trim().max(500).optional(),expectedRevision:z.number().int().positive()}));
      if(x.expectedRevision!==report.revision) throw new ApiError(409,'revision_conflict','Laporan telah diubah petugas lain. Muat ulang.');
      const updated=await db.from('reports').update({status:x.status,revision:report.revision+1,...(x.note?{reviewer_note_public:x.note}:{})}).eq('id',report.id).eq('revision',report.revision).select(fields).single();
      assertDb(updated.error,'Ubah status laporan');
      const caseStatus=x.status==='corroborated'?'ready_for_referral':OPEN_STATUSES.includes(x.status)?'reviewing':'closed_without_resolution';
      const link=await db.from('case_evidence').select('case_id').eq('report_id',report.id).maybeSingle();
      // Only move cases that have not progressed past review; a referred case keeps its own lifecycle.
      if(link.data?.case_id) await db.from('cases').update({status:caseStatus,updated_at:new Date().toISOString()}).eq('id',link.data.case_id).in('status',['new','reviewing','ready_for_referral']);
      await db.from('audit_events').insert({actor_id:user.id,entity_type:'report',entity_id:report.id,action:'report_status_changed',reason:x.note||null,metadata:{from:report.status,to:x.status}});
      return json({item:updated.data});
    }
    throw new ApiError(404,'not_found','Rute tidak ditemukan.');
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
      const e=await db.from('case_evidence').select('*').eq('case_id',path[1]);assertDb(e.error,'Bukti kasus');
      const reports=[] as unknown[], observations=[] as unknown[];
      for(const item of e.data||[]) {
        if(item.report_id) { const r=await db.from('reports').select('*').eq('id',item.report_id).single();if(r.data) reports.push(r.data); }
        if(item.observation_id) { const o=await db.from('observations').select('*').eq('id',item.observation_id).single();if(o.data) observations.push(o.data); }
      }
      const audit=await db.from('audit_events').select('*').eq('entity_type','case').eq('entity_id',path[1]).order('created_at',{ascending:false});
      return json({item:c.data,evidence:e.data,reports,observations,audit:audit.data||[]});
    }
    if(method==='PATCH' && path.length===2) {
      const x=await body(request,caseReviewSchema);
      if(c.data.revision!==x.expectedRevision) throw new ApiError(409,'revision_conflict','Kasus telah berubah. Muat ulang.');
      if(['resolved','closed_without_resolution'].includes(x.status) && !x.reason.trim()) throw new ApiError(422,'reason_required','Alasan penutupan diperlukan.');
      const q=await db.from('cases').update({status:x.status,priority:x.priority,public_note:x.publicNote??c.data.public_note,private_note:x.privateNote??c.data.private_note,revision:x.expectedRevision+1,updated_at:new Date().toISOString()}).eq('id',path[1]).eq('revision',x.expectedRevision).select('*');assertDb(q.error,'Perbarui kasus');
      if(!q.data?.length) throw new ApiError(409,'revision_conflict','Kasus telah berubah.');
      const audit=await db.from('audit_events').insert({actor_id:user.id,entity_type:'case',entity_id:path[1],action:'review_update',reason:x.reason,metadata:{from:c.data.status,to:x.status,priority_from:c.data.priority,priority_to:x.priority,revision:q.data[0].revision}});
      assertDb(audit.error,'Riwayat penilaian');
      const links=await db.from('case_evidence').select('report_id').eq('case_id',path[1]).not('report_id','is',null);
      assertDb(links.error,'Bukti laporan');
      const reportStatus=x.status==='new'?'submitted':x.status==='resolved'||x.status==='closed_without_resolution'?'closed':'under_review';
      for(const link of links.data||[]) {
        if(!link.report_id) continue;
        const updated=await db.from('reports').update({status:reportStatus,...(x.publicNote!==undefined?{reviewer_note_public:x.publicNote||null}:{})}).eq('id',link.report_id);
        assertDb(updated.error,'Tindak lanjut laporan');
      }
      return json({item:q.data[0]});
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
  throw new ApiError(404,'route_not_found','Rute tidak ditemukan.');
}
