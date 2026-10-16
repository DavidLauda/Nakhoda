'use client';

import Image from 'next/image';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type InstallPrompt=Event&{
  prompt:()=>Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>;
};
type InstallState={installed:boolean;available:boolean;busy:boolean;secure:boolean;ios:boolean;notice:string;install:()=>Promise<void>};
const InstallContext=createContext<InstallState|null>(null);

/** Capture the browser's one-use prompt across route changes, including before login. */
export function PwaProvider({children}:{children:React.ReactNode}){
  const prompt=useRef<InstallPrompt|null>(null);
  const [installed,setInstalled]=useState(false),[available,setAvailable]=useState(false),[busy,setBusy]=useState(false),[secure,setSecure]=useState(true),[ios,setIos]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{
    const mode=window.matchMedia('(display-mode: standalone)');
    const launchedStandalone=()=>mode.matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
    setInstalled(launchedStandalone());
    setSecure(window.isSecureContext);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1));
    const onPrompt=(event:Event)=>{
      event.preventDefault();
      prompt.current=event as InstallPrompt;
      setAvailable(true);
      setNotice('');
    };
    const onInstalled=()=>{prompt.current=null;setInstalled(true);setAvailable(false);setNotice('');};
    const onModeChanged=()=>{if(launchedStandalone())onInstalled();};
    window.addEventListener('beforeinstallprompt',onPrompt);
    window.addEventListener('appinstalled',onInstalled);
    mode.addEventListener('change',onModeChanged);
    if(window.isSecureContext&&'serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(error=>console.warn('PWA service worker could not register:',error));
    }
    return()=>{
      window.removeEventListener('beforeinstallprompt',onPrompt);
      window.removeEventListener('appinstalled',onInstalled);
      mode.removeEventListener('change',onModeChanged);
    };
  },[]);

  const install=useCallback(async()=>{
    const request=prompt.current;
    if(!request)return;
    // A captured browser prompt can only be used once, including after dismissal.
    prompt.current=null;
    setAvailable(false);
    setBusy(true);
    try{
      await request.prompt();
      const choice=await request.userChoice;
      setNotice(choice.outcome==='accepted'?'Pemasangan disetujui. Setelah selesai, buka ikon Nakhoda di layar utama.':'Pemasangan dibatalkan. Anda tetap bisa memakai Nakhoda melalui browser.');
    }catch{
      setNotice('Browser belum dapat membuka pemasangan. Gunakan petunjuk melalui tombol Cara memasang.');
    }finally{setBusy(false);}
  },[]);

  return <InstallContext.Provider value={{installed,available,busy,secure,ios,notice,install}}>{children}</InstallContext.Provider>;
}

export function PwaInstallCard(){
  const state=useContext(InstallContext);
  const [help,setHelp]=useState(false);
  if(!state)return null;
  return <section className="pwa-install" aria-label="Pasang Nakhoda">
    <div className="pwa-install-heading"><Image src="/icons/pwa-192.png" width={48} height={48} alt="" unoptimized/><div><h2>{state.installed?'Nakhoda sudah terpasang':'Pasang Nakhoda di HP'}</h2><p>{state.installed?'Buka Nakhoda melalui ikon aplikasi di perangkat.':'Buka peta dan dasbor melalui ikon di layar utama.'}</p></div></div>
    {!state.installed&&<>
      <div className="button-row">
        {state.available||state.busy?<button className="primary" disabled={state.busy} onClick={state.install}>{state.busy?'Menunggu konfirmasi…':'Pasang aplikasi'}</button>:<button className="secondary" onClick={()=>setHelp(value=>!value)} aria-expanded={help} aria-controls="pwa-install-help">Cara memasang</button>}
      </div>
      {state.notice&&<p className="pwa-install-notice" role="status">{state.notice}</p>}
      {help&&<div id="pwa-install-help" className="pwa-install-help">
        {!state.secure?<p>Buka tautan HTTPS Nakhoda di browser HP untuk memasang aplikasi.</p>:state.ios?<ol><li>Buka tautan Nakhoda di Safari.</li><li>Tekan Bagikan, lalu Tambahkan ke Layar Utama.</li><li>Pilih Buka sebagai app web jika tersedia, lalu Tambah.</li></ol>:<><ol><li>Buka tautan HTTPS Nakhoda di Chrome.</li><li>Tekan menu ⋮ dan cari Instal aplikasi atau Tambahkan ke layar utama.</li><li>Ikuti konfirmasi browser, lalu buka ikon Nakhoda.</li></ol><p>Jika pilihan belum muncul, gunakan halaman ini beberapa saat dan periksa kembali menu browser. Jika sudah terpasang, buka melalui ikon Nakhoda.</p></>}
      </div>}
    </>}
  </section>;
}
