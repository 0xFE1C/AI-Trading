import React from 'react';
import {
  Bell,
  X,
  CheckCheck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Zap,
  Radio,
  Clock,
  Trash2
} from 'lucide-react';

export interface AppNotification {
  id: string;
  type: 'buy' | 'sell' | 'warning' | 'alert' | 'info' | 'coin';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onNotificationClick?: (notification: AppNotification) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearAll,
  onNotificationClick,
}) => {
  if (!isOpen) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  const getIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'buy':
        return <TrendingUp className="h-4 w-4 text-emerald-400" />;
      case 'sell':
        return <TrendingDown className="h-4 w-4 text-rose-400" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-400" />;
      case 'coin':
        return <Radio className="h-4 w-4 text-blue-400" />;
      case 'alert':
      default:
        return <Zap className="h-4 w-4 text-indigo-400" />;
    }
  };

  const getBorderColor = (type: AppNotification['type'], read: boolean) => {
    if (read) return 'border-slate-800/60 bg-slate-900/30 opacity-70';
    switch (type) {
      case 'buy':
        return 'border-emerald-500/30 bg-emerald-950/20';
      case 'sell':
        return 'border-rose-500/30 bg-rose-950/20';
      case 'warning':
        return 'border-amber-500/30 bg-amber-950/20';
      case 'coin':
        return 'border-blue-500/30 bg-blue-950/20';
      default:
        return 'border-indigo-500/30 bg-indigo-950/20';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md h-full bg-[#0b101b] border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Bell className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">Pusat Pemberitahuan</h3>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-600 text-white">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">Riwayat eksekusi &amp; peringatan risiko sistem</p>
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

        {/* Action Bar */}
        {notifications.length > 0 && (
          <div className="px-4 py-2 border-b border-slate-800/80 bg-[#080d17] flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={onMarkAllAsRead}
              className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
              <span>Tandai Semua Dibaca</span>
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="flex items-center gap-1.5 text-rose-400/80 hover:text-rose-300 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Hapus Riwayat</span>
            </button>
          </div>
        )}

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {notifications.length > 0 ? (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => onNotificationClick && onNotificationClick(item)}
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 transition-all cursor-pointer hover:border-slate-700 ${getBorderColor(
                  item.type,
                  item.read
                )}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getIcon(item.type)}
                    <span className="font-bold text-slate-100">{item.title}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(item.timestamp).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px] whitespace-pre-line pl-6">
                  {item.message}
                </p>
              </div>
            ))
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Bell className="h-10 w-10 text-slate-600 mb-2 stroke-1" />
              <p className="text-xs font-medium text-slate-400">Belum ada notifikasi</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                Transaksi beli, jual, pergerakan koin baru, atau peringatan rem darurat akan tercatat di sini.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
