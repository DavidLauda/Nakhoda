# Progress: Logo Nakhoda Berputar pada Loading

Tanggal: 16 Oktober 2026 (Asia/Jakarta)

## Perubahan

- Menambahkan komponen loading bersama yang menampilkan logo Nakhoda berputar dengan teks status di bawahnya.
- Menggunakan logo putih untuk latar gelap dan logo gelap untuk latar terang. Animasi berputar setiap 1,8 detik.
- Memasang indikator pada loading halaman, sesi pengguna, data peta nelayan, laporan, indikasi, penilaian, foto, observasi, dan kesehatan data.
- Membedakan status sedang memuat dari data kosong atau permintaan gagal. Refresh berkala peta tetap mempertahankan data yang sedang ditampilkan.
- Menambahkan status yang dapat dibaca pembaca layar. Animasi berhenti jika pengguna mengaktifkan pengurangan gerakan pada perangkat.

## Verifikasi

- `npm run typecheck`: lulus.
- `npm run lint`: lulus dengan empat peringatan penggunaan elemen `img` yang sudah ada.
- `npm test`: 28 tes lulus.
- `npm run build`: lulus.
- Pemeriksaan Chrome pada build produksi lokal: logo benar-benar berputar, kedua varian logo termuat, tampilan lebar 390 piksel tidak meluber, pengurangan gerakan menghentikan animasi, dan indikator menghilang setelah data tersedia.
- Pemeriksaan browser menggunakan respons API tiruan tanpa menulis data ke Supabase.

## Status

Selesai di workspace lokal. Belum commit, push, atau deploy; perubahan belum tersedia pada situs publik.
