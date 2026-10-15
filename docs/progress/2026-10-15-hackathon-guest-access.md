# Akses tamu demo hackathon

**Tanggal:** 15 Oktober 2026 (WIB)

## Progres

- Halaman masuk kini mengutamakan tombol **Masuk sebagai tamu demo**. Pengunjung tidak perlu menyediakan alamat email atau kata sandi.
- Supabase Anonymous Sign-Ins membuat sesi dan ID terpisah untuk setiap tamu. Trigger profil memberi setiap akun baru peran `fisherman`; jalur peninjau dan admin tetap dibatasi menurut peran.
- Form email untuk akun tim tetap tersedia dalam bagian **Masuk akun tim**. Pendaftaran email disembunyikan selama mode demo aktif.
- Pengaturan akun memberi peringatan bahwa sesi tamu tidak dapat dipulihkan setelah keluar atau menghapus data browser.
- Variabel `NEXT_PUBLIC_DEMO_GUEST_ENABLED` ditambahkan; konfigurasi lokal disetel `true`. README dan panduan demo menjelaskan pengaturan Supabase yang diperlukan.

## Verifikasi

- `npm run typecheck` lulus.
- `npm test` lulus (2 tes).
- `npm run build` lulus; hanya ada peringatan lint lama tentang gambar dan dependency hook.
- Halaman lokal menampilkan tombol masuk tamu, keterangan sesi, dan bagian masuk akun tim.
- **Allow anonymous sign-ins** berhasil diaktifkan pada proyek Supabase Nakhoda setelah persetujuan pengguna.
- Uji browser berhasil: tombol tamu membuat sesi `fisherman`/`Tamu Demo`, membuka observasi Sentinel dan sel lingkungan yang sudah dipublikasikan, serta menampilkan peringatan sesi tamu pada Pengaturan.
- Saat tamu membuka dasbor peninjau secara langsung, aplikasi menampilkan **Akses peninjau diperlukan**; tautan dasbor peninjau juga tidak muncul pada navigasi tamu.

## Langkah deployment

Pengaturan Supabase sudah aktif dan konfigurasi lokal sudah diuji. Pada deployment, setel `NEXT_PUBLIC_DEMO_GUEST_ENABLED=true` di lingkungan hosting lalu deploy ulang. Alur pembuatan laporan belum diuji dengan data baru agar basis data pilot tidak terisi laporan uji.

## Batasan

Sesi tamu tidak dapat dipulihkan setelah keluar atau data browser dihapus. Anonymous Sign-Ins memberi pengunjung peran database `authenticated`; karena itu kebijakan RLS dan pembatasan penyalahgunaan perlu dipertahankan. Matikan mode tamu dan Anonymous Sign-Ins setelah kebutuhan demo berakhir.
