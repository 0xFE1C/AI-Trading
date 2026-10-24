import React, { useState } from 'react';
import {
  BookOpen,
  HelpCircle,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';

interface GlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'glossary' | 'faq';
}

interface TermItem {
  term: string;
  category: 'Dasar Trading' | 'Manajemen Risiko' | 'Indikator Teknikal' | 'Fitur AI';
  simple: string;
  detail: string;
}

interface FaqItem {
  question: string;
  category: 'Keamanan & Modal' | 'Setup & API' | 'Logika Trading' | 'Troubleshooting';
  answer: string;
}

const GLOSSARY_TERMS: TermItem[] = [
  {
    term: 'Paper Trading (Mode Simulasi)',
    category: 'Dasar Trading',
    simple: 'Trading memakai saldo virtual (simulasi), uang rupiah asli Anda 100% aman dan tidak tersentuh.',
    detail: 'Sistem menyimulasikan eksekusi order pada harga pasar nyata tanpa mengirimkan transaksi ke bursa. Sangat direkomendasikan untuk menguji strategi minimal 7 hari sebelum beralih ke mode Live.',
  },
  {
    term: 'Live Trading',
    category: 'Dasar Trading',
    simple: 'Trading riil dengan akun dan saldo Rupiah resmi Anda di bursa Indodax.',
    detail: 'Order beli dan jual langsung dieksekusi di bursa menggunakan Trade API v2.0 Indodax dengan autentikasi tanda tangan HMAC-SHA256.',
  },
  {
    term: 'Trailing Stop Loss',
    category: 'Manajemen Risiko',
    simple: 'Batas proteksi kerugian dinamis yang otomatis naik saat harga naik, dan mengunci profit saat harga berbalik arah.',
    detail: 'Berbeda dengan stop loss statis yang tetap di titik bawah, trailing stop bergerak mengikuti kenaikan harga puncak (highest watermark). Jika harga turun sebesar persentase trailing dari puncak, posisi langsung dijual demi mengamankan laba.',
  },
  {
    term: 'Take Profit (Profit Tahap 1 / TP1)',
    category: 'Manajemen Risiko',
    simple: 'Penjualan sebagian posisi (scale-out) saat target profit awal tercapai untuk mengamankan modal pokok.',
    detail: 'Saat harga mencapai target TP1, bot menjual 50% porsi koin, dan memindahkan batas proteksi sisanya ke Titik Impas (Break-Even) sehingga sisa posisi menjadi bebas risiko (free-roll trade).',
  },
  {
    term: 'Titik Impas (Break-Even Point / BEP)',
    category: 'Manajemen Risiko',
    simple: 'Harga di mana posisi tidak untung dan tidak rugi (setelah memperhitungkan biaya transaksi bursa).',
    detail: 'Ketika harga sudah naik melampaui target tertentu, bot mengunci stop loss persis di atas harga beli + fee bursa (0.2%), menjamin transaksi tidak berakhir dengan kerugian modal.',
  },
  {
    term: 'Circuit Breaker (Rem Pengaman Harian)',
    category: 'Manajemen Risiko',
    simple: 'Sistem penghenti otomatis yang mem-pause trading jika kerugian harian mencapai batas toleransi maksimal.',
    detail: 'Jika total kerugian hari itu menyentuh batas profil risiko (contoh: 3% pada profil Konservatif), bot seketika menahan seluruh pembelian baru selama 24 jam untuk melindungi modal dari kehancuran berturut-turut.',
  },
  {
    term: 'Selisih Harga (Slippage)',
    category: 'Dasar Trading',
    simple: 'Perbedaan antara harga yang diharapkan saat order dibuat dengan harga sebenarnya saat order terpenuhi di pasar.',
    detail: 'Pada bursa dengan likuiditas tipis, order besar bisa terisi di harga lebih tinggi. Bot menghitung estimasi slippage pada buku order sebelum masuk dan membatalkan entry jika melebihi batas toleransi.',
  },
  {
    term: 'Buku Order (Orderbook)',
    category: 'Dasar Trading',
    simple: 'Daftar antrean order beli (bid) dan antrean order jual (ask) yang sedang aktif di bursa.',
    detail: 'Bot menganalisis ketebalan antrean pada orderbook (kedalaman likuiditas) untuk memastikan ada cukup volume sebelum membeli agar tidak terjebak likuiditas tipis.',
  },
  {
    term: 'Selisih Beli-Jual (Spread)',
    category: 'Dasar Trading',
    simple: 'Jarak antara harga penawaran jual terendah dengan harga penawaran beli tertinggi di bursa.',
    detail: 'Spread yang terlalu lebar menandakan pasar tidak likuid dan berisiko memicu kerugian seketika begitu Anda membeli. Bot memblokir pembelian jika spread melebihi batas aman.',
  },
  {
    term: 'RSI (Relative Strength Index)',
    category: 'Indikator Teknikal',
    simple: 'Indikator momentum untuk mengukur apakah harga koin sudah terlalu mahal (overbought) atau terlalu murah (oversold).',
    detail: 'Skor RSI berkisar 0-100. RSI di atas 70 menunjukkan pasar sudah overbought (pucuk) dan rawan koreksi, sehingga bot melarang pembelian demi menghindari beli di puncak candle.',
  },
  {
    term: 'EMA (Exponential Moving Average)',
    category: 'Indikator Teknikal',
    simple: 'Garis rata-rata pergerakan harga yang memberi bobot lebih besar pada pergerakan harga terkini.',
    detail: 'Bot menggunakan EMA-21 dan EMA-50 untuk mendeteksi tren arah pasar (Uptrend vs Downtrend) dan memvalidasi apakah harga berada di fase sehat.',
  },
  {
    term: 'ATR (Average True Range)',
    category: 'Indikator Teknikal',
    simple: 'Ukuran rata-rata rentang gejolak (volatilitas) harga koin dalam periode waktu tertentu.',
    detail: 'Digunakan oleh bot untuk menentukan jarak trailing stop yang ideal. Koin bervolatilitas tinggi memerlukan jarak stop yang lebih adaptif agar tidak mudah tersentuh oleh wick palsu.',
  },
  {
    term: 'Win Rate',
    category: 'Indikator Teknikal',
    simple: 'Persentase jumlah transaksi yang berhasil menghasilkan keuntungan dibandingkan total transaksi selesai.',
    detail: 'Dihitung dengan rumus: (Jumlah Transaksi Untung / Total Transaksi) x 100%. Contoh: 8 untung dari 10 transaksi = Win Rate 80%.',
  },
  {
    term: 'Profit Factor',
    category: 'Indikator Teknikal',
    simple: 'Rasio antara total nilai uang yang dihasilkan dari transaksi untung dibanding total nilai uang dari transaksi rugi.',
    detail: 'Nilai di atas 1.5 menandakan strategi yang sehat. Contoh: jika total laba Rp 1.500.000 dan total rugi Rp 500.000, maka Profit Factor adalah 3.0.',
  },
  {
    term: 'Max Drawdown',
    category: 'Manajemen Risiko',
    simple: 'Penurunan terdalam saldo portofolio dari titik tertinggi (peak) ke titik terendah (trough).',
    detail: 'Mengukur risiko penurunan modal terburuk yang pernah dialami strategi. Semakin kecil angka drawdown, semakin aman strategi tersebut bagi investor konservatif.',
  },
  {
    term: 'Pelacak Whale On-Chain',
    category: 'Fitur AI',
    simple: 'Analis AI yang melacak pergerakan dompet kripto bermodal raksasa (whale) menuju atau keluar dari bursa.',
    detail: 'Inflow besar koin ke bursa sering kali mendahului aksi jual masal (dump), sementara outflow ke dompet dingin menandakan akumulasi jangka panjang.',
  },
  {
    term: 'Sentimen Pasar',
    category: 'Fitur AI',
    simple: 'Skor nada berita dan obrolan komunitas terhadap suatu koin, berskala -1.0 (sangat negatif) sampai +1.0 (sangat positif).',
    detail: 'Bot menganalisis 100+ sumber berita crypto dan media sosial untuk memastikan pembelian hanya dilakukan saat sentimen publik mendukung.',
  },
  {
    term: '9 Gerbang Pengaman (Pure Risk Guard)',
    category: 'Manajemen Risiko',
    simple: 'Sembilan lapis pemeriksaan kuantitatif bertingkat yang wajib diloloskan sebelum suatu order beli disetujui.',
    detail: 'Gerbang meliputi: (1) Sakelar Auto-Trading, (2) Rem Kerugian Harian, (3) Kapasitas Posisi, (4) Filter Crash BTC, (5) Deteksi Perangkap Spread, (6) Filter Pucuk RSI, (7) Anggaran Toleransi Slippage, (8) Skor Peluang Rebound, (9) Konfirmasi AI Manajer Risiko.',
  },
  {
    term: 'Kuota AI & Penghemat Token',
    category: 'Fitur AI',
    simple: 'Sistem cerdas yang mengoptimalkan konsumsi API kecerdasan buatan dan mencegah pembengkakan pemakaian.',
    detail: 'Menggunakan deduplikasi konteks berbasis SHA-256 dan fail-safe deterministik: jika kuota AI menipis, bot tetap dapat berjalan aman menggunakan indikator teknikal murni.',
  },
  {
    term: 'Posisi Bayangan (Ghost Trade)',
    category: 'Fitur AI',
    simple: 'Simulasi posisi koin yang ditolak oleh AI untuk menguji apakah keputusan penolakan AI benar-benar menyelamatkan modal.',
    detail: 'Jika sinyal ditolak AI lalu harganya turun menyentuh stop-loss, sistem mencatatnya sebagai "Kerugian Terhindar" (Bullet Dodged), membuktikan secara empiris nilai tambah filter AI.',
  },
];

