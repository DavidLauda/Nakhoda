'use client';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let instance:SupabaseClient|null=null;
export function browserDb() {
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.startsWith('sb_secret_')) return null;
  if(!instance) instance=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return instance;
}
export async function api(path:string, options:RequestInit={}) {
  const client=browserDb();if(!client) throw new Error('Supabase belum dikonfigurasi.');
  const {data}=await client.auth.getSession();
  if(!data.session) throw new Error('Masuk kembali untuk sinkronisasi.');
  const headers=new Headers(options.headers);headers.set('Authorization',`Bearer ${data.session.access_token}`);
  if(options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
  const response=await fetch(`/api/${path}`,{...options,headers,cache:'no-store'});
  const result=await response.json().catch(()=>({error:{message:`HTTP ${response.status}`}}));
  if(!response.ok) throw new Error(result.error?.message||`HTTP ${response.status}`);
  return result;
}
