import { PesisirApp } from '@/components/PesisirApp';
export default async function Page({params}:{params:Promise<{slug?:string[]}>}) {const {slug}=await params;return <PesisirApp route={(slug||[]).join('/')} />;}
