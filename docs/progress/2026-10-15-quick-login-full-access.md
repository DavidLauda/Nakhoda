# Masuk Cepat dengan akses penuh

**Tanggal:** 15 Oktober 2026 (WIB)

## Tujuan dan perubahan

Juri hackathon masuk dengan satu tombol **Masuk Cepat**, tanpa email, kata sandi, atau akun yang perlu dibagikan. Ini membuka aplikasi dan data pilot yang sama, bukan halaman simulasi. Selama `QUICK_LOGIN_FULL_ACCESS=true`, sesi yang dibuat melalui Supabase Anonymous Sign-Ins diberi peran efektif `admin` oleh API Nakhoda sehingga alur nelayan, peninjau, kesehatan data, dan administrasi tersedia dalam satu sesi. Profil Supabase dasarnya tetap `fisherman`; peran penuh berlaku di API hanya selama flag server aktif.

Halaman masuk tidak lagi menyebut akun demo. Form email tim tetap tersedia dalam bagian yang dapat dibuka. Sesi Masuk Cepat tidak dapat dipulihkan setelah keluar atau data browser dihapus.

Navigasi ponsel kini juga memuat tautan **Tinjau**, **Data**, dan **Admin**; bilah navigasi dapat digeser pada layar sempit.

## Verifikasi lokal

- Halaman masuk menampilkan **Masuk Cepat** dan tidak meminta email.
- Setelah satu klik, navigasi menampilkan Peta, Laporan, Perjalanan, Dasbor peninjau, Kesehatan data, Administrasi, dan Akun.
- Laporan bertanda **[UJI HACKATHON]** berhasil dikirim melalui formulir nyata. Laporan itu memicu satu kasus nyata; isinya menyatakan bahwa ini bukan temuan lapangan.
- Kasus uji dapat dibuka, status diubah dari `new` ke `reviewing`, dan alasan perubahan muncul di riwayat audit setelah halaman dimuat ulang.
- Panel Administrasi dan rincian run satelit pada Kesehatan data terbuka dengan sesi Masuk Cepat.
- `npm run typecheck` lulus.

## Konfigurasi dan batasan

Supabase **Allow anonymous sign-ins** sudah aktif. Di lokal, `NEXT_PUBLIC_QUICK_LOGIN_ENABLED=true` dan `QUICK_LOGIN_FULL_ACCESS=true` disetel pada `.env.local` yang diabaikan Git. Deployment untuk juri perlu kedua flag tersebut pada lingkungan hosting lalu deploy ulang. Saat flag server aktif, setiap pengunjung yang memakai Anonymous Sign-Ins dapat melakukan perubahan nyata, termasuk pada kasus, penerima email, dan peran; gunakan hanya selama jendela penjurian yang terkendali, lalu matikan kedua flag. Pengiriman Gmail tetap membutuhkan konfigurasi pengirim serta aturan penerima yang ada; alur ini belum diuji dalam pekerjaan ini. Pelacakan perjalanan tetap membutuhkan izin lokasi dari browser.
