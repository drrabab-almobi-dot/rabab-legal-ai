import React, { useEffect, useState } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui';
import { Calendar, Clock, Video, Phone, MapPin, CheckCircle, Mail } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLang } from '@/hooks/use-language';

const APPOINTMENT_TYPES = [
  { id: 'phone', label: 'استشارة هاتفية', labelEn: 'Phone Consultation', icon: <Phone className="w-7 h-7 text-secondary" /> },
  { id: 'office', label: 'استشارة مكتبية', labelEn: 'In-Office Consultation', icon: <MapPin className="w-7 h-7 text-secondary" /> },
  { id: 'online', label: 'استشارة إلكترونية', labelEn: 'Online Consultation', icon: <Video className="w-7 h-7 text-secondary" /> },
];

const TIME_SLOTS = [
  '10:00 ص', '11:00 ص', '12:00 م', '01:00 م', '02:00 م',
  '05:00 م', '06:00 م', '07:00 م', '08:00 م', '09:00 م',
];

const FRAME_STYLES = [
  {
    border: 'border-secondary/80 hover:border-secondary',
    selected: 'border-secondary bg-secondary/15 ring-2 ring-secondary/35',
  },
  {
    border: 'border-accent/80 hover:border-accent',
    selected: 'border-accent bg-accent/15 ring-2 ring-accent/35',
  },
  {
    border: 'border-blue-400/80 hover:border-blue-400',
    selected: 'border-blue-400 bg-blue-400/15 ring-2 ring-blue-400/35',
  },
  {
    border: 'border-emerald-400/80 hover:border-emerald-400',
    selected: 'border-emerald-400 bg-emerald-400/15 ring-2 ring-emerald-400/35',
  },
];

function displayTime(time: string, lang: 'ar' | 'en') {
  return lang === 'en'
    ? time.replace(' ص', ' AM').replace(' م', ' PM')
    : time;
}

