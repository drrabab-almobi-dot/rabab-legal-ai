import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'wouter';
import { Navbar, Footer } from '@/components/layout';
import { Button, Input, Label, Card, CardContent } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function ForgotPassword() {
  const { toast } = useToast();
  const { lang, t } = useLang();
  const schema = z.object({
    email: z.string().email(t("أدخل بريداً إلكترونياً صحيحاً", "Enter a valid email address")),
  });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = async (data: { email: string }) => {
    setLoading(true);
    try {
      await fetch(`${BASE}/api/auth/forgot-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });
      setSent(true);
    } catch {
      toast({ title: t("حدث خطأ", "An error occurred"), description: t("يرجى المحاولة مرة أخرى لاحقاً.", "Please try again later."), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md border-border/50 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-2 bg-secondary" />
          <CardContent className="pt-8 pb-8 px-8">
            {sent ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-primary">{t("تم إرسال رابط الاستعادة", "Recovery link sent")}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("إذا كان البريد الإلكتروني مسجّلاً في المنصة، ستصلك رسالة تحتوي على رابط لإعادة تعيين كلمة المرور خلال دقائق.", "If the email address is registered, you will receive a message with a password reset link within a few minutes.")}
                </p>
                <p className="text-xs text-muted-foreground">{t("تحقق من مجلد البريد غير المرغوب فيه إذا لم تجد الرسالة.", "Check your spam folder if you cannot find the message.")}</p>
                <Link href="/login">
                  <Button variant="outline" className="w-full mt-4 gap-2">
                     <ArrowRight className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
                     {t("العودة لتسجيل الدخول", "Back to log in")}
                  </Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Mail className="w-7 h-7 text-secondary" />
                  </div>
                   <h1 className="text-2xl font-bold text-primary mb-2">{t("نسيت كلمة المرور؟", "Forgot password?")}</h1>
                   <p className="text-base text-muted-foreground">{t("أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة التعيين", "Enter your email address and we'll send you a reset link.")}</p>
                </div>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-2">
                     <Label htmlFor="email">{t("البريد الإلكتروني", "Email address")}</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="example@domain.com"
                      dir="ltr"
                      className="text-left"
                      {...form.register('email')}
                    />
                    {form.formState.errors.email && (
                      <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                     {loading ? t("جارٍ الإرسال...", "Sending...") : t("إرسال رابط الاستعادة", "Send recovery link")}
                  </Button>
                  <Link href="/login">
                    <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                       <ArrowRight className={`w-4 h-4 ${lang === 'ar' ? 'rotate-180' : ''}`} />
                       {t("العودة لتسجيل الدخول", "Back to log in")}
                    </Button>
                  </Link>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
