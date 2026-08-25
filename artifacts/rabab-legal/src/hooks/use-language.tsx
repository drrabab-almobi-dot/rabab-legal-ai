import React, { createContext, useContext, useState, useEffect } from 'react';

export type Lang = 'ar' | 'en';

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (ar: string, en: string) => string;
  isAr: boolean;
}

const LangContext = createContext<LangContextType>({
  lang: 'ar',
  setLang: () => {},
  t: (ar) => ar,
  isAr: true,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try { return (localStorage.getItem('lang') as Lang) || 'ar'; } catch { return 'ar'; }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch {}
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = l;
    document.body.dir = l === 'ar' ? 'rtl' : 'ltr';
    document.body.lang = l;
  };

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
    document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.lang = lang;
  }, [lang]);

  const t = (ar: string, en: string) => lang === 'ar' ? ar : en;

  return (
    <LangContext.Provider value={{ lang, setLang, t, isAr: lang === 'ar' }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}