const FAQ_LIST: FaqItem[] = [
  {
    question: 'Apakah uang / modal saya aman menggunakan aplikasi ini?',
    category: 'Keamanan & Modal',
    answer:
      'Ya! Keamanan modal adalah prioritas utama rancangan AI-Trading. Secara default, aplikasi selalu berjalan di Mode Paper (uang simulasi) sehingga rupiah Anda tidak tersentuh sama sekali. Selain itu, API Key Indodax tidak pernah membutuhkan izin "Withdraw" (penarikan) — Anda hanya perlu mengaktifkan izin "View" dan "Trade". Sistem tidak memiliki akses untuk mentransfer uang keluar dari akun bursa Anda.',
  },
  {
    question: 'Bagaimana cara mendapatkan API Key resmi dari Indodax?',
    category: 'Setup & API',
    answer:
      '1. Masuk ke situs web resmi Indodax.com di browser komputer.\n2. Klik menu Profil akun Anda ➜ pilih "API".\n3. Buat API Key baru, beri label (misal: "AITrading").\n4. Centang izin "Trade" dan "View". JANGAN centang izin "Withdraw".\n5. Masukkan kode 2FA untuk konfirmasi, lalu salin Key dan Secret ke menu Pengaturan di aplikasi ini.',
  },
  {
    question: 'Mengapa bot diam saja dan belum melakukan pembelian koin?',
    category: 'Logika Trading',
    answer:
      'Bot trading yang baik adalah bot yang disiplin! Sebelum membeli koin, sistem harus meloloskan "9 Gerbang Pengaman" (seperti filter kondisi BTC, spread tipis, dan RSI yang tidak overbought). Jika pasar sedang turun atau berisiko tinggi, menahan posisi dan tidak belanja adalah bentuk perlindungan terbaik bagi modal Anda. Anda dapat memeriksa panel "Diagnostik 9 Gerbang" di dashboard untuk melihat koin apa yang sedang dipantau dan alasan penolakannya.',
  },
  {
    question: 'Apa yang terjadi jika koneksi internet atau server komputer saya mati?',
    category: 'Troubleshooting',
    answer:
      'Jika server bot mati, order yang belum terisi di bursa tidak akan diproses. Untuk posisi yang sudah terbuka, bot dilengkapi mekanisme Deadman Switch & Take-Profit di bursa. Namun demi kinerja optimal (terutama untuk trailing stop real-time), disarankan menjalankan bot di komputer yang terhubung internet stabil atau VPS 24 jam.',
  },
  {
    question: 'Berapa modal minimal yang disarankan untuk mulai trading?',
    category: 'Keamanan & Modal',
    answer:
      'Bursa Indodax menetapkan minimal order sekitar Rp 10.000 per transaksi. Untuk memulai, modal Rp 100.000 s/d Rp 500.000 sudah sangat cukup untuk mencoba bot dengan profil Konservatif. Anda dapat menggunakan kalkulator risiko di Pengaturan untuk menghitung alokasi per koin secara otomatis.',
  },
  {
    question: 'Bagaimana cara menghubungkan akun AI Google (Antigravity)?',
    category: 'Setup & API',
    answer:
      'Di dashboard atau Pengaturan, klik tombol "Hubungkan Antigravity (Google OAuth)". Anda akan diarahkan untuk login ke akun Google Anda. Setelah disetujui, token tersimpan secara lokal dan membuka model mutakhir (Gemini 3.8 Flash, Claude Sonnet 4.6) tanpa biaya API tambahan.',
  },
  {
    question: 'Apa perbedaan mendasar mode Paper vs mode Live?',
    category: 'Logika Trading',
    answer:
      'Mode Paper menggunakan saldo virtual Rp 10.000.000 untuk berlatih tanpa risiko rugi sedikit pun, namun tetap membaca harga dan orderbook nyata dari Indodax. Mode Live menggunakan saldo Rupiah asli di akun Indodax Anda dan mengeksekusi order nyata di bursa.',
  },
  {
    question: 'Bagaimana cara kerja Trailing Stop Loss melindungi profit saya?',
    category: 'Logika Trading',
    answer:
      'Misalkan Anda membeli koin di harga Rp 1.000 dengan trailing stop 3%. Jika harga naik menjadi Rp 1.500, batas proteksi otomatis ikut naik ke Rp 1.455 (3% di bawah Rp 1.500). Jika harga kemudian berbalik turun ke Rp 1.455, bot langsung menjual posisi tersebut, sehingga Anda tetap mengantongi laba 45,5%!',
  },
  {
    question: 'Apakah bot ini memerlukan biaya langganan bulanan atau bagi hasil?',
    category: 'Keamanan & Modal',
    answer:
      'Tidak! Piranti lunak ini berjalan 100% di perangkat Anda secara mandiri (self-hosted). Tidak ada biaya langganan cloud bulanan, tidak ada komisi per trade ke pihak ketiga, dan tidak ada bagi hasil keuntungan.',
  },
  {
    question: 'Bagaimana cara membuat cadangan (backup) dan memulihkan data?',
    category: 'Troubleshooting',
    answer:
      'Buka tab "Laporan & Kinerja" ➜ pada bagian "Backup & Keamanan Database", klik tombol "Buat Snapshot Backup Database". File cadangan SQLite akan dibuat otomatis dan dapat diunduh ke komputer Anda kapan saja.',
  },
];

