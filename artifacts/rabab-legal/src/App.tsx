import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider } from '@/hooks/use-auth';
import { LangProvider } from '@/hooks/use-language';
import { ThemeProvider } from '@/hooks/use-theme';
import { ProtectedRoute, GuestOnlyRoute } from '@/components/protected-route';

// Pages
import Home from '@/pages/home';
import Pricing from '@/pages/pricing';
import Login from '@/pages/login';
import Register from '@/pages/register';
import Dashboard from '@/pages/dashboard';
import Consultation from '@/pages/consultation';
import PaymentFlow from '@/pages/payment';
import PaymentCallback from '@/pages/payment-callback';
import { PaymentSuccess, PaymentFailed } from '@/pages/payment-status';
import InvoiceDetail from '@/pages/invoice';
import Contact from '@/pages/contact';
import About from '@/pages/about';
import FAQ from '@/pages/faq';
import Appointment from '@/pages/appointment';
import Privacy from '@/pages/privacy';
import Terms from '@/pages/terms';

// Admin Pages
import AdminDashboard from '@/pages/admin/dashboard';
import AdminUsers from '@/pages/admin/users';
import AdminKnowledgeBase from '@/pages/admin/knowledge-base';
import AdminPackages from '@/pages/admin/packages';
import AdminCoupons from '@/pages/admin/coupons';
import AdminPayments from '@/pages/admin/payments';
import AdminConsultations from '@/pages/admin/consultations';
import AdminAuditLog from '@/pages/admin/audit-log';
import AdminNotifications from '@/pages/admin/notifications';
// [DISABLED Aug-2026] import AdminTelegramSync from '@/pages/admin/telegram-sync';
import AdminMojContent from '@/pages/admin/moj-content';
import AdminKnowledgeQuality from '@/pages/admin/knowledge-quality';
import AdminSectionControl from '@/pages/admin/section-control';
import AdminConversionReport from '@/pages/admin/conversion-report';
import AdminSourceStatus from '@/pages/admin/source-status';
import AdminEmailSettings from '@/pages/admin/email-settings';
import AdminContactMessages from '@/pages/admin/contact-messages';
import AdminLegalCodex from '@/pages/admin/legal-codex';
import AdminWhatsAppSettings from '@/pages/admin/whatsapp-settings';
import KnowledgeSearch from '@/pages/knowledge-search';
import LegalSearchPage from '@/pages/legal-search';
import InitiativesPage from '@/pages/initiatives';
import AdminInitiatives from '@/pages/admin/initiatives';
import { DevPanel } from '@/components/dev-panel';
import ContractsPage from '@/pages/contracts';
import LegalAssistant from '@/pages/legal-assistant';
import ServiceDetails from '@/pages/service-details';
import ForgotPassword from '@/pages/forgot-password';
import ResetPassword from '@/pages/reset-password';
import UsageLogPage from '@/pages/usage-log';
import OrganizationPage from '@/pages/organization';
import { UsageCounter } from '@/components/UsageCounter';
import { QuotaConfirmProvider } from '@/components/QuotaConfirmModal';

const queryClient = new QueryClient();

// Placeholder components for static pages
const SimplePage = ({ title }: { title: string }) => (
  <div className="min-h-screen flex flex-col bg-muted/20">
    <div className="p-4 bg-primary text-white"><h1 className="text-xl font-bold">{title}</h1></div>
    <div className="container mx-auto p-12 max-w-3xl prose prose-slate rtl:prose-invert">
      <p>محتوى صفحة {title} باللغة العربية...</p>
    </div>
  </div>
);

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/20 text-center px-4">
      <div>
        <h1 className="text-6xl font-bold text-primary mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">عذراً، الصفحة التي تبحث عنها غير موجودة.</p>
        <button onClick={() => window.location.href = '/'} className="bg-primary text-white px-6 py-3 rounded-md font-bold">العودة للرئيسية</button>
      </div>
    </div>
  );
}

