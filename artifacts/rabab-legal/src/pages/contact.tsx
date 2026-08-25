import { setPageSEO } from '@/lib/seo';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Navbar, Footer } from '@/components/layout';
import { Button, Input, Textarea, Label, Card, CardContent } from '@/components/ui';
import { Phone, Mail, Globe, AtSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import React, { useState } from 'react';
import { useLang } from '@/hooks/use-language';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const contactSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب"),
  email: z.string().email("بريد غير صالح"),
  message: z.string().min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل")
});

type ContactForm = z.infer<typeof contactSchema>;
export default function Contact() {
  const { lang, t } = useLang();
  setPageSEO({
    title: t('تواصل معنا', 'Contact Us'),
    description: t(
      'تواصل مع فريق RABAB LEGAL AI — محامي أونلاين في السعودية جاهز للإجابة على استفساراتك القانونية.',
      'Contact the RABAB LEGAL AI team for answers to your legal questions in Saudi Arabia.',
    ),
    canonical: 'https://rabablegal.com/contact',
  });
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
          title: t("تعذّر إرسال الرسالة", 'Unable to send the message'),
          description: body.error ?? t("حدث خطأ أثناء الإرسال، يرجى المحاولة مرة أخرى.", 'Something went wrong while sending. Please try again.'),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: t("تم إرسال رسالتك بنجاح", 'Your message was sent'),
        description: t("سنتواصل معك في أقرب وقت ممكن.", 'We will contact you as soon as possible.'),
      });
      form.reset();
    } catch {
      toast({
        title: t("تعذّر الاتصال بالخادم", 'Unable to reach the server'),
        description: t("يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.", 'Check your internet connection and try again.'),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      
      {/* Hero header — dark section */}
      <div className="bg-primary border-b border-secondary/20 py-14">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold text-primary-foreground mb-4">{t('تواصل معنا', 'Contact Us')}</h1>
          <p className="text-lg text-primary-foreground/65 mx-auto max-w-2xl">{t('نحن هنا للإجابة على استفساراتك وتقديم الدعم اللازم. لا تتردد في التواصل معنا عبر القنوات التالية أو بترك رسالتك.', 'We are here to answer your questions and provide support. Contact us through any of the channels below or leave us a message.')}</p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-16 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              
              <div className="bg-primary border-2 border-secondary/55 rounded-xl shadow-sm shadow-secondary/10 text-center p-6 hover:border-secondary hover:shadow-secondary/20 transition-all">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <Phone className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">{t('رقم الهاتف', 'Phone Number')}</h3>
                <p className="text-sm text-primary-foreground/65 leading-relaxed" dir="ltr">+966504647649<br/>+966570773999</p>
              </div>

              <div className="bg-primary border-2 border-secondary/55 rounded-xl shadow-sm shadow-secondary/10 text-center p-6 hover:border-secondary hover:shadow-secondary/20 transition-all">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">{t('البريد الإلكتروني', 'Email address')}</h3>
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

              <div className="bg-primary border-2 border-secondary/55 rounded-xl shadow-sm shadow-secondary/10 text-center p-6 hover:border-secondary hover:shadow-secondary/20 transition-all">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <AtSign className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">{t('تويتر / X', 'X (Twitter)')}</h3>
                <p className="text-sm text-primary-foreground/65 leading-relaxed" dir="ltr">@rabab_almoobi</p>
              </div>

              <div className="bg-primary border-2 border-secondary/55 rounded-xl shadow-sm shadow-secondary/10 text-center p-6 hover:border-secondary hover:shadow-secondary/20 transition-all">
                <div className="w-12 h-12 bg-secondary/15 text-secondary rounded-full flex items-center justify-center mx-auto mb-4 border border-secondary/25">
                  <Globe className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-primary-foreground mb-2">{t('منصة شركة المحاماة', 'Law Firm Platform')}</h3>
                <a href="https://rabablawyer.sa" target="_blank" rel="noopener noreferrer" className="text-sm text-secondary hover:underline leading-relaxed" dir="ltr">rabablawyer.sa</a>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-primary border-2 border-secondary/65 rounded-2xl shadow-lg shadow-secondary/15 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-full h-1.5 bg-secondary"></div>
            <div className="p-8">
              <h2 className="text-2xl font-bold text-primary-foreground mb-6">{t('أرسل رسالة', 'Send a Message')}</h2>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('الاسم الكامل', 'Full Name')}</Label>
                  <Input {...form.register('name')} disabled={submitting} />
                  {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name?.message as string}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('البريد الإلكتروني', 'Email address')}</Label>
                  <Input {...form.register('email')} dir="ltr" className="text-left" disabled={submitting} />
                  {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email?.message as string}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('الرسالة', 'Message')}</Label>
                  <Textarea {...form.register('message')} className="min-h-[150px]" disabled={submitting} />
                  {form.formState.errors.message && <p className="text-sm text-destructive">{form.formState.errors.message?.message as string}</p>}
                </div>
                <Button type="submit" className="w-full h-12 text-base font-bold shadow-md" disabled={submitting}>
                  {submitting ? t("جارٍ الإرسال…", 'Sending…') : t("إرسال الرسالة", 'Send Message')}
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
