import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Gamepad2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Activity,
  Sliders,
  Target,
  Bot,
  Zap,
  Award,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';

export interface TutorialStep {
  id: string;
  tab: 'dashboard' | 'reports' | 'scanner' | 'agents' | 'backtest' | 'whatsapp' | 'quota' | 'settings';
  targetSelector?: string; // CSS selector for spotlight
  title: string;
  badge: string;
  narrative: string;
  tip: string;
  buttonText: string;
  centerModal?: boolean; // If true, display as centered dialog (intro or outro)
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    tab: 'dashboard',
    title: 'Selamat Datang di Cockpit AI Trading!',
    badge: 'MISI 1: ORIENTASI COCKPIT',
    centerModal: true,
    narrative:
      'Halo Trader! Selamat datang di platform trading crypto otomatis bertenaga Multi-Agent AI. Seperti bermain game simulator, kamu adalah Komandan armada ini. Di cockpit ini, kamu bisa memantau pasar Indodax, membaca radar koin, dan membiarkan algoritma kuantitatif memburu profit secara terukur. Tapi ingat, komandan bijak tidak asal menekan tombol sebelum memahami fungsi cockpit-nya!',
    tip: 'Jika kamu sudah memahami dasar trading, kamu dapat menekan tombol "Lewati Tur" kapan saja untuk langsung masuk ke cockpit.',
    buttonText: 'Siap! Mulai Misi Pelatihan ➜',
  },
  {
    id: 'trading-mode',
    tab: 'dashboard',
    targetSelector: '[data-tour="trading-mode"]',
    title: 'Kenali Mode Trading: Paper vs Live',
    badge: 'MISI 2: MODE SIMULASI',
    narrative:
      'Lihat tombol yang menyala di atas! Secara default, sistem berada di MODE: PAPER. Di mode ini, bot trading menggunakan uang virtual (simulasi). Uang Rupiah aslimu 100% AMAN karena tidak ada transaksi bursa nyata yang dikirim. Jangan pernah beralih ke MODE: LIVE sebelum kamu benar-benar menguji performa dan strategi bot di mode simulasi!',
    tip: 'Mode Paper sangat cocok untuk melihat bagaimana bot bereaksi terhadap gejolak pasar tanpa resiko rugi.',
    buttonText: 'Paham, Lanjut ke Sakelar Utama ➜',
  },
  {
    id: 'auto-trading',
    tab: 'dashboard',
    targetSelector: '[data-tour="auto-trading"]',
    title: 'Sakelar Mesin Bot: Auto-Trading Switch',
    badge: 'MISI 3: KENDALI MESIN',
    narrative:
      'Ini adalah Sakelar Mesin Utama bot kamu! Ketika berstatus PAUSED (Abu-abu / Off), bot hanya memantau pasar sebagai pengamat dan TIDAK AKAN membuka posisi beli. Ketika kamu nyalakan menjadi ACTIVE (Hijau / On), mesin otomatis melakukan pemindaian berkala, mengevaluasi indikator, dan mengeksekusi order.',
    tip: 'Saat baru menyalakan bot atau mengubah pengaturan, selalu pastikan status PAUSED agar kamu bisa memeriksa setting terlebih dahulu.',
    buttonText: 'Lanjut ke Rem Darurat ➜',
  },
  {
    id: 'panic-sell',
    tab: 'dashboard',
    targetSelector: '[data-tour="panic-sell"]',
    title: 'Rem Darurat: Panic Sell',
    badge: 'MISI 4: PROTEKSI MODAL',
    narrative:
      'Setiap pesawat tempur punya tombol kursi pelontar darurat — di trading ada tombol PANIC SELL! Jika pasar crypto tiba-tiba mengalami crash mendadak atau kamu ingin segera mengamankan seluruh dana, tombol merah ini akan langsung melikuidasi seluruh posisi koin terbuka kembali ke saldo Rupiah (IDR) dalam satu klik konfirmasi.',
    tip: 'Gunakan tombol ini hanya dalam kondisi darurat ketika kamu ingin keluar dari seluruh pasar seketika.',
    buttonText: 'Pergi ke Markas Pengaturan ➜',
  },
  {
    id: 'settings-nav',
    tab: 'settings',
    targetSelector: '[data-tour="nav-settings"]',
    title: 'Kunjungi Markas: AI Models & Settings',
    badge: 'MISI 5: KUNJUNGI SHOP / MARKAS',
    narrative:
      'Seperti di game RPG di mana kamu harus ke Shop / Inventory untuk upgrade senjata, di trading kamu wajib memahami Markas Pengaturan (Settings)! Di menu inilah kamu menghubungkan model kecerdasan buatan (Gemini / Claude), mengatur batas modal per trade, dan memilih profil risiko.',
    tip: 'Kita baru saja berpindah ke tab Pengaturan. Mari kita lihat senjata rahasia untuk pemula!',
    buttonText: 'Lihat Fitur 1-Klik Pemula ➜',
  },
  {
    id: 'beginner-preset',
    tab: 'settings',
    targetSelector: '[data-tour="beginner-preset"]',
    title: 'Golden Rule: Gunakan Profil Konservatif!',
    badge: 'MISI 6: ATURAN EMAS PEMULA',
    narrative:
      'Aturan paling penting bagi pemula adalah: PROTEKSI MODAL JAUH LEBIH PENTING DARIPADA MENGINCAR UNTUNG CEPAT! Jangan langsung memakai profil Agresif. Di banner hijau ini terdapat tombol "Setup Otomatis 1-Klik untuk Pemula" yang akan langsung menyetel bot ke profil Konservatif: hanya trading koin blue-chip terkuat (BTC, ETH, SOL) dengan Stop Loss ketat dan tanpa koin micin/memecoin!',
    tip: 'Dengan profil konservatif, bot memiliki 9 gerbang pengaman untuk menahanmu dari jebakan FOMO.',
    buttonText: 'Periksa Radar & Diagnostik Sinyal ➜',
  },
  {
    id: 'entry-diagnostics',
    tab: 'dashboard',
    targetSelector: '[data-tour="entry-diagnostics"]',
    title: 'Transparansi Penuh: Diagnostik Gerbang Masuk',
    badge: 'MISI 7: MONITOR RADAR',
    narrative:
      'Pertanyaan paling sering dari pemula: "Kenapa bot diam saja dan belum belanja?" Jawabannya ada di panel Diagnostik Gerbang Masuk ini! Bot AI kamu dilengkapi 9 lapis gerbang pengaman kuantitatif (Circuit Breaker, Crash Filter BTC, Slippage Book, Spread Trap, RSI Pucuk). Panel ini secara jujur dan transparan menampilkan gerbang mana yang menolak koin demi menyelamatkan uangmu dari kerugian!',
    tip: 'Jika kondisi pasar tidak ideal, tidak trading adalah bentuk trading terbaik untuk melindungi modalmu.',
    buttonText: 'Selesaikan Pelatihan Cockpit! 🎖️',
  },
  {
    id: 'completed',
    tab: 'dashboard',
    title: 'Misi Selesai: Cockpit Unlocked! 🏆',
    badge: 'PELATIHAN LULUS',
    centerModal: true,
    narrative:
      'Selamat, Komandan! Kamu telah menyelesaikan seluruh misi pelatihan awal. Sekarang kamu sudah memahami fungsi mode Paper, sakelar Auto-Trading, tombol Panic Sell, profil risiko Konservatif, serta transparansi Diagnostik Gerbang Masuk.',
    tip: '3 Aturan Emas Trader Pemula: 1. Selalu mulai dari Paper Trading. 2. Gunakan profil risiko Konservatif. 3. Jangan panik saat bot menahan trading di pasar berbahaya.',
    buttonText: 'Mulai Jelajahi Cockpit 🚀',
  },
];

