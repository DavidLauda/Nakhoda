/** Pure rules for the government problem map and report validation; shared by API and UI. */
export const PILOT_BOX=[106.35,-6.20,107.10,-5.35] as const;
export const PROBLEM_STEP=0.05;
export const REPORT_CATEGORIES:Record<string,string>={coral_concern:'Karang rusak',mangrove_damage:'Mangrove rusak',shoreline_erosion:'Abrasi pantai',marine_waste:'Sampah laut',water_pollution:'Pencemaran air',other:'Lainnya'};
export const REPORT_STATUS:Record<string,string>={pending_upload:'Belum terkirim',submitted:'Baru',under_review:'Dalam verifikasi',needs_information:'Perlu info tambahan',corroborated:'Terverifikasi',unsubstantiated:'Tidak terbukti',duplicate:'Duplikat',closed:'Ditutup'};
export const OPEN_STATUSES=['submitted','under_review','needs_information'];
export const REVIEW_ACTIONS=['under_review','needs_information','corroborated','unsubstantiated','closed'] as const;
export type ReviewAction=typeof REVIEW_ACTIONS[number];

const COLS=Math.round((PILOT_BOX[2]-PILOT_BOX[0])/PROBLEM_STEP),ROWS=Math.round((PILOT_BOX[3]-PILOT_BOX[1])/PROBLEM_STEP);
/** 0.05° cell holding a point. Columns are lettered west to east, rows numbered north to south (like the mockup's "D5"). */
export function problemCell(lon:number,lat:number){
  const x=Math.min(COLS-1,Math.max(0,Math.floor((lon-PILOT_BOX[0])/PROBLEM_STEP)));
  const row=Math.min(ROWS-1,Math.max(0,Math.floor((PILOT_BOX[3]-lat)/PROBLEM_STEP)));
  const west=PILOT_BOX[0]+x*PROBLEM_STEP,north=PILOT_BOX[3]-row*PROBLEM_STEP;
  return {key:`${x},${row}`,code:`${String.fromCharCode(65+x)}${row+1}`,west,east:west+PROBLEM_STEP,south:north-PROBLEM_STEP,north};
}

export type SatelliteObservation={id:string;type:string;lon:number;lat:number;observed_start?:string;observed_end:string;metrics:Record<string,unknown>|null;quality_flags?:unknown;coverage_fraction?:number|null};
/** NOAA 7-day alert ≥2 (Warning) or Sentinel-2 candidate pixels count as an indication worth checking, never as proof of damage. */
export function satelliteSignal(o:SatelliteObservation):{indication:boolean;label:string;ignored?:string}{
  const m=o.metrics||{};
  if(o.type==='heat_stress'){
    const level=Number((m.alert_7day as {value?:unknown}|undefined)?.value);
    const names=['Tidak ada tekanan','Watch','Warning','Alert 1','Alert 2','Alert 3','Alert 4','Alert 5'];
    return {indication:Number.isFinite(level)&&level>=2,label:`Panas karang NOAA: ${Number.isFinite(level)?names[level]||`level ${level}`:'tidak diketahui'}`};
  }
  const pixels=Number(m.candidate_pixel_count),size=Number(m.pixel_size_m)||10;
  const cloud=Math.max(Number(m.current_cloud_percent)||0,Number(m.baseline_cloud_percent)||0);
  if(!Number.isFinite(pixels)||pixels<=0)return {indication:false,label:'Perubahan optik Sentinel-2: tidak ada kandidat'};
  const area=`${(pixels*size*size/1e4).toLocaleString('id-ID',{maximumFractionDigits:1})} ha`;
  // Thin cloud and its edges survive the SCL mask and read as "change"; such pairs are shown but not counted.
  if(cloud>=OPTICAL_MAX_CLOUD)return {indication:false,ignored:`awan ${Math.round(cloud)}% pada salah satu citra`,label:`Perubahan optik Sentinel-2: ${area} berubah, tidak dihitung karena awan ${Math.round(cloud)}%`};
  return {indication:true,label:`Perubahan optik Sentinel-2: ${area} berubah (${pixels} piksel)`};
}
/** Optical pairs with this much scene cloud are too likely to flag cloud edges as change. */
export const OPTICAL_MAX_CLOUD=15;

/** Problem = a verified report, two open reports, or a report backed by a satellite indication. Watch = one open report or a satellite indication alone. */
export function cellLevel({open,verified,satellite}:{open:number;verified:number;satellite:boolean}):'problem'|'watch'|null{
  if(verified>0||open>=2||(open>=1&&satellite))return 'problem';
  if(open>=1||satellite)return 'watch';
  return null;
}

/** One point each for a photo, another report in the same cell, and a satellite indication. */
export function confidence({photo,neighbours,satellite}:{photo:boolean;neighbours:number;satellite:boolean}){
  const score=(photo?1:0)+(neighbours>0?1:0)+(satellite?1:0);
  return {score,label:score>=3?'tinggi':score===2?'sedang':'rendah'};
}

/** Explains a typed coordinate the server would reject and, when the intent is obvious, offers the corrected pair. */
/** Pilot bounds written the way they are typed into the form: minus means south, dot is the decimal separator. */
export const PILOT_RANGE_TEXT=`lintang ${PILOT_BOX[3]} sampai ${PILOT_BOX[1].toFixed(2)}, bujur ${PILOT_BOX[0]} sampai ${PILOT_BOX[2].toFixed(2)}`;
export function coordinateIssue(lat:number,lon:number):{message:string;fix?:{lat:number;lon:number}}|null{
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const [west,south,east,north]=PILOT_BOX,inside=(la:number,lo:number)=>lo>=west&&lo<=east&&la>=south&&la<=north;
  if(inside(lat,lon))return null;
  if(Math.abs(lat)>=100&&Math.abs(lon)<10){
    const fix={lat:-Math.abs(lon),lon:Math.abs(lat)},fits=inside(fix.lat,fix.lon);
    return {message:`Lintang dan bujur tertukar: lintang sekitar -5.9 (diawali minus), bujur sekitar 106.6.${fits?'':` Setelah ditukar pun titiknya masih di luar area pilot (${PILOT_RANGE_TEXT}).`}`,fix:fits?fix:undefined};
  }
  if(lat>0&&inside(-lat,lon))return {message:'Lintang di selatan khatulistiwa diketik dengan minus, misalnya -5.86.',fix:{lat:-lat,lon}};
  return {message:`Titik di luar area pilot (${PILOT_RANGE_TEXT}).`};
}
