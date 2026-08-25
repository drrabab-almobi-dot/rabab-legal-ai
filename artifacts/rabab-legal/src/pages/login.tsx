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
import { Scale, Loader2, Eye, EyeOff, Mail, RefreshCw, CheckCircle2, ShieldCheck, Phone } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function OtpStep({ email, onVerified }: { email: string; onVerified: (token: string, user: any) => void }) {
  const { toast } = useToast();
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
    if (code.length < 6) { toast({ variant: "destructive", title: "الرمز غير مكتمل" }); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ variant: "destructive", title: "رمز غير صحيح", description: data.error || "الرمز غير صحيح أو منتهي الصلاحية" });
        setDigits(Array(6).fill("")); inputRefs.current[0]?.focus(); return;
      }
      onVerified(data.token, data.user);
    } catch {
      toast({ variant: "destructive", title: "خطأ في الاتصال" });
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
      toast({ title: "تم إرسال رمز جديد", description: "تحققي من بريدك الإلكتروني" });
    } catch {
      toast({ variant: "destructive", title: "فشل الإرسال" });
    } finally { setResendLoading(false); }
  };

  return (
    <Card className="w-full max-w-md border-border/50 shadow-lg">
      <CardHeader className="text-center pb-6 pt-10">
        <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
          <Mail className="w-8 h-8" />
        </div>
        <CardTitle className="text-2xl font-bold text-primary mb-2">تأكيد البريد الإلكتروني</CardTitle>
        <p className="text-muted-foreground">أرسلنا رمزاً مكوناً من 6 أرقام إلى</p>
        <p className="font-semibold text-primary mt-1" dir="ltr">{email}</p>
        <p className="text-sm text-muted-foreground mt-2">الرمز صالح لمدة 10 دقائق</p>
      </CardHeader>
      <CardContent className="pb-10">
        <div className="flex justify-center gap-1.5 sm:gap-3 mb-8" onPaste={handlePaste} dir="ltr">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { inputRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold border-2 rounded-xl bg-background focus:border-secondary focus:outline-none transition-colors" />
          ))}
        </div>
        <Button className="w-full h-12 text-base font-bold mb-4" onClick={handleVerify} disabled={loading || digits.join("").length < 6}>
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle2 className="w-5 h-5 ml-2" />تأكيد الحساب</>}
        </Button>
        <div className="text-center">
          <button type="button" onClick={handleResend} disabled={countdown > 0 || resendLoading}
            className="text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto">
            {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {countdown > 0 ? `إعادة الإرسال بعد ${countdown} ثانية` : "إعادة إرسال الرمز"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Login() {
  setPageSEO({ title: 'تسجيل الدخول', canonical: 'https://rabablegal.com/login' });
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const { login: contextLogin } = useAuth();
  const { toast } = useToast();
  const isDevelopmentPreview = import.meta.env.DEV;

  // OTP challenge state — shown when server returns 403 + pendingVerification
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [verifyToken, setVerifyToken] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

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
      toast({ title: "تم تسجيل الدخول بنجاح" });
      redirectAfterLogin(res.user);
    } catch (err: any) {
      // 403 = phone not verified → show OTP step (error body is on err.data)
      const errBody = err?.data ?? err;
      if (errBody?.pendingVerification) {
        setVerifyToken(errBody.verifyToken);
        setMaskedPhone(errBody.maskedPhone ?? '');
        setStep('otp');
        toast({ title: "يلزم التحقق من الجوال", description: `أُرسل رمز SMS إلى ${errBody.maskedPhone}` });
      } else {
        toast({
          variant: "destructive",
          title: "فشل تسجيل الدخول",
          description: err?.name === "TimeoutError" || err?.name === "AbortError"
            ? "الخادم لا يستجيب حاليًا. تحققي من اتصال الخدمة وحاولي بعد قليل."
            : errBody?.error || "البريد الإلكتروني أو كلمة المرور غير صحيحة"
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 2: confirm OTP ───────────────────────────────────────────────────
  const onConfirmOtp = async () => {
    if (otpCode.length !== 6) {
      toast({ variant: "destructive", title: "الرمز غير صحيح", description: "أدخلي رمزاً مكوناً من 6 أرقام" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await customFetch<{ token: string; user: any }>(
        '/api/auth/phone-verify/confirm',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verifyToken, code: otpCode }) }
      );
      contextLogin(res.user);
      toast({ title: "تم التحقق بنجاح" });
      redirectAfterLogin(res.user);
    } catch (err: any) {
      toast({ variant: "destructive", title: "رمز غير صحيح", description: err?.error || "الرمز غير صحيح أو منتهي الصلاحية" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────────────
  const onResend = async () => {
    setIsResending(true);
    try {
      const res = await customFetch<{ verifyToken: string; maskedPhone: string }>(
        '/api/auth/phone-verify/resend',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verifyToken }) }
      );
      setVerifyToken(res.verifyToken);
      setMaskedPhone(res.maskedPhone);
      setOtpCode('');
      toast({ title: "تم إعادة الإرسال", description: `رمز جديد أُرسل إلى ${res.maskedPhone}` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: err?.error || "حدث خطأ، حاولي مجدداً" });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Navbar />

      <main className="flex-1 flex items-center justify-center p-4 py-12">
        <Card className="w-full max-w-md border-border/50 shadow-lg">

          {/* ── Step 1: Login form ────────────────────────────────────────── */}
          {step === 'form' && (
            <>
              <CardHeader className="text-center pb-8 pt-10">
                <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6 shadow-inner">
                  <Scale className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary mb-2">تسجيل الدخول</CardTitle>
                <p className="text-muted-foreground text-lg">مرحباً بك مجدداً في رباب محاميتك الرقمية في الأنظمة السعودية والخليجية RABAB LEGAL AI</p>
              </CardHeader>
              <CardContent className="pb-10">
                {isDevelopmentPreview && (
                  <div
                    className="mb-6 rounded-lg border border-secondary/40 bg-secondary/10 p-4 text-sm leading-7 text-foreground"
                    data-testid="development-preview-notice"
                    role="status"
                  >
                    <p className="font-bold">أنتِ الآن في معاينة التطوير.</p>
                    <p className="mt-1 text-muted-foreground">
                      حسابات المعاينة مستقلة عن حسابات الموقع الرسمي. إذا كان لديكِ حساب في الموقع الرسمي،
                      سجّلي الدخول من{' '}
                      <a href="https://rabablegal.com/login" className="font-bold text-secondary hover:underline">
                        rabablegal.com
                      </a>
                      .
                    </p>
                  </div>
                )}
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="email">البريد الإلكتروني</Label>
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
                      <Label htmlFor="password">كلمة المرور</Label>
                      <Link href="/forgot-password" className="text-xs text-secondary hover:underline">نسيت كلمة المرور؟</Link>
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
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "تسجيل الدخول"}
                  </Button>

                  <div className="text-center mt-6 text-sm">
                    <span className="text-muted-foreground">ليس لديك حساب؟ </span>
                    <Link href="/register" className="text-primary font-bold hover:underline">
                      سجل الآن
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          )}

          {/* ── Step 2: OTP verification ──────────────────────────────────── */}
          {step === 'otp' && (
            <>
              <CardHeader className="text-center pb-8 pt-10">
                <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary mb-2">تحقق من رقم جوالك</CardTitle>
                <p className="text-muted-foreground">أُرسل رمز تحقق مكوّن من 6 أرقام إلى</p>
                {maskedPhone && (
                  <p className="flex items-center justify-center gap-2 text-foreground font-semibold mt-1" dir="ltr">
                    <Phone className="w-4 h-4 text-secondary" />
                    {maskedPhone}
                  </p>
                )}
              </CardHeader>

              <CardContent className="pb-10">
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="otp-code">رمز التحقق</Label>
                    <Input
                      id="otp-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="XXXXXX"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      data-testid="input-otp-code"
                      dir="ltr"
                      className="text-center text-2xl tracking-[0.4em] font-mono h-14"
                      autoFocus
                    />
                  </div>

                  <Button
                    className="w-full h-12 text-base font-bold"
                    onClick={onConfirmOtp}
                    disabled={isSubmitting || otpCode.length !== 6}
                    data-testid="button-otp-confirm"
                  >
                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "تأكيد الرمز"}
                  </Button>

                  <div className="text-center text-sm">
                    <span className="text-muted-foreground">لم تستلم الرمز؟ </span>
                    <button
                      type="button"
                      onClick={onResend}
                      disabled={isResending}
                      className="text-primary font-bold hover:underline disabled:opacity-50"
                    >
                      {isResending ? "جارٍ الإرسال..." : "أعد الإرسال"}
                    </button>
                  </div>

                  <div className="text-center text-sm">
                    <button
                      type="button"
                      onClick={() => { setStep('form'); setOtpCode(''); }}
                      className="text-muted-foreground hover:text-foreground hover:underline text-xs"
                    >
                      ← العودة لتسجيل الدخول
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