interface GameTutorialModalProps {
  isOpen: boolean;
  onComplete: () => void;
  activeTab: string;
  onSwitchTab: (tab: string) => void;
}

export const GameTutorialModal: React.FC<GameTutorialModalProps> = ({
  isOpen,
  onComplete,
  activeTab,
  onSwitchTab,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    const saved = localStorage.getItem('ai_trading_tutorial_step');
    const parsed = saved ? parseInt(saved, 10) : 0;
    return !isNaN(parsed) && parsed >= 0 && parsed < TUTORIAL_STEPS.length ? parsed : 0;
  });
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const step = TUTORIAL_STEPS[currentStepIndex];
  const progressPercent = Math.round(((currentStepIndex + 1) / TUTORIAL_STEPS.length) * 100);

  // Sync activeTab when step changes
  useEffect(() => {
    if (!isOpen) return;
    if (step.tab && step.tab !== activeTab) {
      onSwitchTab(step.tab);
    }
  }, [isOpen, currentStepIndex, step.tab, activeTab, onSwitchTab]);

  // Measure and track target element bounding rect
  const updateTargetRect = useCallback(() => {
    if (!step.targetSelector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step.targetSelector]);

  useEffect(() => {
    if (!isOpen) return;

    // Small delay to allow tab render and layout transition
    const timeout = setTimeout(() => {
      updateTargetRect();

      // Scroll target element into view smoothly if needed
      if (step.targetSelector) {
        const el = document.querySelector(step.targetSelector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 150);

    const handleResizeOrScroll = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(updateTargetRect);
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isOpen, currentStepIndex, step.targetSelector, updateTargetRect]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < TUTORIAL_STEPS.length - 1) {
      const next = currentStepIndex + 1;
      setCurrentStepIndex(next);
      localStorage.setItem('ai_trading_tutorial_step', String(next));
    } else {
      localStorage.removeItem('ai_trading_tutorial_step');
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      const prev = currentStepIndex - 1;
      setCurrentStepIndex(prev);
      localStorage.setItem('ai_trading_tutorial_step', String(prev));
    }
  };

  const handleSkip = () => {
    localStorage.removeItem('ai_trading_tutorial_step');
    onComplete();
  };

  const isFinalStep = currentStepIndex === TUTORIAL_STEPS.length - 1;

  // Calculate position for dialog box relative to target rect
  const getDialogStyle = (): React.CSSProperties => {
    if (step.centerModal || !targetRect) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const dialogWidth = Math.min(480, viewportWidth - 32);

    // Default: place below the target
    let top = targetRect.bottom + 16;
    let left = targetRect.left + targetRect.width / 2 - dialogWidth / 2;

    // Boundary check for horizontal
    if (left < 16) left = 16;
    if (left + dialogWidth > viewportWidth - 16) {
      left = viewportWidth - dialogWidth - 16;
    }

    // If target is too low in viewport, place above
    if (top + 280 > viewportHeight && targetRect.top > 300) {
      top = targetRect.top - 280 - 16;
    }

    return {
      position: 'fixed',
      top: `${Math.max(16, top)}px`,
      left: `${left}px`,
      width: `${dialogWidth}px`,
      zIndex: 9999,
    };
  };

  return (
    <div className="fixed inset-0 z-[9990] overflow-hidden select-none pointer-events-auto">
      {/* 1. Dark Backdrop Overlay */}
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm transition-all duration-300" />

      {/* 2. Spotlight Cutout / Glowing Frame over Target Element */}
      {targetRect && !step.centerModal && (
        <div
          className="fixed pointer-events-none transition-all duration-300 ease-out z-[9995]"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            borderRadius: '16px',
            boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.88), 0 0 35px rgba(59, 130, 246, 0.65)',
            border: '2px solid rgba(96, 165, 250, 0.9)',
          }}
        >
          {/* Pulsating corner beacons */}
          <span className="absolute -top-1.5 -left-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
          </span>
          <span className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
          </span>

          {/* Floating animated target pointer tag */}
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full shadow-lg flex items-center gap-1 animate-bounce">
            <Target className="w-3 h-3" />
            <span>TARGET MISI</span>
          </div>
        </div>
      )}

      {/* 3. Game HUD Quest Dialog Box */}
      <div
        style={getDialogStyle()}
        className={`w-full max-w-lg rounded-2xl border-2 border-blue-500/50 bg-[#090f1d] shadow-2xl shadow-blue-950/80 p-5 sm:p-6 text-slate-100 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 ${
          step.centerModal ? 'mx-4' : ''
        }`}
      >
        {/* HUD Top Bar: Mission Badge, Progress, & Unskippable indicator */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/40">
              <Gamepad2 className="w-4 h-4 text-blue-300 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] font-mono tracking-wider font-extrabold text-blue-400 uppercase">
                {step.badge}
              </span>
              <div className="text-xs font-bold text-slate-200">
                Langkah {currentStepIndex + 1} dari {TUTORIAL_STEPS.length}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={handleSkip}
              className="text-[10px] font-mono font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-2 py-0.5 rounded-full transition-colors"
              title="Lewati tutorial dan langsung ke terminal"
            >
              Lewati Tur ✕
            </button>
            {/* Progress Bar */}
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quest Title & Guide Avatar */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-md shadow-blue-600/30 border border-blue-400/40">
            {isFinalStep ? (
              <Award className="w-6 h-6 text-amber-300 animate-bounce" />
            ) : (
              <Bot className="w-6 h-6 text-blue-100" />
            )}
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight leading-snug">
              {step.title}
            </h3>
            <p className="text-xs text-blue-300/80 font-mono mt-0.5">
              Instruksi AI Tactical Navigator
            </p>
          </div>
        </div>

        {/* Narrative / Explanation Body */}
        <div className="p-3.5 rounded-xl border border-slate-800/80 bg-slate-900/60 text-xs sm:text-sm text-slate-300 leading-relaxed max-h-[220px] overflow-y-auto">
          {step.narrative}
        </div>

        {/* Tactical Pro-Tip Box */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl border border-blue-500/30 bg-blue-950/30 text-xs text-blue-200">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="leading-snug">
            <strong className="text-blue-300 font-semibold">Tips Pemula: </strong>
            <span>{step.tip}</span>
          </div>
        </div>

        {/* Bottom Actions: Prev & Next Button (NO SKIP BUTTON) */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          {currentStepIndex > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Sebelumnya</span>
            </button>
          ) : (
            <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Ikuti panduan tahap demi tahap</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleNext}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all active:scale-95"
          >
            <span>{step.buttonText}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
