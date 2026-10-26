# 📘 PANDUAN PENGGUNA RESMI — AI TRADING TERMINAL
### *Platform Bot Trading Kripto Otonom Indodax Berbasis Tim Riset AI*

---

## 🎯 DAFTAR ISI
1. [Pengenalan Singkat](#1-pengenalan-singkat)
2. [Langkah 1: Menjalankan Program (1-Klik)](#2-langkah-1-menjalankan-program-1-klik)
3. [Langkah 2: Token Akses & Keamanan Dashboard](#3-langkah-2-token-akses--keamanan-dashboard)
4. [Langkah 3: Menghubungkan Akun Indodax](#4-langkah-3-menghubungkan-akun-indodax)
5. [Langkah 4: Memilih Profil Risiko](#5-langkah-4-memilih-profil-risiko)
6. [Langkah 5: Uji Coba di Mode Demo (Paper Trading)](#6-langkah-5-uji-coba-di-mode-demo-paper-trading)
7. [Langkah 6: Beralih ke Mode Nyata (Live Trading)](#7-langkah-6-beralih-ke-mode-nyata-live-trading)
8. [Fitur Unggulan: Tim Riset AI 24 Jam](#8-fitur-unggulan-tim-riset-ai-24-jam)
9. [Notifikasi WhatsApp & Perintah Remote](#9-notifikasi-whatsapp--perintah-remote)
10. [Prosedur Darurat: Tombol Panic Sell](#10-prosedur-darurat-tombol-panic-sell)
11. [Backup & Pemeliharaan Data](#11-backup--pemeliharaan-data)
12. [Tanya Jawab (FAQ) & Troubleshooting](#12-tanya-jawab-faq--troubleshooting)

---

## 1. PENGENALAN SINGKAT

AI Trading Terminal adalah sistem perdagangan kripto otonom untuk bursa **Indodax**. 

Bot ini dirancang khusus untuk melindungi modal Anda terlebih dahulu (*capital preservation*) sebelum mengejar keuntungan. Menggunakan kombinasi **10 Analis Riset AI**, filter keselamatan **9 Gerbang Risiko**, dan eksekusi **Trailing Stop Ratchet** matematis, bot bekerja 24 jam sehari memantau pasar tanpa emosi manusia (bebas FOMO dan panic-selling yang keliru).

---

## 2. LANGKAH 1: MENJALANKAN PROGRAM (1-KLIK)

Anda tidak perlu mengetikkan perintah terminal rumit. Cukup gunakan launcher bawaan yang sesuai dengan sistem operasi Anda:

### Pengguna Windows:
1. Masuk ke folder folder aplikasi.
2. Klik ganda (**double-click**) file **`start.bat`** (atau klik kanan `start.ps1` lalu pilih *Run with PowerShell*).
3. Browser Anda akan terbuka secara otomatis ke alamat **`http://localhost:3001`**.

### Pengguna Linux / macOS:
1. Buka terminal di folder aplikasi.
2. Jalankan perintah: `./start.sh`
3. Buka browser Anda ke `http://localhost:3001`.

> 💡 **Persyaratan Sistem:** Komputer telah terpasang **Node.js** (versi 22.12 ke atas) dan memiliki koneksi internet aktif.

---

## 3. LANGKAH 2: TOKEN AKSES & KEAMANAN DASHBOARD

Saat server pertama kali menyala, sistem akan menghasilkan sebuah **Admin Access Token** unik. Token ini disimpan terenkripsi di database dan hanya ditampilkan di terminal bila server berjalan secara interaktif (TTY). Pada server headless/Docker, tampilkan token secara lokal di server dengan perintah `npm run admin:token`.

1. Saat Anda membuka dashboard untuk pertama kali, sebuah jendela login otentikasi akan meminta **Admin Access Token**.
2. Salin token dari terminal (atau hasil `npm run admin:token`), lalu tempelkan ke kolom input dashboard dan klik **Simpan & Masuk**.
3. Token Anda tersimpan di browser lokal Anda. Tanpa token ini, pengunjung lain di jaringan Anda hanya dapat melihat dashboard dalam mode pantau (*View-Only*): saldo, posisi, riwayat transaksi, QR WhatsApp, dan detail kuota provider **disembunyikan**, dan mereka tidak bisa mengubah pengaturan atau menjalankan transaksi.
4. Jika lupa token, jangan cari di log server (token sengaja tidak dicetak di log non-interaktif). Jalankan `npm run admin:token` di mesin server. Rotasi token juga tidak lagi mengirim token mentah melalui WhatsApp/Telegram.

---

## 4. LANGKAH 3: MENGHUBUNGKAN AKUN INDODAX

Untuk menghubungkan bot dengan saldo Indodax Anda:

### Langkah Pembuatan API Key di Indodax:
1. Masuk ke akun Anda di situs resmi [Indodax.com](https://indodax.com).
2. Buka menu **Profil / Akun** &rarr; pilih **API Key**.
3. Buat API Key baru.
4. ⚠️ **ATURAN KESELAMATAN WAJIB:**
   - Centang izin: **Informasi Akun (Read)**
   - Centang izin: **Trading / Transaksi (Trade)**
   - ❌ **JANGAN PERNAH MENCENTANG IZIN PENARIKAN (WITHDRAW)!**
   - *Bot ini TIDAK PERNAH membutuhkan izin penarikan dana. Dengan tidak mencentang izin withdraw, saldo Anda 100% aman di dalam Indodax.*
5. Masukkan kode OTP Indodax Anda untuk mengonfirmasi pembuatan API Key.
6. Simpan **API Key** dan **Secret Key** yang diberikan.

### Memasukkan Kredensial ke Dashboard:
1. Di AI Trading Terminal, buka tab **Pengaturan** (ikon gear di sidebar).
2. Pada tab **Bursa & API Indodax**, masukkan **API Key** dan **Secret Key**.
3. Klik tombol **Simpan Pengaturan**.
4. Bot akan otomatis memverifikasi koneksi ke server Indodax.

---

## 5. LANGKAH 4: MEMILIH PROFIL RISIKO

Anda dapat menyesuaikan gaya trading bot dengan modal dan toleransi risiko Anda melalui 1-klik di tab **Pengaturan &rarr; Profil Risiko**:

| Profil Risiko | Karakteristik | Target Untung (TP) | Pengaman Rugi (Stop Loss) | Cocok Untuk |
|---|---|---|---|---|
| 🛡️ **Konservatif** | Mengutamakan keamanan modal, hanya membeli koin likuiditas tinggi (BTC, ETH, SOL). | 3.5% | Trailing Stop ketat (1.8%) | Pemula & pemilik modal besar yang mengutamakan ketenangan tidur. |
| ⚖️ **Seimbang** *(Rekomendasi)* | Keseimbangan optimal antara peluang keuntungan dan perlindungan risiko. | 5.0% | Trailing Stop moderat (2.5%) | Sebagian besar pengguna & pasar normal. |
| 🚀 **Agresif** | Menangkap pergerakan koin momentum tinggi dan koin yang baru terdaftar di Indodax. | 7.5% | Trailing Stop longgar (3.5%) | Trader berpengalaman di fase pasar Bull Run kencang. |

---

## 6. LANGKAH 5: UJI COBA DI MODE DEMO (PAPER TRADING)

> ⚠️ **Saran Profesional:** Jangan langsung menggunakan uang nyata! Jalankan bot di **Mode Demo** terlebih dahulu selama 3 sampai 7 hari.

1. Pastikan badge di pojok kiri atas bertuliskan **Mode Demo (Simulasi)**.
2. Pada tab **Dashboard**, klik tombol **Mulai Auto-Trading**.
3. Bot akan mulai menganalisa pasar Indodax secara real-time:
   - Saldo simulasi Rp 10.000.000 (virtual) akan digunakan untuk membeli koin yang lolos seluruh 9 gerbang analisa.
   - Anda dapat melihat transaksi simulasi yang masuk, titik beli, pergerakan harga, dan saat bot menjual untuk mengunci keuntungan.
4. Pelajari cara kerja bot di tab **Laporan Performa** untuk melihat rasio kemenangan (*win rate*), profit bersih, dan drawdown.

---

## 7. LANGKAH 6: BERALIH KE MODE NYATA (LIVE TRADING)

Setelah Anda merasa puas dengan performa bot di Mode Demo dan memahami karakternya:

1. Buka tab **Dashboard**.
2. Klik tombol **Beralih ke Live Trading**.
3. Sebuah jendela keselamatan interaktif akan muncul. Anda wajib membaca dan mencentang **3 Poin Persetujuan Risiko**:
   - [x] Saya memahami risiko fluktuasi harga aset kripto.
   - [x] Saya telah menguji bot di Mode Demo dan memahami cara kerjanya.
   - [x] Saya bersedia menggunakan modal dingin (*uang yang siap menanggung risiko*).
4. Klik **Konfirmasi & Aktifkan Mode Live**.
5. Badge status akan berubah menjadi warna merah/oranye menyala: **Mode Live (Uang Nyata)**.
6. Kini bot akan mengeksekusi order riil langsung ke buku order Indodax sesuai saldo IDR Anda.
7. Jika AI dikonfigurasi pada mode *Hybrid* atau *Wajib AI*, kegagalan provider AI di Mode Live akan memblokir entry baru (fail-closed) sampai AI pulih. Posisi yang sudah terbuka tetap dipantau dan trailing stop tetap berjalan.

---

## 8. FITUR UNGGULAN: TIM RISET AI 24 JAM

Di tab **Riset AI**, Anda memiliki tim yang terdiri dari **10 Analis Khusus** yang bekerja secara otomatis di atas sumber data yang sama:

1. **Analis Berita Global:** Merangkum berita kripto dunia dari RSS CoinDesk dan CoinTelegraph.
2. **Analis Teknologi & Ekosistem:** Menyaring judul berita untuk upgrade protokol, hard fork, dan perkembangan ekosistem.
3. **Analis Sentimen Berita:** Membandingkan skor lexicon deterministik pada headline dengan pergerakan pasar Indodax.
4. **Radar Narasi Pasar:** Mendeteksi tema narasi dominan dari headline, blog Indodax, dan data ticker.
5. **Radar Listing Indodax:** Memantau blog resmi Indodax dan alert koin baru.
6. **Pemburu Momentum:** Menganalisa top gainer dan lonjakan volume 24 jam di Indodax.
7. **Radar Keamanan:** Memindai kata kunci hack/exploit/delisting pada judul berita. Ini bukan audit smart contract.
8. **Radar Makro & Regulasi:** Menyorot berita makro/regulasi yang tersedia di RSS; tidak ada feed resmi The Fed, Bank Indonesia, atau Bappebti secara langsung.
9. **Analis Likuiditas & Spread:** Menilai spread bid/ask dan volume pair paling likuid di Indodax.
10. **Analis Korelasi BTC:** Membandingkan arah BTC dengan top gainer altcoin di Indodax.

> **Catatan sumber data:** Secara default bot tidak melakukan scraping Twitter/X, Reddit, atau dompet on-chain. Anda dapat menambahkan hingga 5 feed RSS publik melalui variabel lingkungan `AI_TRADING_EXTRA_RSS_FEEDS`.

Jika ada ancaman serius terdeteksi oleh salah satu analis (misalnya indikasi koin di-hack atau regulasi darurat), bot akan **segera membatalkan rencana beli** demi menyelamatkan uang Anda.

---

## 9. NOTIFIKASI BOTS (WHATSAPP & TELEGRAM) & PERINTAH REMOTE

Anda tidak perlu menatap layar komputer seharian. Buka tab **Bots** di dashboard untuk mengatur kanal notifikasi sesuai preferensi Anda:
- **Keduanya Sekaligus:** Mengirim sinyal dan order ke WhatsApp dan Telegram bersamaan.
- **Hanya WhatsApp:** Menggunakan WhatsApp Baileys.
- **Hanya Telegram:** Menggunakan bot Telegram resmi (tanpa perlu scan QR).

### Menghubungkan WhatsApp:
1. Buka tab **Bots** di dashboard &rarr; bagian **WhatsApp**.
2. Buka aplikasi WhatsApp di HP Anda &rarr; pilih menu **Perangkat Tertaut** &rarr; **Tautkan Perangkat**.
3. Arahkan kamera HP ke **QR Code** yang tampil di dashboard.
4. Simpan nomor HP Anda pada kolom Nomor HP Administrator.

### Menghubungkan Telegram:
1. Buka tab **Bots** di dashboard &rarr; bagian **Telegram**.
2. Masukkan **Telegram Bot Token** (dari @BotFather) dan **Chat ID** Anda (dari @userinfobot).
3. Klik tombol **Kirim Pesan Tes Telegram** untuk memastikan notifikasi masuk ke HP Anda.

### Perintah Remote Populer (Kirim ke Chat Bot):
- `/status` — Melihat status mesin, koneksi bursa, dan posisi terbuka saat ini.
- `/profit` — Ringkasan laba bersih dan performa trading hari ini.
- `/modal <nominal> [profil]` — Atur alokasi modal otomatis dari HP (cth: `/modal 500000 seimbang`).
- `/koin` — Daftar 5 koin dengan kenaikan tertinggi hari ini di Indodax.
- `/help` — Melihat daftar lengkap perintah yang tersedia.
- `/balance` *(Khusus Administrator)* — Memeriksa saldo IDR dan estimasi total aset di Indodax.

---

## 10. PROSEDUR DARURAT: TOMBOL PANIC SELL

Jika terjadi peristiwa luar biasa di pasar dunia dan Anda ingin mengamankan seluruh aset seketika:

1. Klik tombol merah **Panic Sell (Darurat)** di pojok kanan atas dashboard.
2. Centang konfirmasi tindakan darurat.
3. Bot akan menjalankan 3 aksi secara simultan dalam 1 detik:
   - Menjual **SEMUA** posisi koin yang sedang terbuka langsung ke saldo IDR pada harga terbaik saat ini.
   - Membatalkan semua pending order di bursa Indodax.
   - Menjeda (*Pause*) auto-trading agar tidak melakukan transaksi beli baru sampai Anda mengaktifkannya kembali.

---

## 11. BACKUP & PEMELIHARAAN DATA

Seluruh riwayat trading, pengaturan, dan log analisa tersimpan di database lokal SQLite komputer Anda:

- **Backup Otomatis:** Sistem membuat file cadangan terverifikasi secara berkala di folder `backups/`.
- **Download Manual:** Anda dapat mengunduh file database kapan saja melalui tab **Laporan &rarr; Tombol Unduh Backup Database**.
- **Ekspor Laporan Pajak & Transaksi:** Anda dapat mengunduh rekaman transaksi dalam bentuk **CSV (Excel)** atau dokumen **PDF Resmi** dengan menekan tombol di tab Laporan.

---

## 12. TANYA JAWAB (FAQ) & TROUBLESHOOTING

#### Q: Mengapa bot belum melakukan pembelian koin sama sekali hari ini?
> **A:** Ini adalah perilaku normal dan tanda bahwa filter risiko bekerja dengan baik! Bot memiliki 9 gerbang keselamatan ketat (menganalisa spread bid-ask, tren harga Bitcoin, indikator RSI jenuh beli, dan analisa sentimen berita). Bot hanya akan membeli jika seluruh gerbang keselamatan terpenuhi demi meminimalkan risiko kerugian.

#### Q: Apakah komputer saya harus selalu menyala dan terhubung ke internet?
> **A:** Ya. Bot bekerja secara real-time membaca candlestick dan memantau trailing stop setiap detik. Jika komputer mati atau internet terputus, bot tidak dapat mengeksekusi order. Untuk trading 24/7 tanpa komputer menyala di rumah, Anda dapat menjalankan bot di VPS (Virtual Private Server).

#### Q: Bagaimana jika koneksi internet saya tiba-tiba mati saat sedang ada posisi koin terbuka?
> **A:** Begitu bot menyala kembali dan internet pulih, bot akan langsung mensinkronkan status dengan bursa Indodax dan melanjutkan pengawalan trailing stop pada posisi yang ada.

#### Q: Bagaimana cara mengganti token admin jika lupa?
> **A:** Jika server berjalan di terminal interaktif, restart program akan menampilkan token aktif. Untuk server headless/Docker, jalankan `npm run admin:token` di dalam server/container (mis. `docker compose exec ai-trading npm run admin:token`). Anda juga dapat mengatur rotasi token otomatis berkala di tab **Pengaturan &rarr; Keamanan & Hak Akses**; token baru harus diambil dari server, bukan dari pesan chat.

---

*Hak Cipta & Disclaimer Finansial: Trading aset kripto memiliki risiko volatilitas harga tinggi. Pastikan Anda hanya memperdagangkan dana yang siap Anda kelola secara bijak.*
