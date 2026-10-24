import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface HelpTooltipProps {
  content: string;
  title?: string;
  className?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ content, title, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { l } = useLanguage();

  return (
    <span className={`relative inline-flex items-center ml-1 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
        className="p-0.5 rounded-full text-slate-400 hover:text-slate-200 focus:outline-none transition-colors"
        aria-label={title || l('Help', 'Bantuan')}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <span
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-left text-[11px] text-slate-200 leading-relaxed pointer-events-none animate-in fade-in zoom-in-95 duration-150"
          role="tooltip"
        >
          {title && <span className="font-bold text-slate-100 block mb-0.5">{title}</span>}
          <span>{content}</span>
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </span>
      )}
    </span>
  );
};
