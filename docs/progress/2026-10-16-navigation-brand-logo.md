# Progress: Logo Nakhoda pada Navigasi

**Tanggal:** 16 Oktober 2026 — Asia/Jakarta

**Status:** Perubahan lokal selesai; belum commit, push, atau deploy.

## Permintaan

Mengganti ikon kompas di samping nama Nakhoda dengan logo resmi yang telah diberikan pengguna.

## Perubahan

- Sidebar nelayan dan pemerintah memakai logo Nakhoda versi terang pada latar navy.
- Header ponsel juga menampilkan logo versi terang di samping nama aplikasi.
- Halaman Quick Login dan pemeriksaan sumber memakai logo versi gelap; halaman konfigurasi backend memakai versi terang sesuai latarnya.
- Menggunakan aset PNG asli di `public/brand/` melalui komponen `BrandMark`, dengan proporsi persegi dan ukuran konsisten.
- Gambar diberi teks alternatif kosong karena nama Nakhoda sudah tertulis di sebelahnya.

## Verifikasi

- `npm run typecheck`: lulus.
- `npx eslint components/PesisirApp.tsx`: tanpa error; dua peringatan penggunaan `<img>` pada detail observasi yang sudah ada.
- `git diff --check`: lulus.
- Kedua aset logo tersedia di `public/brand/`.

## Langkah Berikutnya

Perubahan dapat ditinjau secara lokal. Tampilan pada URL Vercel akan berubah setelah commit dan push diterapkan melalui deployment berikutnya. Tampilan browser dan HP belum diuji ulang dalam perubahan ini.
