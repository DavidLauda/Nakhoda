# Progress: Revisi Menyeluruh README Nakhoda

Tanggal: 16 Oktober 2026 (Asia/Jakarta)

## Tujuan

Menjadikan README sebagai dokumentasi utama yang rinci untuk anggota tim, pengembang baru, dan persiapan demo hackathon.

## Perubahan

- Menulis ulang README dalam Bahasa Indonesia dengan daftar isi dan 19 bagian utama.
- Memperbarui flow nelayan dan pemerintah sesuai navigasi serta fitur saat ini, termasuk laporan lapangan, penilaian langsung pada indikasi, dan penghapusan email.
- Menjelaskan warna peta, ambang skor, prioritas konservasi, perbedaan data terukur/perkiraan, Top 3, umur data, serta cakupan Teluk Jakarta dan Kepulauan Seribu.
- Mendokumentasikan sumber dan quality gate Marine, Marine detail, Sentinel-2, serta NOAA berdasarkan konfigurasi/kode pipeline.
- Menambahkan diagram arsitektur, struktur repository, kelompok tabel/bucket, dan rute utama.
- Melengkapi setup Supabase, environment lokal/Vercel/Actions, Quick Login, flag server `QUICK_LOGIN_FULL_ACCESS`, dan perpindahan portal tanpa kehilangan sesi.
- Menjelaskan perbedaan publikasi otomatis runner standar dan flag `--publish` pada runner detail; `all` tidak menjalankan `marine-highres`.
- Menambahkan pembacaan artifact/status, jadwal workflow, PWA/offline, pengujian HP, troubleshooting, urutan demo, serta batasan produk.
- Menandai dokumentasi lama sebagai riwayat yang dapat mencerminkan perilaku sebelum revisi.

## Dasar verifikasi

- Membandingkan isi dengan komponen UI, API, aturan akses, manifest/service worker, skema SQL, workflow CI/pipeline, script grid, dan implementasi analisis.
- Memeriksa referensi resmi Supabase Anonymous Sign-Ins, Next.js PWA, dan Next.js pada Vercel.
- Memeriksa target tautan lokal, anchor daftar isi, keseimbangan blok kode Markdown, dan `git diff --check`.
- Tidak menjalankan ulang test/build aplikasi karena perubahan hanya dokumentasi. Tidak mengakses nilai `.env.local` atau mengubah konfigurasi layanan.

## Temuan yang didokumentasikan

- `QUICK_LOGIN_FULL_ACCESS` digunakan server tetapi belum ada di `.env.example`; README menjelaskan cara menambahkannya untuk demo peninjauan.
- Catatan lama menyebut laporan/kasus di luar alur utama, sedangkan navigasi terkini sudah mendukung laporan dan penilaian indikasi.
- Layer selatan turunan KKP sudah ada, sedangkan README lama masih menyatakan belum diwakili.
- Health endpoint terbaru hanya mengembalikan keberadaan konfigurasi Supabase, bukan Gmail atau bukti konektivitas.

## Status

Revisi dokumentasi selesai lokal. Belum commit, push, atau deploy. Kode aplikasi, konfigurasi environment, dan data layanan tidak diubah.
