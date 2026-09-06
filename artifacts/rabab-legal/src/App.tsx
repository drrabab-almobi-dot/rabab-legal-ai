import { Route, Switch, Router as WouterRouter, useLocation, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { LangProvider, useLang } from '@/hooks/use-language';
import { ThemeProvider } from '@/hooks/use-theme';
import { ProtectedRoute, GuestOnlyRoute } from '@/components/protected-route';
import { QuotaConfirmProvider } from '@/components/QuotaConfirmModal';

// Route-level loading keeps administration, document tools, and PDF libraries out
// of the critical homepage bundle. Each route remains functionally identical.
const Home = lazy(() => import('@/pages/home'));
const Pricing = lazy(() => import('@/pages/pricing'));
const Login = lazy(() => import('@/pages/login'));
const Register = lazy(() => import('@/pages/register'));
const Dashboard = lazy(() => import('@/pages/dashboard'));
const Consultation = lazy(() => import('@/pages/consultation'));
const PaymentFlow = lazy(() => import('@/pages/payment'));
const PaymentCallback = lazy(() => import('@/pages/payment-callback'));
const PaymentSuccess = lazy(async () => ({ default: (await import('@/pages/payment-status')).PaymentSuccess }));
const PaymentFailed = lazy(async () => ({ default: (await import('@/pages/payment-status')).PaymentFailed }));
const InvoiceDetail = lazy(() => import('@/pages/invoice'));
const Contact = lazy(() => import('@/pages/contact'));
const About = lazy(() => import('@/pages/about'));
const FAQ = lazy(() => import('@/pages/faq'));
const Appointment = lazy(() => import('@/pages/appointment'));
const Privacy = lazy(() => import('@/pages/privacy'));
const Terms = lazy(() => import('@/pages/terms'));
const ForgotPassword = lazy(() => import('@/pages/forgot-password'));
const ResetPassword = lazy(() => import('@/pages/reset-password'));
const KnowledgeSearch = lazy(() => import('@/pages/knowledge-search'));
const LegalSearchPage = lazy(() => import('@/pages/legal-search'));
const ContractsPage = lazy(() => import('@/pages/contracts'));
const LegalAssistant = lazy(() => import('@/pages/legal-assistant'));
const ServiceDetails = lazy(() => import('@/pages/service-details'));
const UsageLogPage = lazy(() => import('@/pages/usage-log'));
const OrganizationPage = lazy(() => import('@/pages/organization'));
const DevPanel = lazy(async () => ({ default: (await import('@/components/dev-panel')).DevPanel }));
const UsageCounter = lazy(async () => ({ default: (await import('@/components/UsageCounter')).UsageCounter }));

const AdminDashboard = lazy(() => import('@/pages/admin/dashboard'));
const AdminUsers = lazy(() => import('@/pages/admin/users'));
const AdminKnowledgeBase = lazy(() => import('@/pages/admin/knowledge-base'));
const AdminPackages = lazy(() => import('@/pages/admin/packages'));
const AdminCoupons = lazy(() => import('@/pages/admin/coupons'));
const AdminPayments = lazy(() => import('@/pages/admin/payments'));
const AdminConsultations = lazy(() => import('@/pages/admin/consultations'));
const AdminAuditLog = lazy(() => import('@/pages/admin/audit-log'));
const AdminNotifications = lazy(() => import('@/pages/admin/notifications'));
const AdminMojContent = lazy(() => import('@/pages/admin/moj-content'));
const AdminKnowledgeQuality = lazy(() => import('@/pages/admin/knowledge-quality'));
const AdminSectionControl = lazy(() => import('@/pages/admin/section-control'));
const AdminConversionReport = lazy(() => import('@/pages/admin/conversion-report'));
const AdminSourceStatus = lazy(() => import('@/pages/admin/source-status'));
const AdminEmailSettings = lazy(() => import('@/pages/admin/email-settings'));
const AdminContactMessages = lazy(() => import('@/pages/admin/contact-messages'));
const AdminLegalCodex = lazy(() => import('@/pages/admin/legal-codex'));
const AdminWhatsAppSettings = lazy(() => import('@/pages/admin/whatsapp-settings'));
const AdminInitiatives = lazy(() => import('@/pages/admin/initiatives'));

const queryClient = new QueryClient();

// Placeholder components for static pages
const SimplePage = () => {
  const { lang, t } = useLang();
  const title = t('إخلاء المسؤولية القانوني', 'Legal Disclaimer');

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen flex flex-col bg-muted/20">
      <div className="p-4 bg-primary text-white">
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      <div className="container mx-auto p-12 max-w-3xl prose prose-slate rtl:prose-invert">
        <p>{t('محتوى صفحة إخلاء المسؤولية القانوني باللغة العربية...', 'The Legal Disclaimer page content is available in Arabic...')}</p>
      </div>
    </div>
  );
};

