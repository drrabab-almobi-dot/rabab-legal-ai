import { useEffect, useRef, useState } from 'react';
import { Button, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useLang } from '@/hooks/use-language';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, Loader2, Mail, RefreshCw, Timer } from 'lucide-react';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type EmailVerificationStepProps = {
  email: string;
  onVerified: (token: string, user: any) => void;
  onBack?: () => void;
};

export function EmailVerificationStep({ email, onVerified, onBack }: EmailVerificationStepProps) {
  const { toast } = useToast();
  const { lang, t } = useLang();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((seconds) => seconds - 1), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== 6) {
      toast({ variant: 'destructive', title: t('الرمز غير مكتمل', 'Incomplete code') });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast({
          variant: 'destructive',
          title: t('تعذر تأكيد الرمز', 'Could not confirm code'),
          description: data.error || t('الرمز غير صحيح أو منتهي الصلاحية.', 'The code is incorrect or expired.'),
        });
        setDigits(Array(6).fill(''));
        inputRefs.current[0]?.focus();
        return;
      }
      onVerified(data.token, data.user);
    } catch {
      toast({ variant: 'destructive', title: t('خطأ في الاتصال', 'Connection error') });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'resend failed');
      setCountdown(60);
      toast({ title: t('تم إرسال رمز جديد', 'New code sent'), description: t('تحققي من بريدك الإلكتروني.', 'Check your email.') });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t('فشل الإرسال', 'Sending failed'),
        description: error instanceof Error ? error.message : t('حاولي مرة أخرى لاحقاً.', 'Please try again later.'),
      });
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <CardHeader className="pb-6 pt-10 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-secondary bg-secondary/10 text-secondary">
          <Mail className="h-8 w-8" />
        </div>
        <CardTitle className="mb-2 text-2xl font-bold text-primary">{t('تأكيد البريد الإلكتروني', 'Confirm your email')}</CardTitle>
        <p className="text-muted-foreground">{t('أرسلنا رمزاً من 6 أرقام إلى', 'We sent a 6-digit code to')}</p>
        <p className="mt-1 font-semibold text-primary" dir="ltr">{email}</p>
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="h-3.5 w-3.5" />
          {t('الرمز صالح لمدة 10 دقائق', 'The code is valid for 10 minutes')}
        </div>
      </CardHeader>
      <CardContent className="pb-10">
        <div className="mb-8 flex justify-center gap-1.5 sm:gap-3" onPaste={(event) => {
          const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
          if (pasted.length === 6) {
            setDigits(pasted.split(''));
            inputRefs.current[5]?.focus();
          }
        }} dir="ltr">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => { inputRefs.current[index] = element; }}
              aria-label={`${t('رقم', 'Digit')} ${index + 1}`}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={digit}
              onChange={(event) => handleDigitChange(index, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
              }}
              className="h-12 w-10 rounded-xl border-2 border-secondary/55 bg-background text-center text-xl font-bold outline-none transition-colors focus:border-secondary focus:ring-2 focus:ring-secondary/25 sm:h-14 sm:w-12 sm:text-2xl"
            />
          ))}
        </div>
        <Button className="mb-4 h-12 w-full text-base font-bold" onClick={handleVerify} disabled={loading || digits.join('').length !== 6}>
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="ms-2 h-5 w-5" />{t('تأكيد الحساب', 'Confirm account')}</>}
        </Button>
        <div className="text-center">
          <button type="button" onClick={handleResend} disabled={countdown > 0 || resendLoading} className="mx-auto flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary disabled:opacity-50">
            {resendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {countdown > 0 ? t(`إعادة الإرسال بعد ${countdown} ثانية`, `Resend in ${countdown} seconds`) : t('إعادة إرسال الرمز', 'Resend code')}
          </button>
        </div>
        {onBack && (
          <div className="mt-5 text-center">
            <button type="button" onClick={onBack} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
              {t('← العودة', '← Back')}
            </button>
          </div>
        )}
      </CardContent>
    </div>
  );
}
