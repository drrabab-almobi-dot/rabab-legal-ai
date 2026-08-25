import { setPageSEO } from '@/lib/seo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button, Input, Label, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Navbar, Footer } from '@/components/layout';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';
import { Scale, Loader2, ShieldCheck, Phone, Eye, EyeOff, User, Building2 } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { useLang } from '@/hooks/use-language';

type RegisterFormValues = { name: string; email: string; phone: string; password: string; confirmPassword: string };

export default function Register() {
  const { lang, t } = useLang();
  const registerSchema = z.object({
    name: z.string().min(2, t("الاسم يجب أن يكون حرفين على الأقل", "Name must be at least 2 characters")),
    email: z.string().email(t("البريد الإلكتروني غير صالح", "Invalid email address")),
    phone: z.string().min(9, t("رقم الجوال قصير جداً", "Phone number is too short")).regex(/^[0-9+]+$/, t("أرقام فقط", "Numbers only")),
    password: z.string().min(8, t("كلمة المرور يجب أن تكون 8 أحرف على الأقل", "Password must be at least 8 characters")),
    confirmPassword: z.string()
  }).refine((data) => data.password === data.confirmPassword, {
    message: t("كلمات المرور غير متطابقة", "Passwords do not match"),
    path: ["confirmPassword"],
  });
  setPageSEO({ title: t('إنشاء حساب', 'Create Account'), description: t('أنشئ حسابك في RABAB LEGAL AI وابدأ في الحصول على استشارات قانونية أونلاين في الأنظمة السعودية.', 'Create an account with RABAB LEGAL AI and begin receiving online legal consultations for Saudi laws.'), canonical: 'https://rabablegal.com/register' });
  const [, setLocation] = useLocation();
  const { login: contextLogin } = useAuth();
  const { toast } = useToast();

  // Step 1: registration form  |  Step 2: OTP entry
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [verifyToken, setVerifyToken] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // نوع الحساب: فرد أو منشأة
  const [accountType, setAccountType]       = useState<'individual' | 'entity'>('individual');
  const [entityName,  setEntityName]        = useState('');
  const [entityCr,    setEntityCr]          = useState('');
  const [entityTax,   setEntityTax]         = useState('');

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', phone: '', password: '', confirmPassword: '' }
  });

  // ── Step 1: submit registration ───────────────────────────────────────────
  const onSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    const { confirmPassword, ...registerData } = data;
    const fullData = {
      ...registerData,
      accountType,
      ...(accountType === 'entity' ? { entityName, entityCrNumber: entityCr, entityTaxNumber: entityTax || undefined } : {}),
    };
    try {
      const res = await customFetch<{ pendingVerification: boolean; verifyToken: string; maskedPhone: string }>(
        '/api/auth/register',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fullData) }
      );
      if (res.pendingVerification) {
        setVerifyToken(res.verifyToken);
        setMaskedPhone(res.maskedPhone);
        setStep('otp');
        toast({ title: t("تم إرسال رمز التحقق", "Verification code sent"), description: t(`أُرسل رمز SMS إلى ${res.maskedPhone}`, `An SMS code was sent to ${res.maskedPhone}`) });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: t("فشل إنشاء الحساب", "Account creation failed"), description: err?.error || err?.message || t("حدث خطأ غير متوقع", "An unexpected error occurred.") });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 2: confirm OTP ───────────────────────────────────────────────────
  const onConfirmOtp = async () => {
    if (otpCode.length !== 6) {
      toast({ variant: "destructive", title: t("الرمز غير صحيح", "Incorrect code"), description: t("أدخلي رمزاً مكوناً من 6 أرقام", "Enter a 6-digit code.") });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await customFetch<{ token: string; user: any }>(
        '/api/auth/phone-verify/confirm',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verifyToken, code: otpCode }) }
      );
      contextLogin(res.user);
      toast({ title: t("تم التحقق بنجاح", "Verified successfully"), description: t("مرحباً بك في رباب محاميتك الرقمية", "Welcome to Rabab, your digital lawyer.") });
      setLocation('/dashboard');
    } catch (err: any) {
      toast({ variant: "destructive", title: t("رمز غير صحيح", "Incorrect code"), description: err?.error || t("الرمز غير صحيح أو منتهي الصلاحية", "The code is incorrect or expired.") });
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
      // Server invalidates old token and returns a fresh one
      setVerifyToken(res.verifyToken);
      setMaskedPhone(res.maskedPhone);
      setOtpCode('');
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
        <Card className="w-full max-w-lg border-2 border-primary/55 shadow-lg shadow-primary/10">

          {/* ── Step 1: Registration form ─────────────────────────────────── */}
          {step === 'form' && (
            <>
              <CardHeader className="text-center pb-8 pt-10">
                <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
                  <Scale className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary mb-2">{t('إنشاء حساب جديد', 'Create a New Account')}</CardTitle>
                <p className="text-muted-foreground text-base leading-relaxed">{t('انضم إلى رباب محاميتك الرقمية في الأنظمة السعودية والخليجية', 'Join Rabab, your digital lawyer for Saudi and GCC laws')}<br />RABAB LEGAL AI {t('وابدأ استشاراتك', 'and start your consultations')}</p>
              </CardHeader>
              <CardContent className="pb-10">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                   {/* ── نوع الحساب ── */}
                   <div className="space-y-2">
                      <Label>{t('نوع الحساب', 'Account Type')}</Label>
                     <div className="grid grid-cols-2 gap-2">
                       {([
                          { id: 'individual', label: 'فرد', labelEn: 'Individual', icon: <User className="w-4 h-4" /> },
                          { id: 'entity',     label: 'منشأة / شركة', labelEn: 'Organization / Company', icon: <Building2 className="w-4 h-4" /> },
                       ] as const).map(opt => (
                         <button key={opt.id} type="button"
                           onClick={() => setAccountType(opt.id)}
                           className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                             accountType === opt.id
                               ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-card border-blue-400/55 hover:border-primary/65 hover:shadow-sm text-foreground'
                           }`}
                         >
                            {opt.icon}{lang === 'ar' ? opt.label : opt.labelEn}
                         </button>
                       ))}
                     </div>
                   </div>

                   {/* ── حقول المنشأة ── */}
                   {accountType === 'entity' && (
                      <div className="space-y-3 p-4 bg-muted/40 rounded-xl border-2 border-blue-400/45 shadow-sm shadow-blue-400/5">
                        <p className="text-xs font-bold text-muted-foreground">{t("بيانات المنشأة", "Organization details")}</p>
                       <div className="space-y-2">
                          <Label htmlFor="entityName">{t("اسم المنشأة", "Organization name")} <span className="text-destructive">*</span></Label>
                         <Input id="entityName" value={entityName} onChange={e => setEntityName(e.target.value)}
                            placeholder={t("اسم الشركة أو المنشأة", "Company or organization name")} dir={lang === 'ar' ? 'rtl' : 'ltr'} />
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-2">
                            <Label htmlFor="entityCr">{t("رقم السجل التجاري", "Commercial registration number")} <span className="text-destructive">*</span></Label>
                           <Input id="entityCr" value={entityCr} onChange={e => setEntityCr(e.target.value)}
                             placeholder="1234567890" dir="ltr" />
                         </div>
                         <div className="space-y-2">
                            <Label htmlFor="entityTax">{t("الرقم الضريبي", "Tax number")} <span className="text-muted-foreground text-xs">{t("(اختياري)", "(optional)")}</span></Label>
                           <Input id="entityTax" value={entityTax} onChange={e => setEntityTax(e.target.value)}
                             placeholder="300..." dir="ltr" />
                         </div>
                       </div>
                     </div>
                   )}

                  <div className="space-y-2">
                     <Label htmlFor="name">{t("الاسم الكامل", "Full name")}</Label>
                    <Input
                      id="name"
                       placeholder={t("الاسم الثلاثي", "Full name")}
                       dir={lang === 'ar' ? 'rtl' : 'ltr'}
                      {...form.register('name')}
                      data-testid="input-register-name"
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                       <Label htmlFor="email">{t("البريد الإلكتروني", "Email address")}</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="name@example.com"
                        {...form.register('email')}
                        data-testid="input-register-email"
                        dir="ltr"
                        className="text-left"
                      />
                      {form.formState.errors.email && (
                        <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                       <Label htmlFor="phone">{t("رقم الجوال", "Mobile number")}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        placeholder="05XXXXXXXX"
                        {...form.register('phone')}
                        data-testid="input-register-phone"
                        dir="ltr"
                        className="text-left"
                      />
                      {form.formState.errors.phone && (
                        <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                     <Label htmlFor="password">{t("كلمة المرور", "Password")}</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                         placeholder={t("8 أحرف على الأقل", "At least 8 characters")}
                        {...form.register('password')}
                        data-testid="input-register-password"
                        dir="ltr"
                        className="text-left pl-10"
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

                  <div className="space-y-2">
                     <Label htmlFor="confirmPassword">{t("تأكيد كلمة المرور", "Confirm password")}</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                         placeholder={t("أعد إدخال كلمة المرور", "Re-enter password")}
                        {...form.register('confirmPassword')}
                        data-testid="input-register-confirm-password"
                        dir="ltr"
                        className="text-left pl-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(v => !v)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {form.formState.errors.confirmPassword && (
                      <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
                    )}
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                      <span className="text-muted-foreground">{t('بالنقر على "إنشاء الحساب"، أنت توافق على', 'By creating an account, you agree to our')} </span><Link href="/terms" className="text-muted-foreground underline hover:text-foreground">{t('شروط الخدمة', 'Terms of Service')}</Link><span className="text-muted-foreground"> {t('و', 'and')} </span><Link href="/privacy" className="text-muted-foreground underline hover:text-foreground">{t('سياسة الخصوصية', 'Privacy Policy')}</Link><span className="text-muted-foreground">.</span>
                    </p>
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-bold"
                      disabled={isSubmitting}
                      data-testid="button-register-submit"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t('إنشاء الحساب', 'Create Account')}
                    </Button>
                  </div>

                  <div className="text-center mt-6 text-sm">
                    <span className="text-muted-foreground">{t('لديك حساب بالفعل؟', 'Already have an account?')} </span>
                    <Link href="/login" className="text-primary font-bold hover:underline">
                      {t('سجل دخولك', 'Log in')}
                    </Link>
                  </div>
                </form>
              </CardContent>
            </>
          )}

          {/* ── Step 2: OTP Verification ──────────────────────────────────── */}
          {step === 'otp' && (
            <>
              <CardHeader className="text-center pb-8 pt-10">
                <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                 <CardTitle className="text-2xl font-bold text-primary mb-2">{t("تحقق من رقم جوالك", "Verify your phone number")}</CardTitle>
                <p className="text-muted-foreground">
                   {t("أُرسل رمز تحقق مكوّن من 6 أرقام إلى", "A 6-digit verification code was sent to")}
                </p>
                <p className="flex items-center justify-center gap-2 text-foreground font-semibold mt-1" dir="ltr">
                  <Phone className="w-4 h-4 text-secondary" />
                  {maskedPhone}
                </p>
              </CardHeader>

              <CardContent className="pb-10">
                <div className="space-y-5">
                  <div className="space-y-2">
                     <Label htmlFor="otp-code">{t("رمز التحقق", "Verification code")}</Label>
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
                     {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : t("تأكيد الرمز", "Confirm code")}
                  </Button>

                  <div className="text-center text-sm">
                     <span className="text-muted-foreground">{t("لم تستلم الرمز؟", "Didn't receive the code?")} </span>
                    <button
                      type="button"
                      onClick={onResend}
                      disabled={isResending}
                      className="text-primary font-bold hover:underline disabled:opacity-50"
                    >
                       {isResending ? t("جارٍ الإرسال...", "Sending...") : t("أعد الإرسال", "Resend")}
                    </button>
                  </div>

                  <div className="text-center text-sm">
                    <button
                      type="button"
                      onClick={() => setStep('form')}
                      className="text-muted-foreground hover:text-foreground hover:underline text-xs"
                    >
                       {t("← تعديل البيانات", "← Edit details")}
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
