import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as cases from '../lib/case-review.ts';
import * as review from '../lib/review.ts';

// Exercise the actual API handler against a scripted database; never contact Supabase.
const compiled=ts.transpileModule(fs.readFileSync(new URL('../lib/api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const observationId='11aa71b0-894c-43e4-810d-b891d13643a1',caseId='756af1ee-e37a-4dc1-8378-ee2450091fcf';
const record={id:caseId,area_id:'pilot',status:'reviewing',priority:'routine',revision:2,public_note:'Catatan lama',private_note:'INTERNAL',updated_at:'2026-10-16T00:00:00Z'};
const payload={expectedRevision:2,status:'in_progress',priority:'urgent_review',publicNote:'  Hindari area ini.  ',privateNote:'  Pemeriksaan hari Senin.  ',reason:'  Hasil tinjauan citra.  '};
function harness(steps,{role='reviewer'}={}){
  const calls=[];
  class ApiError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
  const db={from(table){
    const call={table,ops:[]};calls.push(call);
    const finish=()=>{
      const expected=steps.shift();assert.ok(expected,`Unexpected query: ${table}`);assert.equal(table,expected.table);
      expected.check?.(call);
      return {data:expected.data??null,error:expected.error??null};
    };
    const q={then(resolve,reject){return Promise.resolve().then(finish).then(resolve,reject);}};
    for(const method of ['select','eq','in','not','limit','order','update','upsert','insert'])q[method]=(...args)=>{call.ops.push([method,...args]);return q;};
    q.single=q.maybeSingle=()=>Promise.resolve().then(finish);
    return q;
  }};
  const server={
    ApiError,identity:async()=>({id:'officer',role}),serviceDb:()=>db,pilotAreaId:async()=>'pilot',
    reviewer:async()=>{if(role==='fisherman')throw new ApiError(403,'role_forbidden','Akses peninjau diperlukan.');},
    assertDb:(error)=>{if(error)throw new ApiError(500,'database_error',error.message);},
    json:(data,status=200)=>({status,data}),failure:error=>{if(!(error instanceof ApiError))throw error;return {status:error.status,data:{error:{code:error.code,message:error.message}}};},
  };
  const sandboxModule={exports:{}};
  vm.runInNewContext(compiled,{exports:sandboxModule.exports,module:sandboxModule,process:{env:{}},console,Date,
    require(name){if(name==='server-only')return {};if(name==='sharp')return {};if(name==='zod')return {z};if(name==='./server')return server;if(name==='./case-review')return cases;if(name==='./review')return review;if(name==='./geo')return {};throw new Error(`Unexpected import ${name}`);},
  });
  return {calls,async request(method,path,body){const result=await sandboxModule.exports.handleApi({json:async()=>body},method,path.split('/'));assert.equal(steps.length,0,'Every expected query must run');return result;}};
}
import { z } from 'zod';
const op=(call,name)=>call.ops.find(x=>x[0]===name)?.[1];

test('indication review loads without creating a case, and requires reviewer access',async()=>{
  const h=harness([{table:'observations',data:{id:observationId,area_id:'pilot'}},{table:'case_evidence'}]);
  const r=await h.request('GET',`review/indications/${observationId}/case`);
  assert.equal(r.data.item,null);assert.equal(r.data.audit.length,0);
  assert.ok(h.calls.every(c=>!c.ops.some(o=>['upsert','insert','update'].includes(o[0]))));
  assert.equal((await harness([],{role:'fisherman'}).request('GET',`review/indications/${observationId}/case`)).status,403);
});

test('existing indication review loads both notes and audit without email dependencies',async()=>{
  const h=harness([{table:'observations',data:{id:observationId,area_id:'pilot'}},{table:'case_evidence',data:{case_id:caseId}},{table:'cases',data:record},{table:'audit_events',data:[{id:'audit',reason:'Pemeriksaan awal'}]}]);
  const r=await h.request('GET',`review/indications/${observationId}/case`);
  assert.equal(r.data.item.private_note,'INTERNAL');assert.equal(r.data.audit[0].reason,'Pemeriksaan awal');
});

test('saving a review persists the five fields and shares only the public note with linked reports',async()=>{
  const updated={...record,...{status:payload.status,priority:payload.priority,revision:3}};
  const h=harness([
    {table:'cases',data:record},
    {table:'cases',data:[updated],check:c=>{const x=op(c,'update');assert.equal(x.status,'in_progress');assert.equal(x.priority,'urgent_review');assert.equal(x.public_note,'Hindari area ini.');assert.equal(x.private_note,'Pemeriksaan hari Senin.');assert.equal(x.revision,3);assert.ok(c.ops.some(o=>o[0]==='eq'&&o[1]==='revision'&&o[2]===2));}},
    {table:'audit_events',check:c=>{const x=op(c,'insert');assert.equal(x.reason,'Hasil tinjauan citra.');assert.equal(x.metadata.priority_to,'urgent_review');}},
    {table:'case_evidence',data:[{report_id:'report'}]},
    {table:'reports',check:c=>{const x=op(c,'update');assert.equal(x.reviewer_note_public,'Hindari area ini.');assert.equal(x.private_note,undefined);}},
  ]);
  assert.equal((await h.request('PATCH',`cases/${caseId}`,payload)).data.item.revision,3);
});

test('stale revisions and blank change reasons cannot overwrite a case',async()=>{
  assert.equal((await harness([{table:'cases',data:record}]).request('PATCH',`cases/${caseId}`,{...payload,expectedRevision:1})).status,409);
  assert.equal((await harness([{table:'cases',data:record}]).request('PATCH',`cases/${caseId}`,{...payload,reason:'   '})).status,422);
  assert.equal((await harness([{table:'cases',data:record},{table:'cases',data:[]}]).request('PATCH',`cases/${caseId}`,payload)).status,409);
});

test('first review uses an idempotent case key and links the observation',async()=>{
  const created={...record,id:observationId,revision:1};
  const h=harness([
    {table:'observations',data:{id:observationId,area_id:'pilot',type:'optical_change',lon:106.61,lat:-5.87}},
    {table:'case_evidence'},
    {table:'cases',data:created,check:c=>{assert.equal(op(c,'upsert').id,observationId);assert.equal(c.ops.find(x=>x[0]==='upsert')[2].ignoreDuplicates,true);}},
    {table:'case_evidence',check:c=>assert.equal(op(c,'upsert').observation_id,observationId)},
    {table:'audit_events'},
  ]);
  const r=await h.request('POST',`review/indications/${observationId}/case`);
  assert.equal(r.status,201);assert.equal(r.data.item.revision,1);
});

test('fisher observation response queries only public review fields',async()=>{
  const h=harness([
    {table:'observations',data:{id:observationId,manifest:{}}},
    {table:'case_evidence',data:{case_id:caseId}},
    {table:'cases',data:{status:'reviewing',public_note:'Hindari area ini.'},check:c=>assert.equal(op(c,'select'),'status,priority,public_note,updated_at')},
  ],{role:'fisherman'});
  const r=await h.request('GET',`observations/${observationId}`);
  assert.equal(r.data.review.public_note,'Hindari area ini.');assert.equal(r.data.review.private_note,undefined);
});

test('removed email and recipient routes cannot send or prepare mail',async()=>{
  for(const suffix of ['email-send','email-preview'])assert.equal((await harness([{table:'cases',data:record}]).request('POST',`cases/${caseId}/${suffix}`,{})).status,404);
  for(const route of ['recipients','admin/recipients'])assert.equal((await harness([]).request('GET',route)).status,404);
});

test('old case bookmarks resolve to their satellite indication, report, or inbox',()=>{
  assert.equal(cases.caseDestination([{report_id:'report'},{observation_id:observationId}]),`/government/indications/${observationId}`);
  assert.equal(cases.caseDestination([{report_id:'report'}]),'/government/reports/report');
  assert.equal(cases.caseDestination([]),'/government/reports');
});
