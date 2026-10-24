import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { Language, translations } from './translations';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  l: (enText: string, idText: string) => string;
  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const STORAGE_KEY = 'ai_trading_language';

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Default language is English ('en')
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'id') {
        return saved;
      }
    } catch {
      // Ignore localStorage errors
    }
    return 'en';
  });

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
    } catch {
      // Ignore localStorage errors
    }
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useMemo(() => {
    return (key: string, fallback?: string): string => {
      const currentDict = translations[language] || translations.en;
      if (currentDict && key in currentDict) {
        return currentDict[key];
      }
      // Fallback to English if missing in target language
      if (translations.en && key in translations.en) {
        return translations.en[key];
      }
      return fallback || key;
    };
  }, [language]);

  const l = useMemo(() => {
    return (enText: string, idText: string): string => {
      return language === 'id' ? idText : enText;
    };
  }, [language]);

  const formatCurrency = useMemo(() => {
    return (val: number): string => {
      if (language === 'id') {
        return `Rp ${val.toLocaleString('id-ID')}`;
      }
      // For English, still display IDR currency clearly with international format
      return `IDR ${val.toLocaleString('en-US')}`;
    };
  }, [language]);

  const formatNumber = useMemo(() => {
    return (val: number): string => {
      return val.toLocaleString(language === 'id' ? 'id-ID' : 'en-US');
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, l, formatCurrency, formatNumber }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
