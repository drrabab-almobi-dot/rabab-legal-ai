import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation } from 'wouter';
import { Navbar, Footer } from '@/components/layout';
import { Button, Input, Label, Card, CardContent } from '@/components/ui';
import { useToast } from '@/hooks/use-toast';
import { Lock, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const schema = z.object({
  password: z.string().min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "كلمتا المرور غير متطابقتين",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) setInvalid(true);
    else setToken(t);
  }, []);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const onSubmit = async (data: { password: string; confirmPassword: string }) => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: data.password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "خطأ", description: err.error || "الرابط منتهي الصلاحية أو غير صالح.", variant: "destructive" });
        return;
      }
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      toast({ title: "حدث خطأ", description: "يرجى المحاولة مرة أخرى.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <Card className="w-full max-w-md border-border/50 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-full h-2 bg-secondary" />
          <CardContent className="pt-8 pb-8 px-8">
            {invalid ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <XCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-primary">رابط غير صالح</h2>
                <p className="text-muted-foreground text-sm">الرابط مفقود أو منتهي الصلاحية. يرجى طلب رابط جديد.</p>
                <Link href="/forgot-password">
                  <Button className="w-full mt-2">طلب رابط جديد</Button>
                </Link>
              </div>
            ) : done ? (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-primary">تم تغيير كلمة المرور</h2>
                <p className="text-muted-foreground text-sm">سيتم توجيهك لصفحة تسجيل الدخول خلال ثوانٍ...</p>
                <Link href="/login">
                  <Button className="w-full mt-2">تسجيل الدخول الآن</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <div className="w-14 h-14 bg-secondary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-7 h-7 text-secondary" />
                  </div>
                  <h1 className="text-2xl font-bold text-primary mb-2">إعادة تعيين كلمة المرور</h1>
                  <p className="text-base text-muted-foreground">أدخل كلمة المرور الجديدة</p>
                </div>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="password">كلمة المرور الجديدة</Label>
                    <div className="relative">
                      <Input id="password" type={showPass ? "text" : "password"} placeholder="••••••••" dir="ltr" className="text-left pl-10" {...form.register('password')} />
                      <button type="button" onClick={() => setShowPass(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
                    <div className="relative">
                      <Input id="confirmPassword" type={showConfirm ? "text" : "password"} placeholder="••••••••" dir="ltr" className="text-left pl-10" {...form.register('confirmPassword')} />
                      <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" tabIndex={-1}>
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {form.formState.errors.confirmPassword && <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "جارٍ الحفظ..." : "حفظ كلمة المرور الجديدة"}
                  </Button>
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
