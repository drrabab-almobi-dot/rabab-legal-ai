import React from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { FileText } from 'lucide-react';

const sections = [
  {
    title: '١. قبول الشروط',
    content: `باستخدامك لمنصة RABAB LEGAL AI — رباب محاميتك الرقمية، فإنك توافق على الالتزام بهذه الشروط. إذا لم توافق على أي بند، يرجى التوقف عن استخدام المنصة. تُطبَّق هذه الشروط على جميع المستخدمين بما فيهم الزوار والمشتركون.`,
  },
  {
    title: '٢. وصف الخدمة',
    content: `تُقدّم المنصة معلومات قانونية أولية وبحثاً نظامياً في أنظمة دول مجلس التعاون الخليجي الست (السعودية، الإمارات، الكويت، قطر، البحرين، عُمان). المنصة تحت إشراف المحامية والمحكم التجاري د. رباب أحمد المعبي.`,
  },
  {
    title: '٣. إخلاء المسؤولية القانوني',
    content: `المعلومات المقدمة عبر المنصة لأغراض معرفية وإرشادية فقط. لا تُعدّ استشارة قانونية ملزمة أو رأياً قانونياً رسمياً يُعتدّ به أمام المحاكم أو الجهات الرسمية. لا تتحمل المنصة أي مسؤولية عن قرارات تُتخذ استناداً لمعلوماتها دون الرجوع لمحامٍ مرخّص.`,
  },
  {
    title: '٤. الأهلية والتسجيل',
    content: `يجب أن تكون 18 سنة أو أكثر لاستخدام المنصة. أنت مسؤول عن صحة بيانات التسجيل وسرية كلمة المرور. تُخطرنا فوراً إذا اشتبهت في استخدام غير مصرح لحسابك.`,
  },
  {
    title: '٥. الاستخدام المقبول',
    content: `يُسمح بـ: الاستفسار القانوني الشخصي، البحث والدراسة القانونية، تحليل العقود والمستندات الخاصة.\n\nيُحظر: انتحال صفة محامٍ أو جهة رسمية، نشر محتوى مضلل أو مخالف للنظام، محاولة اختراق النظام أو استخراج البيانات آلياً، إعادة بيع أو توزيع محتوى المنصة دون إذن.`,
  },
  {
    title: '٦. الاشتراكات والمدفوعات',
    content: `• الباقة التجريبية: 3 استشارات مجانية، مرة واحدة لكل مستخدم.\n• الخصم يتم فقط بعد ظهور إجابة ناجحة.\n• المدفوعات غير قابلة للاسترداد إلا في حالات محددة يراجعها فريق الإدارة.\n• تُجدَّد الباقات الشهرية تلقائياً ما لم تُلغَ قبل 48 ساعة من تاريخ التجديد.\n• الأسعار شاملة ضريبة القيمة المضافة 15%.`,
  },
  {
    title: '٧. الملكية الفكرية',
    content: `جميع محتويات المنصة من تصميم وكود وشعار ومحتوى نصي مملوكة لـ RABAB LEGAL AI. يُسمح باقتباس المعلومات القانونية للاستخدام الشخصي مع نسب المصدر. يُحظر نسخ أو إعادة إنتاج واجهات المنصة أو بنيتها التقنية.`,
  },
  {
    title: '٨. تحميل المستندات',
    content: `عند رفع أي مستند فإنك تُقرّ أنك تمتلك حق رفعه أو لديك إذن من صاحبه. لا تُحمّل كلمات مرور أو بيانات بنكية أو معلومات شخصية حساسة لأطراف أخرى. تُحذف المستندات وفق سياسة الاحتفاظ المعتمدة ولا تُستخدم لتدريب النماذج.`,
  },
  {
    title: '٩. تعليق الحساب وإنهاؤه',
    content: `نحتفظ بحق تعليق أو إنهاء حساب أي مستخدم يخالف هذه الشروط. في حالة الإنهاء يُلغى الاشتراك وتبقى الرسوم المسددة غير قابلة للاسترداد ما لم يكن الإنهاء من طرفنا بغير سبب مشروع.`,
  },
  {
    title: '١٠. تغيير الشروط',
    content: `يحق لنا تعديل هذه الشروط. نُخطرك بالتغييرات الجوهرية قبل 14 يوماً من نفاذها. استمرار استخدام المنصة يُعدّ قبولاً للشروط المحدَّثة.`,
  },
  {
    title: '١١. القانون المطبّق والاختصاص',
    content: `تخضع هذه الشروط للأنظمة المعمول بها في المملكة العربية السعودية. أي نزاع يُحال أولاً للتفاوض الودي، ثم للتحكيم وفق نظام التحكيم السعودي في الرياض، ثم لمحاكم الرياض المختصة.`,
  },
];

export default function Terms() {
  setPageSEO({ title: 'الشروط والأحكام', canonical: 'https://rabablegal.com/terms' });
  return (
    <div className="min-h-screen flex flex-col font-sans" dir="rtl">
      <Navbar />

      <section className="bg-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">شروط الاستخدام</h1>
          <p className="text-white/70">آخر تحديث: يوليو 2026</p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-10">
            <p className="text-sm text-amber-200 leading-relaxed">
              ⚠️ <strong>تنبيه مهم:</strong> قراءة هذه الشروط بعناية قبل استخدام المنصة إلزامية. استخدامك للمنصة يُعدّ قبولاً صريحاً لجميع البنود الواردة أدناه.
            </p>
          </div>

          <div className="space-y-8">
            {sections.map((s, i) => (
              <div key={i}>
                <h2 className="text-xl font-bold text-foreground mb-3">{s.title}</h2>
                <p className="text-muted-foreground leading-loose whitespace-pre-line">{s.content}</p>
                {i < sections.length - 1 && <div className="border-b border-border/40 mt-8" />}
              </div>
            ))}
          </div>

          <div className="mt-12 bg-primary/5 border border-primary/20 rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">
              للاستفسار عن هذه الشروط: <a href="mailto:info@rabablegal.com" className="text-secondary hover:underline font-medium">info@rabablegal.com</a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
