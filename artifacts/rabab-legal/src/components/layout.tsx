import React from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useLang, type Lang } from '@/hooks/use-language';
import { useTheme, type ThemeId } from '@/hooks/use-theme';
import { useLogout } from '@workspace/api-client-react';
import { Button } from './ui';
import { Scale, LogOut, User as UserIcon, Menu, X, MessageSquare, CreditCard, Home, FileText, BookOpen, Bell, Globe, ClipboardList, RefreshCw, ShieldCheck, Settings, TrendingUp, Mail, Inbox, Palette, Check } from 'lucide-react';
import { NotificationBell } from './notification-bell';

const PLATFORM_LANGUAGES: Array<{
  value: Lang;
  labelAr: string;
  labelEn: string;
  short: string;
}> = [
  { value: 'ar', labelAr: 'العربية', labelEn: 'Arabic', short: 'ع' },
  { value: 'en', labelAr: 'الإنجليزية', labelEn: 'English', short: 'EN' },
];

function LanguagePickerButton() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const currentLanguage = PLATFORM_LANGUAGES.find(language => language.value === lang) ?? PLATFORM_LANGUAGES[0];

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(value => !value)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/30 text-xs font-bold text-white hover:text-secondary hover:border-secondary/50 transition-colors"
        title={t('اختيار لغة المنصة', 'Choose platform language')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe className="w-3.5 h-3.5" />
        <span>{currentLanguage.short}</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('اختيار لغة المنصة', 'Choose platform language')}
          className="absolute left-0 top-full mt-2 z-[200] w-44 rounded-xl border border-white/10 bg-primary p-1.5 shadow-2xl"
        >
          <p className="px-2 py-1.5 text-[11px] font-bold text-white/60">
            {t('لغة المنصة', 'Platform language')}
          </p>
          {PLATFORM_LANGUAGES.map(language => {
            const active = lang === language.value;
            return (
              <button
                key={language.value}
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLang(language.value);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors"
                style={{
                  background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: active ? '#fff' : 'rgba(255,255,255,0.72)',
                }}
              >
                <span className="w-7 text-center font-bold">{language.short}</span>
                <span className="flex-1 text-right">
                  {lang === 'ar' ? language.labelAr : language.labelEn}
                </span>
                {active && <Check className="w-3 h-3 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── زر اختيار الثيم ─────────────────────────────────────────────────────────
function ThemePickerButton() {
  const { theme, setTheme, themes } = useTheme();
  const { lang } = useLang();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/30 text-xs font-bold text-white hover:text-secondary hover:border-secondary/50 transition-colors"
        title={lang === 'ar' ? 'اختيار الثيم' : 'Choose theme'}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Palette className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="اختيار الثيم"
          className="absolute left-0 top-full mt-2 z-[200] w-48 rounded-xl shadow-2xl overflow-hidden"
          style={{ background: 'hsl(220 55% 10%)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          <div className="p-1.5 flex flex-col gap-0.5">
            {themes.map(t => {
              const active = theme === t.id;
              return (
                <button
                  key={t.id}
                  role="option"
                  aria-selected={active}
                  onClick={() => { setTheme(t.id as ThemeId); setOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-right w-full transition-colors"
                  style={{
                    background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
                    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {/* مربعات الألوان */}
                  <span className="flex gap-0.5 shrink-0">
                    {t.swatches.map((c, i) => (
                      <span
                        key={i}
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ background: c, border: '1px solid rgba(255,255,255,0.18)' }}
                      />
                    ))}
                  </span>
                  {/* الاسم */}
                  <span className="flex-1 text-right">
                    {lang === 'ar' ? t.labelAr : t.labelEn}
                  </span>
                  {/* علامة الاختيار */}
                  {active && <Check className="w-3 h-3 shrink-0" style={{ color: 'hsl(47 100% 48%)' }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { isAuthenticated, isAdmin, user, logout: contextLogout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const logoutMutation = useLogout();
  const [location] = useLocation();
  const { lang, setLang, t } = useLang();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        contextLogout();
      }
    });
  };

  const navLinks = [
    { name: t('الرئيسية', 'Home'), path: '/' },
    { name: t('استشارة قانونية', 'Legal Consult'), path: '/consultation' },
    { name: t('استشارة قضائية', 'Judicial'), path: '/services/judicial' },
    { name: t('العقود', 'Contracts'), path: '/contracts' },
    { name: t('الباحثة الذكية', 'Research'), path: '/legal-search' },
    { name: t('الباقات', 'Pricing'), path: '/pricing' },
    { name: t('مبادرات', 'Initiatives'), path: '/initiatives' },
    { name: t('حجز موعد', 'Appointment'), path: '/appointment' },
    { name: t('تواصل', 'Contact'), path: '/contact' },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-secondary/30" style={{ background: 'var(--navbar-bg, black)' }}>
      {/* RTL: col1=يمين | col2=وسط | col3=يسار */}
      <div className="container mx-auto px-4 h-16 hidden md:grid items-center" style={{gridTemplateColumns:'auto 1fr auto'}}>

        {/* Col 1 → أقصى اليمين: الشعار */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="relative flex flex-col leading-tight text-right">
              <div className="flex items-center gap-2" dir="ltr">
                <div className="flex flex-col leading-tight text-right">
                  <span className="font-bold text-base whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>رباب محاميتك الرقمية</span>
                  <span className="font-bold text-base whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>RABAB LEGAL AI</span>
                </div>
                <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-300">
                  <Scale className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Col 2 → وسط: روابط الناف موزّعة بالتساوي */}
        <div className="flex items-center justify-evenly px-6">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path}
              className="text-xs font-medium transition-colors whitespace-nowrap text-white hover:text-white/80 relative flex items-center gap-1"
            >
              {link.name}
            </Link>
          ))}
        </div>

        {/* Col 3 → أقصى اليسار: ثيم + لغة + دخول */}
        <div className="flex items-center gap-2">
          <ThemePickerButton />
          <LanguagePickerButton />
          {isAuthenticated ? (
            <>
              <NotificationBell lang={lang} />
              {isAdmin ? (
                <Link href="/admin" className="text-xs font-medium text-white hover:text-secondary transition-colors whitespace-nowrap">{t('لوحة الإدارة', 'Admin')}</Link>
              ) : (
                <Link href="/dashboard" className="text-xs font-medium text-white hover:text-secondary transition-colors whitespace-nowrap">{t('حسابي', 'My Account')}</Link>
              )}
              <Button variant="ghost" size="icon" onClick={handleLogout} title={t('تسجيل الخروج', 'Logout')}>
                <LogOut className="w-4 h-4 text-destructive" />
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs font-medium text-white hover:text-secondary transition-colors whitespace-nowrap">
                {t('تسجيل الدخول', 'Login')}
              </Link>
              <Link href="/register">
                <Button size="sm" className="bg-secondary text-primary hover:bg-secondary/90 whitespace-nowrap text-xs font-bold">
                  {t('حساب جديد', 'Register')}
                </Button>
              </Link>
            </>
          )}
        </div>

      </div>

      {/* Mobile bar */}
      <div className="md:hidden container mx-auto px-4 h-16 flex items-center justify-between">
        <button 
          className="p-2 text-foreground"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
        <Link href="/" className="flex items-center gap-2 group">
          <span className="font-bold text-sm whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>رباب محاميتك الرقمية</span>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{background:'hsl(47 100% 48%)'}}>
            <Scale className="w-5 h-5" style={{color:'hsl(220 55% 8%)'}} />
          </div>
        </Link>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-b border-border bg-background p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
          {navLinks.map((link) => (
            <Link 
              key={link.path} 
              href={link.path}
              className="mobile-nav-link text-base font-medium py-2 border-b border-border/50 transition-colors flex items-center gap-2"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.name}
            </Link>
          ))}
          <div className="mt-2 border-t border-border/50 pt-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
              <Globe className="w-4 h-4 text-primary" />
              <span>{t('لغة المنصة', 'Platform language')}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORM_LANGUAGES.map(language => {
                const active = lang === language.value;
                return (
                  <button
                    key={language.value}
                    type="button"
                    onClick={() => {
                      setLang(language.value);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {lang === 'ar' ? language.labelAr : language.labelEn}
                    {active && <Check className="inline-block ms-1.5 h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>
          {isAuthenticated ? (
            <div className="flex flex-col gap-2 mt-4">
               {isAdmin ? (
                  <Link href="/admin">
                    <Button variant="outline" className="w-full justify-start" onClick={() => setIsMobileMenuOpen(false)}>لوحة الإدارة</Button>
                  </Link>
                ) : (
                  <Link href="/dashboard">
                    <Button variant="outline" className="w-full justify-start" onClick={() => setIsMobileMenuOpen(false)}>حسابي</Button>
                  </Link>
                )}
              <Button variant="ghost" className="w-full justify-start text-destructive" onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}>
                تسجيل الخروج
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-4">
              <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full">تسجيل الدخول</Button>
              </Link>
              <Link href="/register" onClick={() => setIsMobileMenuOpen(false)}>
                <Button className="w-full">حساب جديد</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground py-12 mt-auto border-t-[4px] border-secondary">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-8 h-8" style={{color:'hsl(47 100% 48%)'}} />
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-xl whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>رباب محاميتك الرقمية</span>
                <span className="text-xl font-bold" style={{color:'hsl(47 100% 48%)'}}>RABAB LEGAL AI</span>
              </div>
            </div>
            <p className="text-white leading-relaxed">
              منصة رقمية متطورة تقدم استشارات قانونية دقيقة وموثقة للأفراد والشركات في المملكة العربية السعودية<br />
              ودول مجلس التعاون.
            </p>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4 text-secondary">روابط سريعة</h3>
            <ul className="space-y-2">
              <li><Link href="/" className="text-white hover:text-secondary transition-colors">الرئيسية</Link></li>
              <li><Link href="/about" className="text-white hover:text-secondary transition-colors">من نحن</Link></li>
              <li><Link href="/pricing" className="text-white hover:text-secondary transition-colors">الباقات والأسعار</Link></li>
              <li><Link href="/#services" className="text-white hover:text-secondary transition-colors">الخدمات القانونية</Link></li>
              <li><Link href="/contracts" className="text-white hover:text-secondary transition-colors">صياغة العقود</Link></li>
              <li><Link href="/appointment" className="text-white hover:text-secondary transition-colors">حجز موعد</Link></li>
              <li><Link href="/faq" className="text-white hover:text-secondary transition-colors">الأسئلة الشائعة</Link></li>
              <li><Link href="/contact" className="text-white hover:text-secondary transition-colors">تواصل معنا</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4 text-secondary">قانوني</h3>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-white hover:text-secondary transition-colors">سياسة الخصوصية</Link></li>
              <li><Link href="/terms" className="text-white hover:text-secondary transition-colors">شروط الاستخدام</Link></li>
              <li><Link href="/disclaimer" className="text-white hover:text-secondary transition-colors">إخلاء المسؤولية</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-primary-foreground/20 text-center text-sm flex flex-col md:flex-row justify-between items-center gap-4" style={{color:'hsl(47 100% 48%)'}}>
          <p>© {new Date().getFullYear()} رباب محاميتك الرقمية — RABAB LEGAL AI. جميع الحقوق محفوظة.</p>
          <div className="flex gap-4">
            <a href="https://wa.me/966504647649" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">تواصل عبر واتساب</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function AdminSidebar({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { logout: contextLogout } = useAuth();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => { contextLogout(); navigate('/'); },
    });
  };
  
  const menu = [
    { name: 'لوحة القيادة', icon: Home, path: '/admin' },
    { name: 'المستخدمين', icon: UserIcon, path: '/admin/users' },
    { name: 'قاعدة المعرفة', icon: BookOpen, path: '/admin/knowledge-base' },
    { name: 'جودة البيانات', icon: ShieldCheck, path: '/admin/knowledge-quality' },
    { name: 'حالة المصادر', icon: ShieldCheck, path: '/admin/source-status' },
    { name: 'تحكم الأقسام', icon: Settings, path: '/admin/section-control' },
    { name: 'تقرير التحويل', icon: TrendingUp, path: '/admin/conversion-report' },
    // [DISABLED Aug-2026] بوت تلجرام معطَّل — أُزيل من القائمة حتى لا يظهر كخيار غير عامل
    { name: 'أحكام وتعاميم العدل', icon: BookOpen, path: '/admin/moj-content' },
    { name: 'المدونات القضائية', icon: BookOpen, path: '/admin/legal-codex' },
    { name: 'إعدادات البريد', icon: Mail, path: '/admin/email-settings' },
    { name: 'رسائل التواصل', icon: Inbox, path: '/admin/contact-messages' },
    { name: 'الإشعارات القانونية', icon: Bell, path: '/admin/notifications' },
    { name: 'الباقات', icon: CreditCard, path: '/admin/packages' },
    { name: 'الكوبونات', icon: FileText, path: '/admin/coupons' },
    { name: 'المدفوعات', icon: CreditCard, path: '/admin/payments' },
    { name: 'الاستشارات', icon: MessageSquare, path: '/admin/consultations' },
    { name: 'سجل التدقيق', icon: ClipboardList, path: '/admin/audit-log' },
    { name: 'إعدادات واتساب', icon: MessageSquare, path: '/admin/whatsapp' },
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/30">
      <aside className="w-full md:w-64 bg-card border-l border-border shrink-0 flex flex-col">
        <div className="p-6 border-b border-border">
          <h2 className="font-bold text-xl text-card-foreground">الإدارة المركزية</h2>
        </div>
        <nav className="flex-1 p-4 flex flex-col gap-2">
          {menu.map((item) => {
            const isActive = location === item.path;
            return (
              <Link 
                key={item.path} 
                href={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-white'}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-right hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">تسجيل الخروج</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
