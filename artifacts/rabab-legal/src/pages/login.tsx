import { setPageSEO } from '@/lib/seo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Navbar, Footer } from '@/components/layout';
import { useToast } from '@/hooks/use-toast';
import React, { useState, useRef, useEffect } from 'react';
import { Scale, Loader2, Eye, EyeOff, Mail, RefreshCw, CheckCircle2, ShieldCheck, Phone, Timer, MessageSquare } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { useLang } from '@/hooks/use-language';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type LoginFormValues = { email: string; password: string };

function OtpStep({ email, onVerified }: { email: string; onVerified: (token: string, user: any) => void }) {
  const { toast } = useToast();
  const { lang, t } = useLang();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => { inputRefs.current[0]?.focus(); }, []);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = cleaned;
    setDigits(next);
    if (cleaned && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) { setDigits(pasted.split("")); inputRefs.current[5]?.focus(); }
  };

  const handleVerify = async () => {
    const code = digits.join("");
    if (code.length < 6) { toast({ variant: "destructive", title: t("الرمز غير مكتمل", "Incomplete code") }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: t("رمز غير صحيح", "Incorrect code"), description: data.error || t("الرمز غير صحيح أو منتهي الصلاحية", "The code is incorrect or expired.") });
        setDigits(Array(6).fill("")); inputRefs.current[0]?.focus(); return;
      }
      onVerified(data.token, data.user);
    } catch {
      toast({ variant: "destructive", title: t("خطأ في الاتصال", "Connection error") });
    } finally { setLoading(false); }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResendLoading(true);
    try {
      await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email }),
      });
      setCountdown(60);
      toast({ title: t("تم إرسال رمز جديد", "New code sent"), description: t("تحققي من بريدك الإلكتروني", "Check your email.") });
    } catch {
      toast({ variant: "destructive", title: t("فشل الإرسال", "Sending failed") });
    } finally { setResendLoading(false); }
  };

  return (
    <Card className="w-full max-w-md border-2 border-secondary/60 shadow-lg shadow-secondary/10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <CardHeader className="text-center pb-6 pt-10">
        <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
          <Mail className="w-8 h-8" />
        </div>
        <CardTitle className="text-2xl font-bold text-primary mb-2">{t("تأكيد البريد الإلكتروني", "Confirm your email")}</CardTitle>
        <p className="text-muted-foreground">{t("أرسلنا رمزاً مكوناً من 6 أرقام إلى", "We sent a 6-digit code to")}</p>
        <p className="font-semibold text-primary mt-1" dir="ltr">{email}</p>
        <div className="flex items-center justify-center gap-1.5 mt-2 text-xs text-muted-foreground">
          <Timer className="w-3.5 h-3.5" />
          {t("الرمز صالح لمدة 10 دقائق", "The code is valid for 10 minutes")}
        </div>
      </CardHeader>
      <CardContent className="pb-10">
        <div className="flex justify-center gap-1.5 sm:gap-3 mb-8" onPaste={handlePaste} dir="ltr">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { inputRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border-2 border-secondary/55 rounded-xl bg-background focus:border-secondary focus:ring-2 focus:ring-secondary/25 focus:outline-none transition-colors" />
          ))}
        </div>
        <Button className="w-full h-12 text-base font-bold mb-4" onClick={handleVerify} disabled={loading || digits.join("").length < 6}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 ms-2" />{t("تأكيد الحساب", "Confirm account")}</>}
        </Button>
        <div className="text-center">
          <button type="button" onClick={handleResend} disabled={countdown > 0 || resendLoading}
            className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto">
            {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {countdown > 0 ? t(`إعادة الإرسال بعد ${countdown} ثانية`, `Resend in ${countdown} seconds`) : t("إعادة إرسال الرمز", "Resend code")}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Login() {
  const { lang, t } = useLang();
  const loginSchema = z.object({
    email: z.string().email(t("البريد الإلكتروني غير صالح", "Invalid email address")),
    password: z.string().min(1, t("كلمة المرور مطلوبة", "Password is required")),
  });
  setPageSEO({ title: t('تسجيل الدخول', 'Log in'), canonical: 'https://rabablegal.com/login' });
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const { login: contextLogin } = useAuth();
  const { toast } = useToast();
  const isDevelopmentPreview = import.meta.env.DEV;

  // OTP challenge state — shown when server returns 403 + pendingVerification
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [verifyToken, setVerifyToken] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  // ── OTP digit boxes + countdown for phone verification ─────────────────────
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(6).fill(''));
  const [otpCountdown, setOtpCountdown] = useState(0);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => setOtpCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  const handleOtpDigitChange = (index: number, value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = cleaned;
    setOtpDigits(next);
    if (cleaned && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) otpInputRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtpDigits(pasted.split(''));
      otpInputRefs.current[5]?.focus();
    }
  };

  const returnTo = (() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('returnTo');
      if (!raw) return null;
      const decoded = decodeURIComponent(raw);
      return decoded.startsWith('/') ? decoded : null;
    } catch { return null; }
  })();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' }
  });

  function redirectAfterLogin(user: any) {
    if (returnTo) {
      window.location.href = import.meta.env.BASE_URL.replace(/\/$/, '') + returnTo;
    } else if (user.role === 'admin') {
      setLocation('/admin');
    } else {
      setLocation('/dashboard');
    }
  }

  // ── Step 1: email + password ──────────────────────────────────────────────
  const onSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      const res = await customFetch<any>('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(12000),
      });
      // Normal success
      contextLogin(res.user);
      toast({ title: t("تم تسجيل الدخول بنجاح", "Logged in successfully") });
      redirectAfterLogin(res.user);
    } catch (err: any) {
      // 403 = phone not verified → show OTP step (error body is on err.data)
      const errBody = err?.data ?? err;
      if (errBody?.pendingVerification) {
        setVerifyToken(errBody.verifyToken);
        setMaskedPhone(errBody.maskedPhone ?? '');
        setOtpCountdown(60);
        setOtpDigits(Array(6).fill(''));
        setStep('otp');
        toast({ title: t("يلزم التحقق من الجوال", "Phone verification required"), description: t(`أُرسل رمز SMS إلى ${errBody.maskedPhone}`, `An SMS code was sent to ${errBody.maskedPhone}`) });
      } else {
        toast({
          variant: "destructive",
          title: t("فشل تسجيل الدخول", "Log in failed"),
          description: err?.name === "TimeoutError" || err?.name === "AbortError"
            ? t("الخادم لا يستجيب حاليًا. تحققي من اتصال الخدمة وحاولي بعد قليل.", "The server is not responding. Check the service connection and try again shortly.")
            : errBody?.error || t("البريد الإلكتروني أو كلمة المرور غير صحيحة", "Incorrect email or password.")
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 2: confirm phone OTP ─────────────────────────────────────────────
  const onConfirmOtp = async () => {
    const code = otpDigits.join('');
    if (code.length !== 6) {
      toast({ variant: "destructive", title: t("الرمز غير مكتمل", "Incomplete code"), description: t("أدخلي رمزاً مكوناً من 6 أرقام", "Enter a 6-digit code.") });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await customFetch<{ token: string; user: any }>(
        '/api/auth/phone-verify/confirm',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verifyToken, code }) }
      );
      contextLogin(res.user);
      toast({ title: t("تم التحقق بنجاح", "Verified successfully") });
      redirectAfterLogin(res.user);
    } catch (err: any) {
      const errMsg = err?.error || '';
      if (errMsg.includes('expired') || errMsg.includes('منتهي')) {
        toast({ variant: "destructive", title: t("انتهت صلاحية الرمز", "Code expired"), description: t("الرمز انتهت صلاحيته. اضغطي على إعادة الإرسال للحصول على رمز جديد.", "The code has expired. Click resend to get a new code.") });
      } else {
        toast({ variant: "destructive", title: t("رمز غير صحيح", "Incorrect code"), description: errMsg || t("الرمز غير صحيح. تحققي من الرقم وحاولي مرة أخرى.", "The code is incorrect. Check the number and try again.") });
      }
      setOtpDigits(Array(6).fill(''));
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Resend phone OTP ──────────────────────────────────────────────────────
  const onResend = async () => {
    if (otpCountdown > 0) return;
    setIsResending(true);
    try {
      const res = await customFetch<{ verifyToken: string; maskedPhone: string }>(
        '/api/auth/phone-verify/resend',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verifyToken }) }
      );
      setVerifyToken(res.verifyToken);
      setMaskedPhone(res.maskedPhone);
      setOtpDigits(Array(6).fill(''));
      setOtpCountdown(60);
      otpInputRefs.current[0]?.focus();
      toast({ title: t("تم إعادة الإرسال", "Code resent"), description: t(`رمز جديد أُرسل إلى ${res.maskedPhone}`, `A new code was sent to ${res.maskedPhone}`) });
    } catch (err: any) {
      toast({ variant: "destructive", title: t("فشل الإرسال", "Sending failed"), description: err?.error || t("حدث خطأ، حاولي مجدداً", "An error occurred. Please try again.") });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md border-2 border-primary/55 shadow-lg shadow-primary/10">

          {/* ── Step 1: Login form ────────────────────────────────────────── */}
          {step === 'form' && (
            <>
              <CardHeader className="text-center pb-8 pt-10">
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6 shadow-inner">
                  <Scale className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary mb-2">{t('تسجيل الدخول', 'Log in')}</CardTitle>
                <p className="text-muted-foreground text-lg">{t('مرحباً بك مجدداً في رباب محاميتك الرقمية في الأنظمة السعودية والخليجية RABAB LEGAL AI', 'Welcome back to Rabab, your digital lawyer for Saudi and GCC laws — RABAB LEGAL AI')}</p>
              </CardHeader>
              <CardContent className="pb-10">
                {isDevelopmentPreview && (
                  <div
                    className="mb-6 rounded-lg border border-secondary/40 bg-secondary/10 p-4 text-sm leading-7 text-foreground"
                    data-testid="development-preview-notice"
                    role="status"
                  >
                    <p className="font-bold">{t('أنتِ الآن في معاينة التطوير.', 'You are currently using the development preview.')}</p>
                    <p className="mt-1 text-muted-foreground">
                      {t('حسابات المعاينة مستقلة عن حسابات الموقع الرسمي. إذا كان لديكِ حساب في الموقع الرسمي، سجّلي الدخول من', 'Preview accounts are separate from official website accounts. If you have an official account, sign in at')}{' '}
                      <a href="https://rabablegal.com/login" className="font-bold text-secondary hover:underline">
                        rabablegal.com
                      </a>
                      .
                    </p>
                  </div>
                )}
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("البريد الإلكتروني", "Email address")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      {...form.register('email')}
                      data-testid="input-login-email"
                      dir="ltr"
                      className="text-left"
                      autoComplete="email"
                    />
                    {form.formState.errors.email && (
                      <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="password">{t("كلمة المرور", "Password")}</Label>
                      <Link href="/forgot-password" className="text-xs text-secondary hover:underline">{t("نسيت كلمة المرور؟", "Forgot password?")}</Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        {...form.register('password')}
                        data-testid="input-login-password"
                        dir="ltr"
                        className="text-left pl-10"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(v => !v)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {form.formState.errors.password && (
                      <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-bold mt-2"
                    disabled={isSubmitting}
                    data-testid="button-login-submit"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("تسجيل الدخول", "Log in")}
                  </Button>

                  <div className="text-center mt-6 text-sm">
                    <span className="text-muted-foreground">{t('ليس لديك حساب؟', 'Don't have an account?')} </span>
                    <Link href="/register" className="text-primary font-bold hover:underline">
                      {t('سجل الآن', 'Register now')}
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          )}

          {/* ── Step 2: Phone OTP verification (improved) ─────────────────── */}
          {step === 'otp' && (
            <>
              <CardHeader className="text-center pb-6 pt-10">
                <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary mb-2">{t("تحقق من رقم جوالك", "Verify your phone number")}</CardTitle>
                <p className="text-muted-foreground">{t("أُرسل رمز تحقق مكوّن من 6 أرقام عبر رسالة SMS إلى", "A 6-digit verification code was sent via SMS to")}</p>
                {maskedPhone && (
                  <p className="flex items-center justify-center gap-2 text-foreground font-semibold mt-1" dir="ltr">
                    <Phone className="w-4 h-4 text-secondary" />
                    {maskedPhone}
                  </p>
                )}
                <div className="flex items-center justify-center gap-1.5 mt-3 text-xs text-muted-foreground">
                  <Timer className="w-3.5 h-3.5" />
                  {t("الرمز صالح لمدة 10 دقائق", "The code is valid for 10 minutes")}
                </div>
              </CardHeader>

              <CardContent className="pb-10">
                <div className="space-y-5">
                  {/* ── 6 individual digit boxes ── */}
                  <div className="space-y-2">
                    <Label>{t("رمز التحقق", "Verification code")}</Label>
                    <div className="flex justify-center gap-1.5 sm:gap-3" onPaste={handleOtpPaste} dir="ltr">
                      {otpDigits.map((d, i) => (
                        <input
                          key={i}
                          ref={(el) => { otpInputRefs.current[i] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={d}
                          onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(i, e)}
                          data-testid={`input-otp-digit-${i}`}
                          className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border-2 border-secondary/55 rounded-xl bg-background focus:border-secondary focus:ring-2 focus:ring-secondary/25 focus:outline-none transition-colors"
                        />
                      ))}
                    </div>
                  </div>

                  <Button
                    className="w-full h-12 text-base font-bold"
                    onClick={onConfirmOtp}
                    disabled={isSubmitting || otpDigits.join('').length !== 6}
                    data-testid="button-otp-confirm"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("تأكيد الرمز", "Confirm code")}
                  </Button>

                  {/* ── Resend with countdown ── */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={onResend}
                      disabled={otpCountdown > 0 || isResending}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1.5 mx-auto"
                    >
                      {isResending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      {otpCountdown > 0
                        ? t(`إعادة الإرسال بعد ${otpCountdown} ثانية`, `Resend in ${otpCountdown} seconds`)
                        : t("إعادة إرسال الرمز", "Resend code")}
                    </button>
                  </div>

                  {/* ── SMS info note ── */}
                  <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg border border-muted-foreground/10">
                    <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {t(
                        "تحققي من رسائل الجوال SMS. إذا لم تصل الرسالة خلال دقيقة، تأكدي من صحة الرقم أو أعيدي الإرسال.",
                        "Check your phone SMS messages. If you don't receive the code within a minute, verify your number or resend."
                      )}
                    </p>
                  </div>

                  <div className="text-center text-sm">
                    <button
                      type="button"
                      onClick={() => { setStep('form'); setOtpDigits(Array(6).fill('')); setOtpCountdown(0); }}
                      className="text-muted-foreground hover:text-foreground hover:underline text-xs"
                    >
                      {t("← العودة لتسجيل الدخول", "← Back to log in")}
                    </button>
                  </div>
                </div>
              </CardContent>
            </>
          )}

        </Card>
      </main>

      <Footer />
    </div>
  );
}
