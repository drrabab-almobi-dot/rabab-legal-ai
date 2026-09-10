import { AccountWorkspace2026 } from "@/components/account-workspace-2026";
import { useLang } from "@/hooks/use-language";
import { setPageSEO } from "@/lib/seo";

export default function DesignPreview2026() {
  const { t } = useLang();
  setPageSEO({
    title: "معاينة تصميم المنصة 2026",
    description: "معاينة تجريبية لتصميم واجهة RABAB LEGAL AI لعام 2026.",
  });

  return (
    <AccountWorkspace2026
      preview
      userName={t("أحمد محمود", "Ahmed Mahmoud")}
      email="ahmed.m@example.com"
      consultations={[
        {
          id: "demo-1",
          title: t("استشارة حول قانون العمل", "Employment law consultation"),
          area: t("قانون العمل", "Employment law"),
          status: "answered",
          taskType: "legal",
          date: t("12 أكتوبر 2026", "12 October 2026"),
          href: "/consultation",
        },
        {
          id: "demo-2",
          title: t("تأسيس شركة", "Company formation"),
          area: t("نظام الشركات", "Companies law"),
          status: "pending",
          taskType: "legal",
          date: t("15 أكتوبر 2026", "15 October 2026"),
          href: "/consultation",
        },
        {
          id: "demo-3",
          title: t("تحليل حكم تجاري", "Commercial judgment analysis"),
          area: t("القضاء التجاري", "Commercial judiciary"),
          status: "answered",
          taskType: "judicial",
          date: t("18 أكتوبر 2026", "18 October 2026"),
          href: "/consultation?type=judgment_analysis",
        },
      ]}
      invoices={[
        {
          id: "invoice-demo-1",
          title: t("الباقة الأساسية", "Essential plan"),
          amount: t("299 ر.س", "SAR 299"),
          date: t("1 أكتوبر 2026", "1 October 2026"),
          href: "/pricing",
        },
      ]}
      plan={{
        active: true,
        name: t("الباقة المهنية", "Professional plan"),
        billingLabel: t("سنوي", "Annual"),
        used: 3,
        total: 9999,
        isUnlimited: true,
        remaining: 9996,
        progressPercent: 0,
        daysRemaining: 210,
      }}
    />
  );
}
