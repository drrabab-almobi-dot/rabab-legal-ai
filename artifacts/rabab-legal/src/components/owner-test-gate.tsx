import { useEffect, useState, type ReactNode } from 'react';
import { LockKeyhole, Loader2, ShieldCheck } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useLang } from '@/hooks/use-language';

type AccessMode = 'loading' | 'off' | 'admin_only';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function OwnerTestGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const [location] = useLocation();
  const { lang, t } = useLang();
  const [accessMode, setAccessMode] = useState<AccessMode>('loading');

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/access-mode`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return { mode: 'off' };
        return response.json() as Promise<{ mode?: string }>;
      })
      .then((data) => {
        if (active) setAccessMode(data.mode === 'admin_only' ? 'admin_only' : 'off');
      })
      .catch(() => {
        // A failed probe must never lock a healthy public production application.
        if (active) setAccessMode('off');
      });
    return () => { active = false; };
  }, []);

  if (accessMode === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" aria-live="polite">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label={t('جارٍ التحقق من حالة الدخول', 'Checking access status')} />
      </div>
    );
  }

  if (accessMode !== 'admin_only' || isAdmin) return <>{children}</>;

  // The owner may sign in from the normal audited authentication page. A signed
  // in non-admin receives the same closed-test notice and cannot use any APIs.
  const loginPath = `/login?returnTo=${encodeURIComponent('/dashboard')}`;
  const showLogin = !isAuthenticated && location === '/login';
  if (showLogin) return <>{children}</>;

  return (
    <main
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_42%),hsl(var(--background))] px-5 py-10 flex items-center justify-center"
    >
      <section className="w-full max-w-xl rounded-3xl border border-primary/15 bg-card p-8 text-center shadow-xl shadow-primary/5 md:p-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <LockKeyhole className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-secondary/15 px-3 py-1 text-xs font-bold text-primary">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t('وضع اختبار خاص', 'Private testing mode')}
        </p>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          {t('المنصة تحت اختبار الجودة', 'The platform is undergoing quality testing')}
        </h1>
        <p className="mt-4 leading-8 text-muted-foreground">
          {t(
            'نختبر خدمات الاستشارات والتحقق القانوني قبل إتاحتها للعامة. الوصول متاح حالياً للمسؤول المخوّل فقط.',
            'We are validating consultation and legal-verification services before public release. Access is currently limited to the authorized administrator only.',
          )}
        </p>
        {!isAuthenticated && (
          <a
            href={loginPath}
            className="mt-7 inline-flex min-h-10 min-w-52 items-center justify-center rounded-md border border-primary-border bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            {t('دخول المسؤول', 'Administrator sign in')}
          </a>
        )}
      </section>
    </main>
  );
}
