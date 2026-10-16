# Progress: Penilaian Langsung pada Halaman Indikasi

**Tanggal:** 16 Oktober 2026 — Asia/Jakarta

**Status:** Implementasi dan pengujian lokal selesai. Belum commit, push, atau deploy.

## Permintaan

Menyatukan pengelolaan kasus pada halaman indikasi satelit, dengan lima fitur utama: update status, prioritas, catatan untuk nelayan, catatan internal, dan alasan perubahan. Menghapus halaman tindak lanjut yang terpisah dan fitur email.

## Perubahan

- Halaman `/government/indications/:id` menampilkan form **Penilaian indikasi** dengan kelima field dan tombol **Simpan perubahan**. Status yang tersimpan langsung memperbarui badge halaman.
- Penilaian lama dimuat dengan prioritas serta kedua catatannya. Untuk indikasi baru, kasus penyimpanan dibuat saat pengguna pertama kali menyimpan, tanpa tombol atau halaman pembuatan kasus terpisah.
- Alasan perubahan wajib diisi, minimal tiga karakter setelah spasi di awal dan akhir dibuang. Riwayat perubahan menampilkan waktu, status, dan alasan pada halaman yang sama.
- Penyimpanan memakai nomor revisi agar perubahan dari sesi lama ditolak. Pembuatan pertama menggunakan ID kasus yang tetap untuk satu observasi agar permintaan bersamaan tidak membuat kasus baru berulang.
- Catatan untuk nelayan tersedia di detail observasi `/observations/:id` dan diteruskan ke laporan yang terhubung dengan kasus. Catatan internal tetap berada pada API peninjau yang memeriksa peran dan area penugasan.
- Halaman daftar/detail kasus lama digantikan dengan daftar laporan atau pengalihan ke indikasi/laporan terkait. Tautan **Buka kasus & rujukan** dan **Buat kasus tindak lanjut** dihapus.
- Form email, daftar penerima, endpoint pratinjau/pengiriman, modul pengirim Gmail, serta variabel email pada `.env.example` dihapus. Endpoint kesehatan aplikasi tidak lagi memeriksa Gmail.
- Tabel kasus, bukti, audit, dan riwayat email lama tetap tersimpan di database. Tidak diperlukan migrasi SQL untuk perubahan ini.
- Pada layar sempit, form penilaian tampil sebelum penjelasan citra. Layout desktop tetap menempatkan bukti dan penilaian berdampingan.
- ESLint mengabaikan artefak lokal `.tmp/` dan `pipeline/out/`; direktori tersebut sudah diabaikan Git dan berisi hasil pengujian/probe.

## Verifikasi

- TypeScript lulus; build produksi `npm run build` berhasil.
- `npm test`: **28 tes lulus**, termasuk delapan tes baru yang menjalankan handler API dengan database simulasi untuk penyimpanan, alasan wajib, konflik revisi, akses peninjau, catatan publik, endpoint email yang dihapus, dan tujuan tautan lama.
- `npm run lint`: tidak ada error; empat peringatan penggunaan `<img>` yang sudah ada pada komponen bukti/laporan.
- Pengujian Chrome pada build lokal: memuat kelima field, menyimpan penilaian lama, memuat ulang hasil tersimpan, menyimpan indikasi pertama kali, menampilkan riwayat, dan mengalihkan URL kasus lama berhasil.
- Tampilan desktop 1440×1000 dan HP 390×844 diperiksa. Tidak ada overflow horizontal pada HP; form berada sebelum bukti. Screenshot pengujian lokal ada di `.tmp/indication-review/`.
- Semua API dan autentikasi pada pengujian browser memakai data simulasi. Pengujian tidak menulis ke Supabase atau mengirim email. Citra satelit tidak dimuat dalam fixture browser ini.
- `git diff --check`: lulus.

## Langkah Berikutnya

Tinjau perubahan, kemudian commit dan push untuk menjalankan CI serta deployment Vercel. Pengujian penyimpanan terhadap Supabase produksi belum dilakukan; data uji browser hanya disimpan dalam simulasi lokal.