export const GlossaryModal: React.FC<GlossaryModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'glossary',
}) => {
  const [activeTab, setActiveTab] = useState<'glossary' | 'faq'>(defaultTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  if (!isOpen) return null;

  const categories = activeTab === 'glossary'
    ? ['all', 'Dasar Trading', 'Manajemen Risiko', 'Indikator Teknikal', 'Fitur AI']
    : ['all', 'Keamanan & Modal', 'Setup & API', 'Logika Trading', 'Troubleshooting'];

  const filteredTerms = GLOSSARY_TERMS.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesQuery =
      item.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.simple.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.detail.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

  const filteredFaqs = FAQ_LIST.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesQuery =
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesQuery;
  });

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
                <span>Pusat Edukasi &amp; Bantuan Pemula</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-950/40 text-blue-300 font-mono">
                  Panduan Lengkap
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pahami seluruh istilah pasar dan jawaban pertanyaan umum dalam bahasa Indonesia yang ramah.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Tutup Modal"
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
                <span>Kamus Istilah ({GLOSSARY_TERMS.length})</span>
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
                <span>Tanya Jawab FAQ ({FAQ_LIST.length})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeTab === 'glossary' ? 'Cari istilah (cth: Trailing Stop, RSI)...' : 'Cari pertanyaan...'}
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
            <span className="text-[11px] text-slate-500 mr-1">Kategori:</span>
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
                {cat === 'all' ? 'Semua Kategori' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
          {activeTab === 'glossary' ? (
            filteredTerms.length > 0 ? (
              <div className="space-y-3">
                {filteredTerms.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-800 bg-[#070b13] hover:border-slate-700 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                        <span>{item.term}</span>
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-800 bg-slate-900 text-slate-400 font-mono">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-emerald-400 leading-relaxed">
                      💡 {item.simple}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-slate-900">
                      {item.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                Tidak ada istilah yang cocok dengan pencarian &quot;{searchQuery}&quot;.
              </div>
            )
          ) : (
            filteredFaqs.length > 0 ? (
              <div className="space-y-2.5">
                {filteredFaqs.map((faq, idx) => {
                  const isExpanded = expandedFaq === idx;
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
                            {faq.question}
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
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                Tidak ada pertanyaan FAQ yang cocok dengan pencarian &quot;{searchQuery}&quot;.
              </div>
            )
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Info className="h-4 w-4 text-blue-400 shrink-0" />
            <span>Panduan lengkap pemula tersedia di file <code className="text-blue-300 bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-500/20">docs/PANDUAN_PENGGUNA.md</code></span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