function BackButton() {
  const [location, navigate] = useLocation();
  const navigationStack = useRef<string[]>([location]);
  const currentLocation = useRef(location);
  const isReturning = useRef(false);

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
      aria-label="العودة للصفحة السابقة"
      title="العودة للصفحة السابقة"
      className="fixed top-[4.5rem] right-4 md:right-6 z-40 inline-flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 text-sm font-bold text-foreground shadow-md backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
      <span>رجوع</span>
    </button>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/contact" component={Contact} />
      <Route path="/about" component={About} />
      <Route path="/faq" component={FAQ} />
      <Route path="/appointment" component={Appointment} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/disclaimer"><SimplePage title="إخلاء المسؤولية القانوني" /></Route>

      <Route path="/login">
        <GuestOnlyRoute><Login /></GuestOnlyRoute>
      </Route>
      <Route path="/register">
        <GuestOnlyRoute><Register /></GuestOnlyRoute>
      </Route>
      <Route path="/forgot-password">
        <GuestOnlyRoute><ForgotPassword /></GuestOnlyRoute>
      </Route>
      <Route path="/reset-password" component={ResetPassword} />

      {/* Protected Client Routes */}
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/consultation">
        <Consultation />
      </Route>
      <Route path="/consultation/:id">
        <Consultation />
      </Route>
      <Route path="/payment">
        <ProtectedRoute><PaymentFlow /></ProtectedRoute>
      </Route>
      <Route path="/payment/callback">
        <ProtectedRoute><PaymentCallback /></ProtectedRoute>
      </Route>
      <Route path="/payment/success">
        <ProtectedRoute><PaymentSuccess /></ProtectedRoute>
      </Route>
      <Route path="/payment/failed">
        <ProtectedRoute><PaymentFailed /></ProtectedRoute>
      </Route>
      <Route path="/invoices/:id">
        <ProtectedRoute><InvoiceDetail /></ProtectedRoute>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute adminOnly><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/knowledge-base">
        <ProtectedRoute adminOnly><AdminKnowledgeBase /></ProtectedRoute>
      </Route>
      <Route path="/admin/packages">
        <ProtectedRoute adminOnly><AdminPackages /></ProtectedRoute>
      </Route>
      <Route path="/admin/coupons">
        <ProtectedRoute adminOnly><AdminCoupons /></ProtectedRoute>
      </Route>
      <Route path="/admin/payments">
        <ProtectedRoute adminOnly><AdminPayments /></ProtectedRoute>
      </Route>
      <Route path="/admin/consultations">
        <ProtectedRoute adminOnly><AdminConsultations /></ProtectedRoute>
      </Route>
      <Route path="/admin/audit-log">
        <ProtectedRoute adminOnly><AdminAuditLog /></ProtectedRoute>
      </Route>
      <Route path="/admin/notifications">
        <ProtectedRoute adminOnly><AdminNotifications /></ProtectedRoute>
      </Route>
      {/* [DISABLED Aug-2026] بوت تلجرام معطَّل — الصفحة محفوظة في telegram-sync.tsx */}
      {/* <Route path="/admin/telegram-sync">
        <ProtectedRoute adminOnly><AdminTelegramSync /></ProtectedRoute>
      </Route> */}
      <Route path="/admin/moj-content">
        <ProtectedRoute adminOnly><AdminMojContent /></ProtectedRoute>
      </Route>
      <Route path="/admin/knowledge-quality">
        <ProtectedRoute adminOnly><AdminKnowledgeQuality /></ProtectedRoute>
      </Route>
      <Route path="/admin/section-control">
        <ProtectedRoute adminOnly><AdminSectionControl /></ProtectedRoute>
      </Route>
      <Route path="/admin/conversion-report">
        <ProtectedRoute adminOnly><AdminConversionReport /></ProtectedRoute>
      </Route>
      <Route path="/admin/source-status">
        <ProtectedRoute adminOnly><AdminSourceStatus /></ProtectedRoute>
      </Route>
      <Route path="/admin/email-settings">
        <ProtectedRoute adminOnly><AdminEmailSettings /></ProtectedRoute>
      </Route>
      <Route path="/admin/contact-messages">
        <ProtectedRoute adminOnly><AdminContactMessages /></ProtectedRoute>
      </Route>
      <Route path="/admin/legal-codex">
        <ProtectedRoute adminOnly><AdminLegalCodex /></ProtectedRoute>
      </Route>
      <Route path="/admin/initiatives">
        <ProtectedRoute adminOnly><AdminInitiatives /></ProtectedRoute>
      </Route>
      <Route path="/admin/whatsapp">
        <ProtectedRoute adminOnly><AdminWhatsAppSettings /></ProtectedRoute>
      </Route>

      {/* Public service discovery — login is requested only when a user starts a metered action. */}
      <Route path="/knowledge-search">
        <KnowledgeSearch />
      </Route>

      {/* Standalone smart legal search */}
      <Route path="/legal-search">
        <LegalSearchPage />
      </Route>

      {/* Community initiatives (public) */}
      <Route path="/initiatives" component={InitiativesPage} />

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
        <ProtectedRoute><UsageLogPage /></ProtectedRoute>
      </Route>

      {/* Organization management */}
      <Route path="/organization">
        <ProtectedRoute><OrganizationPage /></ProtectedRoute>
      </Route>
      <Route path="/join-org">
        <OrganizationPage />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}


function WhatsAppButton() {
  return (
    <a
      href="https://wa.me/966504647649"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل عبر واتساب"
      style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999, background: 'hsl(47 100% 48%)' }}
      className="flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
    >
      <svg viewBox="0 0 32 32" className="w-7 h-7 shrink-0" style={{ fill: 'hsl(220 60% 7%)' }}>
        <path d="M16 .5C7.44.5.5 7.44.5 16c0 2.82.74 5.47 2.02 7.77L.5 31.5l7.95-2.02A15.44 15.44 0 0016 31.5C24.56 31.5 31.5 24.56 31.5 16S24.56.5 16 .5zm0 28.12a12.55 12.55 0 01-6.38-1.74l-.46-.27-4.72 1.2 1.22-4.6-.3-.47A12.6 12.6 0 1116 28.62zM23.18 19.5c-.36-.18-2.14-1.06-2.47-1.18-.33-.12-.57-.18-.81.18s-.93 1.18-1.14 1.42-.42.27-.78.09a9.87 9.87 0 01-2.9-1.79 10.9 10.9 0 01-2.01-2.5c-.21-.36-.02-.56.16-.74.16-.16.36-.42.54-.63s.24-.36.36-.6.06-.45-.03-.63c-.09-.18-.81-1.95-1.11-2.67-.29-.7-.59-.6-.81-.61h-.69c-.24 0-.63.09-.96.45s-1.26 1.23-1.26 3 1.29 3.48 1.47 3.72 2.54 3.88 6.16 5.44a20.75 20.75 0 002.06.76c.87.27 1.66.24 2.28.15.7-.1 2.14-.87 2.44-1.71s.3-1.56.21-1.71c-.09-.15-.33-.24-.69-.42z"/>
      </svg>
      <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'hsl(220 60% 7%)' }}>تواصل عبر واتساب</span>
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
              <TooltipProvider>
                <Router />
                <BackButton />
                <Toaster />
                <DevPanel />
                <UsageCounter />
              </TooltipProvider>
            </QuotaConfirmProvider>
          </AuthProvider>
        </WouterRouter>
      </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
