import test from 'node:test';
import assert from 'node:assert/strict';
import { problemCell, satelliteSignal, cellLevel, confidence } from '../lib/review.ts';

test('problem cells are lettered west to east and numbered north to south',()=>{
  assert.equal(problemCell(106.351,-5.351).code,'A1');
  assert.equal(problemCell(106.51,-5.56).code,'D5');
  assert.equal(problemCell(107.099,-6.199).code,'O17');
  const c=problemCell(106.61,-5.87);
  assert.ok(106.61>=c.west&&106.61<c.east&&-5.87>=c.south&&-5.87<c.north);
});
test('satellite indications need a NOAA warning or optical candidates',()=>{
  assert.equal(satelliteSignal({type:'heat_stress',metrics:{alert_7day:{value:1}}}).indication,false);
  assert.equal(satelliteSignal({type:'heat_stress',metrics:{alert_7day:{value:2}}}).indication,true);
  assert.equal(satelliteSignal({type:'optical_change',metrics:{candidate_pixel_count:0}}).indication,false);
  assert.equal(satelliteSignal({type:'optical_change',metrics:{candidate_pixel_count:12,current_cloud_percent:3,baseline_cloud_percent:5}}).indication,true);
  const cloudy=satelliteSignal({type:'optical_change',metrics:{candidate_pixel_count:1150,pixel_size_m:10,current_cloud_percent:20.82,baseline_cloud_percent:20.68}});
  assert.equal(cloudy.indication,false);assert.match(cloudy.ignored,/awan 21%/);assert.match(cloudy.label,/11,5 ha/);
  const v2clear=satelliteSignal({type:'optical_change',metrics:{candidate_pixel_count:1905,current_cloud_percent:20.8,baseline_cloud_percent:20.7,square_cloud_fraction_before:0.018,square_cloud_fraction_after:0}});
  assert.equal(v2clear.indication,true);assert.match(v2clear.label,/awan di kotak 1,8%/);
  assert.equal(satelliteSignal({type:'optical_change',metrics:{candidate_pixel_count:50,square_cloud_fraction_before:0.2,square_cloud_fraction_after:0}}).indication,false);
  assert.equal(satelliteSignal({type:'heat_stress',metrics:null}).indication,false);
});
test('cell level combines reports and satellite',()=>{
  assert.equal(cellLevel({open:0,verified:0,satellite:false}),null);
  assert.equal(cellLevel({open:1,verified:0,satellite:false}),'watch');
  assert.equal(cellLevel({open:0,verified:0,satellite:true}),'watch');
  assert.equal(cellLevel({open:1,verified:0,satellite:true}),'problem');
  assert.equal(cellLevel({open:2,verified:0,satellite:false}),'problem');
  assert.equal(cellLevel({open:0,verified:1,satellite:false}),'problem');
});
test('confidence counts independent evidence',()=>{
  assert.equal(confidence({photo:false,neighbours:0,satellite:false}).label,'rendah');
  assert.equal(confidence({photo:true,neighbours:1,satellite:false}).label,'sedang');
  assert.equal(confidence({photo:true,neighbours:2,satellite:true}).label,'tinggi');
});
import { coordinateIssue } from '../lib/review.ts';
test('coordinate issues explain swapped, positive and outside points',()=>{
  assert.equal(coordinateIssue(-5.86,106.61),null);
  const swapped=coordinateIssue(106.6,5.8);assert.match(swapped.message,/tertukar/);assert.deepEqual(swapped.fix,{lat:-5.8,lon:106.6});
  const outsideSwap=coordinateIssue(107.545,5.8);assert.match(outsideSwap.message,/tertukar/);assert.equal(outsideSwap.fix,undefined);
  assert.deepEqual(coordinateIssue(5.86,106.61).fix,{lat:-5.86,lon:106.61});
  assert.match(coordinateIssue(-5.8,107.545).message,/di luar area pilot/);
});
