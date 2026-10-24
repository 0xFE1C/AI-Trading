import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Gamepad2,
  Sparkles,
  ArrowLeft,
  Bot,
  Award,
  ChevronRight,
  HelpCircle,
  Target,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export interface TutorialStep {
  id: string;
  tab: 'dashboard' | 'reports' | 'scanner' | 'agents' | 'backtest' | 'whatsapp' | 'quota' | 'settings';
  targetSelector?: string;
  centerModal?: boolean;
  title_en: string;
  title_id: string;
  badge_en: string;
  badge_id: string;
  narrative_en: string;
  narrative_id: string;
  tip_en: string;
  tip_id: string;
  buttonText_en: string;
  buttonText_id: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    tab: 'dashboard',
    title_en: 'Welcome to the AI Trading Cockpit!',
    title_id: 'Selamat Datang di Cockpit AI Trading!',
    badge_en: 'MISSION 1: COCKPIT ORIENTATION',
    badge_id: 'MISI 1: ORIENTASI COCKPIT',
    centerModal: true,
    narrative_en:
      'Hello Trader! Welcome to the autonomous crypto trading platform powered by Multi-Agent AI. Think of this as a flight simulator where you are the Commander. From this cockpit, you can monitor the Indodax market, scan coin momentum, and let quantitative algorithms hunt for disciplined profits. A wise commander never flips switches without understanding their cockpit!',
    narrative_id:
      'Halo Trader! Selamat datang di platform trading crypto otomatis bertenaga Multi-Agent AI. Seperti bermain game simulator, kamu adalah Komandan armada ini. Di cockpit ini, kamu bisa memantau pasar Indodax, membaca radar koin, dan membiarkan algoritma kuantitatif memburu profit secara terukur. Tapi ingat, komandan bijak tidak asal menekan tombol sebelum memahami fungsi cockpit-nya!',
    tip_en: 'Complete this 8-step training orientation to master all controls and unlock your cockpit.',
    tip_id: 'Selesaikan 8 langkah orientasi pelatihan ini untuk menguasai kendali dan membuka cockpit kamu.',
    buttonText_en: 'Ready! Start Training Mission ➜',
    buttonText_id: 'Siap! Mulai Misi Pelatihan ➜',
  },
  {
    id: 'trading-mode',
    tab: 'dashboard',
    targetSelector: '[data-tour="trading-mode"]',
    title_en: 'Know Your Trading Mode: Paper vs Live',
    title_id: 'Kenali Mode Trading: Paper vs Live',
    badge_en: 'MISSION 2: SIMULATION MODE',
    badge_id: 'MISI 2: MODE SIMULASI',
    narrative_en:
      'Notice the glowing toggle highlighted above! By default, the system boots into MODE: PAPER. In this mode, the trading bot runs on simulated virtual balance. Your real Rupiah is 100% SAFE because zero real exchange orders are transmitted. Never switch to MODE: LIVE before validating strategy performance in simulation!',
    narrative_id:
      'Lihat tombol yang disorot di atas! Secara default, sistem berada di MODE: PAPER. Di mode ini, bot trading menggunakan uang virtual (simulasi). Uang Rupiah aslimu 100% AMAN karena tidak ada transaksi bursa nyata yang dikirim. Jangan pernah beralih ke MODE: LIVE sebelum kamu benar-benar menguji performa dan strategi bot di mode simulasi!',
    tip_en: 'Paper mode is ideal to see how the bot reacts to market swings without risking a single penny.',
    tip_id: 'Mode Paper sangat cocok untuk melihat bagaimana bot bereaksi terhadap gejolak pasar tanpa resiko rugi.',
    buttonText_en: 'Understood, Proceed to Master Switch ➜',
    buttonText_id: 'Paham, Lanjut ke Sakelar Utama ➜',
  },
  {
    id: 'auto-trading',
    tab: 'dashboard',
    targetSelector: '[data-tour="auto-trading"]',
    title_en: 'Bot Engine Master Switch: Auto-Trading',
    title_id: 'Sakelar Mesin Bot: Auto-Trading Switch',
    badge_en: 'MISSION 3: ENGINE CONTROL',
    badge_id: 'MISI 3: KENDALI MESIN',
    narrative_en:
      'This is your bot\'s Main Engine Ignition! When set to PAUSED (Gray / Off), the bot operates purely as an observer and WILL NOT open buy positions. When flipped to ACTIVE (Green / On), the engine autonomously performs periodic scans, evaluates indicators, and executes orders.',
    narrative_id:
      'Ini adalah Sakelar Mesin Utama bot kamu! Ketika berstatus PAUSED (Abu-abu / Off), bot hanya memantau pasar sebagai pengamat dan TIDAK AKAN membuka posisi beli. Ketika kamu nyalakan menjadi ACTIVE (Hijau / On), mesin otomatis melakukan pemindaian berkala, mengevaluasi indikator, dan mengeksekusi order.',
    tip_en: 'Whenever configuring new settings, always keep the switch on PAUSED to verify your parameters first.',
    tip_id: 'Saat baru menyalakan bot atau mengubah pengaturan, selalu pastikan status PAUSED agar kamu bisa memeriksa setting terlebih dahulu.',
    buttonText_en: 'Proceed to Emergency Brake ➜',
    buttonText_id: 'Lanjut ke Rem Darurat ➜',
  },
  {
    id: 'panic-sell',
    tab: 'dashboard',
    targetSelector: '[data-tour="panic-sell"]',
    title_en: 'Emergency Brake: Panic Sell',
    title_id: 'Rem Darurat: Panic Sell',
    badge_en: 'MISSION 4: CAPITAL DEFENSE',
    badge_id: 'MISI 4: PROTEKSI MODAL',
    narrative_en:
      'Every jet fighter has an ejection seat button — in trading, that is PANIC SELL! If crypto markets experience an abrupt crash or you wish to instantly secure all funds, this red button liquidates all open coin positions back to Rupiah (IDR) cash in one single confirmed click.',
    narrative_id:
      'Setiap pesawat tempur punya tombol kursi pelontar darurat — di trading ada tombol PANIC SELL! Jika pasar crypto tiba-tiba mengalami crash mendadak atau kamu ingin segera mengamankan seluruh dana, tombol merah ini akan langsung melikuidasi seluruh posisi koin terbuka kembali ke saldo Rupiah (IDR) dalam satu klik konfirmasi.',
    tip_en: 'Use this emergency feature only when you want an immediate, complete exit from all active market positions.',
    tip_id: 'Gunakan tombol ini hanya dalam kondisi darurat ketika kamu ingin keluar dari seluruh pasar seketika.',
    buttonText_en: 'Go to Settings HQ ➜',
    buttonText_id: 'Pergi ke Markas Pengaturan ➜',
  },
  {
    id: 'settings-nav',
    tab: 'settings',
    targetSelector: '[data-tour="nav-settings"]',
    title_en: 'Visit HQ: AI Models & Settings',
    title_id: 'Kunjungi Markas: AI Models & Settings',
    badge_en: 'MISSION 5: VISIT ARMORY / HQ',
    badge_id: 'MISI 5: KUNJUNGI SHOP / MARKAS',
    narrative_en:
      'Just like visiting the Armory in an RPG to upgrade your equipment, in trading you must master your Settings HQ! Here you connect your artificial intelligence models (Gemini / Claude), tune capital allocation per trade, and select your risk profile.',
    narrative_id:
      'Seperti di game RPG di mana kamu harus ke Shop / Inventory untuk upgrade senjata, di trading kamu wajib memahami Markas Pengaturan (Settings)! Di menu inilah kamu menghubungkan model kecerdasan buatan (Gemini / Claude), mengatur batas modal per trade, dan memilih profil risiko.',
    tip_en: 'We just transitioned to the Settings tab. Let\'s inspect the secret weapon designed for beginners!',
    tip_id: 'Kita baru saja berpindah ke tab Pengaturan. Mari kita lihat senjata rahasia untuk pemula!',
    buttonText_en: 'View 1-Click Beginner Preset ➜',
    buttonText_id: 'Lihat Fitur 1-Klik Pemula ➜',
  },
  {
    id: 'beginner-preset',
    tab: 'settings',
    targetSelector: '[data-tour="beginner-preset"]',
    title_en: 'Golden Rule: Stick to Conservative Profile!',
    title_id: 'Golden Rule: Gunakan Profil Konservatif!',
    badge_en: 'MISSION 6: BEGINNER GOLDEN RULE',
    badge_id: 'MISI 6: ATURAN EMAS PEMULA',
    narrative_en:
      'The #1 rule for beginners: CAPITAL DEFENSE IS FAR MORE IMPORTANT THAN CHASING FAST GAINS! Do not jump into the Aggressive profile. In this green banner, the "1-Click Automatic Preset for Beginners" instantly configures the bot into Conservative mode: trading only bluechips (BTC, ETH, SOL) with strict Stop Loss and zero memecoin risk!',
    narrative_id:
      'Aturan paling penting bagi pemula adalah: PROTEKSI MODAL JAUH LEBIH PENTING DARIPADA MENGINCAR UNTUNG CEPAT! Jangan langsung memakai profil Agresif. Di banner hijau ini terdapat tombol "Setup Otomatis 1-Klik untuk Pemula" yang akan langsung menyetel bot ke profil Konservatif: hanya trading koin blue-chip terkuat (BTC, ETH, SOL) dengan Stop Loss ketat dan tanpa koin micin/memecoin!',
    tip_en: 'With a conservative profile, the bot relies on 9 safety gates to prevent emotional FOMO entries.',
    tip_id: 'Dengan profil konservatif, bot memiliki 9 gerbang pengaman untuk menahanmu dari jebakan FOMO.',
    buttonText_en: 'Inspect Radar & Entry Diagnostics ➜',
    buttonText_id: 'Periksa Radar & Diagnostik Sinyal ➜',
  },
  {
    id: 'entry-diagnostics',
    tab: 'dashboard',
    targetSelector: '[data-tour="entry-diagnostics"]',
    title_en: 'Total Transparency: 9 Gates Entry Diagnostics',
    title_id: 'Transparansi Penuh: Diagnostik Gerbang Masuk',
    badge_en: 'MISSION 7: RADAR MONITOR',
    badge_id: 'MISI 7: MONITOR RADAR',
    narrative_en:
      'The most frequent beginner question: "Why is the bot idle and not buying?" The answer lies in this Entry Diagnostics panel! Your AI bot is equipped with 9 quantitative safety barriers (Circuit Breaker, BTC Crash Filter, Orderbook Slippage, Spread Trap, RSI Peak). This panel honestly reveals which gate is blocking coins to protect your money from drawdown!',
    narrative_id:
      'Pertanyaan paling sering dari pemula: "Kenapa bot diam saja dan belum belanja?" Jawabannya ada di panel Diagnostik Gerbang Masuk ini! Bot AI kamu dilengkapi 9 lapis gerbang pengaman kuantitatif (Circuit Breaker, Crash Filter BTC, Slippage Book, Spread Trap, RSI Pucuk). Panel ini secara jujur dan transparan menampilkan gerbang mana yang menolak koin demi menyelamatkan uangmu dari kerugian!',
    tip_en: 'When market conditions are poor, no trade is the best trade to protect your capital.',
    tip_id: 'Jika kondisi pasar tidak ideal, tidak trading adalah bentuk trading terbaik untuk melindungi modalmu.',
    buttonText_en: 'Complete Cockpit Training! 🎖️',
    buttonText_id: 'Selesaikan Pelatihan Cockpit! 🎖️',
  },
  {
    id: 'completed',
    tab: 'dashboard',
    title_en: 'Mission Accomplished: Cockpit Unlocked! 🏆',
    title_id: 'Misi Selesai: Cockpit Unlocked! 🏆',
    badge_en: 'TRAINING GRADUATED',
    badge_id: 'PELATIHAN LULUS',
    centerModal: true,
    narrative_en:
      'Congratulations, Commander! You have successfully completed the initial flight orientation. You now understand Paper mode, the Auto-Trading master switch, Panic Sell safeguards, Conservative risk settings, and the transparent 9 Gates Entry Diagnostics.',
    narrative_id:
      'Selamat, Komandan! Kamu telah menyelesaikan seluruh misi pelatihan awal. Sekarang kamu sudah memahami fungsi mode Paper, sakelar Auto-Trading, tombol Panic Sell, profil risiko Konservatif, serta transparansi Diagnostik Gerbang Masuk.',
    tip_en: '3 Golden Rules for Beginners: 1. Always start in Paper Trading. 2. Use Conservative risk profile. 3. Never panic when the bot waits patiently in dangerous markets.',
    tip_id: '3 Aturan Emas Trader Pemula: 1. Selalu mulai dari Paper Trading. 2. Gunakan profil risiko Konservatif. 3. Jangan panik saat bot menahan trading di pasar berbahaya.',
    buttonText_en: 'Explore Cockpit Now 🚀',
    buttonText_id: 'Mulai Jelajahi Cockpit 🚀',
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
  const { l, language } = useLanguage();
  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    const saved = localStorage.getItem('ai_trading_tutorial_step');
    const parsed = saved ? parseInt(saved, 10) : 0;
    return !isNaN(parsed) && parsed >= 0 && parsed < TUTORIAL_STEPS.length ? parsed : 0;
  });
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const rawStep = TUTORIAL_STEPS[currentStepIndex];
  const step = useMemo(() => {
    const isId = language === 'id';
    return {
      ...rawStep,
      title: isId ? rawStep.title_id : rawStep.title_en,
      badge: isId ? rawStep.badge_id : rawStep.badge_en,
      narrative: isId ? rawStep.narrative_id : rawStep.narrative_en,
      tip: isId ? rawStep.tip_id : rawStep.tip_en,
      buttonText: isId ? rawStep.buttonText_id : rawStep.buttonText_en,
    };
  }, [rawStep, language]);

  const progressPercent = Math.round(((currentStepIndex + 1) / TUTORIAL_STEPS.length) * 100);

  // Sync activeTab when step changes
  useEffect(() => {
    if (!isOpen) return;
    if (step.tab && step.tab !== activeTab) {
      onSwitchTab(step.tab);
    }
  }, [isOpen, currentStepIndex, step.tab, activeTab, onSwitchTab]);

  // COMPLETE SCROLL & BACKGROUND LOCK: User cannot scroll or interact with background during tutorial
  useEffect(() => {
    if (!isOpen) return;

    // 1. Freeze body and document scroll
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    // 2. Prevent scroll wheel & touchmove
    const preventScroll = (e: Event) => {
      e.preventDefault();
    };

    // 3. Prevent scroll keys (arrow keys, page up/down, space, home, end)
    const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
    const preventKeyScroll = (e: KeyboardEvent) => {
      if (scrollKeys.has(e.key)) {
        e.preventDefault();
      }
    };

    window.addEventListener('wheel', preventScroll, { passive: false });
    window.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('keydown', preventKeyScroll, { passive: false });

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.removeEventListener('wheel', preventScroll);
      window.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('keydown', preventKeyScroll);
    };
  }, [isOpen]);

  // Measure and track target element bounding rect with retry
  const updateTargetRect = useCallback(() => {
    if (!step.targetSelector) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setTargetRect(rect);
        return;
      }
    }
    setTargetRect(null);
  }, [step.targetSelector]);

  // Robust element detection, scrolling into center, and DOM highlight class attachment
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let attempts = 0;

    const findAndMeasure = () => {
      if (cancelled) return;

      if (!step.targetSelector) {
        setTargetRect(null);
        return;
      }

      const el = document.querySelector(step.targetSelector) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setTargetRect(rect);

          // Add highlighting class to element directly
          el.classList.add('tutorial-active-target');

          // Smooth scroll only if element is outside comfortable viewport
          const inView =
            rect.top >= 40 &&
            rect.bottom <= window.innerHeight - 40 &&
            rect.left >= 0 &&
            rect.right <= window.innerWidth;

          if (!inView) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
      }

      // Retry up to 10 times (1 second total) in case views or tabs are still mounting
      if (attempts < 10) {
        attempts++;
        setTimeout(findAndMeasure, 100);
      }
    };

    findAndMeasure();

    const handleResizeOrScroll = () => {
      updateTargetRect();
    };

    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);

      // Clean up highlighting class
      if (step.targetSelector) {
        const el = document.querySelector(step.targetSelector);
        if (el) {
          el.classList.remove('tutorial-active-target');
        }
      }
    };
  }, [isOpen, currentStepIndex, step.targetSelector, activeTab, updateTargetRect]);

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

  const isFinalStep = currentStepIndex === TUTORIAL_STEPS.length - 1;

  // Calculate intelligent position for the dialog box relative to target rect
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
    const dialogEstimatedHeight = 360;

    // Special case: If target is in the sidebar on large desktop screens
    if (targetRect.left < 280 && viewportWidth >= 1024) {
      let top = Math.max(20, targetRect.top - 20);
      if (top + dialogEstimatedHeight > viewportHeight - 20) {
        top = Math.max(20, viewportHeight - dialogEstimatedHeight - 20);
      }
      return {
        position: 'fixed',
        top: `${top}px`,
        left: `${targetRect.right + 24}px`,
        width: `${dialogWidth}px`,
        zIndex: 9999,
      };
    }

    // Default: place below the target
    let top = targetRect.bottom + 16;
    let left = targetRect.left + targetRect.width / 2 - dialogWidth / 2;

    // If placing below exceeds screen bottom, place above target
    if (top + dialogEstimatedHeight > viewportHeight - 16 && targetRect.top > dialogEstimatedHeight + 20) {
      top = targetRect.top - dialogEstimatedHeight - 16;
    }

    // Horizontal boundary clamp
    if (left < 16) left = 16;
    if (left + dialogWidth > viewportWidth - 16) {
      left = viewportWidth - dialogWidth - 16;
    }

    return {
      position: 'fixed',
      top: `${Math.max(16, top)}px`,
      left: `${left}px`,
      width: `${dialogWidth}px`,
      zIndex: 9999,
    };
  };

  const hasCutout = !step.centerModal && targetRect;

  return (
    <div
      className="fixed inset-0 z-[9990] overflow-hidden select-none pointer-events-auto"
      onClick={(e) => {
        // Prevent clicking anywhere in the background from triggering any underlying actions
        e.stopPropagation();
        e.preventDefault();
      }}
    >
      {/* 1. Backdrop Overlay:
             If there is a target, use SVG Mask to punch a 100% CRYSTAL-CLEAR TRANSPARENT HOLE directly over the target element.
             If centerModal or no target, use a smooth dark backdrop. */}
      {hasCutout ? (
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none z-[9991]"
          style={{ width: '100vw', height: '100vh' }}
        >
          <defs>
            <mask id="tutorial-spotlight-hole">
              {/* White area = dimmed backdrop */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {/* Black area = 100% PURE TRANSPARENT CUTOUT showing real element underneath */}
              <rect
                x={Math.max(0, targetRect.left - 8)}
                y={Math.max(0, targetRect.top - 8)}
                width={targetRect.width + 16}
                height={targetRect.height + 16}
                rx="14"
                ry="14"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(3, 7, 18, 0.75)"
            mask="url(#tutorial-spotlight-hole)"
          />
        </svg>
      ) : (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs transition-opacity duration-300 z-[9991]" />
      )}

      {/* 2. Futuristic Neon Frame around the Transparent Cutout */}
      {hasCutout && (
        <div
          className="fixed pointer-events-none transition-all duration-300 ease-out z-[9995]"
          style={{
            top: Math.max(0, targetRect.top - 8),
            left: Math.max(0, targetRect.left - 8),
            width: targetRect.width + 16,
            height: targetRect.height + 16,
            borderRadius: '14px',
            border: '2px solid #38bdf8',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.55), inset 0 0 12px rgba(56, 189, 248, 0.2)',
          }}
        >
          {/* Tactical Corner Targeting Brackets */}
          <span className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-cyan-300" />
          <span className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-cyan-300" />
          <span className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-cyan-300" />
          <span className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-cyan-300" />

          {/* Pulsating Corner Beacons */}
          <span className="absolute -top-1.5 -left-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
          </span>
          <span className="absolute -bottom-1.5 -right-1.5 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500" />
          </span>

          {/* Animated Target Badge */}
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white text-[10px] font-mono font-extrabold px-3 py-0.5 rounded-full shadow-lg shadow-cyan-950/60 flex items-center gap-1.5 animate-bounce whitespace-nowrap">
            <Target className="w-3 h-3 text-cyan-200" />
            <span>{l('MISSION TARGET', 'TARGET MISI')}</span>
          </div>
        </div>
      )}

      {/* 3. Game HUD Quest Dialog Box (Only clickable element) */}
      <div
        style={getDialogStyle()}
        onClick={(e) => {
          // Allow clicks inside dialog box (prev and next buttons)
          e.stopPropagation();
        }}
        className={`w-full max-w-lg rounded-2xl border-2 border-blue-500/50 bg-[#090f1d] shadow-2xl shadow-blue-950/90 p-5 sm:p-6 text-slate-100 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200 pointer-events-auto ${
          step.centerModal ? 'mx-4' : ''
        }`}
      >
        {/* HUD Top Bar: Mission Badge & Progress Percentage (NO SKIP BUTTON) */}
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
                {language === 'id'
                  ? `Langkah ${currentStepIndex + 1} dari ${TUTORIAL_STEPS.length}`
                  : `Step ${currentStepIndex + 1} of ${TUTORIAL_STEPS.length}`}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1 text-[10px] font-mono font-semibold text-blue-400 bg-blue-950/60 border border-blue-500/30 px-2 py-0.5 rounded-full">
              <Sparkles className="w-2.5 h-2.5 text-blue-300 animate-pulse" />
              <span>{progressPercent}%</span>
            </div>
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
              {l('AI Tactical Navigator Briefing', 'Instruksi AI Tactical Navigator')}
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
            <strong className="text-blue-300 font-semibold">{l('Pro Tip: ', 'Tips Pemula: ')}</strong>
            <span>{step.tip}</span>
          </div>
        </div>

        {/* Bottom Actions: ONLY Prev & Next / Finish Button */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
          {currentStepIndex > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{l('Previous', 'Sebelumnya')}</span>
            </button>
          ) : (
            <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{l('Follow step-by-step briefing', 'Ikuti panduan tahap demi tahap')}</span>
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
