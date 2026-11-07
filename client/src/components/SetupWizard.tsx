import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  Cpu,
  Zap,
  Wallet,
  Bell,
  CheckCircle2,
  Circle,
  ArrowLeft,
  ArrowRight,
  X,
  Shield,
  Scale,
  Flame,
  Lock,
  Bot,
  Globe,
  Info,
  PartyPopper,
} from 'lucide-react';
import { AIModel, AIProvider, RiskProfileKey } from '../types';
import { api, isStaticHost } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { SettingsSubTab } from './SettingsView';

interface CapitalPlanPreview {
  maxAllocationPerTradeIdr?: number;
  maxActiveTrades?: number;
  trailingStopPercent?: number;
  dailyLossLimitPercent?: number;
  cashBufferIdr?: number;
}

interface SetupWizardProps {
  isOpen: boolean;
  isAdmin: boolean;
  /** Every close path (X, ESC, backdrop, "Nanti", finish) marks setup done in App. */
  onClose: () => void;
  /** Opens Settings on a specific sub-tab (closes the wizard first). */
  onOpenSettings: (subTab: SettingsSubTab) => void;
  /** Opens the Bots tab (closes the wizard first). */
  onOpenBots: () => void;
  /** Opens the admin auth modal (non-admin entry). */
  onOpenAuthModal: () => void;
  /** Starts paper trading via toggle + toast (App-owned). */
  onStartPaperTrading: () => Promise<void>;
}

const TOTAL_STEPS = 6;
const DEFAULT_CAPITAL = '10000000';

const RISK_PROFILES: Array<{ key: RiskProfileKey; icon: typeof Shield; nameEn: string; nameId: string; descEn: string; descId: string }> = [
  {
    key: 'conservative',
    icon: Shield,
    nameEn: 'Conservative',
    nameId: 'Konservatif',
    descEn: 'Safest — top coins only, small positions.',
    descId: 'Paling aman — koin teratas saja, posisi kecil.',
  },
  {
    key: 'balanced',
    icon: Scale,
    nameEn: 'Balanced',
    nameId: 'Seimbang',
    descEn: 'Middle ground — steady momentum trading.',
    descId: 'Pilihan tengah — trading momentum yang terukur.',
  },
  {
    key: 'aggressive',
    icon: Flame,
    nameEn: 'Aggressive',
    nameId: 'Agresif',
    descEn: 'Chases new listings & bigger moves, more swings.',
    descId: 'Mengejar listing baru & pergerakan besar, lebih fluktuatif.',
  },
];

/**
 * Guided first-run onboarding wizard ("Panduan Setup").
 * Indonesian-first, one concept per step, everything skippable except the
 * welcome. Pure UI orchestration — all side effects go through App callbacks
 * or the existing api layer with its static-host mocks.
 */
