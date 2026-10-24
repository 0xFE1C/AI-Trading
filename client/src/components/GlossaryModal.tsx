import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  HelpCircle,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'glossary' | 'faq';
}

interface TermItem {
  term_en: string;
  term_id: string;
  category_en: string;
  category_id: string;
  simple_en: string;
  simple_id: string;
  detail_en: string;
  detail_id: string;
}

interface FaqItem {
  question_en: string;
  question_id: string;
  category_en: string;
  category_id: string;
  answer_en: string;
  answer_id: string;
}

const GLOSSARY_TERMS: TermItem[] = [
  {
    term_en: 'Paper Trading (Simulation Mode)',
    term_id: 'Paper Trading (Mode Simulasi)',
    category_en: 'Trading Basics',
    category_id: 'Dasar Trading',
    simple_en: 'Trading using virtual balance; your real Rupiah funds are 100% safe and untouched.',
    simple_id: 'Trading memakai saldo virtual (simulasi), uang rupiah asli Anda 100% aman dan tidak tersentuh.',
    detail_en: 'The system simulates order execution against real market orderbooks without sending financial transactions to the exchange. Strongly recommended for testing strategies for at least 7 days before switching to Live mode.',
    detail_id: 'Sistem menyimulasikan eksekusi order pada harga pasar nyata tanpa mengirimkan transaksi ke bursa. Sangat direkomendasikan untuk menguji strategi minimal 7 hari sebelum beralih ke mode Live.',
  },
  {
    term_en: 'Live Trading (Real Mode)',
    term_id: 'Live Trading',
    category_en: 'Trading Basics',
    category_id: 'Dasar Trading',
    simple_en: 'Real trading with your official Indodax exchange account balance.',
    simple_id: 'Trading riil dengan akun dan saldo Rupiah resmi Anda di bursa Indodax.',
    detail_en: 'Buy and sell orders are directly dispatched to Indodax via Trade API v2.0 with HMAC-SHA256 signature authentication.',
    detail_id: 'Order beli dan jual langsung dieksekusi di bursa menggunakan Trade API v2.0 Indodax dengan autentikasi tanda tangan HMAC-SHA256.',
  },
  {
    term_en: 'Trailing Stop Loss',
    term_id: 'Trailing Stop Loss',
    category_en: 'Risk Management',
    category_id: 'Manajemen Risiko',
    simple_en: 'Dynamic downside protection that trails peak price upward and locks profits when the market reverses.',
    simple_id: 'Batas proteksi kerugian dinamis yang otomatis naik saat harga naik, dan mengunci profit saat harga berbalik arah.',
    detail_en: 'Unlike a static stop loss fixed below entry, a trailing stop automatically ratchets up as price establishes higher watermarks. If price retraces by the trailing percentage from the peak, the position is liquidated immediately.',
    detail_id: 'Berbeda dengan stop loss statis yang tetap di titik bawah, trailing stop bergerak mengikuti kenaikan harga puncak (highest watermark). Jika harga turun sebesar persentase trailing dari puncak, posisi langsung dijual demi mengamankan laba.',
  },
  {
    term_en: 'Take Profit Stage 1 (TP1)',
    term_id: 'Take Profit (Profit Tahap 1 / TP1)',
    category_en: 'Risk Management',
    category_id: 'Manajemen Risiko',
    simple_en: 'Partial position exit (scale-out) once the initial target is reached to secure principal capital.',
    simple_id: 'Penjualan sebagian posisi (scale-out) saat target profit awal tercapai untuk mengamankan modal pokok.',
    detail_en: 'When the market hits target TP1, the bot sells 50% of the coins and moves the remaining stop loss to Break-Even, turning the remaining runner into a risk-free trade.',
    detail_id: 'Saat harga mencapai target TP1, bot menjual 50% porsi koin, dan memindahkan batas proteksi sisanya ke Titik Impas (Break-Even) sehingga sisa posisi menjadi bebas risiko (free-roll trade).',
  },
  {
    term_en: 'Break-Even Point (BEP)',
    term_id: 'Titik Impas (Break-Even Point / BEP)',
    category_en: 'Risk Management',
    category_id: 'Manajemen Risiko',
    simple_en: 'The exact price level where a trade achieves zero net profit or loss (accounting for exchange taker fees).',
    simple_id: 'Harga di mana posisi tidak untung dan tidak rugi (setelah memperhitungkan biaya transaksi bursa).',
    detail_en: 'Once price advances sufficiently, the bot anchors the stop loss just above entry price + 0.2% fee, ensuring the position cannot culminate in capital loss.',
    detail_id: 'Ketika harga sudah naik melampaui target tertentu, bot mengunci stop loss persis di atas harga beli + fee bursa (0.2%), menjamin transaksi tidak berakhir dengan kerugian modal.',
  },
  {
    term_en: 'Daily Circuit Breaker',
    term_id: 'Circuit Breaker (Rem Pengaman Harian)',
    category_en: 'Risk Management',
    category_id: 'Manajemen Risiko',
    simple_en: 'Emergency automated brake that freezes trading if cumulative daily loss reaches the maximum threshold.',
    simple_id: 'Sistem penghenti otomatis yang mem-pause trading jika kerugian harian mencapai batas toleransi maksimal.',
    detail_en: 'If total daily drawdown reaches the risk profile limit (e.g. 3% in Conservative), the bot halts all new entries for 24 hours to protect capital from cascading volatility.',
    detail_id: 'Jika total kerugian hari itu menyentuh batas profil risiko (contoh: 3% pada profil Konservatif), bot seketika menahan seluruh pembelian baru selama 24 jam untuk melindungi modal dari kehancuran berturut-turut.',
  },
  {
    term_en: 'Slippage',
    term_id: 'Selisih Harga (Slippage)',
    category_en: 'Trading Basics',
    category_id: 'Dasar Trading',
    simple_en: 'The difference between expected execution price and the actual fulfilled price across the orderbook.',
    simple_id: 'Perbedaan antara harga yang diharapkan saat order dibuat dengan harga sebenarnya saat order terpenuhi di pasar.',
    detail_en: 'In low-liquidity books, large market orders fill at elevated tiers. The bot inspects real-time orderbook depth and rejects entries when estimated slippage exceeds safety bounds.',
    detail_id: 'Pada bursa dengan likuiditas tipis, order besar bisa terisi di harga lebih tinggi. Bot menghitung estimasi slippage pada buku order sebelum masuk dan membatalkan entry jika melebihi batas toleransi.',
  },
  {
    term_en: 'Orderbook Depth',
    term_id: 'Buku Order (Orderbook)',
    category_en: 'Trading Basics',
    category_id: 'Dasar Trading',
    simple_en: 'The real-time roster of active buy bids and sell asks on the exchange.',
    simple_id: 'Daftar antrean order beli (bid) dan antrean order jual (ask) yang sedang aktif di bursa.',
    detail_en: 'The bot analyzes book depth across top tiers to guarantee adequate volume prior to entry, preventing traders from getting trapped in illiquid pairs.',
    detail_id: 'Bot menganalisis ketebalan antrean pada orderbook (kedalaman likuiditas) untuk memastikan ada cukup volume sebelum membeli agar tidak terjebak likuiditas tipis.',
  },
  {
    term_en: 'Bid-Ask Spread',
    term_id: 'Selisih Beli-Jual (Spread)',
    category_en: 'Trading Basics',
    category_id: 'Dasar Trading',
    simple_en: 'The spread distance between the lowest asking sell price and highest bidding buy price.',
    simple_id: 'Jarak antara harga penawaran jual terendah dengan harga penawaran beli tertinggi di bursa.',
    detail_en: 'Excessive spreads indicate illiquid markets prone to immediate negative returns upon entry. The bot blocks purchases whenever the spread exceeds the risk threshold.',
    detail_id: 'Spread yang terlalu lebar menandakan pasar tidak likuid dan berisiko memicu kerugian seketika begitu Anda membeli. Bot memblokir pembelian jika spread melebihi batas aman.',
  },
  {
    term_en: 'RSI (Relative Strength Index)',
    term_id: 'RSI (Relative Strength Index)',
    category_en: 'Technical Indicators',
    category_id: 'Indikator Teknikal',
    simple_en: 'Momentum oscillator that gauges whether a coin is overbought or oversold.',
    simple_id: 'Indikator momentum untuk mengukur apakah harga koin sudah terlalu mahal (overbought) atau terlalu murah (oversold).',
    detail_en: 'RSI scores range from 0 to 100. Values above 70 indicate overheated overbought conditions vulnerable to sudden corrections; the bot prohibits entering at candle peaks.',
    detail_id: 'Skor RSI berkisar 0-100. RSI di atas 70 menunjukkan pasar sudah overbought (pucuk) dan rawan koreksi, sehingga bot melarang pembelian demi menghindari beli di puncak candle.',
  },
  {
    term_en: 'EMA (Exponential Moving Average)',
    term_id: 'EMA (Exponential Moving Average)',
    category_en: 'Technical Indicators',
    category_id: 'Indikator Teknikal',
    simple_en: 'Weighted trendline indicator placing higher significance on recent price developments.',
    simple_id: 'Garis rata-rata pergerakan harga yang memberi bobot lebih besar pada pergerakan harga terkini.',
    detail_en: 'The quantitative engine leverages EMA-21 and EMA-50 to classify market regimes (Uptrend vs Downtrend) and confirm healthy accumulation phases.',
    detail_id: 'Bot menggunakan EMA-21 dan EMA-50 untuk mendeteksi tren arah pasar (Uptrend vs Downtrend) dan memvalidasi apakah harga berada di fase sehat.',
  },
  {
    term_en: 'ATR (Average True Range)',
    term_id: 'ATR (Average True Range)',
    category_en: 'Technical Indicators',
    category_id: 'Indikator Teknikal',
    simple_en: 'Volatility measurement gauging the average fluctuation range over a given timeframe.',
    simple_id: 'Ukuran rata-rata rentang gejolak (volatilitas) harga koin dalam periode waktu tertentu.',
    detail_en: 'Leveraged by the bot to compute adaptive stop distances. Highly volatile assets receive wider cushion to prevent being stopped out by deceptive wicks.',
    detail_id: 'Digunakan oleh bot untuk menentukan jarak trailing stop yang ideal. Koin bervolatilitas tinggi memerlukan jarak stop yang lebih adaptif agar tidak mudah tersentuh oleh wick palsu.',
  },
  {
    term_en: 'Win Rate',
    term_id: 'Win Rate',
    category_en: 'Technical Indicators',
    category_id: 'Indikator Teknikal',
    simple_en: 'Percentage of completed trades that closed profitably against total resolved trades.',
    simple_id: 'Persentase jumlah transaksi yang berhasil menghasilkan keuntungan dibandingkan total transaksi selesai.',
    detail_en: 'Calculated as: (Winning Trades / Total Trades) * 100%. For example: 8 wins out of 10 trades yields an 80% Win Rate.',
    detail_id: 'Dihitung dengan rumus: (Jumlah Transaksi Untung / Total Transaksi) x 100%. Contoh: 8 untung dari 10 transaksi = Win Rate 80%.',
  },
  {
    term_en: 'Profit Factor',
    term_id: 'Profit Factor',
    category_en: 'Technical Indicators',
    category_id: 'Indikator Teknikal',
    simple_en: 'Ratio of gross gains generated by winning trades against gross losses from losing trades.',
    simple_id: 'Rasio antara total nilai uang yang dihasilkan dari transaksi untung dibanding total nilai uang dari transaksi rugi.',
    detail_en: 'A metric above 1.5 denotes a robust strategy. If total profits are IDR 1,500,000 and total losses are IDR 500,000, Profit Factor is 3.0.',
    detail_id: 'Nilai di atas 1.5 menandakan strategi yang sehat. Contoh: jika total laba Rp 1.500.000 dan total rugi Rp 500.000, maka Profit Factor adalah 3.0.',
  },
  {
    term_en: 'Max Drawdown',
    term_id: 'Max Drawdown',
    category_en: 'Risk Management',
    category_id: 'Manajemen Risiko',
    simple_en: 'The deepest portfolio equity drop from an all-time peak to a subsequent trough.',
    simple_id: 'Penurunan terdalam saldo portofolio dari titik tertinggi (peak) ke titik terendah (trough).',
    detail_en: 'Measures the worst-case historical equity retracement of the system. Lower drawdowns represent superior capital preservation for conservative investors.',
    detail_id: 'Mengukur risiko penurunan modal terburuk yang pernah dialami strategi. Semakin kecil angka drawdown, semakin aman strategi tersebut bagi investor konservatif.',
  },
  {
    term_en: 'On-Chain Whale Tracker',
    term_id: 'Pelacak Whale On-Chain',
    category_en: 'AI Capabilities',
    category_id: 'Fitur AI',
    simple_en: 'AI analyst monitoring high-net-worth wallet flows entering or exiting exchange reserves.',
    simple_id: 'Analis AI yang melacak pergerakan dompet kripto bermodal raksasa (whale) menuju atau keluar dari bursa.',
    detail_en: 'Massive coin inflows to exchanges often precede institutional sell-offs, whereas outflows toward cold custody indicate long-term accumulation.',
    detail_id: 'Inflow besar koin ke bursa sering kali mendahului aksi jual masal (dump), sementara outflow ke dompet dingin menandakan akumulasi jangka panjang.',
  },
  {
    term_en: 'Market Sentiment',
    term_id: 'Sentimen Pasar',
    category_en: 'AI Capabilities',
    category_id: 'Fitur AI',
    simple_en: 'Synthesized score of news and community discussions from -1.0 (extreme fear) to +1.0 (extreme greed).',
    simple_id: 'Skor nada berita dan obrolan komunitas terhadap suatu koin, berskala -1.0 (sangat negatif) sampai +1.0 (sangat positif).',
    detail_en: 'Aggregates 100+ crypto intelligence feeds to guarantee purchases are only triggered when public sentiment confirms positive momentum.',
    detail_id: 'Bot menganalisis 100+ sumber berita crypto dan media sosial untuk memastikan pembelian hanya dilakukan saat sentimen publik mendukung.',
  },
  {
    term_en: '9 Pure Risk Gates',
    term_id: '9 Gerbang Pengaman (Pure Risk Guard)',
    category_en: 'Risk Management',
    category_id: 'Manajemen Risiko',
    simple_en: 'Nine strict quantitative validation barriers that every candidate signal must pass before entry approval.',
    simple_id: 'Sembilan lapis pemeriksaan kuantitatif bertingkat yang wajib diloloskan sebelum suatu order beli disetujui.',
    detail_en: 'Gates include: (1) Auto-Trading Master Switch, (2) Daily Loss Circuit Breaker, (3) Max Concurrency Slots, (4) BTC Regime Crash Guard, (5) Spread Trap Filter, (6) RSI Overbought Barrier, (7) Slippage Tolerance, (8) Rebound Scoring, and (9) AI Risk Confirmation.',
    detail_id: 'Gerbang meliputi: (1) Sakelar Auto-Trading, (2) Rem Kerugian Harian, (3) Kapasitas Posisi, (4) Filter Crash BTC, (5) Deteksi Perangkap Spread, (6) Filter Pucuk RSI, (7) Anggaran Toleransi Slippage, (8) Skor Peluang Rebound, (9) Konfirmasi AI Manajer Risiko.',
  },
  {
    term_en: 'AI Quota & Token Metering',
    term_id: 'Kuota AI & Penghemat Token',
    category_en: 'AI Capabilities',
    category_id: 'Fitur AI',
    simple_en: 'Smart optimization engine preventing API token overuse and rate-limit exhaustion.',
    simple_id: 'Sistem cerdas yang mengoptimalkan konsumsi API kecerdasan buatan dan mencegah pembengkakan pemakaian.',
    detail_en: 'Employs SHA-256 prompt deduplication and a deterministic fallback engine: if AI quota depletes, the bot continues operating smoothly via pure technical indicators.',
    detail_id: 'Menggunakan deduplikasi konteks berbasis SHA-256 dan fail-safe deterministik: jika kuota AI menipis, bot tetap dapat berjalan aman menggunakan indikator teknikal murni.',
  },
  {
    term_en: 'Ghost Positions (A/B Shadow Trades)',
    term_id: 'Posisi Bayangan (Ghost Trade)',
    category_en: 'AI Capabilities',
    category_id: 'Fitur AI',
    simple_en: 'Simulated tracking of rejected signals to empirically verify whether AI vetos saved capital.',
    simple_id: 'Simulasi posisi koin yang ditolak oleh AI untuk menguji apakah keputusan penolakan AI benar-benar menyelamatkan modal.',
    detail_en: 'When an AI agent rejects a candidate and the coin subsequently dumps to hit stop-loss, the system classifies it as a "Bullet Dodged", validating AI protection value.',
    detail_id: 'Jika sinyal ditolak AI lalu harganya turun menyentuh stop-loss, sistem mencatatnya sebagai "Kerugian Terhindar" (Bullet Dodged), membuktikan secara empiris nilai tambah filter AI.',
  },
];

