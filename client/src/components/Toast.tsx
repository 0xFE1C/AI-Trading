import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="fixed bottom-20 md:bottom-5 right-4 left-4 md:left-auto md:right-5 z-50 flex flex-col gap-2 max-w-sm md:w-full pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(toast.id);
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const config = {
    success: {
      bg: 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
    error: {
      bg: 'bg-rose-950/90 border-rose-500/40 text-rose-200',
      icon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
    },
    warning: {
      bg: 'bg-amber-950/90 border-amber-500/40 text-amber-200',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    info: {
      bg: 'bg-blue-950/90 border-blue-500/40 text-blue-200',
      icon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
    },
  }[toast.type];

  return (
    <div
      className={`pointer-events-auto p-3.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 text-xs animate-in slide-in-from-bottom-3 duration-200 ${config.bg}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {config.icon}
        <span className="truncate">{toast.message}</span>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/10 shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const Toast: React.FC<{
  message: string;
  type?: ToastType;
  onClose: () => void;
  durationMs?: number;
}> = ({ message, type = 'info', onClose, durationMs = 4500 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [onClose, durationMs]);

  const config = {
    success: {
      bg: 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
    },
    error: {
      bg: 'bg-rose-950/95 border-rose-500/50 text-rose-200',
      icon: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
    },
    warning: {
      bg: 'bg-amber-950/95 border-amber-500/50 text-amber-200',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
    },
    info: {
      bg: 'bg-blue-950/95 border-blue-500/50 text-blue-200',
      icon: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
    },
  }[type];

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full animate-in slide-in-from-bottom-3 duration-200">
      <div className={`p-3.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-center justify-between gap-3 text-xs ${config.bg}`}>
        <div className="flex items-center gap-2.5">
          {config.icon}
          <span className="font-medium leading-snug">{message}</span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
