import React from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Clock3,
  CreditCard,
  FileText,
  FolderOpen,
  Home,
  LockKeyhole,
  LogOut,
  MessageSquareText,
  Plus,
  Scale,
  Settings,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useLang } from "@/hooks/use-language";

export interface WorkspaceConsultation {
  id: number | string;
  title: string;
  area?: string | null;
  status: string;
  taskType?: string | null;
  date: string;
  href: string;
}

export interface WorkspaceInvoice {
  id: number | string;
  title: string;
  amount: string;
  date: string;
  href: string;
  pdfHref?: string;
}

export interface WorkspacePlan {
  active: boolean;
  name: string;
  billingLabel?: string | null;
  used: number;
  total: number;
  isUnlimited: boolean;
  remaining: number;
  progressPercent: number;
  daysRemaining?: number | null;
}

interface AccountWorkspace2026Props {
  userName: string;
  email: string;
  consultations: WorkspaceConsultation[];
  invoices: WorkspaceInvoice[];
  plan: WorkspacePlan;
  consultationsLoading?: boolean;
  invoicesLoading?: boolean;
  planLoading?: boolean;
  preview?: boolean;
  onLogout?: () => void;
}

const primaryNav = [
  { href: "/", labelAr: "الرئيسية", labelEn: "Home", icon: Home },
  {
    href: "/dashboard",
    labelAr: "سجل الاستشارات",
    labelEn: "Consultations",
    icon: MessageSquareText,
  },
  {
    href: "/usage-log",
    labelAr: "سجل الاستخدام",
    labelEn: "Usage log",
    icon: BarChart3,
  },
  {
    href: "/organization",
    labelAr: "بيانات المنشأة",
    labelEn: "Organization",
    icon: Building2,
  },
];

const mobileNav = [
  {
    href: "/consultation",
    labelAr: "المستشار",
    labelEn: "Advisor",
    icon: MessageSquareText,
  },
  { href: "/contracts", labelAr: "الوثائق", labelEn: "Docs", icon: FileText },
  {
    href: "/appointment",
    labelAr: "المواعيد",
    labelEn: "Booking",
    icon: CalendarDays,
  },
  { href: "/dashboard", labelAr: "الملف", labelEn: "Profile", icon: UserRound },
];

function statusPresentation(
  status: string,
  t: (ar: string, en: string) => string,
) {
  switch (status) {
    case "answered":
      return {
        label: t("مكتمل", "Completed"),
        className: "bg-slate-100 text-slate-700",
      };
    case "pending":
      return {
        label: t("قيد المعالجة", "In progress"),
        className: "bg-amber-100 text-amber-800",
      };
    case "closed":
      return {
        label: t("مغلق", "Closed"),
        className: "bg-slate-100 text-slate-600",
      };
    default:
      return { label: status, className: "bg-blue-50 text-blue-800" };
  }
}

function LoadingRows({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="جار التحميل">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-20 animate-pulse rounded-2xl bg-slate-100"
        />
      ))}
    </div>
  );
}

