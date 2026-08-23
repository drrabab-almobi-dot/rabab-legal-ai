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

const registerSchema = z.object({
  name: z.string().min(2, "الاسم يجب أن يكون حرفين على الأقل"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  phone: z.string().min(9, "رقم الجوال قصير جداً").regex(/^[0-9+]+$/, "أرقام فقط"),
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "كلمات المرور غير متطابقة",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  setPageSEO({ title: 'إنشاء حساب | RABAB LEGAL AI', description: 'أنشئ حسابك في RABAB LEGAL AI وابدأ في الحصول على استشارات قانونية أونلاين في الأنظمة السعودية.', canonical: 'https://rabablegal.com/register' });
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
        toast({ title: "تم إرسال رمز التحقق", description: `أُرسل رمز SMS إلى ${res.maskedPhone}` });
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل إنشاء الحساب", description: err?.error || err?.message || "حدث خطأ غير متوقع" });
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
      toast({ title: "تم التحقق بنجاح", description: "مرحباً بك في رباب محاميتك الرقمية" });
      setLocation('/dashboard');
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
      // Server invalidates old token and returns a fresh one
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
        <Card className="w-full max-w-lg border-border/50 shadow-lg">

          {/* ── Step 1: Registration form ─────────────────────────────────── */}
          {step === 'form' && (
            <>
              <CardHeader className="text-center pb-8 pt-10">
                <div className="w-16 h-16 bg-secondary/10 border-2 border-secondary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-6">
                  <Scale className="w-8 h-8" />
                </div>
                <CardTitle className="text-2xl font-bold text-primary mb-2">إنشاء حساب جديد</CardTitle>
                <p className="text-muted-foreground text-base leading-relaxed">انضم إلى رباب محاميتك الرقمية في الأنظمة السعودية والخليجية<br />RABAB LEGAL AI وابدأ استشاراتك</p>
              </CardHeader>
              <CardContent className="pb-10">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">

                   {/* ── نوع الحساب ── */}
                   <div className="space-y-2">
                     <Label>نوع الحساب</Label>
                     <div className="grid grid-cols-2 gap-2">
                       {([
                         { id: 'individual', label: 'فرد', icon: <User className="w-4 h-4" /> },
                         { id: 'entity',     label: 'منشأة / شركة', icon: <Building2 className="w-4 h-4" /> },
                       ] as const).map(opt => (
                         <button key={opt.id} type="button"
                           onClick={() => setAccountType(opt.id)}
                           className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                             accountType === opt.id
                               ? 'bg-primary text-primary-foreground border-primary'
                               : 'bg-card border-border hover:border-primary/40 text-foreground'
                           }`}
                         >
                           {opt.icon}{opt.label}
                         </button>
                       ))}
                     </div>
                   </div>

                   {/* ── حقول المنشأة ── */}
                   {accountType === 'entity' && (
                     <div className="space-y-3 p-4 bg-muted/40 rounded-xl border border-border/50">
                       <p className="text-xs font-bold text-muted-foreground">بيانات المنشأة</p>
                       <div className="space-y-2">
                         <Label htmlFor="entityName">اسم المنشأة <span className="text-destructive">*</span></Label>
                         <Input id="entityName" value={entityName} onChange={e => setEntityName(e.target.value)}
                           placeholder="اسم الشركة أو المنشأة" dir="rtl" />
                       </div>
                       <div className="grid grid-cols-2 gap-3">
                         <div className="space-y-2">
                           <Label htmlFor="entityCr">رقم السجل التجاري <span className="text-destructive">*</span></Label>
                           <Input id="entityCr" value={entityCr} onChange={e => setEntityCr(e.target.value)}
                             placeholder="1234567890" dir="ltr" />
                         </div>
                         <div className="space-y-2">
                           <Label htmlFor="entityTax">الرقم الضريبي <span className="text-muted-foreground text-xs">(اختياري)</span></Label>
                           <Input id="entityTax" value={entityTax} onChange={e => setEntityTax(e.target.value)}
                             placeholder="300..." dir="ltr" />
                         </div>
                       </div>
                     </div>
                   )}

                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم الكامل</Label>
                    <Input
                      id="name"
                      placeholder="الاسم الثلاثي"
                      {...form.register('name')}
                      data-testid="input-register-name"
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <Label htmlFor="email">البريد الإلكتروني</Label>
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
                      <Label htmlFor="phone">رقم الجوال</Label>
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
                    <Label htmlFor="password">كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="8 أحرف على الأقل"
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
                    <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="أعد إدخال كلمة المرور"
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
                      <span className="text-muted-foreground">بالنقر على "إنشاء الحساب"، أنت توافق على </span><Link href="/terms" className="text-muted-foreground underline hover:text-foreground">شروط الخدمة</Link><span className="text-muted-foreground"> و </span><Link href="/privacy" className="text-muted-foreground underline hover:text-foreground">سياسة الخصوصية</Link><span className="text-muted-foreground"> الخاصة بنا.</span>
                    </p>
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-bold"
                      disabled={isSubmitting}
                      data-testid="button-register-submit"
                    >
                      {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "إنشاء الحساب"}
                    </Button>
                  </div>

                  <div className="text-center mt-6 text-sm">
                    <span className="text-muted-foreground">لديك حساب بالفعل؟ </span>
                    <Link href="/login" className="text-primary font-bold hover:underline">
                      سجل دخولك
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
                <CardTitle className="text-2xl font-bold text-primary mb-2">تحقق من رقم جوالك</CardTitle>
                <p className="text-muted-foreground">
                  أُرسل رمز تحقق مكوّن من 6 أرقام إلى
                </p>
                <p className="flex items-center justify-center gap-2 text-foreground font-semibold mt-1" dir="ltr">
                  <Phone className="w-4 h-4 text-secondary" />
                  {maskedPhone}
                </p>
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
                      onClick={() => setStep('form')}
                      className="text-muted-foreground hover:text-foreground hover:underline text-xs"
                    >
                      ← تعديل البيانات
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
