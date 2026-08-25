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
          className="absolute left-0 top-full mt-2 z-[200] w-44 rounded-xl border-2 border-secondary/60 bg-primary p-1.5 shadow-2xl shadow-secondary/20"
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
  const { lang, t } = useLang();
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
        title={t('اختيار الثيم', 'Choose theme')}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Palette className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t('اختيار الثيم', 'Choose theme')}
          className="absolute left-0 top-full mt-2 z-[200] w-48 rounded-xl border-2 border-secondary/60 shadow-2xl shadow-secondary/20 overflow-hidden"
          style={{ background: 'hsl(220 55% 10%)' }}
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
    <nav dir={lang === 'ar' ? 'rtl' : 'ltr'} className="sticky top-0 z-50 w-full border-b border-secondary/30" style={{ background: 'var(--navbar-bg, black)' }}>
      {/* RTL: col1=يمين | col2=وسط | col3=يسار */}
      <div className="container mx-auto px-4 h-16 hidden xl:grid items-center" style={{gridTemplateColumns:'auto 1fr auto'}}>

        {/* Col 1 → أقصى اليمين: الشعار */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center gap-2 group">
            <div className={`relative flex flex-col leading-tight ${lang === 'ar' ? 'text-right' : 'text-left'}`}>
              <div className="flex items-center gap-2" dir="ltr">
                <div className="flex flex-col leading-tight text-right">
                  <span className="font-bold text-base whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>{t('رباب محاميتك الرقمية', 'Rabab Digital Lawyer')}</span>
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
        <div className="min-w-0 overflow-x-auto">
          <div className="flex min-w-max items-center justify-evenly gap-4 px-6">
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

      {/* Medium-width header: keep the sections beside the brand. The links
          scroll horizontally inside their own flexible column instead of
          dropping below the logo when the preview is narrower than desktop. */}
      <div className="hidden md:flex xl:hidden container mx-auto h-16 items-center gap-2 px-3">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 group">
          <span className="max-w-[118px] truncate text-[11px] font-bold leading-tight whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>
            {t('رباب محاميتك الرقمية', 'Rabab Digital Lawyer')}
          </span>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{background:'hsl(47 100% 48%)'}}>
            <Scale className="h-5 w-5" style={{color:'hsl(220 55% 8%)'}} />
          </div>
        </Link>

        <div className="min-w-0 flex-1 overflow-x-auto" style={{scrollbarWidth:'none'}}>
          <div className="flex min-w-max items-center justify-center gap-3">
            {navLinks.map(link => (
              <Link
                key={link.path}
                href={link.path}
                className="whitespace-nowrap text-[12px] font-medium text-white transition-colors hover:text-secondary"
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ThemePickerButton />
          <LanguagePickerButton />
          {isAuthenticated ? (
            <>
              <NotificationBell lang={lang} />
              <Link href={isAdmin ? '/admin' : '/dashboard'} className="max-w-[42px] truncate text-[10px] font-medium text-white hover:text-secondary transition-colors whitespace-nowrap">
                {isAdmin ? t('لوحة الإدارة', 'Admin') : t('حسابي', 'Account')}
              </Link>
              <Button variant="ghost" size="icon" onClick={handleLogout} title={t('تسجيل الخروج', 'Logout')} className="h-8 w-8">
                <LogOut className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-[11px] font-medium text-white hover:text-secondary transition-colors whitespace-nowrap">{t('تسجيل الدخول', 'Login')}</Link>
              <Link href="/register">
                <Button size="sm" className="h-8 bg-secondary px-2 text-[11px] font-bold text-primary hover:bg-secondary/90 whitespace-nowrap">{t('حساب جديد', 'Register')}</Button>
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
        <Link href="/" className="flex min-w-0 items-center gap-2 group">
          <span className="min-w-0 max-w-[calc(100vw-116px)] truncate font-bold text-sm whitespace-nowrap" style={{color:'hsl(47 100% 48%)'}}>{t('رباب محاميتك الرقمية', 'Rabab Digital Lawyer')}</span>
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
                        : 'border-secondary/50 text-muted-foreground hover:border-secondary hover:bg-muted'
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
                    <Button variant="outline" className="w-full justify-start" onClick={() => setIsMobileMenuOpen(false)}>{t('لوحة الإدارة', 'Admin')}</Button>
                  </Link>
                ) : (
                  <Link href="/dashboard">
                    <Button variant="outline" className="w-full justify-start" onClick={() => setIsMobileMenuOpen(false)}>{t('حسابي', 'My Account')}</Button>
                  </Link>
                )}
              <Button variant="ghost" className="w-full justify-start text-destructive" onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}>
                {t('تسجيل الخروج', 'Logout')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-4">
              <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                <Button variant="outline" className="w-full">{t('تسجيل الدخول', 'Login')}</Button>
              </Link>
              <Link href="/register" onClick={() => setIsMobileMenuOpen(false)}>
                <Button className="w-full">{t('حساب جديد', 'Register')}</Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

export function Footer() {
  const { t, lang } = useLang();
  return (
    <footer dir={lang === 'ar' ? 'rtl' : 'ltr'} className="bg-primary text-primary-foreground py-12 mt-auto border-t-[4px] border-secondary">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-8 h-8" style={{color:'hsl(47 100% 48%)'}} />
              <div className="flex flex-col leading-tight">
                <span className="font-bold text-xl whitespace-nowrap" style={{ color: 'hsl(47 100% 48%)' }}>{t('رباب محاميتك الرقمية', 'Rabab, your digital lawyer')}</span>
                <span className="text-xl font-bold" style={{color:'hsl(47 100% 48%)'}}>RABAB LEGAL AI</span>
              </div>
            </div>
            <p className="text-white leading-relaxed max-w-2xl">
              {lang === 'ar' ? (
                <>
                  منصة رقمية متطورة تقدم استشارات قانونية دقيقة وموثقة للأفراد والشركات{' '}
                  <span className="whitespace-nowrap">في المملكة العربية السعودية</span>
                  {' '}ودول مجلس التعاون.
                </>
              ) : (
                'An advanced digital platform providing accurate, source-based legal guidance for individuals and businesses in Saudi Arabia and the GCC.'
              )}
            </p>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4 text-secondary">{t('روابط سريعة', 'Quick Links')}</h3>
            <ul className="space-y-2">
              <li><Link href="/" className="text-white hover:text-secondary transition-colors">{t('الرئيسية', 'Home')}</Link></li>
              <li><Link href="/about" className="text-white hover:text-secondary transition-colors">{t('من نحن', 'About Us')}</Link></li>
              <li><Link href="/pricing" className="text-white hover:text-secondary transition-colors">{t('الباقات والأسعار', 'Plans & Pricing')}</Link></li>
              <li><Link href="/#services" className="text-white hover:text-secondary transition-colors">{t('الخدمات القانونية', 'Legal Services')}</Link></li>
              <li><Link href="/contracts" className="text-white hover:text-secondary transition-colors">{t('صياغة العقود', 'Contract Drafting')}</Link></li>
              <li><Link href="/appointment" className="text-white hover:text-secondary transition-colors">{t('حجز موعد', 'Book an Appointment')}</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-bold text-lg mb-4 text-secondary">{t('قانوني', 'Legal')}</h3>
            <ul className="space-y-2">
              <li><Link href="/privacy" className="text-white hover:text-secondary transition-colors">{t('سياسة الخصوصية', 'Privacy Policy')}</Link></li>
              <li><Link href="/terms" className="text-white hover:text-secondary transition-colors">{t('شروط الاستخدام', 'Terms of Use')}</Link></li>
              <li><Link href="/disclaimer" className="text-white hover:text-secondary transition-colors">{t('إخلاء المسؤولية', 'Disclaimer')}</Link></li>
               <li><Link href="/faq" className="text-white hover:text-secondary transition-colors">{t('الأسئلة الشائعة', 'FAQ')}</Link></li>
               <li><Link href="/contact" className="text-white hover:text-secondary transition-colors">{t('تواصل معنا', 'Contact Us')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-primary-foreground/20 text-center text-sm flex flex-col md:flex-row justify-between items-center gap-4" style={{color:'hsl(47 100% 48%)'}}>
          <p>© {new Date().getFullYear()} {t('رباب محاميتك الرقمية', 'Rabab, your digital lawyer')} — RABAB LEGAL AI. {t('جميع الحقوق محفوظة.', 'All rights reserved.')}</p>
          <div className="flex gap-4">
            <a href="https://wa.me/966504647649" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">{t('تواصل عبر واتساب', 'Contact via WhatsApp')}</a>
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
  const { lang, t } = useLang();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => { contextLogout(); navigate('/'); },
    });
  };
  
  const menu = [
    { name: t('لوحة القيادة', 'Dashboard'), icon: Home, path: '/admin' },
    { name: t('المستخدمين', 'Users'), icon: UserIcon, path: '/admin/users' },
    { name: t('قاعدة المعرفة', 'Knowledge Base'), icon: BookOpen, path: '/admin/knowledge-base' },
    { name: t('جودة البيانات', 'Data Quality'), icon: ShieldCheck, path: '/admin/knowledge-quality' },
    { name: t('حالة المصادر', 'Source Status'), icon: ShieldCheck, path: '/admin/source-status' },
    { name: t('تحكم الأقسام', 'Section Control'), icon: Settings, path: '/admin/section-control' },
    { name: t('تقرير التحويل', 'Conversion Report'), icon: TrendingUp, path: '/admin/conversion-report' },
    // [DISABLED Aug-2026] بوت تلجرام معطَّل — أُزيل من القائمة حتى لا يظهر كخيار غير عامل
    { name: t('أحكام وتعاميم العدل', 'MOJ Rulings & Circulars'), icon: BookOpen, path: '/admin/moj-content' },
    { name: t('المدونات القضائية', 'Judicial Codex'), icon: BookOpen, path: '/admin/legal-codex' },
    { name: t('إعدادات البريد', 'Email Settings'), icon: Mail, path: '/admin/email-settings' },
    { name: t('رسائل التواصل', 'Contact Messages'), icon: Inbox, path: '/admin/contact-messages' },
    { name: t('الإشعارات القانونية', 'Legal Notifications'), icon: Bell, path: '/admin/notifications' },
    { name: t('الباقات', 'Plans'), icon: CreditCard, path: '/admin/packages' },
    { name: t('الكوبونات', 'Coupons'), icon: FileText, path: '/admin/coupons' },
    { name: t('المدفوعات', 'Payments'), icon: CreditCard, path: '/admin/payments' },
    { name: t('الاستشارات', 'Consultations'), icon: MessageSquare, path: '/admin/consultations' },
    { name: t('سجل التدقيق', 'Audit Log'), icon: ClipboardList, path: '/admin/audit-log' },
    { name: t('إعدادات واتساب', 'WhatsApp Settings'), icon: MessageSquare, path: '/admin/whatsapp' },
  ];

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/30">
      <aside className="w-full md:w-64 bg-card border-l-2 border-secondary/60 shadow-sm shadow-secondary/10 shrink-0 flex flex-col">
        <div className="p-6 border-b border-secondary/35">
          <h2 className="font-bold text-xl text-card-foreground">{t('الإدارة المركزية', 'Central Administration')}</h2>
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
        <div className="p-4 border-t border-secondary/35">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full text-right hover:bg-destructive/10 text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">{t('تسجيل الخروج', 'Logout')}</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 overflow-auto">
        {children}
      </main>
    </div>
  );
}
