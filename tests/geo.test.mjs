import test from 'node:test';
import assert from 'node:assert/strict';
import { snap250, presenceIsFresh } from '../lib/geo.ts';

test('server grid conceals an exact fix while remaining within the intended cell scale',()=>{
  const exact={lon:106.612347,lat:-5.749123};const approx=snap250(exact.lon,exact.lat);
  assert.notDeepEqual(approx,exact);
  const dy=(approx.lat-exact.lat)*111320,dx=(approx.lon-exact.lon)*111320*Math.cos(exact.lat*Math.PI/180);
  assert.ok(Math.hypot(dx,dy)<180);
  assert.deepEqual(snap250(exact.lon,exact.lat),approx);
});
test('stale, future and invalid presence are hidden at query time',()=>{
  const now=Date.parse('2026-10-14T05:00:00Z');
  assert.equal(presenceIsFresh(new Date(now-179999).toISOString(),now),true);
  assert.equal(presenceIsFresh(new Date(now-180000).toISOString(),now),false);
  assert.equal(presenceIsFresh(new Date(now+1000).toISOString(),now),false);
  assert.equal(presenceIsFresh('invalid',now),false);
});
import { pointInArea, zoneAt, cellIntersectsArea, cellZoneTypes, distanceKm, bearingDeg, compassId } from '../lib/geo.ts';
import { buildFisherGrid } from '../lib/conservation-grid.ts';
const square=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
test('point in polygon respects holes and multipolygons',()=>{
  const donut={type:'Polygon',coordinates:[square(0,0,10,10),square(4,4,6,6)]};
  assert.equal(pointInArea(2,2,donut),true);
  assert.equal(pointInArea(5,5,donut),false);
  assert.equal(pointInArea(11,5,donut),false);
  const multi={type:'MultiPolygon',coordinates:[[square(0,0,1,1)],[square(5,5,6,6)]]};
  assert.equal(pointInArea(5.5,5.5,multi),true);
  assert.equal(pointInArea(3,3,multi),false);
});
test('cell intersection finds partial overlap and the containing zone',()=>{
  const zones=[{geometry:{type:'Polygon',coordinates:[square(106.5,-5.8,106.6,-5.7)]},properties:{zoneType:'Inti'}}];
  assert.equal(zoneAt(106.55,-5.75,zones)?.properties.zoneType,'Inti');
  assert.equal(zoneAt(106.7,-5.75,zones),undefined);
  const nested=[{geometry:{type:'Polygon',coordinates:[square(106.4,-5.9,106.7,-5.6)]},properties:{zoneType:'Pemanfaatan Terbatas'}},...zones];
  assert.equal(zoneAt(106.55,-5.75,nested)?.properties.zoneType,'Inti');
  assert.equal(zoneAt(106.65,-5.75,nested)?.properties.zoneType,'Pemanfaatan Terbatas');
  assert.deepEqual([...cellZoneTypes({lon:106.62,lat:-5.75},0.025,zones)],['Inti']);
  assert.equal(cellZoneTypes({lon:106.7,lat:-5.75},0.025,zones).size,0);
});
test('narrow zones are detected without sampling; cells wholly in a hole stay clear',()=>{
  const strip={type:'Polygon',coordinates:[square(0.019,0,0.021,0.1)]};
  assert.equal(cellIntersectsArea({lon:0.05,lat:0.05},0.05,strip),true);
  const donut={type:'Polygon',coordinates:[square(0,0,10,10),square(4,4,6,6)]};
  assert.equal(cellIntersectsArea({lon:5,lat:5},0.25,donut),false);
  assert.equal(cellIntersectsArea({lon:4,lat:5},0.25,donut),true);
});
test('one square per location gives conservation priority over a measured score',()=>{
  const grid={origin:[0,0],resolutions:{'0.01':[[0,0,'Inti','Test zone',1]],'0.05':[]}};
  const sea={origin:[0,0],step:.01,cells:[[0,0],[1,0]]};
  const cells=[
    {id:'blocked',lon:0.005,lat:0.005,resolution:'0.01 degree',currentScore:99,exclusion:null,observed_end:'2026-10-16',sst_c:30,chlorophyll_mg_m3:1},
    {id:'free',lon:0.015,lat:0.005,resolution:'0.01 degree',currentScore:50,exclusion:null,observed_end:'2026-10-16',sst_c:30,chlorophyll_mg_m3:1},
  ];
  const {areas,blocked,recommended}=buildFisherGrid(cells,grid,sea,Date.parse('2026-10-16T06:00:00Z'));
  assert.deepEqual([...blocked],['blocked']);
  assert.equal(areas.features.length,2);
  assert.equal(areas.features.find(f=>f.properties.kind==='conservation').properties.zoneType,'Inti');
  assert.equal(areas.features.find(f=>f.properties.kind==='conservation').properties.category,'avoid');
  assert.equal(areas.features.find(f=>f.properties.kind==='environment').properties.id,'free');
  assert.deepEqual(recommended.map(c=>c.id),['free']);
});
test('full sea grid fills gaps with fresh coarse data or unknown, keeping land absent',()=>{
  const grid={origin:[0,0],resolutions:{'0.01':[]}};
  // The missing [2,0] cell represents land, even if a provider supplies a value there.
  const sea={origin:[0,0],step:.01,cells:[[0,0],[1,0],[5,0]]};
  const base={resolution:'0.01 degree',currentScore:60,exclusion:null,observed_end:'2026-10-16',sst_c:30,chlorophyll_mg_m3:1};
  const cells=[{...base,id:'direct',lon:.005,lat:.005},{...base,id:'land',lon:.025,lat:.005},
    {...base,id:'coarse',lon:.025,lat:.025,resolution:'0.05 degree',currentScore:99}];
  const now=Date.parse('2026-10-16T06:00:00Z');
  const {areas,recommended}=buildFisherGrid(cells,grid,sea,now);
  assert.deepEqual(areas.features.map(f=>f.properties.coverage),['measured','estimate','unknown']);
  assert.equal(areas.features[1].properties.sourceCellId,'coarse');
  assert.equal(areas.features[1].properties.score,99);
  assert.equal(areas.features[1].properties.category,'high');
  assert.equal(areas.features[1].properties.coverage,'estimate');
  assert.equal(areas.features[2].properties.category,'unknown');
  assert.equal(areas.features[2].properties.score,undefined);
  assert.deepEqual(recommended.map(c=>c.id),['direct']);
  assert.equal(areas.features.length,3);
  for(const observed_end of ['2026-10-01','2026-10-18','invalid']){
    const stale=cells.map(c=>({...c,observed_end}));
    assert.ok(buildFisherGrid(stale,grid,sea,now).areas.features.every(f=>f.properties.coverage==='unknown'));
  }
});
test('coastal geometry is retained and a measured centre on land is not recommended',()=>{
  const clipped={type:'Polygon',coordinates:[square(0,0,.004,.01)]};
  const grid={origin:[0,0],resolutions:{'0.01':[]}};
  const sea={origin:[0,0],step:.01,cells:[[0,0,clipped]]};
  const cells=[{id:'land-centre',lon:.005,lat:.005,resolution:'0.01 degree',currentScore:99,exclusion:null,observed_end:'2026-10-16',sst_c:30,chlorophyll_mg_m3:1}];
  const result=buildFisherGrid(cells,grid,sea,Date.parse('2026-10-16T06:00:00Z'));
  assert.deepEqual(result.areas.features[0].geometry,clipped);
  assert.equal(result.areas.features[0].properties.coverage,'unknown');
  assert.equal(result.recommended.length,0);
});