const FAQ_LIST: FaqItem[] = [
  {
    question_en: 'Is my money / capital safe using this application?',
    question_id: 'Apakah uang / modal saya aman menggunakan aplikasi ini?',
    category_en: 'Capital & Security',
    category_id: 'Keamanan & Modal',
    answer_en:
      'Yes! Capital security is our paramount design principle. By default, the application runs exclusively in Paper Mode (simulated balance), leaving your real Rupiah untouched. Furthermore, Indodax API keys NEVER require "Withdraw" permissions — you only grant "View" and "Trade". The system has zero technical ability to withdraw funds from your exchange account.',
    answer_id:
      'Ya! Keamanan modal adalah prioritas utama rancangan AI-Trading. Secara default, aplikasi selalu berjalan di Mode Paper (uang simulasi) sehingga rupiah Anda tidak tersentuh sama sekali. Selain itu, API Key Indodax tidak pernah membutuhkan izin "Withdraw" (penarikan) — Anda hanya perlu mengaktifkan izin "View" dan "Trade". Sistem tidak memiliki akses untuk mentransfer uang keluar dari akun bursa Anda.',
  },
  {
    question_en: 'How do I obtain official API Keys from Indodax?',
    question_id: 'Bagaimana cara mendapatkan API Key resmi dari Indodax?',
    category_en: 'Setup & API',
    category_id: 'Setup & API',
    answer_en:
      '1. Log in to your official Indodax.com account on a desktop browser.\n2. Navigate to Profile ➜ select "Trade API".\n3. Create a new API Key with a label (e.g. "AITrading").\n4. Enable "Trade" and "View" permissions. NEVER enable "Withdraw".\n5. Enter your 2FA code to confirm, then copy your Key and Secret into the Settings menu of this app.',
    answer_id:
      '1. Masuk ke situs web resmi Indodax.com di browser komputer.\n2. Klik menu Profil akun Anda ➜ pilih "API".\n3. Buat API Key baru, beri label (misal: "AITrading").\n4. Centang izin "Trade" dan "View". JANGAN centang izin "Withdraw".\n5. Masukkan kode 2FA untuk konfirmasi, lalu salin Key dan Secret ke menu Pengaturan di aplikasi ini.',
  },
  {
    question_en: 'Why is the bot idle and not opening buy orders yet?',
    question_id: 'Mengapa bot diam saja dan belum melakukan pembelian koin?',
    category_en: 'Trading Logic',
    category_id: 'Logika Trading',
    answer_en:
      'A disciplined trading bot avoids reckless trades! Prior to taking a position, candidate coins must satisfy all "9 Pure Risk Gates" (such as BTC regime stability, low bid-ask spread, and non-overbought RSI). In adverse or falling market conditions, staying in cash is the best possible trade. You can inspect the "9 Gates Entry Diagnostics" card on the dashboard to see which gate is actively filtering coins to protect your money.',
    answer_id:
      'Bot trading yang baik adalah bot yang disiplin! Sebelum membeli koin, sistem harus meloloskan "9 Gerbang Pengaman" (seperti filter kondisi BTC, spread tipis, dan RSI yang tidak overbought). Jika pasar sedang turun atau berisiko tinggi, menahan posisi dan tidak belanja adalah bentuk perlindungan terbaik bagi modal Anda. Anda dapat memeriksa panel "Diagnostik 9 Gerbang" di dashboard untuk melihat koin apa yang sedang dipantau dan alasan penolakannya.',
  },
  {
    question_en: 'What happens if my internet disconnects or my computer shuts down?',
    question_id: 'Apa yang terjadi jika koneksi internet atau server komputer saya mati?',
    category_en: 'Troubleshooting',
    category_id: 'Troubleshooting',
    answer_en:
      'If your computer shuts down, pending local orders will not be generated. For existing open positions, exchange take-profit orders placed previously remain intact. However, for continuous real-time trailing stops, running the bot on a machine with a stable connection or a 24/7 VPS is strongly recommended.',
    answer_id:
      'Jika server bot mati, order yang belum terisi di bursa tidak akan diproses. Untuk posisi yang sudah terbuka, bot dilengkapi mekanisme Deadman Switch & Take-Profit di bursa. Namun demi kinerja optimal (terutama untuk trailing stop real-time), disarankan menjalankan bot di komputer yang terhubung internet stabil atau VPS 24 jam.',
  },
  {
    question_en: 'What is the recommended minimum capital to start trading?',
    question_id: 'Berapa modal minimal yang disarankan untuk mulai trading?',
    category_en: 'Capital & Security',
    category_id: 'Keamanan & Modal',
    answer_en:
      'Indodax enforces a minimum order size of ~IDR 10,000 per transaction. To begin, an allocation of IDR 100,000 to IDR 500,000 is ample to operate comfortably in Conservative mode. You can use the Capital Wizard in Settings to automatically size positions.',
    answer_id:
      'Bursa Indodax menetapkan minimal order sekitar Rp 10.000 per transaksi. Untuk memulai, modal Rp 100.000 s/d Rp 500.000 sudah sangat cukup untuk mencoba bot dengan profil Konservatif. Anda dapat menggunakan kalkulator risiko di Pengaturan untuk menghitung alokasi per koin secara otomatis.',
  },
  {
    question_en: 'How do I connect Google AI (Antigravity OAuth)?',
    question_id: 'Bagaimana cara menghubungkan akun AI Google (Antigravity)?',
    category_en: 'Setup & API',
    category_id: 'Setup & API',
    answer_en:
      'On the dashboard or in Settings, click "Connect Antigravity (Google OAuth)". Follow the prompt to authorize via your Google account. Once verified, credentials are stored securely in your local environment, unlocking state-of-the-art models (Gemini 3.8 Flash, Claude Sonnet 4.6) at zero additional API costs.',
    answer_id:
      'Di dashboard atau Pengaturan, klik tombol "Hubungkan Antigravity (Google OAuth)". Anda akan diarahkan untuk login ke akun Google Anda. Setelah disetujui, token tersimpan secara lokal dan membuka model mutakhir (Gemini 3.8 Flash, Claude Sonnet 4.6) tanpa biaya API tambahan.',
  },
  {
    question_en: 'What is the difference between Paper Mode and Live Mode?',
    question_id: 'Apa perbedaan mendasar mode Paper vs mode Live?',
    category_en: 'Trading Logic',
    category_id: 'Logika Trading',
    answer_en:
      'Paper Mode provides a virtual simulation balance (IDR 10,000,000) allowing you to test strategies against real live market feeds without risking real money. Live Mode trades real Indonesian Rupiah through your Indodax account with real financial orders.',
    answer_id:
      'Mode Paper menggunakan saldo virtual Rp 10.000.000 untuk berlatih tanpa risiko rugi sedikit pun, namun tetap membaca harga dan orderbook nyata dari Indodax. Mode Live menggunakan saldo Rupiah asli di akun Indodax Anda dan mengeksekusi order nyata di bursa.',
  },
  {
    question_en: 'How does Trailing Stop Loss protect my gains?',
    question_id: 'Bagaimana cara kerja Trailing Stop Loss melindungi profit saya?',
    category_en: 'Trading Logic',
    category_id: 'Logika Trading',
    answer_en:
      'Suppose you buy at IDR 1,000 with a 3% trailing stop. As the price rallies to IDR 1,500, your stop price is automatically elevated to IDR 1,455 (3% below peak). If the market subsequently pulls back to IDR 1,455, the bot exits immediately, banking a solid 45.5% profit!',
    answer_id:
      'Misalkan Anda membeli koin di harga Rp 1.000 dengan trailing stop 3%. Jika harga naik menjadi Rp 1.500, batas proteksi otomatis ikut naik ke Rp 1.455 (3% di bawah Rp 1.500). Jika harga kemudian berbalik turun ke Rp 1.455, bot langsung menjual posisi tersebut, sehingga Anda tetap mengantongi laba 45,5%!',
  },
  {
    question_en: 'Does this software charge monthly subscriptions or profit commissions?',
    question_id: 'Apakah bot ini memerlukan biaya langganan bulanan atau bagi hasil?',
    category_en: 'Capital & Security',
    category_id: 'Keamanan & Modal',
    answer_en:
      'No! This software runs 100% locally on your machine (self-hosted). There are zero cloud subscription fees, no third-party trading fees, and zero profit cuts.',
    answer_id:
      'Tidak! Piranti lunak ini berjalan 100% di perangkat Anda secara mandiri (self-hosted). Tidak ada biaya langganan cloud bulanan, tidak ada komisi per trade ke pihak ketiga, dan tidak ada bagi hasil keuntungan.',
  },
  {
    question_en: 'How do I create database backups and restore records?',
    question_id: 'Bagaimana cara membuat cadangan (backup) dan memulihkan data?',
    category_en: 'Troubleshooting',
    category_id: 'Troubleshooting',
    answer_en:
      'Open the "Reports & Performance" tab ➜ under "Database Backup & Security", click "Create SQLite Database Snapshot". The backup file is compiled instantaneously and can be downloaded anytime.',
    answer_id:
      'Buka tab "Laporan & Kinerja" ➜ pada bagian "Backup & Keamanan Database", klik tombol "Buat Snapshot Backup Database". File cadangan SQLite akan dibuat otomatis dan dapat diunduh ke komputer Anda kapan saja.',
  },
];