export function AccountWorkspace2026({
  userName,
  email,
  consultations,
  invoices,
  plan,
  consultationsLoading = false,
  invoicesLoading = false,
  planLoading = false,
  preview = false,
  onLogout,
}: AccountWorkspace2026Props) {
  const { lang, t } = useLang();
  const rtl = lang === "ar";
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "ر";

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="min-h-[100dvh] bg-[#f7f7f5] text-[#14213d]"
    >
      {preview && (
        <div className="sticky top-0 z-[70] flex min-h-10 items-center justify-center gap-2 bg-[#ffdb3c] px-4 py-2 text-center text-xs font-bold text-[#1a237e] shadow-sm">
          <CircleHelp className="h-4 w-4" aria-hidden="true" />
          {t(
            "معاينة تصميم 2026 — البيانات المعروضة تجريبية ولا تمثل حسابًا حقيقيًا",
            "2026 design preview — all displayed data is illustrative",
          )}
        </div>
      )}

      <div className="mx-auto grid min-h-[100dvh] max-w-[1600px] lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="hidden border-s border-[#e5e7eb] bg-white lg:flex lg:flex-col">
          <div className="flex items-center gap-3 border-b border-[#eef0f3] px-6 py-6">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#1a237e] text-[#ffdb3c] shadow-[0_10px_30px_rgba(26,35,126,0.18)]">
              <Scale className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-black text-[#1a237e]">
                {t("رباب القانونية", "RABAB LEGAL")}
              </p>
              <p className="text-[11px] font-bold tracking-[0.16em] text-[#9b7b00]">
                RABAB LEGAL AI
              </p>
            </div>
          </div>

          <div className="px-5 py-6 text-center">
            <div className="relative mx-auto mb-3 grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#1a237e] to-[#3949ab] text-xl font-black text-white shadow-[0_12px_35px_rgba(26,35,126,0.2)]">
              {initials}
              <span className="absolute -bottom-1 -left-1 grid h-8 w-8 place-items-center rounded-full border-4 border-white bg-[#ffdb3c] text-[#1a237e]">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <h2 className="truncate text-base font-black text-[#111b3b]">
              {userName}
            </h2>
            <p className="mt-1 truncate text-xs text-slate-500">{email}</p>
          </div>

          <nav
            className="flex-1 space-y-1 px-4"
            aria-label={t("تنقل الحساب", "Account navigation")}
          >
            {primaryNav.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/dashboard";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-bold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a237e] ${
                    active
                      ? "bg-[#1a237e] text-white shadow-[0_8px_24px_rgba(26,35,126,0.2)]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-[#1a237e]"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {rtl ? item.labelAr : item.labelEn}
                </Link>
              );
            })}
            <Link
              href="/contact"
              className="flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 hover:text-[#1a237e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a237e]"
            >
              <CircleHelp className="h-4 w-4" aria-hidden="true" />
              {t("الدعم الفني", "Support")}
            </Link>
          </nav>

          <div className="border-t border-[#eef0f3] p-4">
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-600 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("تسجيل الخروج", "Sign out")}
              </button>
            ) : (
              <span className="flex min-h-11 items-center gap-3 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-400">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("تسجيل الخروج", "Sign out")}
              </span>
            )}
          </div>
        </aside>

        <div className="min-w-0 pb-24 lg:pb-0">
          <header className="sticky top-0 z-40 flex min-h-16 items-center justify-between border-b border-[#e8eaee] bg-white/95 px-4 backdrop-blur md:px-8 lg:px-10">
            <div className="flex items-center gap-3 lg:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#1a237e] text-[#ffdb3c]">
                <Scale className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-black text-[#1a237e]">
                {t("المحامية الرقمية", "Digital Lawyer")}
              </span>
            </div>
            <div className="hidden lg:block">
              <p className="text-xs font-bold text-slate-400">
                {t("مساحة العمل القانونية", "Legal workspace")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/contact"
                aria-label={t("المساعدة", "Help")}
                className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-[#1a237e]"
              >
                <CircleHelp className="h-5 w-5" aria-hidden="true" />
              </Link>
              <Link
                href="/dashboard"
                aria-label={t("الإشعارات", "Notifications")}
                className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-[#1a237e]"
              >
                <Bell className="h-5 w-5" aria-hidden="true" />
                <span className="absolute end-2 top-2 h-2 w-2 rounded-full bg-[#ffdb3c] ring-2 ring-white" />
              </Link>
              <Link
                href="/"
                className="hidden min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-[#1a237e]/30 hover:text-[#1a237e] sm:flex"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                {t("الموقع العام", "Public site")}
              </Link>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 md:py-8 lg:px-10">
            <section className="mb-6 overflow-hidden rounded-[24px] bg-[#1a237e] px-5 py-6 text-white shadow-[0_18px_50px_rgba(26,35,126,0.16)] sm:px-7 md:flex md:items-center md:justify-between">
              <div>
                <p className="mb-2 text-xs font-bold text-[#ffdb3c]">
                  {t("مرحبًا بعودتك", "Welcome back")}
                </p>
                <h1 className="text-2xl font-black sm:text-3xl">
                  {t(`مرحبًا، ${userName}`, `Hello, ${userName}`)}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-white/70">
                  {t(
                    "تابع استشاراتك ووثائقك وابدأ طلبًا قانونيًا جديدًا من مساحة واحدة.",
                    "Manage your consultations and documents, or start a new legal request.",
                  )}
                </p>
              </div>
              <Link
                href="/consultation"
                className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#ffdb3c] px-5 text-sm font-black text-[#1a237e] shadow-[0_10px_26px_rgba(255,219,60,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ffe56d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:mt-0"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("استشارة جديدة", "New consultation")}
              </Link>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(310px,0.8fr)]">
              <div className="space-y-6">
                <section className="rounded-[24px] border border-[#e7e9ee] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold text-[#9b7b00]">
                        {t("المتابعة القانونية", "Legal follow-up")}
                      </p>
                      <h2 className="mt-1 text-xl font-black text-[#111b3b]">
                        {t("أحدث الاستشارات", "Recent consultations")}
                      </h2>
                    </div>
                    <Link
                      href="/dashboard"
                      className="text-xs font-bold text-[#1a237e] hover:underline"
                    >
                      {t("عرض الكل", "View all")}
                    </Link>
                  </div>

                  {consultationsLoading ? (
                    <LoadingRows count={3} />
                  ) : consultations.length > 0 ? (
                    <div className="space-y-3">
                      {consultations.slice(0, 4).map((consultation) => {
                        const status = statusPresentation(
                          consultation.status,
                          t,
                        );
                        return (
                          <Link
                            key={consultation.id}
                            href={consultation.href}
                            className="group flex items-center gap-4 rounded-2xl border border-[#eceef2] bg-[#fbfbfa] p-4 transition hover:-translate-y-0.5 hover:border-[#1a237e]/20 hover:bg-white hover:shadow-[0_10px_24px_rgba(26,35,126,0.08)]"
                          >
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eef0ff] text-[#1a237e]">
                              {consultation.taskType === "judicial" ? (
                                <Scale className="h-5 w-5" aria-hidden="true" />
                              ) : (
                                <FileText
                                  className="h-5 w-5"
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-black text-[#111b3b]">
                                {consultation.title}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                {consultation.area && (
                                  <span>{consultation.area}</span>
                                )}
                                <span className="inline-flex items-center gap-1">
                                  <Clock3
                                    className="h-3 w-3"
                                    aria-hidden="true"
                                  />
                                  {consultation.date}
                                </span>
                              </span>
                            </span>
                            <span
                              className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black ${status.className}`}
                            >
                              {status.label}
                            </span>
                            <ChevronLeft
                              className="hidden h-4 w-4 text-slate-300 transition group-hover:-translate-x-1 group-hover:text-[#1a237e] sm:block"
                              aria-hidden="true"
                            />
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-10 text-center">
                      <MessageSquareText
                        className="mx-auto h-8 w-8 text-slate-300"
                        aria-hidden="true"
                      />
                      <p className="mt-3 text-sm font-bold text-slate-600">
                        {t("لا توجد استشارات حتى الآن", "No consultations yet")}
                      </p>
                      <Link
                        href="/consultation"
                        className="mt-3 inline-flex text-xs font-black text-[#1a237e] hover:underline"
                      >
                        {t("ابدأ أول استشارة", "Start your first consultation")}
                      </Link>
                    </div>
                  )}
                </section>

                <section className="rounded-[24px] border border-[#e7e9ee] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#9b7b00]">
                        {t("الفوترة الآمنة", "Secure billing")}
                      </p>
                      <h2 className="mt-1 text-xl font-black text-[#111b3b]">
                        {t("المدفوعات والفواتير", "Payments and invoices")}
                      </h2>
                    </div>
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff8d8] text-[#9b7b00]">
                      <WalletCards className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>

                  {invoicesLoading ? (
                    <LoadingRows />
                  ) : invoices.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {invoices.slice(0, 2).map((invoice) => (
                        <div
                          key={invoice.id}
                          className="rounded-2xl border border-[#eceef2] bg-[#fbfbfa] p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[#1a237e] shadow-sm">
                              <CreditCard
                                className="h-5 w-5"
                                aria-hidden="true"
                              />
                            </span>
                            <span className="text-sm font-black text-[#111b3b]">
                              {invoice.amount}
                            </span>
                          </div>
                          <p className="mt-4 truncate text-sm font-bold text-slate-700">
                            {invoice.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {invoice.date}
                          </p>
                          <div className="mt-4 flex gap-3 text-xs font-bold">
                            <Link
                              href={invoice.href}
                              className="text-[#1a237e] hover:underline"
                            >
                              {t("عرض الفاتورة", "View invoice")}
                            </Link>
                            {invoice.pdfHref && (
                              <a
                                href={invoice.pdfHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-slate-500 hover:text-[#1a237e]"
                              >
                                PDF
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center sm:flex-row sm:justify-between sm:text-start">
                      <div>
                        <p className="text-sm font-black text-slate-700">
                          {t("لا توجد فواتير سابقة", "No previous invoices")}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {t(
                            "ستظهر الفواتير هنا بعد أول عملية دفع.",
                            "Invoices will appear here after your first payment.",
                          )}
                        </p>
                      </div>
                      <Link
                        href="/pricing"
                        className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-[#1a237e]/15 px-4 text-xs font-black text-[#1a237e] sm:mt-0"
                      >
                        {t("عرض الباقات", "View plans")}
                      </Link>
                    </div>
                  )}
                </section>
              </div>

              <div className="space-y-6">
                <section className="rounded-[24px] border border-[#e7e9ee] bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-[#9b7b00]">
                        {t("الحساب", "Account")}
                      </p>
                      <h2 className="mt-1 text-xl font-black text-[#111b3b]">
                        {t("الملف الشخصي", "Profile")}
                      </h2>
                    </div>
                    <Settings
                      className="h-5 w-5 text-[#1a237e]"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="flex items-center gap-4 rounded-2xl bg-[#fbfbfa] p-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#1a237e] text-base font-black text-white">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-black text-[#111b3b]">
                        {userName}
                      </p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {email}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <Link
                      href="/organization"
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-[#eceef2] px-4 text-sm font-bold text-slate-700 transition hover:border-[#1a237e]/20 hover:bg-slate-50"
                    >
                      <UserRound
                        className="h-4 w-4 text-[#1a237e]"
                        aria-hidden="true"
                      />
                      <span className="flex-1">
                        {t(
                          "المعلومات الشخصية والمنشأة",
                          "Personal and organization details",
                        )}
                      </span>
                      <ChevronLeft
                        className="h-4 w-4 text-slate-300"
                        aria-hidden="true"
                      />
                    </Link>
                    <Link
                      href="/privacy"
                      className="flex min-h-12 items-center gap-3 rounded-xl border border-[#eceef2] px-4 text-sm font-bold text-slate-700 transition hover:border-[#1a237e]/20 hover:bg-slate-50"
                    >
                      <LockKeyhole
                        className="h-4 w-4 text-[#1a237e]"
                        aria-hidden="true"
                      />
                      <span className="flex-1">
                        {t("الأمان والخصوصية", "Security and privacy")}
                      </span>
                      <ChevronLeft
                        className="h-4 w-4 text-slate-300"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>
                </section>

                <section className="overflow-hidden rounded-[24px] border border-[#e7e9ee] bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
                  <div className="h-1.5 bg-[#ffdb3c]" />
                  <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-bold text-[#9b7b00]">
                          {t("الباقة الحالية", "Current plan")}
                        </p>
                        <h2 className="mt-1 text-xl font-black text-[#111b3b]">
                          {planLoading
                            ? t("جار التحميل", "Loading")
                            : plan.name}
                        </h2>
                      </div>
                      {plan.billingLabel && (
                        <span className="rounded-full bg-[#fff8d8] px-3 py-1 text-[11px] font-black text-[#8a6c00]">
                          {plan.billingLabel}
                        </span>
                      )}
                    </div>

                    {planLoading ? (
                      <div className="mt-5 h-24 animate-pulse rounded-2xl bg-slate-100" />
                    ) : plan.active ? (
                      <>
                        <div className="mt-5 rounded-2xl bg-[#f7f8ff] p-4">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                            <span>{t("الاستخدام", "Usage")}</span>
                            <span className="text-[#1a237e]">
                              {plan.isUnlimited
                                ? t("غير محدود", "Unlimited")
                                : `${plan.used} / ${plan.total}`}
                            </span>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-[#1a237e] transition-[width] duration-300"
                              style={{
                                width: plan.isUnlimited
                                  ? "100%"
                                  : `${Math.min(plan.progressPercent, 100)}%`,
                              }}
                            />
                          </div>
                          {!plan.isUnlimited && (
                            <p className="mt-3 text-xs text-slate-500">
                              {t(
                                `${plan.remaining} استشارة متبقية`,
                                `${plan.remaining} consultations remaining`,
                              )}
                            </p>
                          )}
                        </div>

                        {plan.daysRemaining !== null &&
                          plan.daysRemaining !== undefined &&
                          plan.daysRemaining <= 7 &&
                          plan.daysRemaining >= 0 && (
                            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
                              <AlertCircle
                                className="mt-0.5 h-4 w-4 shrink-0"
                                aria-hidden="true"
                              />
                              {t(
                                `ينتهي الاشتراك خلال ${plan.daysRemaining} أيام`,
                                `Subscription ends in ${plan.daysRemaining} days`,
                              )}
                            </div>
                          )}

                        <Link
                          href="/pricing"
                          className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#1a237e]/15 text-sm font-black text-[#1a237e] transition hover:bg-[#f7f8ff]"
                        >
                          {t("إدارة الباقة", "Manage plan")}
                        </Link>
                      </>
                    ) : (
                      <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-900">
                        <p>{t("لا توجد باقة نشطة", "No active plan")}</p>
                        <Link
                          href="/pricing"
                          className="mt-3 inline-flex text-xs font-black text-[#1a237e] hover:underline"
                        >
                          {t("استعرض الباقات", "Browse plans")}
                        </Link>
                      </div>
                    )}
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-3">
                  <Link
                    href="/contracts"
                    className="rounded-2xl bg-[#1a237e] p-4 text-white shadow-[0_10px_28px_rgba(26,35,126,0.16)] transition hover:-translate-y-0.5"
                  >
                    <FolderOpen
                      className="h-5 w-5 text-[#ffdb3c]"
                      aria-hidden="true"
                    />
                    <p className="mt-3 text-sm font-black">
                      {t("العقود", "Contracts")}
                    </p>
                    <p className="mt-1 text-[11px] text-white/60">
                      {t("صياغة ومراجعة", "Draft and review")}
                    </p>
                  </Link>
                  <Link
                    href="/appointment"
                    className="rounded-2xl bg-[#ffdb3c] p-4 text-[#1a237e] shadow-[0_10px_28px_rgba(255,219,60,0.18)] transition hover:-translate-y-0.5"
                  >
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                    <p className="mt-3 text-sm font-black">
                      {t("حجز موعد", "Book")}
                    </p>
                    <p className="mt-1 text-[11px] text-[#1a237e]/60">
                      {t("مع المحامية", "With counsel")}
                    </p>
                  </Link>
                </section>
              </div>
            </div>
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-[22px] border border-[#e4e6eb] bg-white/95 p-2 shadow-[0_18px_50px_rgba(15,23,42,0.18)] backdrop-blur lg:hidden"
        aria-label={t("التنقل السريع", "Quick navigation")}
      >
        {mobileNav.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/dashboard";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black transition ${active ? "bg-[#ffdb3c] text-[#1a237e]" : "text-slate-500 hover:bg-slate-50 hover:text-[#1a237e]"}`}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {rtl ? item.labelAr : item.labelEn}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
