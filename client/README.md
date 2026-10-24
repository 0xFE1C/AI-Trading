# 🖥️ AI Trading Terminal — Frontend Web Client

Ini adalah antarmuka visual (Dashboard Web / UI) resmi untuk **AI Trading Terminal**.

Saat Anda menjalankan aplikasi (`start.bat`, `start.ps1`, atau `npm start`) dan membuka alamat **`http://localhost:3001`** di browser, halaman web interaktif yang Anda lihat dibangun dari folder `client/` ini.

---

## 📂 Struktur Utama Folder `client/`:

- **`src/components/`**: Komponen visual utama dashboard:
  - `DashboardView.tsx`: Halaman utama, grafik harga live, tombol Start/Stop Auto-Trading, & Panic Sell.
  - `BotsView.tsx`: Pusat kendali terpadu bot notifikasi WhatsApp (Baileys) & Telegram resmi.
  - `EntryDiagnosticsSection.tsx`: Tabel live pemantauan 9 gerbang pengaman risiko (alasan koin diterima/ditolak).
  - `SettingsView.tsx`: Form input API Key Indodax, preferensi risiko, & konfigurasi token admin.
  - `QuotaView.tsx`: Monitor penggunaan token AI & telemetri kuota Antigravity.
  - `ReportView.tsx`: Laporan laba/rugi, unduh backup database SQLite, ekspor CSV & PDF resmi.
  - `MarketScannerView.tsx`: Pemindai pasar koin Indodax secara real-time.
  - `MultiAgentView.tsx`: Panel status 10 agen riset AI swarm & blackboard bus.
- **`src/services/`**: Penghubung komunikasi ke backend server (`/api` endpoints & WebSocket real-time).
- **`src/types/`**: Definisi tipe TypeScript untuk data order, koin, sinyal, dan status bot.
- **`src/utils/`**: Utilitas generator PDF laporan resmi dan formatter mata uang Rupiah (IDR).
- **`public/`**: Aset Progressive Web App (PWA) termasuk `manifest.webmanifest`, service worker (`sw.js`), dan ikon aplikasi (192x192 & 512x512).

---

## ⚙️ Skrip Pengembangan:

```bash
# Menjalankan server frontend dev lokal:
npm run dev

# Membangun aset produksi (dikompilasi ke client/dist):
npm run build
```
*(Catatan: Anda tidak perlu menjalankan build frontend secara manual karena script utama `npm run build` di root folder sudah otomatis mengompilasi backend sekaligus frontend ini).*
