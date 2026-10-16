import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import manifest from '../app/manifest.ts';

test('install manifest has real PNGs for both required sizes and scoped standalone launch',async()=>{
  const m=manifest();
  assert.equal(m.id,'/');
  assert.equal(m.scope,'/');
  assert.equal(m.start_url,'/');
  assert.equal(m.display,'standalone');
  assert.equal(m.prefer_related_applications,false);
  for(const size of [192,512]){
    const icon=m.icons.find(icon=>icon.purpose==='any'&&icon.sizes===`${size}x${size}`);
    assert.ok(icon,`missing ${size}px install icon`);
    assert.equal(icon.type,'image/png');
    const meta=await sharp(readFileSync(new URL(`../public${icon.src}`,import.meta.url))).metadata();
    assert.equal(meta.width,size);
    assert.equal(meta.height,size);
    assert.equal(meta.format,'png');
  }
});

test('maskable artwork is opaque and fits the protected circular safe zone',async()=>{
  const icon=manifest().icons.find(icon=>icon.purpose==='maskable');
  assert.ok(icon);
  const file=new URL(`../public${icon.src}`,import.meta.url);
  const {data,info}=await sharp(readFileSync(file)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(info.width,512);
  assert.equal(info.height,512);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const offset=(y*512+x)*4;
    assert.equal(data[offset+3],255);
    if(Math.hypot(x+.5-256,y+.5-256)>512*.4){
      assert.deepEqual([...data.subarray(offset,offset+3)],[11,42,60]);
    }
  }
});

function worker(){
  const handlers=new Map(),stored=new Map(),deleted=[];
  let fetcher=async()=>new Response('online');
  const cache={addAll:async paths=>{for(const path of paths)stored.set(path,new Response(path==='/offline.html'?'offline page':path));}};
  const caches={open:async()=>cache,keys:async()=>['nakhoda-shell-v2','nakhoda-static-v3','other-app-cache'],delete:async key=>{deleted.push(key);return true;},match:async key=>stored.get(typeof key==='string'?key:new URL(key.url).pathname)?.clone()};
  vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{
    self:{location:{origin:'https://nakhoda.test'},addEventListener:(name,fn)=>handlers.set(name,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}},
    caches,URL,Response,fetch:(...args)=>fetcher(...args),
  });
  return {handlers,stored,deleted,setFetch:value=>{fetcher=value;}};
}
async function lifecycle(w,name){let work;w.handlers.get(name)({waitUntil:promise=>{work=promise;}});await work;}

test('service worker installs only existing public fallback assets and retires only its old cache',async()=>{
  const w=worker();
  await lifecycle(w,'install');
  for(const path of w.stored.keys())assert.ok(existsSync(new URL(`../public${path}`,import.meta.url)),path);
  assert.ok(w.stored.has('/offline.html'));
  assert.ok(!w.stored.has('/map'));
  assert.ok(!w.stored.has('/settings'));
  await lifecycle(w,'activate');
  assert.deepEqual(w.deleted,['nakhoda-shell-v2']);
});

test('service worker leaves APIs, authenticated requests, and third-party maps untouched',()=>{
  const w=worker();
  for(const request of [
    {url:'https://nakhoda.test/api/me',method:'GET',headers:new Headers()},
    {url:'https://nakhoda.test/map',method:'GET',headers:new Headers({Authorization:'Bearer example'})},
    {url:'https://tile.openstreetmap.org/8/1/1.png',method:'GET',headers:new Headers()},
    {url:'https://nakhoda.test/api/report',method:'POST',headers:new Headers()},
  ]){
    let intercepted=false;
    w.handlers.get('fetch')({request,respondWith:()=>{intercepted=true;}});
    assert.equal(intercepted,false,request.url);
  }
});

test('offline navigation shows the connection page instead of stale session HTML',async()=>{
  const w=worker();
  await lifecycle(w,'install');
  const request={url:'https://nakhoda.test/map',method:'GET',mode:'navigate',headers:new Headers()};
  let response;
  w.handlers.get('fetch')({request,respondWith:promise=>{response=promise;}});
  assert.equal(await (await response).text(),'online');
  w.setFetch(async()=>{throw new TypeError('offline');});
  w.handlers.get('fetch')({request,respondWith:promise=>{response=promise;}});
  assert.equal(await (await response).text(),'offline page');
});
