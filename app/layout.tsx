import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const display=Bricolage_Grotesque({subsets:['latin'],weight:['600','800'],variable:'--font-display',display:'swap'});
const body=Plus_Jakarta_Sans({subsets:['latin'],weight:['400','500','600','700'],variable:'--font-body',display:'swap'});
export const metadata:Metadata={title:'Nakhoda',description:'Peta kondisi perairan untuk nelayan dan dasbor ekosistem untuk pemerintah di Kepulauan Seribu',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Nakhoda',statusBarStyle:'default'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#0b2a3c'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="id" className={`${display.variable} ${body.variable}`}><body>{children}</body></html>; }