export const GlossaryModal: React.FC<GlossaryModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'glossary',
}) => {
  const { l, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'glossary' | 'faq'>(defaultTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const categories = useMemo(() => {
    if (activeTab === 'glossary') {
      return language === 'id'
        ? ['all', 'Dasar Trading', 'Manajemen Risiko', 'Indikator Teknikal', 'Fitur AI']
        : ['all', 'Trading Basics', 'Risk Management', 'Technical Indicators', 'AI Capabilities'];
    }
    return language === 'id'
      ? ['all', 'Keamanan & Modal', 'Setup & API', 'Logika Trading', 'Troubleshooting']
      : ['all', 'Capital & Security', 'Setup & API', 'Trading Logic', 'Troubleshooting'];
  }, [activeTab, language]);

  const filteredTerms = useMemo(() => {
    return GLOSSARY_TERMS.filter((item) => {
      const cat = language === 'id' ? item.category_id : item.category_en;
      const term = language === 'id' ? item.term_id : item.term_en;
      const simple = language === 'id' ? item.simple_id : item.simple_en;
      const detail = language === 'id' ? item.detail_id : item.detail_en;

      const matchesCat = selectedCategory === 'all' || cat === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesQuery =
        !q ||
        term.toLowerCase().includes(q) ||
        simple.toLowerCase().includes(q) ||
        detail.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [selectedCategory, searchQuery, language]);

  const filteredFaqs = useMemo(() => {
    return FAQ_LIST.filter((item) => {
      const cat = language === 'id' ? item.category_id : item.category_en;
      const question = language === 'id' ? item.question_id : item.question_en;
      const answer = language === 'id' ? item.answer_id : item.answer_en;

      const matchesCat = selectedCategory === 'all' || cat === selectedCategory;
      const q = searchQuery.toLowerCase();
      const matchesQuery =
        !q ||
        question.toLowerCase().includes(q) ||
        answer.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });
  }, [selectedCategory, searchQuery, language]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="max-w-3xl w-full max-h-[90vh] flex flex-col rounded-2xl border border-slate-800 bg-[#0b101b] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              {activeTab === 'glossary' ? <BookOpen className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>{l('Education & Help Center', 'Pusat Edukasi & Bantuan Pemula')}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-300 font-mono">
                  {l('Complete Guide', 'Panduan Lengkap')}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {l(
                  'Understand all market terms and frequently asked questions in clear, accessible language.',
                  'Pahami seluruh istilah pasar dan jawaban pertanyaan umum dalam bahasa yang ramah.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={l('Close Modal', 'Tutup Modal')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="p-4 border-b border-slate-800/60 bg-[#080d17] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Tabs */}
            <div className="flex bg-slate-900/90 border border-slate-800 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('glossary');
                  setSelectedCategory('all');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'glossary'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>{l('Trading Glossary', 'Kamus Istilah')} ({GLOSSARY_TERMS.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('faq');
                  setSelectedCategory('all');
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'faq'
                    ? 'bg-blue-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{l('FAQ', 'Tanya Jawab FAQ')} ({FAQ_LIST.length})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'glossary'
                    ? l('Search terms (e.g. Trailing Stop, RSI)...', 'Cari istilah (cth: Trailing Stop, RSI)...')
                    : l('Search questions...', 'Cari pertanyaan...')
                }
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900/80 border border-slate-700/80 focus:border-blue-500 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[11px] text-slate-500 mr-1">{l('Category:', 'Kategori:')}</span>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                  selectedCategory === cat
                    ? 'border-blue-500/60 bg-blue-950/60 text-blue-300 font-semibold'
                    : 'border-slate-800 bg-slate-900/40 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat === 'all' ? l('All Categories', 'Semua Kategori') : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {activeTab === 'glossary' ? (
            filteredTerms.length > 0 ? (
              <div className="space-y-3">
                {filteredTerms.map((item, idx) => {
                  const term = language === 'id' ? item.term_id : item.term_en;
                  const cat = language === 'id' ? item.category_id : item.category_en;
                  const simple = language === 'id' ? item.simple_id : item.simple_en;
                  const detail = language === 'id' ? item.detail_id : item.detail_en;
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-slate-800 bg-[#070b13] hover:border-slate-700 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                          <span>{term}</span>
                        </h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-800 bg-slate-900 text-slate-400 font-mono">
                          {cat}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-emerald-400 leading-relaxed">
                        💡 {simple}
                      </p>
                      <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-900">
                        {detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                {l(
                  `No terms match the search query "${searchQuery}".`,
                  `Tidak ada istilah yang cocok dengan pencarian "${searchQuery}".`
                )}
              </div>
            )
          ) : (
            filteredFaqs.length > 0 ? (
              <div className="space-y-2.5">
                {filteredFaqs.map((faq, idx) => {
                  const isExpanded = expandedFaq === idx;
                  const question = language === 'id' ? faq.question_id : faq.question_en;
                  const answer = language === 'id' ? faq.answer_id : faq.answer_en;
                  return (
                    <div
                      key={idx}
                      className="rounded-xl border border-slate-800 bg-[#070b13] overflow-hidden transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => setExpandedFaq(isExpanded ? null : idx)}
                        className="w-full p-4 text-left flex items-center justify-between gap-3 hover:bg-slate-900/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600/20 text-blue-400 text-[10px] font-bold shrink-0">
                            {idx + 1}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-slate-200">
                            {question}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="p-4 pt-1 border-t border-slate-800/60 bg-slate-950/40 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                          {answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                {l(
                  `No FAQ questions match the search query "${searchQuery}".`,
                  `Tidak ada pertanyaan FAQ yang cocok dengan pencarian "${searchQuery}".`
                )}
              </div>
            )
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Info className="h-4 w-4 text-blue-400 shrink-0" />
            <span>
              {l(
                'Complete documentation is available in ',
                'Panduan lengkap pemula tersedia di file '
              )}
              <code className="text-blue-300 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-500/20">
                {language === 'id' ? 'docs/PANDUAN_PENGGUNA.md' : 'README.md'}
              </code>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              {l('Close', 'Tutup')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