export const SetupWizard: React.FC<SetupWizardProps> = ({
  isOpen,
  isAdmin,
  onClose,
  onOpenSettings,
  onOpenBots,
  onOpenAuthModal,
  onStartPaperTrading,
}) => {
  const { l, language, setLanguage, formatCurrency } = useLanguage();

  const [step, setStep] = useState(0);
  const [loadingBase, setLoadingBase] = useState(false);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [activeProviderCount, setActiveProviderCount] = useState(0);

  // Step 3 state
  const [subModel, setSubModel] = useState('');
  const [masterModel, setMasterModel] = useState('');
  const [savingModels, setSavingModels] = useState(false);
  const [modelsSaved, setModelsSaved] = useState(false);

  // Step 4 state
  const [capital, setCapital] = useState(DEFAULT_CAPITAL);
  const [profile, setProfile] = useState<RiskProfileKey>('balanced');
  const [plan, setPlan] = useState<CapitalPlanPreview | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [applyingCapital, setApplyingCapital] = useState(false);
  const [capitalApplied, setCapitalApplied] = useState(false);
  const [capitalApplyError, setCapitalApplyError] = useState<string | null>(null);
  const [startingPaper, setStartingPaper] = useState(false);

  const activeProviders = providers.filter((p) => p.is_active === 1);

  // Load current configuration each time the wizard opens.
  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    setStep(0);
    setModelsSaved(false);
    setCapitalApplied(false);
    setLoadingBase(true);
    let cancelled = false;
    (async () => {
      try {
        const [provData, modelData, settings] = await Promise.all([
          api.getProviders(),
          api.getModels(),
          api.getSettings(),
        ]);
        if (cancelled) return;
        setProviders(provData || []);
        setModels(modelData || []);
        setActiveProviderCount((provData || []).filter((p) => p.is_active === 1).length);
        setSubModel(settings?.subagent_model || '');
        setMasterModel(settings?.master_model || '');
      } catch {
        // Wizard still works: every step degrades to its "not configured" state.
      } finally {
        if (!cancelled) setLoadingBase(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isAdmin]);

  // ESC closes the wizard (App treats it as "skip" and marks setup done).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Live allocation preview for step 4 (debounced).
  useEffect(() => {
    if (!isOpen || step !== 3) return;
    const capitalNum = parseInt(capital, 10);
    if (!Number.isFinite(capitalNum) || capitalNum < 10000) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await api.calculateCapitalPlan(capitalNum, profile);
        if (!cancelled) setPlan(result);
      } catch {
        if (!cancelled) setPlan(null);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, step, capital, profile]);

  const goNext = useCallback(() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)), []);
  const goBack = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const handleSaveModels = async () => {
    setSavingModels(true);
    try {
      await api.updateSettings({ subagent_model: subModel, master_model: masterModel });
      setModelsSaved(true);
      goNext();
    } catch {
      // Auth problems fire the global AUTH_REQUIRED modal; stay on this step.
    } finally {
      setSavingModels(false);
    }
  };

  const handleApplyCapital = async () => {
    const capitalNum = parseInt(capital, 10);
    if (!Number.isFinite(capitalNum) || capitalNum < 10000) return;
    setApplyingCapital(true);
    setCapitalApplyError(null);
    try {
      await api.autoSetCapital(capitalNum, profile);
      setCapitalApplied(true);
      goNext();
    } catch (err) {
      // autoSetCapital has no static-host mock: in demo mode treat it as
      // applied so the demo flow is not dead-ended.
      if (isStaticHost) {
        setCapitalApplied(true);
        goNext();
        return;
      }
      // 401+requiresAuth fires the global AUTH_REQUIRED modal; anything else
      // must be surfaced so a silent failure never looks like success.
      const message = err instanceof Error ? err.message : 'Gagal menerapkan rencana modal.';
      setCapitalApplyError(message);
    } finally {
      setApplyingCapital(false);
    }
  };

  if (!isOpen) return null;

  const modelOptions = (models || []).map((m) => (
    <option key={m.id} value={m.alias_model_id}>
      {m.display_name}
    </option>
  ));

  const capitalNum = parseInt(capital, 10);
  const capitalValid = Number.isFinite(capitalNum) && capitalNum >= 10000;

  // ------------------------------------------------------------------
  // Non-admin entry: the wizard handles this gracefully on its own.
  // ------------------------------------------------------------------
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={l('Setup Guide', 'Panduan Setup')}
          className="max-w-md w-full rounded-2xl border border-slate-800 bg-[#0d1322] p-6 space-y-4 shadow-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                <Rocket className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-slate-100">{l('Setup Guide', 'Panduan Setup')}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={l('Close', 'Tutup')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 flex items-start gap-3">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200 leading-relaxed">
              {l(
                'The setup guide needs admin access so it can safely configure the bot for you. Please log in as admin first.',
                'Panduan setup memerlukan akses admin agar bisa mengatur bot dengan aman untuk Anda. Silakan masuk sebagai admin terlebih dahulu.'
              )}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition-colors"
            >
              {l('Later', 'Nanti')}
            </button>
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition-colors shadow-md"
            >
              {l('Log in as Admin', 'Masuk sebagai Admin')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Per-step content
  // ------------------------------------------------------------------
  const renderStep = () => {
    switch (step) {
      // STEP 1 — Welcome
      case 0:
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 text-blue-400">
                <Rocket className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  {l('Welcome to Your Trading Assistant!', 'Selamat Datang di Asisten Trading Anda!')}
                </h2>
                <p className="text-xs text-blue-300 font-medium">
                  {l('Takes about 2 minutes', 'Cuma butuh sekitar 2 menit')}
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
              <p>
                {l(
                  'This bot watches Indodax for you 24/7 and only buys a coin when several independent safety filters agree. You stay in control — everything can be paused with one click.',
                  'Bot ini memantau Indodax untuk Anda 24/7 dan hanya membeli koin ketika beberapa filter keamanan independen sama-sama menyetujui. Anda tetap pegang kendali — semuanya bisa dijeda dengan satu klik.'
                )}
              </p>
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/30 flex items-start gap-2.5">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-emerald-200 leading-relaxed">
                  {l(
                    'The bot always starts in PAPER mode: a full simulation with IDR 10,000,000 virtual funds. Zero real money is at risk until you deliberately switch to live much later.',
                    'Bot selalu dimulai dalam mode PAPER: simulasi penuh dengan saldo virtual Rp 10.000.000. Tidak ada uang riil yang berisiko sampai Anda sendiri yang mengaktifkan mode live jauh nanti.'
                  )}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                {l('Choose your language', 'Pilih bahasa Anda')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { code: 'en', label: 'English', flag: '🇺🇸' },
                    { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
                  ] as const
                ).map((langOpt) => (
                  <button
                    key={langOpt.code}
                    type="button"
                    onClick={() => setLanguage(langOpt.code)}
                    aria-pressed={language === langOpt.code}
                    className={`flex items-center justify-between p-3 rounded-xl border text-sm font-medium transition-all ${
                      language === langOpt.code
                        ? 'border-blue-500 bg-blue-600/15 text-white shadow-sm ring-1 ring-blue-500/50'
                        : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-lg">{langOpt.flag}</span>
                      {langOpt.label}
                    </span>
                    {language === langOpt.code && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      // STEP 2 — AI connection (optional)
      case 1:
        return (
          <div className="space-y-4">
            <StepHeader
              icon={<Cpu className="w-5 h-5" />}
              title={l('Connect AI (optional)', 'Koneksi AI (opsional)')}
              subtitle={l('Step 2 of 6', 'Langkah 2 dari 6')}
            />

            {loadingBase ? (
              <div className="py-8 flex justify-center">
                <div className="w-7 h-7 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            ) : activeProviderCount > 0 ? (
              <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-950/30 flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-300">{l('AI is connected and active', 'AI sudah terhubung dan aktif')}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {activeProviders.map((p) => p.name).join(', ')}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 rounded-xl border border-blue-500/25 bg-blue-950/20 space-y-2">
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {l('What does the AI actually do?', 'Apa sebenarnya fungsi AI ini?')}
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {l(
                      'Think of the AI as a research lens: it reads market news and double-checks every buy signal before the bot acts. It never touches your funds directly.',
                      'Anggap AI sebagai lensa riset: ia membaca berita pasar dan memeriksa ulang setiap sinyal beli sebelum bot bertindak. AI tidak pernah menyentuh dana Anda secara langsung.'
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenSettings('ai')}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white shadow-md transition-colors flex items-center justify-center gap-2"
                >
                  <Cpu className="w-4 h-4" />
                  {l('Connect AI in Settings', 'Hubungkan AI di Pengaturan')}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}

            <div className="p-3 rounded-xl border border-slate-800 bg-slate-900/50 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {l(
                  'Fine to skip: with AI off, the bot runs on 100% deterministic rules and costs 0 tokens.',
                  'Tidak masalah jika dilewati: tanpa AI, bot berjalan dengan aturan 100% deterministik dan biaya 0 token.'
                )}
              </p>
            </div>
          </div>
        );

      // STEP 3 — Model selection (optional)
      case 2:
        return (
          <div className="space-y-4">
            <StepHeader
              icon={<Zap className="w-5 h-5" />}
              title={l('Pick your AI models (optional)', 'Pilih Model AI (opsional)')}
              subtitle={l('Step 3 of 6', 'Langkah 3 dari 6')}
            />

            {loadingBase ? (
              <div className="py-8 flex justify-center">
                <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              </div>
            ) : models.length === 0 ? (
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 text-xs text-slate-300 leading-relaxed">
                {l(
                  'No AI models are imported yet. Skip this step now — you can import models later from Settings after connecting an AI provider.',
                  'Belum ada model AI yang diimpor. Lewati langkah ini — Anda bisa mengimpor model nanti dari Pengaturan setelah menghubungkan provider AI.'
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="wizard-subagent-model" className="text-xs font-semibold text-slate-300 block mb-1.5">
                    {l('Research swarm model', 'Model swarm riset')}
                  </label>
                  <select
                    id="wizard-subagent-model"
                    value={subModel}
                    onChange={(e) => setSubModel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  >
                    <option value="">{l("Don't use yet", 'Belum digunakan')}</option>
                    {modelOptions}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {l('Used by the 10-agent research swarm that reads the market.', 'Dipakai oleh 10 agen riset yang membaca pasar.')}
                  </p>
                </div>

                <div>
                  <label htmlFor="wizard-master-model" className="text-xs font-semibold text-slate-300 block mb-1.5">
                    {l('Entry confirmation model', 'Model konfirmasi entry')}
                  </label>
                  <select
                    id="wizard-master-model"
                    value={masterModel}
                    onChange={(e) => setMasterModel(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">{l("Don't use yet", 'Belum digunakan')}</option>
                    {modelOptions}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {l('The final gate that approves or vetoes each buy.', 'Pengaman akhir yang menyetujui atau memveto setiap pembelian.')}
                  </p>
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              {l('You can change these anytime in Settings → AI.', 'Anda bisa mengubahnya kapan saja di Pengaturan → AI.')}
            </p>
          </div>
        );

      // STEP 4 — Capital & risk profile (optional)
      case 3:
        return (
          <div className="space-y-4">
            <StepHeader
              icon={<Wallet className="w-5 h-5" />}
              title={l('Capital & risk profile', 'Modal & Profil Risiko')}
              subtitle={l('Step 4 of 6', 'Langkah 4 dari 6')}
            />

            <div>
              <label htmlFor="wizard-capital" className="text-xs font-semibold text-slate-300 block mb-1.5">
                {l('Virtual capital to manage (IDR)', 'Modal virtual yang dikelola (IDR)')}
              </label>
              <input
                id="wizard-capital"
                type="number"
                min={10000}
                step={10000}
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-sm text-slate-100 font-mono focus:outline-none focus:border-amber-500"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {['1000000', '5000000', '10000000'].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCapital(val)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-colors ${
                      capital === val
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    Rp {parseInt(val, 10).toLocaleString('id-ID')}
                  </button>
                ))}
              </div>
              {capital !== DEFAULT_CAPITAL && (
                <button
                  type="button"
                  onClick={() => setCapital(DEFAULT_CAPITAL)}
                  className="text-[10px] text-blue-400 hover:text-blue-300 underline mt-1.5"
                >
                  {l('Reset to default IDR 10,000,000', 'Kembalikan ke bawaan Rp 10.000.000')}
                </button>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-300 mb-2">{l('Choose a risk style', 'Pilih gaya risiko')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {RISK_PROFILES.map((rp) => {
                  const Icon = rp.icon;
                  const selected = profile === rp.key;
                  return (
                    <button
                      key={rp.key}
                      type="button"
                      onClick={() => setProfile(rp.key)}
                      aria-pressed={selected}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        selected
                          ? 'border-blue-500 bg-blue-600/15 shadow-sm ring-1 ring-blue-500/50'
                          : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${selected ? 'text-blue-400' : 'text-slate-400'}`} />
                        <span className={`text-xs font-bold ${selected ? 'text-white' : 'text-slate-200'}`}>
                          {l(rp.nameEn, rp.nameId)}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">{l(rp.descEn, rp.descId)}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live allocation preview */}
            {capitalValid && (
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/60">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                    {l('Your plan at a glance', 'Rencana Anda sekilas')}
                  </p>
                  {planLoading && <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />}
                </div>
                {plan ? (
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-800/60">
                      <tr>
                        <td className="py-1.5 text-slate-400">{l('Per trade amount', 'Jumlah per trade')}</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-slate-100">
                          {formatCurrency(Math.round(plan.maxAllocationPerTradeIdr || 0))}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-slate-400">{l('Max positions at once', 'Maks posisi bersamaan')}</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-slate-100">{plan.maxActiveTrades ?? '—'}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-slate-400">{l('Trailing stop', 'Trailing stop')}</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-amber-400">
                          {(plan.trailingStopPercent ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-slate-400">{l('Daily loss limit', 'Batas rugi harian')}</td>
                        <td className="py-1.5 text-right font-mono font-semibold text-rose-400">
                          {(plan.dailyLossLimitPercent ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {l('Enter at least IDR 10,000 to preview the allocation.', 'Masukkan minimal Rp 10.000 untuk melihat pratinjau alokasi.')}
                  </p>
                )}
              </div>
            )}

            {capitalApplied && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {l('Capital plan applied.', 'Rencana modal diterapkan.')}
              </p>
            )}
          </div>
        );

      // STEP 5 — Notifications (optional)
      case 4:
        return (
          <div className="space-y-4">
            <StepHeader
              icon={<Bell className="w-5 h-5" />}
              title={l('Admin notifications (optional)', 'Notifikasi admin (opsional)')}
              subtitle={l('Step 5 of 6', 'Langkah 5 dari 6')}
            />

            <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-950/20 flex items-start gap-3">
              <Bot className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="space-y-1.5">
                <p className="text-xs text-slate-200 font-medium leading-relaxed">
                  {l('Get trade alerts on your phone', 'Dapatkan notifikasi trade di HP Anda')}
                </p>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {l(
                    'The bot can send every buy, sell and safety alert to your WhatsApp or Telegram, so you always know what it is doing — even when away from the computer.',
                    'Bot dapat mengirim setiap aksi beli, jual, dan peringatan keamanan ke WhatsApp atau Telegram Anda, jadi Anda selalu tahu apa yang sedang ia lakukan — bahkan saat jauh dari komputer.'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenBots}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white shadow-md transition-colors flex items-center justify-center gap-2"
            >
              <Bell className="w-4 h-4" />
              {l('Set up WhatsApp / Telegram', 'Atur WhatsApp / Telegram')}
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[11px] text-slate-500">
              {l('Optional — the dashboard works fully without it.', 'Opsional — dashboard tetap berfungsi penuh tanpa ini.')}
            </p>
          </div>
        );

      // STEP 6 — Finish / recap
      default:
        return (
          <div className="space-y-4">
            <StepHeader
              icon={<PartyPopper className="w-5 h-5" />}
              title={l('You are all set!', 'Semuanya siap!')}
              subtitle={l('Step 6 of 6', 'Langkah 6 dari 6')}
            />

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 divide-y divide-slate-800/60">
              <RecapRow
                done={activeProviderCount > 0}
                doneText={l('AI research lens connected', 'Lensa riset AI terhubung')}
                skippedText={l('AI skipped — 100% deterministic mode (0 tokens)', 'AI dilewati — mode 100% deterministik (0 token)')}
              />
              <RecapRow
                done={modelsSaved || Boolean(subModel || masterModel)}
                doneText={
                  modelsSaved
                    ? l('AI models selected', 'Model AI dipilih')
                    : l('AI models already configured earlier', 'Model AI sudah diatur sebelumnya')
                }
                skippedText={l('Model selection skipped', 'Pemilihan model dilewati')}
              />
              <RecapRow
                done={capitalApplied}
                doneText={l(
                  `Capital plan applied (${formatCurrency(capitalValid ? capitalNum : 0)}, ${l(
                    RISK_PROFILES.find((r) => r.key === profile)?.nameEn || 'Balanced',
                    RISK_PROFILES.find((r) => r.key === profile)?.nameId || 'Seimbang'
                  )})`,
                  `Rencana modal diterapkan (${formatCurrency(capitalValid ? capitalNum : 0)}, ${
                    RISK_PROFILES.find((r) => r.key === profile)?.nameId || 'Seimbang'
                  })`
                )}
                skippedText={l('Capital setup skipped — current settings kept', 'Pengaturan modal dilewati — pengaturan lama dipakai')}
              />
              <RecapRow
                done={false}
                neutral
                doneText=""
                skippedText={l('Notifications can be set up anytime in the Bots tab', 'Notifikasi bisa diatur kapan saja di tab Bots')}
              />
            </div>

            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-200 leading-relaxed">
                {l(
                  'Ready in PAPER mode with IDR 10,000,000 virtual funds. Nothing real is at risk — watch it, learn from it, and decide later.',
                  'Siap dalam mode PAPER dengan saldo virtual Rp 10.000.000. Tidak ada uang riil yang berisiko — amati, pelajari, dan putuskan nanti.'
                )}
              </p>
            </div>
          </div>
        );
    }
  };

  // Footer buttons per step
  const renderFooter = () => {
    if (step === 0) {
      return (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={goNext}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white shadow-md transition-colors active:scale-95"
          >
            {l("Let's go", 'Mulai')}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      );
    }

    if (step === TOTAL_STEPS - 1) {
      return (
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm text-slate-300 font-medium transition-colors"
          >
            {l('Later', 'Nanti')}
          </button>
          <button
            type="button"
            disabled={startingPaper}
            onClick={async () => {
              // In-flight guard: POST /trading/toggle is a pure toggle, so a
              // double-click would switch the engine ON then straight OFF.
              setStartingPaper(true);
              try {
                await onStartPaperTrading();
                onClose();
              } finally {
                setStartingPaper(false);
              }
            }}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-wait text-sm font-bold text-white shadow-lg shadow-emerald-950/40 transition-colors active:scale-95"
          >
            {startingPaper ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Rocket className="w-4 h-4" />
            )}
            {l('Start Paper Trading', 'Mulai Paper Trading')}
          </button>
        </div>
      );
    }

    // Optional steps 2-5: Back + skip + primary action
    const primaryAction = () => {
      if (step === 2) {
        // Model step: primary saves when models exist; skip leaves them untouched.
        return (
          <button
            type="button"
            onClick={handleSaveModels}
            disabled={savingModels || loadingBase || models.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-white shadow-md transition-colors"
          >
            {savingModels && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {models.length === 0 ? l('Nothing to save yet', 'Belum ada yang bisa disimpan') : l('Save & Continue', 'Simpan & Lanjut')}
            {!savingModels && <ArrowRight className="w-4 h-4" />}
          </button>
        );
      }
      if (step === 3) {
        return (
          <div className="flex flex-col items-end gap-1.5">
            {capitalApplyError && (
              <p className="text-xs text-rose-400 max-w-xs text-right" role="alert">
                {l('Failed to apply the capital plan', 'Gagal menerapkan rencana modal')}: {capitalApplyError}
              </p>
            )}
            <button
              type="button"
              onClick={handleApplyCapital}
              disabled={!capitalValid || applyingCapital || planLoading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-bold text-white shadow-md transition-colors"
            >
              {applyingCapital && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {l('Apply & Continue', 'Terapkan & Lanjut')}
              {!applyingCapital && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        );
      }
      return (
        <button
          type="button"
          onClick={goNext}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-bold text-white shadow-md transition-colors"
        >
          {l('Next', 'Lanjut')}
          <ArrowRight className="w-4 h-4" />
        </button>
      );
    };

    return (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goBack}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {l('Back', 'Kembali')}
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goNext}
            className="text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2 transition-colors"
          >
            {l('Skip this', 'Lewati ini')}
          </button>
          {primaryAction()}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={l('Setup Guide', 'Panduan Setup')}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg w-full rounded-2xl border border-slate-800 bg-[#0d1322] shadow-2xl overflow-hidden"
      >
        {/* Progress header */}
        <div className="p-4 sm:p-5 pb-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-300">
              {l('Setup Guide', 'Panduan Setup')} • {step + 1}/{TOTAL_STEPS}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={l('Close setup guide', 'Tutup panduan setup')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Progress bar */}
          <div className="flex gap-1.5" aria-hidden="true">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                  i <= step ? 'bg-blue-500' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step body */}
        <div className="p-4 sm:p-6 max-h-[65vh] overflow-y-auto">{renderStep()}</div>

        {/* Footer */}
        <div className="p-4 sm:p-5 pt-3 border-t border-slate-800 bg-slate-950/40">{renderFooter()}</div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// Small internal building blocks
// ------------------------------------------------------------------

const StepHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({ icon, title, subtitle }) => (
  <div className="flex items-center gap-3">
    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">{icon}</div>
    <div>
      <h2 className="text-base font-bold text-slate-100">{title}</h2>
      <p className="text-[11px] text-slate-400">{subtitle}</p>
    </div>
  </div>
);

const RecapRow: React.FC<{ done: boolean; neutral?: boolean; doneText: string; skippedText: string }> = ({
  done,
  neutral,
  doneText,
  skippedText,
}) => {
  const showDone = done && !neutral;
  return (
    <div className="flex items-center gap-2.5 py-2.5 px-3">
      {showDone ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
      ) : (
        <Circle className="w-4 h-4 text-slate-600 shrink-0" />
      )}
      <span className={`text-xs leading-snug ${showDone ? 'text-slate-200' : 'text-slate-400'}`}>
        {showDone ? doneText : skippedText}
      </span>
    </div>
  );
};
