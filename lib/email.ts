import 'server-only';
import { createHash } from 'crypto';
import { ApiError } from './server';

export function emailMode() { return process.env.EMAIL_MODE === 'live' ? 'live' : 'test'; }
export function allowedRecipient(address: string, verified: boolean, isTest: boolean) {
  const normalized = address.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (emailMode() === 'test') return isTest && (process.env.EMAIL_TEST_ALLOWLIST || '').split(',').map(x => x.trim().toLowerCase()).includes(normalized);
  return verified && !isTest;
}
export function contentHash(subject: string, body: string, to: string) { return createHash('sha256').update(JSON.stringify({subject,body,to})).digest('hex'); }
function base64url(value: string) { return Buffer.from(value, 'utf8').toString('base64url'); }
export async function sendGmail(to: string, subject: string, body: string): Promise<string> {
  const clientId=process.env.GOOGLE_CLIENT_ID, secret=process.env.GOOGLE_CLIENT_SECRET, refresh=process.env.GOOGLE_REFRESH_TOKEN, sender=process.env.EMAIL_SENDER;
  if (!clientId || !secret || !refresh || !sender) throw new ApiError(503,'gmail_unconfigured','Gmail OAuth dan alamat pengirim belum dikonfigurasi.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const token = await fetch('https://oauth2.googleapis.com/token', { method:'POST', signal:controller.signal, headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({client_id:clientId, client_secret:secret, refresh_token:refresh, grant_type:'refresh_token'}) });
    if (!token.ok) throw new ApiError(503,'gmail_auth_failed','Otorisasi Gmail gagal; sambungkan kembali akun pengirim.');
    const tokenData = await token.json();
    if (!tokenData.access_token) throw new ApiError(503,'gmail_auth_failed','Token Gmail tidak tersedia.');
    const message = [`From: ${sender}`,`To: ${to}`,`Subject: ${subject}`, 'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body,'utf8').toString('base64')].join('\r\n');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{ method:'POST', signal:controller.signal, headers:{Authorization:`Bearer ${tokenData.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({raw:base64url(message)}) });
    if (!response.ok) throw new ApiError(response.status >= 500 ? 502 : 503,response.status >= 500 ? 'gmail_send_unknown' : 'gmail_send_rejected',`Gmail mengembalikan HTTP ${response.status}.`,response.status >= 500);
    const result=await response.json();
    if (!result.id) throw new ApiError(502,'gmail_send_unknown','Gmail tidak mengembalikan ID pesan.',true);
    return result.id;
  } catch(error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502,'gmail_send_unknown','Waktu tunggu atau jaringan Gmail gagal; periksa folder Terkirim sebelum mencoba lagi.',true);
  } finally { clearTimeout(timer); }
}
