# Panduan Deploy Nakhoda ke Vercel

**Tanggal:** 16 Oktober 2026 — Asia/Jakarta  
**Status:** Panduan diperbarui berdasarkan konfigurasi repository. Perbaikan PWA lokal perlu di-push dan di-deploy ulang; pemasangan di HP belum diverifikasi.

Tujuannya adalah mendapatkan satu tautan HTTPS yang dapat dibuka juri di laptop dan HP, menjalankan Quick Login, serta menampilkan data Supabase.

Domain Production yang diberikan pengguna: [Nakhoda di Vercel](https://nakhoda-eight.vercel.app/).

## 1. Persiapan

- Gunakan repository GitHub `DavidLauda/Nakhoda` dan branch `main` yang memuat perubahan terbaru. Vercel mengambil kode dari GitHub; perubahan yang hanya tersimpan lokal belum ikut terdeploy.
- Pastikan workflow **Core checks** untuk commit yang akan dipakai berhasil.
- Gunakan proyek Supabase yang sama dengan pengujian lokal. Migrasi aplikasi harus sudah diterapkan dan **Allow anonymous sign-ins** harus aktif. Quick Login memakai sesi Supabase tanpa email atau kata sandi. [Dokumentasi Supabase](https://supabase.com/docs/guides/auth/auth-anonymous)
- Siapkan tiga nilai koneksi Supabase dari konfigurasi lokal atau dashboard Supabase. Masukkan nilainya sendiri ke Vercel; simpan kunci rahasia di luar Git, chat, dan screenshot.

Jika ingin memeriksa build lokal terlebih dahulu, hentikan `npm run dev` sebelum menjalankan perintah berikut agar proses dev dan build tidak memakai folder `.next` bersamaan:

```powershell
npm ci
npm run typecheck
npm test
npm run lint
npm run build
```

## 2. Import repository di Vercel

1. Buka [Vercel](https://vercel.com/) dan masuk menggunakan akun GitHub.
2. Pilih **Add New → Project**.
3. Cari repository **DavidLauda/Nakhoda**, lalu klik **Import**. Jika repository tidak muncul, periksa izin akses integrasi GitHub Vercel.
4. Gunakan nama proyek yang tersedia, misalnya `nakhoda`.
5. Periksa pengaturan berikut sebelum klik Deploy.

| Pengaturan | Nilai untuk Nakhoda |
| --- | --- |
| Framework Preset | **Next.js** |
| Root Directory | Root repository, biasanya `./`; lokasi `package.json`, bukan folder `app` atau `pipeline` |
| Build Command | `npm run build` |
| Install Command | `npm ci` |
| Output Directory | Biarkan otomatis dari preset Next.js; tidak perlu override |
| Node.js Version | **22.x**, agar sesuai workflow Core checks proyek |

Vercel mendukung Next.js dan mendeteksi pengaturan framework saat import. Sesuaikan nilai di atas dengan struktur repository ini. [Panduan build Vercel](https://vercel.com/docs/builds/configure-a-build)

## 3. Masukkan environment variables

Di bagian **Environment Variables** saat import, tambahkan tiga nama berikut. Nilai pada tabel adalah petunjuk, bukan nilai yang disalin secara harfiah.

| Nama persis | Isi dengan | Type di Vercel | Dipakai oleh |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL Supabase, berbentuk `https://<project-ref>.supabase.co` | **Config** | Browser dan API server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key `sb_publishable_...`, atau anon key lama yang sesuai | **Config** | Browser dan validasi sesi |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci server Supabase yang digunakan aplikasi lokal | **Secret** | API server saja |

Nama variabel tetap `NEXT_PUBLIC_SUPABASE_ANON_KEY` meskipun nilainya memakai publishable key baru. Jangan masukkan `sb_secret_...` atau service-role key ke variabel yang berawalan `NEXT_PUBLIC_`; konfigurasi Next.js proyek akan menolak kunci tersebut saat build.

Vercel dapat menolak variabel berawalan `NEXT_PUBLIC_` jika Type dipilih **Secret**. Nilai publik seperti project URL dan publishable key menggunakan **Config**. Jika Config terkunci saat mengedit Secret yang sudah tersimpan, batalkan edit, siapkan kembali nilai publik dari Supabase, hapus hanya entri publik yang salah tipenya, lalu buat ulang dengan nama yang sama sebagai Config. Secret tersimpan tidak bisa langsung diubah menjadi Config. Simpan cakupan environment yang sesuai dan deploy ulang sesudahnya. [Panduan Config dan Secret Vercel](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

Pilih cakupan **Production**. Tambahkan **Preview** jika ingin menguji deployment branch dengan backend yang sama. `.env.local` dan GitHub Actions Secrets tidak otomatis menjadi environment variables Vercel. Untuk mengubahnya setelah import, buka **Project → Settings → Environment Variables**, simpan, lalu buat deployment baru atau gunakan **Redeploy** agar perubahan dipakai. [Dokumentasi environment variables](https://vercel.com/docs/environment-variables)

Untuk demo utama saat ini:

- `NEXT_PUBLIC_MAP_STYLE_URL` bersifat opsional; tanpa nilai ini peta memakai tile OpenStreetMap bawaan.
- Variabel Gmail, `EMAIL_SENDER`, dan konfigurasi email tidak diperlukan untuk flow utama nelayan dan pemerintah.
- `APP_BASE_URL` belum dibaca oleh kode aplikasi saat panduan ini dibuat, sehingga bukan syarat deployment ini.
- Variabel CDSE dan Copernicus Marine ditempatkan di GitHub Actions seperti dijelaskan pada langkah 7.

## 4. Jalankan deployment pertama

1. Setelah tiga variabel wajib terisi, klik **Deploy**.
2. Tunggu hasil build. Jika gagal, buka **Build Logs** dan baca error pertama yang menjelaskan penyebabnya.
3. Setelah status **Ready**, buka domain Production yang tercantum pada proyek, misalnya `https://<nama-proyek>.vercel.app`. Alamat ini contoh; gunakan domain yang benar-benar diberikan Vercel.
4. Pastikan Production Branch adalah `main` pada pengaturan Git proyek.

Integrasi GitHub dapat membuat deployment berikutnya saat branch mendapat push. Perubahan pada branch Production digunakan untuk memperbarui aplikasi Production. [Integrasi GitHub Vercel](https://vercel.com/docs/git/vercel-for-github)

## 5. Uji tautan sebelum dibagikan ke juri

Gunakan domain Production yang sama untuk seluruh pengujian ini.

| Pemeriksaan | Hasil yang diharapkan |
| --- | --- |
| Buka halaman utama dalam incognito | Dua tombol Quick Login terlihat tanpa meminta akun Vercel |
| Pilih **Masuk sebagai Nelayan** | Peta dan detail kondisi perairan terbuka |
| Klik kotak hijau | Skor dan sumber pengukuran atau perkiraan tampil |
| Klik zona merah, kuning, atau abu-abu | Penjelasan sesuai kategori tampil |
| Keluar melalui menu Akun, lalu pilih **Masuk sebagai Pemerintah** | Dashboard ekosistem dan kesehatan sumber terbuka |
| Buka tautan pada HP | Tata letak menyesuaikan ukuran layar |
| Tekan **Tampilkan lokasi saya** di HP | Browser meminta izin lokasi; setelah diizinkan, posisi tampil bila perangkat mendapatkan lokasi |

Status **Ready** menunjukkan build/deployment berhasil. Keberhasilan mengambil data harus diperiksa melalui kedua flow aplikasi di atas.

Untuk pemeriksaan konfigurasi awal, buka `https://<domain-production>/api/health`. Respons `configured.supabase: true` hanya menunjukkan URL dan kunci server tersedia; endpoint ini tidak membuktikan kunci valid atau data berhasil dibaca. Nilai `gmail: false` diperbolehkan untuk demo utama saat ini.

Jika juri justru diminta login ke Vercel, pastikan tautan berasal dari domain Production, lalu periksa **Settings → Deployment Protection**. Aturan perlindungan dapat berlaku pada Preview maupun Production; uji kembali akses publik lewat incognito setelah pengaturan akses demo disepakati tim. [Deployment Protection](https://vercel.com/docs/deployment-protection)

## 6. Persiapan dan pengujian PWA di HP

Repository kini memiliki manifest dengan identitas dan scope `/`, mode `standalone`, ikon PNG 192×192 dan 512×512, ikon maskable terpisah untuk Android, serta Apple touch icon 180×180 dari logo Nakhoda yang diberikan tim. Ikon asli disimpan di `public/brand/` dan hasilnya di `public/icons/`.

Untuk membuat ulang ukuran ikon dari file sumber yang sudah ada di repository:

```powershell
node scripts/generate-pwa-icons.mjs
```

**Perubahan lokal harus masuk GitHub dan deployment Vercel terbaru sebelum menu pemasangan di HP dapat memakai perbaikan ini.** Periksa commit pada deployment Production. Tautan yang masih melayani commit lama tetap memakai konfigurasi PWA lama.

Pemasangan PWA memerlukan konfigurasi manifest yang sesuai dan HTTPS. [Panduan PWA Next.js](https://nextjs.org/docs/app/guides/progressive-web-apps)

Setelah deploy versi terbaru:

1. Buka domain Production langsung di Chrome Android atau Safari iPhone dalam tab biasa.
2. Buka **Akun → Pasang Nakhoda di HP**. Kartu yang sama juga tersedia pada halaman Quick Login.
3. Jika browser menyediakan konfirmasi pemasangan, kartu menampilkan tombol **Pasang aplikasi**. Tekan tombol dan setujui konfirmasi browser.
4. Jika yang muncul **Cara memasang**, tekan untuk melihat petunjuk menu browser. Tombol ini tidak mengklaim aplikasi sudah terpasang.
5. **Android:** menu **⋮ → Instal aplikasi / Tambahkan ke layar utama**. **iPhone:** **Bagikan → Tambahkan ke Layar Utama**; pilih **Buka sebagai app web** jika tersedia.
6. Buka kembali melalui ikon Nakhoda, lalu uji kedua flow dan GPS. Mode `standalone` ditujukan agar aplikasi dibuka tanpa address bar browser.

Chrome menentukan kapan promosi pemasangan tersedia, termasuk apakah aplikasi sudah terpasang dan interaksi pengguna dengan situs. Menu/prompt tidak dijamin muncul seketika. [Kriteria pemasangan Chrome](https://web.dev/articles/install-criteria)

Jika pilihan instalasi masih hilang, periksa dari desktop melalui **DevTools → Application → Manifest**. Pastikan `/manifest.webmanifest`, `/icons/pwa-192.png`, `/icons/pwa-512.png`, dan `/sw.js` pada domain Production bisa diakses tanpa login Vercel; file tersebut harus berisi manifest, gambar, dan JavaScript yang benar, bukan halaman error atau login. Deployment Protection dapat menghalangi akses ini.

Service worker versi `nakhoda-static-v3` mengganti cache halaman lama dengan ikon dan halaman penjelasan offline. API Supabase dan tile peta tetap memerlukan koneksi. Pengujian lokal tidak menggantikan uji pemasangan pada HP melalui URL Production.

## 7. Kredensial satelit tetap di GitHub Actions

Alur data proyek:

```text
CDSE / Copernicus / NOAA
          ↓
GitHub Actions: Satellite pilot pipeline
          ↓
       Supabase
          ↓
Next.js di Vercel → browser atau PWA di HP
```

Vercel menyajikan aplikasi dan API Next.js. Pipeline Python tetap berjalan melalui workflow `.github/workflows/pipeline.yml`, terpisah dari deployment website.

| Secret GitHub Actions | Kegunaan |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Menentukan proyek tujuan publikasi pipeline |
| `SUPABASE_SERVICE_ROLE_KEY` | Menulis hasil pipeline ke Supabase |
| `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET` | Akses Sentinel Hub untuk pipeline `sentinel` |
| `CDSE_USERNAME`, `CDSE_PASSWORD` | Akses unduhan SST Sentinel-3 untuk `marine-highres` |
| `COPERNICUSMARINE_SERVICE_USERNAME`, `COPERNICUSMARINE_SERVICE_PASSWORD` | Akses Copernicus Marine |

Lokasi pengaturan: **GitHub repository → Settings → Secrets and variables → Actions**. URL Supabase dan kunci server dipakai oleh dua lingkungan sehingga perlu tersedia di Vercel dan GitHub Actions masing-masing.

Deployment website tidak menjalankan pengambilan data satelit. Saat perlu memperbarui data, jalankan workflow **Satellite pilot pipeline** dengan sumber yang dibutuhkan, lalu periksa log dan artifact `discovery-metadata`. Setelah hasil berhasil dipublikasikan ke Supabase, muat ulang aplikasi. Nilai bertanggal lebih dari tujuh hari dapat tidak ditampilkan sebagai skor layak oleh aplikasi saat ini.

## 8. Jika menemui masalah

| Gejala | Pemeriksaan berikutnya |
| --- | --- |
| `npm ci` gagal saat build | Pastikan `package.json` dan `package-lock.json` di GitHub sinkron; perbaiki dependensi lokal dan unggah lockfile yang sudah diperiksa |
| Build menolak kunci rahasia pada variabel publik | Ganti `NEXT_PUBLIC_SUPABASE_ANON_KEY` dengan publishable/anon key; simpan kunci server hanya pada `SUPABASE_SERVICE_ROLE_KEY`, lalu deploy ulang |
| Vercel menampilkan `Remove the public framework prefix` | Untuk URL dan publishable key, pertahankan nama `NEXT_PUBLIC_...` dan buat sebagai **Config**. Jika entri sudah tersimpan sebagai Secret, buat ulang entri publik itu sebagai Config seperti langkah 3 |
| Halaman meminta konfigurasi backend | Periksa tiga nama variabel, cakupan Production, dan deployment yang sedang dibuka |
| Quick Login gagal | Periksa kunci/proyek Supabase, Anonymous Sign-Ins, respons API, dan Function Logs Vercel |
| Perubahan environment variable belum terlihat | Buat deployment baru; nilai `NEXT_PUBLIC_` dimasukkan ke bundle ketika build |
| Peta terbuka tetapi banyak kotak abu-abu | Periksa ketersediaan dan umur data pipeline, bukan hanya status deployment |
| GPS gagal di HP | Pastikan HTTPS, izin lokasi situs dan perangkat, serta layanan lokasi HP aktif |
| Menu instalasi PWA tidak muncul | Periksa manifest, ikon, HTTPS, browser yang digunakan, dan apakah aplikasi sudah terpasang |
| UI lama masih tampil | Periksa commit pada deployment yang aktif, kemudian muat ulang; uji lewat incognito untuk membedakan masalah deployment dan cache browser |

## 9. Catatan progress

- **Selesai:** pemeriksaan konfigurasi lokal dan dokumentasi resmi; panduan import, environment variables, Quick Login, pengujian HP, dan pembagian kredensial pipeline telah dibuat.
- **Pembaruan 16 Oktober 2026:** tabel environment variables dilengkapi pilihan Config/Secret dan langkah menangani variabel publik yang terlanjur disimpan sebagai Secret, berdasarkan error dashboard yang dilaporkan pengguna.
- **Progress pengguna:** pengaturan environment variables Vercel dan akses website di HP telah ditunjukkan melalui screenshot. Domain Production dan hasil pemasangan aplikasi di perangkat belum diverifikasi oleh agen.
- **Perbaikan PWA 16 Oktober 2026:** ikon logo PNG dan maskable, Apple touch icon, tombol/petunjuk pemasangan, header pembaruan, serta service worker baru ditambahkan. Perlu deploy commit yang memuat perbaikan ini dan melakukan uji instalasi Android/iPhone.

Sumber dan langkah diperiksa pada **16 Oktober 2026**. Label menu layanan dapat berubah; gunakan pengaturan dengan fungsi yang sama bila tampilannya berbeda.
