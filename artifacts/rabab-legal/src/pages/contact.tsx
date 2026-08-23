import { setPageSEO } from '@/lib/seo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navbar, Footer } from '@/components/layout';
import { Button, Input, Textarea, Label, Card, CardContent } from '@/components/ui';
import { Phone, Mail, Globe, AtSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const contactSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  email: z.string().email("بريد غير صالح"),
  message: z.string().min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل")
});

type ContactForm = z.infer<typeof contactSchema>;
export default function Contact() {
  setPageSEO({ title: 'تواصل معنا | RABAB LEGAL AI', description: 'تواصل مع فريق RABAB LEGAL AI — محامي أونلاين في السعودية جاهز للإجابة على استفساراتك القانونية.', canonical: 'https://rabablegal.com/contact' });
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<ContactForm>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', message: '' }
  });

  const onSubmit = async (data: ContactForm) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          title: "تعذّر إرسال الرسالة",
          description: body.error ?? "حدث خطأ أثناء الإرسال، يرجى المحاولة مرة أخرى.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "تم إرسال رسالتك بنجاح",
        description: "سنتواصل معك في أقرب وقت ممكن.",
      });
      form.reset();
    } catch {
      toast({
        title: "تعذّر الاتصال بالخادم",
        description: "يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Navbar />
      
      {/* Hero header — dark section */}
      <div className="bg-primary border-b border-secondary/20 py-14">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold text-primary-foreground mb-4">تواصل معنا</h1>
          <p className="text-lg text-primary-foreground/65 mx-auto max-w-2xl">نحن هنا للإجابة على استفساراتك وتقديم الدعم اللازم. لا تتردد في التواصل معنا عبر القنوات التالية أو بترك رسالتك.</p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-16 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              <div className="bg-primary border border-secondary/30 rounded-xl shadow-sm text-center p-6 hover:border-secondary/60 transition-colors">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">رقم الهاتف</h3>
                <p className="text-sm text-primary-foreground/65 leading-relaxed" dir="ltr">+966504647649<br/>+966570773999</p>
              </div>

              <div className="bg-primary border border-secondary/30 rounded-xl shadow-sm text-center p-6 hover:border-secondary/60 transition-colors">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">البريد الإلكتروني</h3>
                <a
                  href="https://mail.google.com/mail/?view=cm&to=info@rabablegal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-secondary hover:underline leading-relaxed"
                  dir="ltr"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  info@rabablegal.com
                </a>
              </div>

              <div className="bg-primary border border-secondary/30 rounded-xl shadow-sm text-center p-6 hover:border-secondary/60 transition-colors">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <AtSign className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">تويتر / X</h3>
                <p className="text-sm text-primary-foreground/65 leading-relaxed" dir="ltr">@rabab_almoobi</p>
              </div>

              <div className="bg-primary border border-secondary/30 rounded-xl shadow-sm text-center p-6 hover:border-secondary/60 transition-colors">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <Globe className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">منصة شركة المحاماة</h3>
                <a href="https://rabablawyer.sa" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:underline leading-relaxed" dir="ltr">rabablawyer.sa</a>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-primary border border-secondary/30 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-full h-1.5 bg-secondary"></div>
            <div className="p-8">
              <h2 className="text-2xl font-bold text-primary-foreground mb-6">أرسل رسالة</h2>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>الاسم الكامل</Label>
                  <Input {...form.register('name')} disabled={submitting} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name?.message as string}</p>}
                </div>
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input {...form.register('email')} dir="ltr" className="text-left" disabled={submitting} />
                  {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email?.message as string}</p>}
                </div>
                <div className="space-y-2">
                  <Label>الرسالة</Label>
                  <Textarea {...form.register('message')} className="min-h-[150px]" disabled={submitting} />
                  {form.formState.errors.message && <p className="text-sm text-destructive">{form.formState.errors.message?.message as string}</p>}
                </div>
                <Button type="submit" className="w-full h-12 text-base font-bold shadow-md" disabled={submitting}>
                  {submitting ? "جارٍ الإرسال…" : "إرسال الرسالة"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
