import React, { useState } from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui';
import { Calendar, Clock, Video, Phone, MapPin, CheckCircle, Mail } from 'lucide-react';
import { motion } from 'framer-motion';

const APPOINTMENT_TYPES = [
  { id: 'phone', label: 'استشارة هاتفية', icon: <Phone className="w-7 h-7 text-secondary" /> },
  { id: 'office', label: 'استشارة مكتبية', icon: <MapPin className="w-7 h-7 text-secondary" /> },
  { id: 'online', label: 'استشارة إلكترونية', icon: <Video className="w-7 h-7 text-secondary" /> },
];

const TIME_SLOTS = [
  '10:00 ص', '11:00 ص', '12:00 م', '01:00 م', '02:00 م',
  '05:00 م', '06:00 م', '07:00 م', '08:00 م', '09:00 م',
];

export default function Appointment() {
  setPageSEO({
    title: 'حجز موعد استشارة قانونية',
    description: 'احجز موعد استشارة قانونية مع فريق RABAB LEGAL AI — هاتفياً أو إلكترونياً أو مكتبياً في المملكة العربية السعودية.',
    canonical: 'https://rabablegal.com/appointment',
  });
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
    const msg =
      `طلب حجز موعد - RABAB LEGAL AI\n` +
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
      <div className="min-h-screen flex flex-col font-sans" dir="rtl">
        <Navbar />
        <div className="flex-1 flex items-center justify-center p-8">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-md">
            <div className="w-20 h-20 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-10 h-10 text-secondary" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-3">تم تجهيز طلب الحجز</h2>
            <p className="text-muted-foreground mb-4 leading-relaxed text-center max-w-xs mx-auto">
              إذا لم يفتح واتساب تلقائياً،<br />اضغط الزر أدناه لإرسال الطلب.
            </p>
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="inline-block w-full mb-4 py-3 rounded-xl bg-secondary text-primary font-bold text-center hover:bg-secondary/90 transition-colors">
              💬 فتح واتساب وإرسال الطلب
            </a>
            <Button variant="outline" className="w-full" onClick={() => { setSubmitted(false); setStep(1); setForm({ appointmentType: '', date: '', time: '', name: '', phone: '', email: '', notes: '' }); }}>
              حجز موعد آخر
            </Button>
          </motion.div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans" dir="rtl">
      <Navbar />

      {/* Hero */}
      <section className="bg-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">حجز موعد مع المختصة</h1>
          <p className="text-white max-w-xl mx-auto">احجز موعدك مع المحامية والمحكم التجاري د. رباب أحمد المعبي</p>
        </div>
      </section>

      <section className="py-16 bg-muted/20">
        <div className="container mx-auto px-4 max-w-2xl">

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
              <Card>
                <CardHeader><CardTitle>اختر نوع الاستشارة</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 gap-3">
                    {APPOINTMENT_TYPES.map(t => (
                      <button key={t.id} onClick={() => set('appointmentType', t.id)}
                        className={`p-5 rounded-xl border-2 flex items-center gap-4 transition-all ${form.appointmentType === t.id ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40'}`}>
                        <div className="shrink-0">{t.icon}</div>
                        <p className="font-bold text-base text-foreground">{t.label}</p>
                      </button>
                    ))}
                  </div>
                  <Button className="w-full text-white" disabled={!form.appointmentType} onClick={() => setStep(2)}>
                    التالي ← اختيار الوقت
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Date & Time */}
          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <CardHeader><CardTitle>اختيار التاريخ والوقت</CardTitle></CardHeader>
                <CardContent className="space-y-6">
                  <div>
                    <label className="text-sm font-semibold mb-2 block">التاريخ المقترح</label>
                    <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} min={new Date().toISOString().split('T')[0]} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-3">الوقت المقترح</p>
                    <div className="grid grid-cols-4 gap-2">
                      {TIME_SLOTS.map(t => (
                        <button key={t} onClick={() => set('time', t)}
                          className={`py-2 rounded-lg border text-xs font-medium transition-all ${form.time === t ? 'border-secondary bg-secondary text-primary font-bold' : 'border-border hover:border-secondary/40'}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-primary font-bold" onClick={() => setStep(1)}>← السابق</Button>
                    <Button className="flex-1" disabled={!form.date || !form.time} onClick={() => setStep(3)}><span className="text-white">التالي ← بياناتك</span></Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Personal Info */}
          {step === 3 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <Card>
                <CardHeader><CardTitle>بياناتك الشخصية</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {/* Summary */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-sm space-y-1">
                    <p><span className="font-semibold">نوع الاستشارة:</span> {APPOINTMENT_TYPES.find(t => t.id === form.appointmentType)?.label}</p>
                    <p><span className="font-semibold">التاريخ:</span> {form.date} <span className="font-semibold mr-2">الوقت:</span> {form.time}</p>
                  </div>
                  <div><label className="text-sm font-medium mb-1 block">الاسم الكامل *</label><Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="اسمك الكامل" /></div>
                  <div><label className="text-sm font-medium mb-1 block">رقم الجوال *</label><Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+966XXXXXXXXX" dir="ltr" className="text-left" /></div>
                  <div><label className="text-sm font-medium mb-1 block">البريد الإلكتروني</label><Input value={form.email} onChange={e => set('email', e.target.value)} placeholder="example@email.com" dir="ltr" /></div>
                  <div><label className="text-sm font-medium mb-1 block">ملاحظات إضافية (اختياري)</label>
                    <textarea className="w-full border border-border rounded-md px-3 py-2 text-sm bg-background" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="موضوع الاستشارة أو أي تفاصيل أخرى..." />
                  </div>
                  <p className="text-xs text-muted-foreground">سيُرسَل طلبك عبر واتساب لتأكيد الموعد مع الفريق</p>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-primary font-bold" onClick={() => setStep(2)}>← السابق</Button>
                    <Button className="flex-1 bg-secondary hover:bg-secondary/90 text-primary" disabled={!form.name || !form.phone} onClick={handleSubmit}>
                      إرسال عبر واتساب 💬
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Contact Info */}
          <Card className="mt-6 bg-secondary/5 border-secondary/20">
            <CardContent className="p-5">
              <p className="font-semibold text-secondary mb-3">معلومات التواصل المباشر</p>
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
