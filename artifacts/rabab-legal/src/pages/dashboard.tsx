import React from "react";
import { format } from "date-fns";
import { arSA } from "date-fns/locale";
import {
  getGetMySubscriptionQueryKey,
  useGetMySubscription,
  useListMyConsultations,
  useListMyInvoices,
  useLogout,
} from "@workspace/api-client-react";
import {
  AccountWorkspace2026,
  type WorkspaceConsultation,
  type WorkspaceInvoice,
  type WorkspacePlan,
} from "@/components/account-workspace-2026";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-language";

export default function Dashboard() {
  const { user, logout: clearAuth } = useAuth();
  const { lang, t } = useLang();
  const logoutMutation = useLogout();

  const { data: subscription, isLoading: planLoading } = useGetMySubscription({
    query: { queryKey: getGetMySubscriptionQueryKey(), retry: false },
  });
  const { data: consultations, isLoading: consultationsLoading } =
    useListMyConsultations();
  const { data: invoices, isLoading: invoicesLoading } = useListMyInvoices();

  const formatDate = React.useCallback(
    (value: string) => {
      try {
        return format(
          new Date(value),
          "dd MMMM yyyy",
          lang === "ar" ? { locale: arSA } : undefined,
        );
      } catch {
        return value;
      }
    },
    [lang],
  );

  const total = subscription?.questionsAllowed ?? 0;
  const used = subscription?.questionsUsed ?? 0;
  const isUnlimited = total >= 9999;
  const remaining = Math.max(0, total - used);
  const progressPercent = total > 0 ? (used / total) * 100 : 0;
  const daysRemaining = React.useMemo(() => {
    if (!subscription?.endDate) return null;
    return Math.ceil(
      (new Date(subscription.endDate).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24),
    );
  }, [subscription?.endDate]);

  const workspaceConsultations: WorkspaceConsultation[] = (
    consultations ?? []
  ).map((consultation) => ({
    id: consultation.id,
    title: consultation.title,
    area: consultation.areaAr,
    status: consultation.status,
    taskType: consultation.taskType,
    date: formatDate(consultation.createdAt),
    href: `/consultation/${consultation.id}`,
  }));

  const workspaceInvoices: WorkspaceInvoice[] = (invoices ?? []).map(
    (invoice) => ({
      id: invoice.id,
      title: invoice.packageNameAr || t("اشتراك", "Subscription"),
      amount: `${invoice.totalAmount} ${t("ر.س", "SAR")}`,
      date: formatDate(invoice.createdAt),
      href: `/invoices/${invoice.id}`,
      pdfHref: `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/invoices/${invoice.id}/pdf`,
    }),
  );

  const plan: WorkspacePlan = {
    active: subscription?.status === "active",
    name:
      subscription?.package?.nameAr ?? t("لا توجد باقة نشطة", "No active plan"),
    billingLabel:
      subscription?.package?.billingPeriod === "annual"
        ? t("سنوي", "Annual")
        : subscription?.package?.billingPeriod === "monthly"
          ? t("شهري", "Monthly")
          : null,
    used,
    total,
    isUnlimited,
    remaining,
    progressPercent,
    daysRemaining,
  };

  return (
    <AccountWorkspace2026
      userName={user?.name ?? t("مستخدم رباب", "Rabab user")}
      email={user?.email ?? ""}
      consultations={workspaceConsultations}
      invoices={workspaceInvoices}
      plan={plan}
      consultationsLoading={consultationsLoading}
      invoicesLoading={invoicesLoading}
      planLoading={planLoading}
      onLogout={() =>
        logoutMutation.mutate(undefined, {
          onSettled: clearAuth,
        })
      }
    />
  );
}
