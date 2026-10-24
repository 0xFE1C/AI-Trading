import React, { useState } from 'react';
import { AlertTriangle, X, ShieldAlert, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface PanicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<{ success: boolean; message: string }>;
  openPositionsCount?: number;
}

export const PanicModal: React.FC<PanicModalProps> = ({ isOpen, onClose, onConfirm, openPositionsCount }) => {
  const { l } = useLanguage();
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ success: boolean; text: string } | null>(null);

  if (!isOpen) return null;

  const handleExecute = async () => {
    if (!confirmedCheck || loading) return;
    setLoading(true);
    setResultMsg(null);
    try {
      const res = await onConfirm();
      setResultMsg({ success: res.success, text: res.message });
      if (res.success) {
        setTimeout(() => {
          onClose();
          setResultMsg(null);
          setConfirmedCheck(false);
        }, 2500);
      }
    } catch (err: any) {
      setResultMsg({ success: false, text: err.message || l('Failed to execute Panic Sell.', 'Gagal mengeksekusi Panic Sell.') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="max-w-md w-full rounded-2xl border border-rose-500/40 bg-[#0f0e17] p-6 space-y-5 shadow-2xl shadow-rose-950/50">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-400">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                {l('Emergency: Portfolio Panic Sell', 'Darurat: Panic Sell Portofolio')}
              </h3>
              <p className="text-xs text-rose-300/80">
                {l('Immediate market liquidation of all open coins to IDR', 'Likuidasi darurat seluruh koin ke Rupiah (IDR)')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            title={l('Close', 'Tutup')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Details */}
        <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-4 space-y-2.5 text-xs text-rose-200/90 leading-relaxed">
          <div className="font-semibold text-rose-300 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            {l('This action will immediately execute the following steps:', 'Aksi ini akan menjalankan langkah berikut seketika:')}
          </div>
          <ul className="space-y-1.5 pl-5 list-disc text-slate-300 text-[11px]">
            <li>
              {l(
                `Market-sell ALL ${openPositionsCount !== undefined ? `(${openPositionsCount}) ` : ''}active positions directly to IDR at current best market prices.`,
                `Menjual SEMUA ${openPositionsCount !== undefined ? `(${openPositionsCount}) ` : ''}koin posisi terbuka langsung ke IDR pada harga terbaik saat ini.`
              )}
            </li>
            <li>
              {l('Cancel all unfilled pending orders on the exchange.', 'Membatalkan seluruh pending order yang belum terselesaikan di bursa.')}
            </li>
            <li>
              {l('Pause the auto-trading engine to prevent any new position openings.', 'Menjeda (PAUSE) mesin auto-trading agar tidak membuka posisi baru.')}
            </li>
          </ul>
        </div>

        {/* Feedback message */}
        {resultMsg && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              resultMsg.success
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            {resultMsg.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{resultMsg.text}</span>
          </div>
        )}

        {/* Anti-Accidental Click Confirmation Checkbox */}
        <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/60 cursor-pointer select-none hover:border-slate-700 transition-colors">
          <input
            type="checkbox"
            checked={confirmedCheck}
            onChange={(e) => setConfirmedCheck(e.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-rose-500"
          />
          <span className="text-xs text-slate-300">
            {l(
              'I fully understand and want to liquidate all crypto positions now to preserve capital.',
              'Saya memahami sepenuhnya dan ingin melikuidasi seluruh koin sekarang demi keamanan modal.'
            )}
          </span>
        </label>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
          >
            {l('Cancel', 'Batalkan')}
          </button>
          <button
            type="button"
            onClick={handleExecute}
            disabled={!confirmedCheck || loading}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-lg flex items-center gap-2 ${
              confirmedCheck && !loading
                ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-rose-900/50 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700/50'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{l('Executing...', 'Mengeksekusi...')}</span>
              </>
            ) : (
              <>
                <span>{l('EXECUTE PANIC SELL', 'EKSEKUSI PANIC SELL')}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
