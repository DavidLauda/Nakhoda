# Progress: Legenda peta nelayan lebih jelas

**Tanggal:** 16 Oktober 2026 (Asia/Jakarta)

## Masalah

Label peta “Tertinggi” dan “Terukur” tidak menjelaskan apa yang dibandingkan. Keduanya dapat terbaca sebagai kepastian jumlah ikan atau izin memancing.

## Perubahan

- Legenda menyebut warna hijau tua untuk petak dengan skor laut lebih tinggi dan hijau muda untuk skor lebih rendah. Skor tersebut membandingkan data suhu air dan klorofil antar petak yang tersedia.
- Legenda menunjukkan bahwa merah, ungu, dan kuning adalah kawasan konservasi; titik biru adalah lokasi GPS pengguna bila GPS aktif.
- Panel petak menyebut skor dalam skala 0–100 dan urutannya di peta. Penjelasan menyatakan bahwa skor tinggi tidak menjamin banyak ikan dan warna hijau bukan izin memancing.
- Pada layar ponsel, legenda tampil di bawah peta dengan teks yang lebih besar agar tidak menutupi area peta.

## Verifikasi

- `npm run typecheck` lulus.
- `npm run lint` lulus tanpa error; empat peringatan lama tetap ada.
- `npm run build` lulus setelah akses jaringan tersedia untuk mengunduh Google Fonts yang sudah dipakai aplikasi.
- Peta lokal dibuka melalui alur masuk cepat nelayan. Legenda dan panel menampilkan teks baru. Pada viewport 390 × 844, peta berakhir di y=431 dan legenda dimulai di y=439, sehingga peta tidak tertutup legenda.
- [Tampilan desktop setelah perubahan](assets/2026-10-16-fisher-map-legend.png).

## Batasan

Skor adalah perbandingan kondisi data laut pada pilot, bukan prediksi hasil tangkapan. Aturan penangkapan pada zona konservasi masih harus dicek pada peta resmi KKP.
