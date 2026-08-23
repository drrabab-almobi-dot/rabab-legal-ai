/**
 * use-theme.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * نظام الثيمات الموحّد للمنصة.
 * يشبه use-language في البنية: context + provider + hook.
 * يحفظ الاختيار في localStorage، ويطبّق data-theme على <html>.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeId = 'tech' | 'olive' | 'burgundy';

export interface ThemeDef {
  id: ThemeId;
  labelAr: string;
  labelEn: string;
  /** ثلاثة ألوان تمثيلية: [خلفية، لون مميز، لون ثانوي] */
  swatches: [string, string, string];
  dark: boolean;
}

export const THEMES: ThemeDef[] = [
  {
    id:       'tech',
    labelAr:  'تقني',
    labelEn:  'Tech',
    swatches: ['#0a1628', '#00D4FF', '#FFB800'],
    dark:     true,
  },
  {
    id:       'olive',
    labelAr:  'زيتوني وذهبي',
    labelEn:  'Olive & Gold',
    swatches: ['#F5F1E8', '#0F6E56', '#C9A227'],
    dark:     false,
  },
  {
    id:       'burgundy',
    labelAr:  'عنابي وذهبي',
    labelEn:  'Burgundy & Gold',
    swatches: ['#20140F', '#2E1C15', '#D4AF37'],
    dark:     true,
  },
];

interface ThemeContextType {
  theme: ThemeId;
  themeDef: ThemeDef;
  setTheme: (t: ThemeId) => void;
  themes: ThemeDef[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme:    'tech',
  themeDef: THEMES[0],
  setTheme: () => {},
  themes:   THEMES,
});

function applyThemeToDom(t: ThemeId) {
  if (t === 'tech') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem('rabab-theme') as ThemeId | null;
      if (saved && THEMES.some(t => t.id === saved)) return saved;
    } catch {}
    return 'tech';
  });

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    try { localStorage.setItem('rabab-theme', t); } catch {}
    applyThemeToDom(t);
  };

  // تطبيق الثيم عند التحميل الأول
  useEffect(() => {
    applyThemeToDom(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const themeDef = THEMES.find(t => t.id === theme) ?? THEMES[0];

  return (
    <ThemeContext.Provider value={{ theme, themeDef, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
