import { z } from 'zod';

export const CASE_STATES=['new','reviewing','ready_for_referral','referred','acknowledged','in_progress','resolved','closed_without_resolution'] as const;
export const CASE_STATUS:Record<string,string>={new:'Baru',reviewing:'Sedang ditinjau',ready_for_referral:'Siap dirujuk',referred:'Dirujuk',acknowledged:'Diterima petugas',in_progress:'Sedang ditangani',resolved:'Selesai',closed_without_resolution:'Ditutup tanpa penyelesaian'};
export const CASE_PRIORITIES={routine:'Rutin',priority_review:'Tinjau prioritas',urgent_review:'Tinjau segera'};
export const caseReviewSchema=z.object({
  expectedRevision:z.number().int().positive(),
  status:z.enum(CASE_STATES),
  priority:z.enum(['routine','priority_review','urgent_review']),
  publicNote:z.string().trim().max(2000).optional(),
  privateNote:z.string().trim().max(4000).optional(),
  reason:z.string().trim().min(3,'Alasan perubahan minimal 3 karakter.').max(1000),
});
export type CaseReview={id:string;status:string;priority:string;revision:number;public_note:string|null;private_note:string|null;updated_at:string};
export type CaseAudit={id:string;action:string;reason:string|null;created_at:string;metadata:Record<string,unknown>};
export type PublicCaseReview=Pick<CaseReview,'status'|'priority'|'public_note'|'updated_at'>;

/** Keep old bookmarks useful without retaining a separate case page. */
export function caseDestination(evidence:{observation_id?:string|null;report_id?:string|null}[]){
  const observation=evidence.find(e=>e.observation_id)?.observation_id;
  if(observation)return `/government/indications/${encodeURIComponent(observation)}`;
  const report=evidence.find(e=>e.report_id)?.report_id;
  return report?`/government/reports/${encodeURIComponent(report)}`:'/government/reports';
}