test('estimated and measured scores share green categories; conservation overrides either',()=>{
  const grid={origin:[0,0],resolutions:{'0.01':[[2,0,'Inti','Core',1],[3,0,'Perlindungan Bahari','Protection',2],[4,0,'Pemanfaatan Terbatas','Limited use',3],[5,0,'Pemanfaatan','Use',4]]}};
  const sea={origin:[0,0],step:.01,cells:[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0],[6,0],[10,0]]};
  const base={resolution:'0.01 degree',currentScore:59,exclusion:null,observed_end:'2026-10-16',sst_c:30,chlorophyll_mg_m3:1};
  const cells=[{...base,id:'direct',lon:.005,lat:.005},
    {...base,id:'coarse-high',lon:.025,lat:.025,resolution:'0.05 degree',currentScore:60},
    {...base,id:'coarse-medium',lon:.075,lat:.025,resolution:'0.05 degree',currentScore:59},
    {...base,id:'blocked',lon:.025,lat:.005,currentScore:100}];
  const {areas,recommended}=buildFisherGrid(cells,grid,sea,Date.parse('2026-10-16T06:00:00Z'));
  assert.deepEqual(areas.features.map(f=>f.properties.category),['moderate','high','avoid','avoid','caution','caution','moderate','unknown']);
  assert.equal(areas.features[0].properties.score,59);
  assert.equal(areas.features[1].properties.score,60);
  assert.equal(areas.features[6].properties.score,59);
  assert.deepEqual(recommended.map(c=>c.id),['direct']);
  assert.ok(areas.features.filter(f=>f.properties.kind==='conservation').every(f=>f.properties.score===undefined));
});
test('distance and compass direction',()=>{
  const muaraAngke={lon:106.775,lat:-6.106},pari={lon:106.62,lat:-5.86};
  const km=distanceKm(muaraAngke,pari);
  assert.ok(km>31&&km<33,`got ${km}`);
  assert.equal(compassId(bearingDeg(muaraAngke,pari)),'barat laut');
  assert.equal(compassId(0),'utara');assert.equal(compassId(350),'utara');assert.equal(compassId(135),'tenggara');
});
