import type { MapAreas } from '../components/MapView';
import { pointInArea, type AreaGeometry } from './geo.ts';

export type ConservationGridCell=[number,number,'Inti'|'Perlindungan Bahari'|'Pemanfaatan'|'Pemanfaatan Terbatas',string,number|string];
export type ConservationGrid={origin:[number,number];resolutions:Record<string,ConservationGridCell[]>};
export type SeaGrid={origin:[number,number];step:number;cells:Array<[number,number,AreaGeometry?]>;source?:string};
export type DisplayCell={id:string;lon:number;lat:number;resolution:string;currentScore:number|null;exclusion:string|null;observed_start?:string;observed_end:string;sst_c:number|null;chlorophyll_mg_m3:number|null};
export const HIGH_SCORE_MINIMUM=60;
export const fisherZoneCategory=(zoneType?:string)=>zoneType==='Pemanfaatan'||zoneType==='Pemanfaatan Terbatas'?'caution' as const:'avoid' as const;
const scoreCategory=(score:number)=>score>=HIGH_SCORE_MINIMUM?'high' as const:'moderate' as const;

const square=(west:number,south:number,step:number)=>({type:'Polygon' as const,coordinates:[[[west,south],[west+step,south],[west+step,south+step],[west,south+step],[west,south]]]});
export const gridKey=(lon:number,lat:number,step:number,[west,south]:[number,number])=>`${Math.round((lon-west)/step-0.5)},${Math.round((lat-south)/step-0.5)}`;
const resolutionOf=(cell:DisplayCell)=>Number(cell.resolution.match(/^([\d.]+)\s*degree/)?.[1]);
export function usableCell(cell:DisplayCell,now:number){
  const start=Date.parse(cell.observed_start||cell.observed_end),end=Date.parse(cell.observed_end);
  return !cell.exclusion&&Number.isFinite(start)&&Number.isFinite(end)&&start<=end&&end<=now&&now-start<=7*86400000
    &&cell.currentScore!==null&&Number.isFinite(cell.currentScore)&&cell.currentScore>=0&&cell.currentScore<=100
    &&cell.sst_c!==null&&Number.isFinite(cell.sst_c)&&cell.chlorophyll_mg_m3!==null&&Number.isFinite(cell.chlorophyll_mg_m3)&&cell.chlorophyll_mg_m3>0;
}

/** One visible cell for every sea portion: conservation > measured > estimate > unknown. */
export function buildFisherGrid<T extends DisplayCell>(cells:T[],grid:ConservationGrid,sea:SeaGrid,now=Date.now()){
  if(sea.step!==0.01||sea.origin.some((v,i)=>Math.abs(v-grid.origin[i])>1e-8))throw new Error('Grid laut dan konservasi tidak selaras.');
  const step=sea.step,entries=grid.resolutions[step.toFixed(2)]||[];
  const zones=new Map(entries.map(entry=>[`${entry[0]},${entry[1]}`,entry]));
  const water=new Map(sea.cells.map(([x,y,geometry])=>[`${x},${y}`,geometry]));
  const measured=new Map<string,T>(),coarse=new Map<string,T>(),blocked=new Set<string>();
  for(const cell of [...cells].filter(c=>usableCell(c,now)).sort((a,b)=>Date.parse(b.observed_end)-Date.parse(a.observed_end))){
    const resolution=resolutionOf(cell);
    if(resolution!==step&&resolution!==0.05)continue;
    const key=gridKey(cell.lon,cell.lat,resolution,sea.origin),[x,y]=key.split(',').map(Number);
    if(Math.abs(sea.origin[0]+(x+.5)*resolution-cell.lon)>1e-6||Math.abs(sea.origin[1]+(y+.5)*resolution-cell.lat)>1e-6)continue;
    const target=resolution===step?measured:coarse;
    if(!target.has(key))target.set(key,cell);
  }
  const recommended=[...measured.entries()].filter(([key,cell])=>{
    if(zones.has(key)){blocked.add(cell.id);return false;}
    if(!water.has(key))return false;
    const geometry=water.get(key);
    return !geometry||pointInArea(cell.lon,cell.lat,geometry);
  }).map(([,cell])=>cell).sort((a,b)=>(b.currentScore??0)-(a.currentScore??0));
  const priorityIds=new Set(recommended.filter(c=>c.currentScore!>=HIGH_SCORE_MINIMUM).map(c=>c.id));
  const features:MapAreas['features']=[];
  for(const [x,y,clipped] of sea.cells){
    const key=`${x},${y}`,lon=sea.origin[0]+(x+.5)*step,lat=sea.origin[1]+(y+.5)*step;
    const geometry=clipped||square(sea.origin[0]+x*step,sea.origin[1]+y*step,step);
    const zone=zones.get(key);
    if(zone){
      const [,,zoneType,name,sourceFeatureId]=zone;
      features.push({type:'Feature',geometry,properties:{id:`zone-${x}-${y}`,kind:'conservation',category:fisherZoneCategory(zoneType),name,zoneType,sourceFeatureId,lon,lat}});
      continue;
    }
    const direct=(!clipped||pointInArea(lon,lat,clipped))?measured.get(key):undefined;
    const fallback=coarse.get(gridKey(lon,lat,0.05,sea.origin));
    const source=direct||fallback,coverage=direct?'measured':fallback?'estimate':'unknown';
    features.push({type:'Feature',geometry,properties:{
      id:direct?.id||`${coverage}-${x}-${y}`,kind:'environment',coverage,category:source?scoreCategory(source.currentScore!):'unknown',lon,lat,
      name:direct?'Data terukur':fallback?'Perkiraan':'Belum ada data',
      ...(source?{sourceCellId:source.id,sourceResolution:source.resolution,observedEnd:source.observed_end,score:source.currentScore!,priority:source.currentScore!>=HIGH_SCORE_MINIMUM}:{}),
    }});
  }
  return {areas:{type:'FeatureCollection' as const,features},blocked,recommended,priorityIds};
}
