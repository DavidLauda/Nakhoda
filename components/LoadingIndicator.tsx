import Image from 'next/image';

export function LoadingIndicator({label='Memuat…',light=false,compact=false}:{label?:string;light?:boolean;compact?:boolean}){
  const size=compact?40:64;
  return <span className={`nakhoda-loading${light?' light':''}${compact?' compact':''}`} role="status" aria-live="polite" aria-atomic="true">
    <Image className="nakhoda-loading-logo" src={light?'/brand/nakhoda-light.png':'/brand/nakhoda-dark.png'} width={size} height={size} alt="" loading="eager" unoptimized/>
    <span>{label}</span>
  </span>;
}
