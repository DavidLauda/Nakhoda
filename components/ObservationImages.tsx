'use client';

/** Before / after / difference thumbnails a pipeline run stored with an optical observation. */
export function ObservationImages({manifest}:{manifest:Record<string,unknown>}){
  const shots=([['before_url','Sebelum','before_at'],['after_url','Sesudah','after_at'],['difference_url','Selisih','']] as const).filter(([key])=>typeof manifest[key]==='string');
  if(!shots.length)return <p>Citra tidak tersedia untuk observasi ini.</p>;
  return <div className="observation-images">{shots.map(([key,label,at])=><figure key={key}>
    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, not optimisable */}
    <img src={String(manifest[key])} alt={`Citra ${label.toLowerCase()}`}/>
    <figcaption>{label}{at&&manifest[at]?` · ${new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeZone:'Asia/Jakarta'}).format(new Date(String(manifest[at])))}`:''}</figcaption>
  </figure>)}</div>;
}