function NotFound() {
  const { lang, t } = useLang();

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen flex items-center justify-center bg-muted/20 text-center px-4">
      <div>
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">{t('عذراً، الصفحة التي تبحث عنها غير موجودة.', 'Sorry, the page you are looking for does not exist.')}</p>
        <button onClick={() => (window.location.href = '/')} className="bg-primary text-white px-6 py-3 rounded-md font-bold">
          {t('العودة للرئيسية', 'Back to home')}
        </button>
      </div>
    </div>
  );
}

function BackButton() {
  const [location, navigate] = useLocation();
  const navigationStack = useRef<string[]>([location]);
  const currentLocation = useRef(location);
  const isReturning = useRef(false);
  const { t, lang } = useLang();

  useEffect(() => {
    if (location === currentLocation.current) return;

    if (isReturning.current) {
      navigationStack.current.pop();
      isReturning.current = false;
    } else {
      navigationStack.current.push(location);
    }

    currentLocation.current = location;
  }, [location]);

  if (location === '/') return null;

  const handleBack = () => {
    const previousLocation = navigationStack.current.at(-2);
    if (previousLocation) {
      isReturning.current = true;
      navigate(previousLocation);
    } else {
      navigate('/');
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={t('العودة للصفحة السابقة', 'Go back')}
      title={t('العودة للصفحة السابقة', 'Go back')}
      className={`fixed top-[4.5rem] ${lang === 'ar' ? 'right-4 md:right-6' : 'left-4 md:left-6'} z-40 inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-sm font-bold text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
    >
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
      <span>{t('رجوع', 'Back')}</span>
    </button>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/packages">
        <Redirect to="/pricing" />
      </Route>
      <Route path="/contact" component={Contact} />
      <Route path="/about" component={About} />
      <Route path="/faq" component={FAQ} />
      <Route path="/appointment" component={Appointment} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/disclaimer">
        <SimplePage />
      </Route>

      <Route path="/login">
        <GuestOnlyRoute>
          <Login />
        </GuestOnlyRoute>
      </Route>
      <Route path="/register">
        <GuestOnlyRoute>
          <Register />
        </GuestOnlyRoute>
      </Route>
      <Route path="/forgot-password">
        <GuestOnlyRoute>
          <ForgotPassword />
        </GuestOnlyRoute>
      </Route>
      <Route path="/reset-password" component={ResetPassword} />

      {/* Protected Client Routes */}
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/consultation">
        <Consultation />
      </Route>
      <Route path="/consultation/:id">
        <Consultation />
      </Route>
      <Route path="/payment">
        <ProtectedRoute>
          <PaymentFlow />
        </ProtectedRoute>
      </Route>
      <Route path="/payment/callback">
        <ProtectedRoute>
          <PaymentCallback />
        </ProtectedRoute>
      </Route>
      <Route path="/payment/success">
        <ProtectedRoute>
          <PaymentSuccess />
        </ProtectedRoute>
      </Route>
      <Route path="/payment/failed">
        <ProtectedRoute>
          <PaymentFailed />
        </ProtectedRoute>
      </Route>
      <Route path="/invoices/:id">
        <ProtectedRoute>
          <InvoiceDetail />
        </ProtectedRoute>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute adminOnly>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute adminOnly>
          <AdminUsers />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/knowledge-base">
        <ProtectedRoute adminOnly>
          <AdminKnowledgeBase />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/packages">
        <ProtectedRoute adminOnly>
          <AdminPackages />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/coupons">
        <ProtectedRoute adminOnly>
          <AdminCoupons />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute adminOnly>
          <AdminPayments />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/consultations">
        <ProtectedRoute adminOnly>
          <AdminConsultations />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/audit-log">
        <ProtectedRoute adminOnly>
          <AdminAuditLog />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute adminOnly>
          <AdminNotifications />
        </ProtectedRoute>
      </Route>

      {/* [DISABLED Aug-2026] بوت تلجرام معطَّل — الصفحة محفوظة في telegram-sync.tsx */}
      {/* <Route path="/admin/telegram-sync">
        <ProtectedRoute adminOnly><AdminTelegramSync /></ProtectedRoute>
      </Route> */}

      <Route path="/admin/moj-content">
        <ProtectedRoute adminOnly>
          <AdminMojContent />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/knowledge-quality">
        <ProtectedRoute adminOnly>
          <AdminKnowledgeQuality />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/section-control">
        <ProtectedRoute adminOnly>
          <AdminSectionControl />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/conversion-report">
        <ProtectedRoute adminOnly>
          <AdminConversionReport />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/source-status">
        <ProtectedRoute adminOnly>
          <AdminSourceStatus />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/email-settings">
        <ProtectedRoute adminOnly>
          <AdminEmailSettings />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/contact-messages">
        <ProtectedRoute adminOnly>
          <AdminContactMessages />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/legal-codex">
        <ProtectedRoute adminOnly>
          <AdminLegalCodex />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/initiatives">
        <ProtectedRoute adminOnly>
          <AdminInitiatives />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/whatsapp">
        <ProtectedRoute adminOnly>
          <AdminWhatsAppSettings />
        </ProtectedRoute>
      </Route>

      {/* Public service discovery — login is requested only when a user starts a metered action. */}
      <Route path="/knowledge-search">
        <KnowledgeSearch />
      </Route>

      {/* Standalone smart legal search */}
      <Route path="/legal-search">
        <LegalSearchPage />
      </Route>

      {/* Contracts */}
      <Route path="/contracts">
        <ContractsPage />
      </Route>

      {/* Legal Assistant hub */}
      <Route path="/legal-assistant">
        <LegalAssistant />
      </Route>

      <Route path="/services/:serviceId">
        <ServiceDetails />
      </Route>

      {/* Usage log */}
      <Route path="/usage-log">
        <ProtectedRoute>
          <UsageLogPage />
        </ProtectedRoute>
      </Route>

      {/* Organization management */}
      <Route path="/organization">
        <ProtectedRoute>
          <OrganizationPage />
        </ProtectedRoute>
      </Route>
      <Route path="/join-org">
        <OrganizationPage />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function WhatsAppButton() {
  const { lang, t } = useLang();

  return (
    <a
      href="https://wa.me/966504647649"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('تواصل عبر واتساب', 'Contact us on WhatsApp')}
      title={t('تواصل عبر واتساب', 'Contact us on WhatsApp')}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      style={{
        position: 'fixed',
        insetBlockEnd: 'max(16px, env(safe-area-inset-bottom))',
        insetInlineStart: 'max(16px, env(safe-area-inset-left))',
        zIndex: 9999,
        background: 'hsl(220 60% 7%)',
        border: '1px solid hsl(47 100% 48%)',
      }}
      className="!fixed flex h-12 w-12 flex-row items-center justify-center gap-2 rounded-full p-3 shadow-lg shadow-secondary/15 transition-all duration-300 hover:scale-105 hover:shadow-xl sm:h-auto sm:w-auto sm:rounded-2xl sm:px-3 sm:py-2.5"
    >
      <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0" style={{ fill: 'hsl(47 100% 48%)' }}>
        <path d="M16 .5C7.44.5.5 7.44.5 16c0 2.82.74 5.47 2.02 7.77L.5 31.5l7.95-2.02A15.44 15.44 0 0016 31.5C24.56 31.5 31.5 24.56 31.5 16S24.56.5 16 .5zm0 28.12a12.55 12.55 0 01-6.38-1.74l-.46-.27-4.72 1.2 1.22-4.6-.3-.47A12.6 12.6 0 1116 28.62zM23.18 19.5c-.36-.18-2.14-1.06-2.47-1.18-.33-.12-.57-.18-.81.18s-.93 1.18-1.14 1.42-.42.27-.78.09a9.87 9.87 0 01-2.9-1.79 10.9 10.9 0 01-2.01-2.5c-.21-.36-.02-.56.16-.74.16-.16.36-.42.54-.63s.24-.36.36-.6.06-.45-.03-.63c-.09-.18-.81-1.95-1.11-2.67-.29-.7-.59-.6-.81-.61h-.69c-.24 0-.63.09-.96.45s-1.26 1.23-1.26 3 1.29 3.48 1.47 3.72 2.54 3.88 6.16 5.44a20.75 20.75 0 002.06.76c.87.27 1.66.24 2.28.15.7-.1 2.14-.87 2.44-1.71s.3-1.56.21-1.71c-.09-.15-.33-.24-.69-.42z" />
      </svg>
      <span className="hidden text-xs font-bold whitespace-nowrap text-white sm:inline">{t('تواصل عبر واتساب', 'Contact us on WhatsApp')}</span>
    </a>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LangProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthProvider>
              <QuotaConfirmProvider>
                <AppContent />
              </QuotaConfirmProvider>
            </AuthProvider>
          </WouterRouter>
        </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppContent() {
  const { lang } = useLang();

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <TooltipProvider>
        <Suspense
          fallback={
            <main className="flex min-h-screen items-center justify-center bg-background px-4" role="status" aria-live="polite">
              <p className="text-sm text-muted-foreground">جارٍ تحميل الصفحة…</p>
            </main>
          }
        >
          <Router />
        </Suspense>
        <BackButton />
        <WhatsAppButton />
        <Toaster />
        <Suspense fallback={null}>
          <DevPanel />
          <UsageCounter />
        </Suspense>
      </TooltipProvider>
    </div>
  );
}

export default App;