export default function Appointment() {
  const { lang, t } = useLang();
  useEffect(() => {
    setPageSEO({
      title: t('حجز موعد استشارة قانونية', 'Book a Legal Consultation'),
      description: t(
        'احجز موعد استشارة قانونية مع فريق RABAB LEGAL AI — هاتفياً أو إلكترونياً أو مكتبياً في المملكة العربية السعودية.',
        'Book a legal consultation with the RABAB LEGAL AI team by phone, online, or in office in Saudi Arabia.',
      ),
      canonical: 'https://rabablegal.com/appointment',
    });
  }, [lang]);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    appointmentType: '',
    date: '',
    time: '',
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [waLink, setWaLink] = useState('');

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    const selected = APPOINTMENT_TYPES.find(t => t.id === form.appointmentType);
    const msg = lang === 'en'
      ? `Appointment Request - RABAB LEGAL AI\n` +
        `Consultation type: ${selected?.labelEn ?? ''}\n` +
        `Preferred date: ${form.date}\n` +
        `Preferred time: ${displayTime(form.time, 'en')}\n` +
        `Name: ${form.name}\n` +
        `Phone: ${form.phone}\n` +
        `Email: ${form.email}\n` +
        `Notes: ${form.notes || 'None'}`
      : `طلب حجز موعد - RABAB LEGAL AI\n` +
        `نوع الاستشارة: ${selected?.label}\n` +
        `التاريخ المقترح: ${form.date}\n` +
        `الوقت المقترح: ${form.time}\n` +
        `الاسم: ${form.name}\n` +
        `الهاتف: ${form.phone}\n` +
        `البريد: ${form.email}\n` +
        `ملاحظات: ${form.notes || 'لا يوجد'}`;
    const link = `https://wa.me/966504647649?text=${encodeURIComponent(msg)}`;
    setWaLink(link);
    window.open(link, '_blank');
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-md rounded-2xl border-2 border-secondary/70 bg-card p-8 text-center shadow-lg shadow-secondary/10">
            <div className="w-20 h-20 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-secondary" />
            </div>
            <h2 className="text-2xl font-bold text-secondary mb-3">{t('تم تجهيز طلب الحجز', 'Your Booking Request Is Ready')}</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed text-center max-w-xs mx-auto">
              {t('إذا لم يفتح واتساب تلقائياً،', 'If WhatsApp does not open automatically,')}<br />
              {t('اضغط الزر أدناه لإرسال الطلب.', 'use the button below to send your request.')}
            </p>
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="inline-block w-full mb-4 py-3 rounded-xl bg-secondary text-primary font-bold text-center hover:bg-secondary/90 transition-colors">
              {t('💬 فتح واتساب وإرسال الطلب', '💬 Open WhatsApp & Send Request')}
            </a>
            <Button variant="outline" className="w-full" onClick={() => { setSubmitted(false); setStep(1); setForm({ appointmentType: '', date: '', time: '', name: '', phone: '', email: '', notes: '' }); }}>
              {t('حجز موعد آخر', 'Book Another Appointment')}
            </Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden font-sans" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />

      {/* Hero */}
      <section className="bg-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-secondary mb-3">{t('حجز موعد مع المختصة', 'Book an Appointment with the Specialist')}</h1>
          <p className="text-white max-w-3xl mx-auto text-lg">{t('احجز موعدك مع المحامية والمحكم التجاري د. رباب أحمد المعبي', 'Book an appointment with Lawyer and Commercial Arbitrator Dr. Rabab Ahmed Almoaibi')}</p>
        </div>
      </section>

      <section className="py-16 bg-muted/20">
        <div className="w-full mx-auto max-w-7xl px-3 sm:px-5 lg:px-7">

          {/* Progress */}
          <div className="flex items-center gap-2 mb-10">
            {[1, 2, 3].map(s => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${step >= s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>{s}</div>
                {s < 3 && <div className={`flex-1 h-1 rounded transition-colors ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
              </React.Fragment>
            ))}
          </div>

          {/* Step 1: Type */}
          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="border-2 border-secondary/70 shadow-secondary/10">
                <CardHeader><CardTitle>{t('اختر نوع الاستشارة', 'Choose a Consultation Type')}</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-3">
                    {APPOINTMENT_TYPES.map((t, index) => {
                      const frame = FRAME_STYLES[index % FRAME_STYLES.length];
                      const selected = form.appointmentType === t.id;
                      return (
                      <button key={t.id} onClick={() => set('appointmentType', t.id)}
                        className={`p-5 rounded-xl border-2 flex items-center gap-4 transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${selected ? `${frame.selected} shadow-sm` : `${frame.border} bg-card/30 hover:shadow-sm`}`}>
                        <div className="shrink-0">{t.icon}</div>
                        <p className="font-bold text-lg text-foreground">{lang === 'ar' ? t.label : t.labelEn}</p>
                      </button>
                    )})}
                  </div>
                  <Button className="w-full border-2 border-secondary/70 bg-secondary text-primary hover:border-secondary hover:bg-secondary/90 disabled:border-secondary/55 disabled:bg-secondary/10 disabled:text-secondary disabled:opacity-100" disabled={!form.appointmentType} onClick={() => setStep(2)}>
                    {t('التالي ← اختيار الوقت', 'Next: Choose a Time →')}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="border-2 border-accent/70 shadow-accent/10">
                <CardHeader><CardTitle>{t('اختيار التاريخ والوقت', 'Choose Date & Time')}</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="text-base font-semibold mb-2 block">{t('التاريخ المقترح', 'Preferred Date')}</label>
                    <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} min={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <p className="text-base font-semibold mb-3">{t('الوقت المقترح', 'Preferred Time')}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {TIME_SLOTS.map((t, index) => {
                        const frame = FRAME_STYLES[index % FRAME_STYLES.length];
                        const selected = form.time === t;
                        return (
                        <button key={t} onClick={() => set('time', t)}
                          className={`py-2.5 rounded-lg border-2 text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/30 ${selected ? `${frame.selected} shadow-sm` : `${frame.border} bg-card/30 hover:shadow-sm`}`}>
                          {displayTime(t, lang)}
                        </button>
                      )})}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-primary font-bold" onClick={() => setStep(1)}>{t('← السابق', '← Back')}</Button>
                    <Button className="flex-1 border-2 border-secondary/70 bg-secondary text-primary hover:border-secondary hover:bg-secondary/90 disabled:border-secondary/55 disabled:bg-secondary/10 disabled:text-secondary disabled:opacity-100" disabled={!form.date || !form.time} onClick={() => setStep(3)}><span>{t('التالي ← بياناتك', 'Next: Your Details →')}</span></Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Personal Info */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card className="border-2 border-blue-400/70 shadow-blue-400/10">
                <CardHeader><CardTitle>{t('بياناتك الشخصية', 'Your Details')}</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm space-y-1">
                    <p><span className="font-semibold">{t('نوع الاستشارة:', 'Consultation type:')}</span> {lang === 'ar' ? APPOINTMENT_TYPES.find(item => item.id === form.appointmentType)?.label : APPOINTMENT_TYPES.find(item => item.id === form.appointmentType)?.labelEn}</p>
                    <p><span className="font-semibold">{t('التاريخ:', 'Date:')}</span> {form.date} <span className="font-semibold mr-2">{t('الوقت:', 'Time:')}</span> {displayTime(form.time, lang)}</p>
                  </div>
                  <div><label className="text-base font-medium mb-1 block">{t('الاسم الكامل *', 'Full name *')}</label><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('الاسم الكامل', 'Full Name')} className="h-11 text-base" /></div>
                  <div><label className="text-base font-medium mb-1 block">{t('رقم الجوال *', 'Mobile number *')}</label><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+966XXXXXXXXX" dir="ltr" className="h-11 text-base text-left" /></div>
                  <div><label className="text-base font-medium mb-1 block">{t('البريد الإلكتروني', 'Email address')}</label><Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="example@email.com" dir="ltr" className="h-11 text-base" /></div>
                  <div><label className="text-base font-medium mb-1 block text-secondary">{t('ملاحظات إضافية (اختياري)', 'Additional notes (optional)')}</label>
                    <textarea className="w-full border-2 border-blue-400/60 rounded-md px-4 py-3 text-base bg-background focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-shadow" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('موضوع الاستشارة أو أي تفاصيل أخرى...', 'Consultation subject or any other details…')} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('سيُرسَل طلبك عبر واتساب لتأكيد الموعد مع الفريق', 'Your request will be sent by WhatsApp for confirmation with the team.')}</p>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-primary font-bold" onClick={() => setStep(2)}>{t('← السابق', '← Back')}</Button>
                    <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-primary" disabled={!form.name || !form.phone} onClick={handleSubmit}>
                      {t('إرسال عبر واتساب 💬', 'Send via WhatsApp 💬')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Contact Info */}
          <Card className="mt-6 bg-secondary/5 border-2 border-emerald-400/60 shadow-emerald-400/10">
            <CardContent className="p-5">
              <p className="font-semibold text-secondary mb-3">{t('معلومات التواصل المباشر', 'Direct Contact Information')}</p>
              <div className="flex justify-center gap-10 text-sm flex-wrap">
                <div className="flex flex-col gap-3">
                  <a href="tel:+966504647649" className="flex items-center gap-2 hover:opacity-80 text-foreground" dir="ltr"><Phone className="w-4 h-4 text-secondary shrink-0" /><span>+966504647649</span></a>
                  <a href="tel:+966570773999" className="flex items-center gap-2 hover:opacity-80 text-foreground" dir="ltr"><Phone className="w-4 h-4 text-secondary shrink-0" /><span>+966570773999</span></a>
                </div>
                <div className="flex flex-col gap-3">
                  <a href="mailto:info@rabablegal.com" className="flex items-center justify-center gap-1.5 hover:opacity-80 text-foreground" dir="ltr"><Mail className="w-4 h-4 text-secondary shrink-0" /><span>info@rabablegal.com</span></a>
                  <a href="https://x.com/rabab_almoobi" target="_blank" rel="noopener" className="flex items-center justify-center gap-1 hover:opacity-80" dir="ltr"><span className="text-secondary font-bold">@</span><span className="text-foreground">rabab_almoobi</span></a>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
