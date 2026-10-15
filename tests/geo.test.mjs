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
