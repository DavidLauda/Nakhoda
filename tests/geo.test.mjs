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
import { pointInArea, zoneAt, cellZoneTypes, distanceKm, bearingDeg, compassId } from '../lib/geo.ts';
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
test('cell zone sampling finds partial overlap and the containing zone',()=>{
  const zones=[{geometry:{type:'Polygon',coordinates:[square(106.5,-5.8,106.6,-5.7)]},properties:{zoneType:'Inti'}}];
  assert.equal(zoneAt(106.55,-5.75,zones)?.properties.zoneType,'Inti');
  assert.equal(zoneAt(106.7,-5.75,zones),undefined);
  assert.deepEqual([...cellZoneTypes({lon:106.62,lat:-5.75},0.025,zones)],['Inti']);
  assert.equal(cellZoneTypes({lon:106.7,lat:-5.75},0.025,zones).size,0);
});
test('distance and compass direction',()=>{
  const muaraAngke={lon:106.775,lat:-6.106},pari={lon:106.62,lat:-5.86};
  const km=distanceKm(muaraAngke,pari);
  assert.ok(km>31&&km<33,`got ${km}`);
  assert.equal(compassId(bearingDeg(muaraAngke,pari)),'barat laut');
  assert.equal(compassId(0),'utara');assert.equal(compassId(350),'utara');assert.equal(compassId(135),'tenggara');
});
