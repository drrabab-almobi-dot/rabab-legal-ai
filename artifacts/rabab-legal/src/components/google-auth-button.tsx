import { Button } from '@/components/ui';
import { Loader2 } from 'lucide-react';
import { useLang } from '@/hooks/use-language';
import { useEffect, useState } from 'react';

type GoogleAuthButtonProps = {
  available: boolean | null;
  disabled?: boolean;
  returnTo?: string | null;
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.21-2.27H12v4.3h5.22a4.46 4.46 0 0 1-1.94 2.93v2.79h3.14c1.84-1.7 2.93-4.2 2.93-7.75Z" />
      <path fill="#34A853" d="M12 21.75c2.62 0 4.82-.87 6.42-2.36l-3.14-2.79c-.87.59-1.99.94-3.28.94-2.52 0-4.66-1.7-5.42-3.99H3.34v2.88A9.7 9.7 0 0 0 12 21.75Z" />
      <path fill="#FBBC05" d="M6.58 13.55A5.83 5.83 0 0 1 6.28 12c0-.54.1-1.06.3-1.55V7.57H3.34A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.09 4.43l3.24-2.88Z" />
      <path fill="#EA4335" d="M12 6.46c1.42 0 2.7.49 3.7 1.45l2.77-2.77C16.82 3.6 14.62 2.25 12 2.25a9.7 9.7 0 0 0-8.66 5.32l3.24 2.88c.76-2.29 2.9-3.99 5.42-3.99Z" />
    </svg>
  );
}

export function GoogleAuthButton({ available, disabled = false, returnTo }: GoogleAuthButtonProps) {
  const { lang, t } = useLang();
  const isLoading = available === null;
  const canContinue = available === true && !disabled;

  const continueWithGoogle = () => {
    if (!canContinue) return;
    const safeReturnTo = returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : null;
    const query = safeReturnTo ? `?${new URLSearchParams({ returnTo: safeReturnTo })}` : '';
    window.location.assign(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/auth/google${query}`);
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="h-12 w-full border-primary/25 bg-background text-foreground shadow-sm transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canContinue}
        onClick={continueWithGoogle}
        data-testid="button-google-auth"
      >
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
        <span className="ms-2">{t('المتابعة باستخدام Google', 'Continue with Google')}</span>
      </Button>
      {available === false && (
        <p className="text-center text-xs leading-5 text-muted-foreground" role="status">
          {t('تسجيل Google قيد التفعيل؛ يمكنك استخدام البريد الإلكتروني وكلمة المرور حالياً.', 'Google sign-in is being enabled. Email and password remain available.')}
        </p>
      )}
      {lang === 'ar' && available === true && (
        <p className="text-center text-xs text-muted-foreground">لن ننشر أي محتوى من حسابك على Google.</p>
      )}
    </div>
  );
}

export function SocialSignIn({ returnTo }: { returnTo?: string | null }) {
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/auth/providers`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Provider status request failed');
        const providers = await response.json() as { google?: boolean };
        setGoogleAvailable(providers.google === true);
      })
      .catch(() => setGoogleAvailable(false));

    return () => controller.abort();
  }, []);

  return <GoogleAuthButton available={googleAvailable} returnTo={returnTo} />;
}

export function AuthDivider() {
  const { t } = useLang();
  return (
    <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span>{t('أو المتابعة بالبريد الإلكتروني', 'or continue with email')}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
