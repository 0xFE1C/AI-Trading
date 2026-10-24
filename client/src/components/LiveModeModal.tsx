import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, X, CheckSquare, Square, DollarSign } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface LiveModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const LiveModeModal: React.FC<LiveModeModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const { l } = useLanguage();
  const [agreeRisk, setAgreeRisk] = useState(false);
  const [agreeRealMoney, setAgreeRealMoney] = useState(false);
  const [agreeTested, setAgreeTested] = useState(false);

  if (!isOpen) return null;

  const canConfirm = agreeRisk && agreeRealMoney && agreeTested;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
      <div className="max-w-lg w-full rounded-2xl border border-rose-500/40 bg-[#0d121f] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{l('Confirm LIVE TRADING Activation', 'Konfirmasi Masuk Mode LIVE TRADING')}</span>
              </h2>
              <p className="text-xs text-rose-400 font-medium">
                {l('Risk Warning & Real Capital Execution Consent', 'Peringatan Risiko & Persetujuan Eksekusi Dana Riil')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Narrative / Context */}
        <div className="p-4 rounded-xl border border-rose-950/40 bg-rose-950/20 text-xs text-slate-300 space-y-2 leading-relaxed">
          <p>
            {l(
              'You are about to switch the system from Simulation (Paper) to REAL (Live) Trading Mode.',
              'Anda akan mengalihkan sistem dari Mode Simulasi (Paper) ke Mode Riil (Live).'
            )}
          </p>
          <p className="text-rose-200">
            {l(
              'In Live Mode, all buy and sell orders will be directly executed on Indodax using real IDR wallet funds.',
              'Di Mode Live, seluruh order beli dan jual akan langsung diproses di bursa Indodax menggunakan saldo Rupiah nyata di akun Anda.'
            )}
          </p>
        </div>

        {/* Checkbox Agreements */}
        <div className="space-y-3 pt-1">
          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={agreeRealMoney}
              onChange={(e) => setAgreeRealMoney(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0"
            />
            <span className="text-xs text-slate-200 leading-snug">
              {l(
                'I understand that placed orders will debit real IDR funds from my Indodax account.',
                'Saya memahami bahwa order yang dipasang akan memotong saldo Rupiah resmi di akun Indodax saya.'
              )}
            </span>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={agreeRisk}
              onChange={(e) => setAgreeRisk(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0"
            />
            <span className="text-xs text-slate-200 leading-snug">
              {l(
                'I acknowledge crypto market volatility and accept that AI-Trading is an automated execution tool, not a licensed financial advisor.',
                'Saya memahami volatilitas pasar kripto dan menyetujui bahwa AI-Trading adalah alat otomasi, bukan penasihat keuangan berlisensi.'
              )}
            </span>
          </label>

          <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={agreeTested}
              onChange={(e) => setAgreeTested(e.target.checked)}
              className="mt-0.5 rounded border-slate-700 text-blue-600 focus:ring-0"
            />
            <span className="text-xs text-slate-200 leading-snug">
              {l(
                'I have tested bot behavior in Paper Mode and agree with the currently configured risk parameters.',
                'Saya telah menguji performa bot di Mode Paper dan menyetujui batas profil risiko yang aktif.'
              )}
            </span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 font-medium transition-colors"
          >
            {l('Cancel (Stay in Paper)', 'Batal (Tetap di Paper)')}
          </button>

          <button
            type="button"
            disabled={!canConfirm}
            onClick={handleConfirm}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition-all"
          >
            <ShieldCheck className="h-4 w-4" />
            <span>{l('Activate Real Live Mode', 'Aktifkan Mode Live Riil')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
