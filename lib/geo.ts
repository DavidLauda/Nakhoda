/** Approximate opt-in presence on the server. Never return the input coordinates. */
export function snap250(lon:number,lat:number) {
  const y=lat*111320/250, x=lon*111320*Math.cos(lat*Math.PI/180)/250;
  const sy=Math.round(y)*250/111320;
  return {lat:Math.round(sy*1e6)/1e6,lon:Math.round(Math.round(x)*250/(111320*Math.cos(sy*Math.PI/180))*1e6)/1e6};
}
export function presenceIsFresh(heartbeatAt:string,nowMs:number) {
  const age=nowMs-Date.parse(heartbeatAt);
  return Number.isFinite(age)&&age>=0&&age<180000;
}
