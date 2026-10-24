import React from 'react';
import {
  LayoutDashboard,
  Radar,
  BarChart3,
  Bot,
  Settings,
  ShieldCheck,
  Eye,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  isAdmin: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  isAdmin,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Terminal', icon: LayoutDashboard },
    { id: 'scanner', label: 'Scanner', icon: Radar },
    { id: 'reports', label: 'Laporan', icon: BarChart3 },
    { id: 'agents', label: 'Riset AI', icon: Bot },
    { id: 'settings', label: 'Setting', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-slate-800/90 bg-[#070b13]/95 backdrop-blur-lg px-2 py-1.5 shadow-2xl safe-area-bottom">
      <div className="flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all min-w-[56px] min-h-[48px] touch-manipulation ${
                isActive
                  ? 'text-blue-400 bg-blue-500/10 font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 font-medium'
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-blue-400 scale-110' : 'text-slate-400'}`} />
              <span className="text-[10px] tracking-tight">{item.label}</span>
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-0.5" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
