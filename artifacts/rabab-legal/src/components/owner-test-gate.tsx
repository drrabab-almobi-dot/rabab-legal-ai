import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { LockKeyhole, Loader2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useLang } from "@/hooks/use-language";

export type AccessMode = "loading" | "off" | "admin_only";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PUBLIC_TEST_PATHS = new Set([
  "/",
  "/about",
  "/pricing",
  "/contact",
  "/faq",
  "/privacy",
  "/terms",
  "/disclaimer",
  "/login",
  "/forgot-password",
  "/reset-password",
]);
const PROTECTED_TEST_PATHS = [
  /^\/register$/,
  /^\/dashboard$/,
  /^\/account$/,
  /^\/usage-log$/,
  /^\/organization$/,
  /^\/join-org$/,
  /^\/appointment$/,
  /^\/consultation(?:\/.*)?$/,
  /^\/contracts$/,
  /^\/legal-search$/,
  /^\/legal-assistant$/,
  /^\/knowledge-search$/,
  /^\/payment(?:\/.*)?$/,
  /^\/invoices(?:\/.*)?$/,
  /^\/admin(?:\/.*)?$/,
];

const OwnerTestModeContext = createContext<AccessMode>("loading");

export function useOwnerTestMode() {
  const accessMode = useContext(OwnerTestModeContext);
  return {
    accessMode,
    isLoading: accessMode === "loading",
    isPublicRelease: accessMode === "off",
  };
}

export function OwnerTestGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();
  const [location] = useLocation();
  const { lang, t } = useLang();
  const [accessMode, setAccessMode] = useState<AccessMode>("loading");

  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/api/access-mode`, { credentials: "include" })
      .then(async (response) => {
        if (!response.ok) return { mode: "off" };
        return response.json() as Promise<{ mode?: string }>;
      })
      .then((data) => {
        if (active)
          setAccessMode(data.mode === "admin_only" ? "admin_only" : "off");
      })
      .catch(() => {
        // A failed probe must never lock a healthy public production application.
        if (active) setAccessMode("off");
      });
    return () => {
      active = false;
    };
  }, []);

  if (accessMode === "loading" || isLoading) {
    return (
      <OwnerTestModeContext.Provider value={accessMode}>
        <div
          className="min-h-screen flex items-center justify-center bg-background"
          aria-live="polite"
        >
          <Loader2
            className="h-7 w-7 animate-spin text-primary"
            aria-label={t(
              "جارٍ التحقق من حالة الدخول",
              "Checking access status",
            )}
          />
        </div>
      </OwnerTestModeContext.Provider>
    );
  }

  const currentPath = location.split("?")[0];
  const isPublicTestPath =
    PUBLIC_TEST_PATHS.has(currentPath) || currentPath.startsWith("/services/");
  const isProtectedTestPath = PROTECTED_TEST_PATHS.some((pattern) =>
    pattern.test(currentPath),
  );

  if (
    accessMode !== "admin_only" ||
    isAdmin ||
    isPublicTestPath ||
    !isProtectedTestPath
  ) {
    return (
      <OwnerTestModeContext.Provider value={accessMode}>
        {accessMode === "admin_only" && !isAdmin && (
          <aside
            className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-950"
            role="status"
          >
            {t(
              "المنصة في مرحلة اختبار خاص. يمكنك تصفح المعلومات العامة، بينما التسجيل والخدمات الرقمية غير متاحة مؤقتاً.",
              "The platform is in private testing. Public information is available, while registration and digital services are temporarily unavailable.",
            )}
          </aside>
        )}
        {children}
      </OwnerTestModeContext.Provider>
    );
  }

  // The owner may sign in from the normal audited authentication page. A signed
  // in non-admin receives the same closed-test notice and cannot use any APIs.
  const loginPath = `/login?returnTo=${encodeURIComponent("/dashboard")}`;
  return (
    <OwnerTestModeContext.Provider value={accessMode}>
      <main
        dir={lang === "ar" ? "rtl" : "ltr"}
        className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.12),transparent_42%),hsl(var(--background))] px-5 py-10 flex items-center justify-center"
      >
        <section className="w-full max-w-xl rounded-3xl border border-primary/15 bg-card p-8 text-center shadow-xl shadow-primary/5 md:p-10">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <LockKeyhole className="h-7 w-7" aria-hidden="true" />
          </div>
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-secondary/15 px-3 py-1 text-xs font-bold text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("وضع اختبار خاص", "Private testing mode")}
          </p>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            {t(
              "المنصة تحت اختبار الجودة",
              "The platform is undergoing quality testing",
            )}
          </h1>
          <p className="mt-4 leading-8 text-muted-foreground">
            {t(
              "نختبر خدمات الاستشارات والتحقق القانوني قبل إتاحتها للعامة. الوصول متاح حالياً للمسؤول المخوّل فقط.",
              "We are validating consultation and legal-verification services before public release. Access is currently limited to the authorized administrator only.",
            )}
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {!isAuthenticated && (
              <a
                href={loginPath}
                className="inline-flex min-h-11 min-w-44 items-center justify-center rounded-md border border-primary-border bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("دخول المسؤول", "Administrator sign in")}
              </a>
            )}
            <a
              href="/contact"
              className="inline-flex min-h-11 min-w-44 items-center justify-center rounded-md border-2 border-primary bg-background px-4 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("تواصل معنا", "Contact us")}
            </a>
          </div>
          <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm">
            <a
              href="/privacy"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("سياسة الخصوصية", "Privacy Policy")}
            </a>
            <a
              href="/terms"
              className="font-semibold text-primary underline-offset-4 hover:underline"
            >
              {t("شروط الاستخدام", "Terms of Use")}
            </a>
          </div>
        </section>
      </main>
    </OwnerTestModeContext.Provider>
  );
}
