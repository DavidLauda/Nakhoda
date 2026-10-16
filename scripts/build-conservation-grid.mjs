import { readFileSync, writeFileSync } from 'node:fs';
import { cellIntersectsArea } from '../lib/geo.ts';

const pilot=JSON.parse(readFileSync(new URL('../pipeline/config/pilot.json',import.meta.url),'utf8'));
const read=file=>JSON.parse(readFileSync(new URL(`../public/${file}`,import.meta.url),'utf8'));
const source={features:['conservation-north-big.geojson','conservation-south-kkp-2026.geojson'].flatMap(file=>read(file).features)};
const [west,south,east,north]=pilot.search_bbox_wgs84;
const precedence={Pemanfaatan:1,'Pemanfaatan Terbatas':1,'Perlindungan Bahari':2,Inti:3};
const resolutions={};

for(const step of [0.01,0.05]){
  const cols=Math.round((east-west)/step),rows=Math.round((north-south)/step);
  const cells=new Map();
  for(const feature of source.features){
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const polygon of polygons){
      const outer=polygon[0];
      const xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]);
      const minX=Math.max(0,Math.floor((Math.min(...xs)-west)/step)-1);
      const maxX=Math.min(cols-1,Math.ceil((Math.max(...xs)-west)/step));
      const minY=Math.max(0,Math.floor((Math.min(...ys)-south)/step)-1);
      const maxY=Math.min(rows-1,Math.ceil((Math.max(...ys)-south)/step));
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
        const center={lon:west+(x+0.5)*step,lat:south+(y+0.5)*step};
        if(!cellIntersectsArea(center,step/2,{type:'Polygon',coordinates:polygon}))continue;
        const key=`${x},${y}`,old=cells.get(key);
        if(!old||precedence[feature.properties.zoneType]>precedence[old[2]]){
          cells.set(key,[x,y,feature.properties.zoneType,feature.properties.name,feature.properties.sourceFeatureId??feature.properties.id]);
        }
      }
    }
  }
  resolutions[step.toFixed(2)]=[...cells.values()].sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  process.stdout.write(`${step.toFixed(2)}°: ${cells.size} conservation cells\n`);
}

writeFileSync(new URL('../public/conservation-grid.json',import.meta.url),JSON.stringify({origin:[west,south],resolutions})+'\n');
