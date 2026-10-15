export const PLAYBOOK_VERSION='pilot-playbook-v0.1';
export function recommendation(category: string, hasOptical: boolean, hasField: boolean, hasHeat: boolean, qualityGood: boolean) {
  if (!qualityGood) return {rule:'quality_or_conflict',text:'Minta informasi tambahan dan jelaskan ketidakpastian bukti.'};
  if (hasOptical && hasField) return {rule:'optical_plus_field',text:'Prioritaskan penilaian lokasi oleh petugas yang berkualifikasi dan simpan paket bukti.'};
  if (hasOptical) return {rule:'optical_change',text:'Tinjau pasangan citra dan faktor pengganggu; minta dokumentasi lapangan yang sesuai.'};
  if (hasHeat) return {rule:'heat_stress',text:'Minta pemantauan oleh petugas yang berkualifikasi dan dokumentasikan paparan panas.'};
  if (category==='marine_waste' || category==='water_pollution') return {rule:'pollution',text:'Minta verifikasi dan penanganan atau penyelidikan oleh pihak yang sesuai.'};
  if (category==='mangrove_damage' || category==='shoreline_erosion') return {rule:'coast_change',text:'Minta penilaian lokal, konteks historis, dan tinjauan lembaga terkait.'};
  return {rule:'manual_review',text:'Tinjau bukti dan tentukan tindak lanjut bersama peninjau.'};
}
