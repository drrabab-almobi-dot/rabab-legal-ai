import React from 'react';
import { setPageSEO } from '@/lib/seo';
import { Navbar, Footer } from '@/components/layout';
import { Shield } from 'lucide-react';

const sections = [
  {
    title: '١. المعلومات التي نجمعها',
    content: `عند تسجيلك في المنصة نجمع: الاسم، البريد الإلكتروني، رقم الجوال، وكلمة المرور المشفرة. عند استخدام الخدمة نسجّل: محتوى الاستشارات، المستندات المرفوعة، ونشاط الجلسات. نجمع كذلك بيانات تقنية مثل عنوان IP ونوع المتصفح لأغراض الأمن والأداء.`,
  },
  {
    title: '٢. كيف نستخدم معلوماتك',
    content: `نستخدم بياناتك حصراً لـ: تقديم وتحسين خدمات المنصة، معالجة طلبات الاستشارة، إدارة الاشتراكات والمدفوعات، إرسال إشعارات ضرورية للخدمة، وحماية أمن الحساب. لا نستخدم بياناتك لتدريب نماذج الذكاء الاصطناعي. لا نبيع بياناتك لأي طرف ثالث تحت أي ظرف.`,
  },
  {
    title: '٣. مشاركة البيانات',
    content: `لا تُشارَك بياناتك إلا في الحالات التالية: مزودو الخدمات الضروريين (بوابة الدفع، الاستضافة) بموجب اتفاقيات سرية مشددة، أو عند وجود أمر قضائي ملزم من جهة قضائية مختصة. في جميع الحالات يتم التقليل من البيانات المشاركة إلى الحد الأدنى الضروري.`,
  },
  {
    title: '٤. أمن البيانات',
    content: `نطبق تشفير HTTPS لجميع الاتصالات، وتشفير AES-256 للبيانات الحساسة المخزنة. نطبق مبدأ الصلاحية الأدنى لجميع الوصولات الداخلية. نجري نسخاً احتياطياً مشفراً بانتظام. يخضع النظام لمراجعات أمنية دورية.`,
  },
  {
    title: '٥. ملفات تعريف الارتباط (Cookies)',
    content: `نستخدم ملفات الجلسة الضرورية للدخول الآمن، وملفات تقنية لقياس الأداء. يمكنك إدارة ملفات الارتباط من إعدادات متصفحك. تعطيل ملفات الجلسة قد يمنع تسجيل الدخول.`,
  },
  {
    title: '٦. حقوقك',
    content: `لك الحق في: الاطلاع على بياناتك المحفوظة، طلب تصحيح بيانات غير دقيقة، طلب حذف حسابك وبياناتك كاملة (تُنفَّذ خلال 30 يوماً)، الاعتراض على أي معالجة لبياناتك. لممارسة هذه الحقوق تواصل معنا عبر info@rabablegal.com`,
  },
  {
    title: '٧. الاحتفاظ بالبيانات',
    content: `نحتفظ ببيانات الحساب طالما الحساب نشطاً. عند حذف الحساب تُحذف البيانات خلال 30 يوماً. قد تُحتفظ بعض السجلات المالية لمدة أطول وفق المتطلبات القانونية المعمول بها في المملكة العربية السعودية.`,
  },
  {
    title: '٨. المواطنون القاصرون',
    content: `الخدمة مخصصة للأشخاص الذين بلغوا 18 عاماً. إذا علمنا أن قاصراً قدّم بياناته دون إذن ولي الأمر، سنحذف تلك البيانات فوراً.`,
  },
  {
    title: '٩. تحديثات السياسة',
    content: `قد تُحدَّث هذه السياسة بشكل دوري. نُخطرك بالتغييرات الجوهرية عبر البريد الإلكتروني المسجل قبل نفاذها بـ14 يوماً. استمرار استخدامك للخدمة بعد التحديث يُعدّ موافقةً على السياسة المحدَّثة.`,
  },
  {
    title: '١٠. التواصل والشكاوى',
    content: `لأي استفسار أو شكوى متعلقة بخصوصيتك:\n📧 info@rabablegal.com\n📞 +966504647649\n🌐 rabablegal.com`,
  },
];

export default function Privacy() {
  setPageSEO({ title: 'سياسة الخصوصية', canonical: 'https://rabablegal.com/privacy' });
  return (
    <div className="min-h-screen flex flex-col font-sans" dir="rtl">
      <Navbar />

      <section className="bg-primary py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-secondary" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">سياسة الخصوصية</h1>
          <p className="text-white/70">آخر تحديث: يوليو 2026</p>
        </div>
      </section>

      <section className="py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 mb-10">
            <p className="text-sm text-muted-foreground leading-relaxed">
              نحن في <strong className="text-secondary">RABAB LEGAL AI</strong> نلتزم بحماية خصوصيتك وبياناتك الشخصية. توضح هذه السياسة كيفية جمع بياناتك واستخدامها وحمايتها وفق أفضل الممارسات الدولية والأنظمة المعمول بها في المملكة العربية السعودية.
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
        </div>
      </section>

      <Footer />
    </div>
  );
}
