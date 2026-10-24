import React, { useState, useEffect } from 'react';
import {
  Radio,
  Zap,
  TrendingUp,
  Search,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react';
import { api } from '../services/api';
import { MarketTicker, NewCoinAlert } from '../types';

export const MarketScannerView: React.FC = () => {
  const [gainers, setGainers] = useState<MarketTicker[]>([]);
  const [newCoins, setNewCoins] = useState<NewCoinAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadScannerData = async () => {
    setLoading(true);
    try {
      const data = await api.getScanner();
      setGainers(data.topGainers);
      setNewCoins(data.newCoinAlerts);
    } catch (e) {
      console.error('Error loading scanner data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadScannerData();
    const interval = setInterval(loadScannerData, 20000);
    return () => clearInterval(interval);
  }, []);

  const filteredGainers = gainers.filter(
    (g) =>
      g.symbol.toLowerCase().includes(search.toLowerCase()) ||
      g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-800 bg-[#0b101b]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Market Scanner & Radar Listing Koin Baru</h2>
            <p className="text-xs text-slate-400">
              Memindai seluruh pair Indodax secara real-time untuk mendeteksi koin baru, memecoin, dan lonjakan volume.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari koin (BTC, SOL, PEPE)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/90 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            onClick={loadScannerData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-xs text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Scan Sekarang</span>
          </button>
        </div>
      </div>

      {/* SPECIAL SECTION: New Coin Listing Early Pump Radar */}
      <div className="rounded-xl border border-blue-500/30 bg-gradient-to-b from-blue-950/20 to-slate-900/40 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-blue-500/20">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
              Early Pump Radar: Koin Baru Masuk Indodax
            </h3>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-900/40 border border-blue-500/30 text-blue-300">
            Auto-Detect New Pairs
          </span>
        </div>

        {newCoins.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">
            <p>Tidak ada koin baru yang sedang di-pump dalam jendela pengawasan 24 jam terakhir.</p>
            <p className="text-[11px] text-slate-500 mt-1">
              Saat Indodax menambahkan koin baru, bot akan langsung mendeteksinya di sini dan menganalisa likuiditas awal.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {newCoins.map((coin) => (
              <div
                key={coin.id}
                className="p-3.5 rounded-lg border border-blue-500/30 bg-slate-900/80 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-100 font-mono text-sm">
                    {coin.symbol.toUpperCase()}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-amber-950 text-amber-400 border border-amber-500/30">
                    {coin.status}
                  </span>
                </div>
                <div className="text-xs text-slate-300">{coin.name}</div>
                <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-800 text-slate-400">
                  <span>Harga Awal: Rp {coin.initial_price.toLocaleString('id-ID')}</span>
                  <span className="text-emerald-400 flex items-center gap-0.5">
                    <ArrowUpRight className="h-3 w-3" />
                    +{coin.surge_percent.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Gainers & Momentum Coins Table */}
      <div className="rounded-xl border border-slate-800 bg-[#0b101b] overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">
              Top Momentum Gainers & Altcoins (Indodax IDR Pairs)
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Total {filteredGainers.length} Pairs Terpantau
          </span>
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/60 bg-slate-900/60 text-slate-400 font-mono text-[11px] uppercase">
                <th className="py-3 px-4">#</th>
                <th className="py-3 px-4">Pair</th>
                <th className="py-3 px-4">Harga Terakhir</th>
                <th className="py-3 px-4">Perubahan 24h</th>
                <th className="py-3 px-4">Volume 24h (IDR)</th>
                <th className="py-3 px-4">Range 24h (Low - High)</th>
                <th className="py-3 px-4">Indodax Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 font-mono">
              {filteredGainers.map((g, idx) => {
                const isPositive = g.gain24h >= 0;
                return (
                  <tr key={g.symbol} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-3 px-4 text-slate-500">{idx + 1}</td>
                    <td className="py-3 px-4 font-bold text-slate-200">
                      {g.pair}
                    </td>
                    <td className="py-3 px-4 text-slate-100 font-semibold">
                      Rp {g.last.toLocaleString('id-ID')}
                    </td>
                    <td className={`py-3 px-4 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isPositive ? '+' : ''}{g.gain24h.toFixed(2)}%
                    </td>
                    <td className="py-3 px-4 text-slate-300">
                      Rp {(g.volIdr / 1e6).toFixed(1)} Jt
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {g.low.toLocaleString('id-ID')} - {g.high.toLocaleString('id-ID')}
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={`https://indodax.com/market/${g.pair.replace('/', '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-sans"
                      >
                        Buka Market
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Vertical Cards View */}
        <div className="md:hidden divide-y divide-slate-800/60 font-mono">
          {filteredGainers.map((g, idx) => {
            const isPositive = g.gain24h >= 0;
            return (
              <div key={g.symbol} className="p-4 space-y-2.5 hover:bg-slate-900/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-semibold">#{idx + 1}</span>
                    <span className="font-bold text-slate-100 text-sm">{g.pair}</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                      isPositive
                        ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-950/70 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {isPositive ? '+' : ''}{g.gain24h.toFixed(2)}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Harga Terakhir</span>
                    <span className="text-slate-100 font-semibold">Rp {g.last.toLocaleString('id-ID')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase">Volume 24h</span>
                    <span className="text-slate-300">Rp {(g.volIdr / 1e6).toFixed(1)} Jt</span>
                  </div>
                  <div className="col-span-2 pt-1 border-t border-slate-800/50">
                    <span className="text-[10px] text-slate-500 block uppercase">Range 24h (Low - High)</span>
                    <span className="text-slate-400 text-[11px]">
                      Rp {g.low.toLocaleString('id-ID')} - {g.high.toLocaleString('id-ID')}
                    </span>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <a
                    href={`https://indodax.com/market/${g.pair.replace('/', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 py-1 px-2.5 rounded bg-blue-950/30 border border-blue-500/20 font-sans"
                  >
                    <span>Buka di Indodax</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
