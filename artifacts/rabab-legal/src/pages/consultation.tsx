import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useGetMySubscription, useCreateConsultation, getGetMySubscriptionQueryKey } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { useLang } from '@/hooks/use-language';
import { Navbar } from '@/components/layout';
import { Button, Badge } from '@/components/ui';
import { ShieldAlert, Send, Loader2, Scale, RotateCcw, ExternalLink, AlertCircle, CheckCircle2, Gift, Star, Download, X, AlertTriangle, ThumbsUp, ChevronDown, ChevronUp, ChevronRight, Pencil, MessageSquare, Paperclip, FileText, Clipboard, ClipboardCheck, Globe, Languages, Maximize2, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LegalMarkdown, cleanAiText, markdownToHtml } from '@/components/legal-markdown';
import { exportConsultationWord as exportWordDocx } from '@/lib/export-word';
import { useQuotaConfirm } from '@/components/QuotaConfirmModal';

const AREAS = [
  "نظام العمل",
  "الأحوال الشخصية والتركات",
  "العقود التجارية",
  "النزاعات المدنية",
  "قانون العقارات",
  "الملكية الفكرية",
  "خدمات الشركات والاستثمار",
  "المصرفية والتمويلية",
  "القضايا الجزائية",
  "التأسيس التجاري والتراخيص",
  "تحليل العقود",
  "أخرى",
];

const COUNTRIES = [
  { code: 'SA', name: 'المملكة العربية السعودية', flag: '🇸🇦' },
  { code: 'AE', name: 'الإمارات العربية المتحدة', flag: '🇦🇪' },
  { code: 'KW', name: 'الكويت', flag: '🇰🇼' },
  { code: 'QA', name: 'قطر', flag: '🇶🇦' },
  { code: 'BH', name: 'البحرين', flag: '🇧🇭' },
  { code: 'OM', name: 'سلطنة عُمان', flag: '🇴🇲' },
];

const CONSULTATION_LANGUAGES = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ur', label: 'اردو' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'de', label: 'Deutsch' },
  { code: 'zh', label: '中文' },
  { code: 'ru', label: 'Русский' },
] as const;

function responseLanguageLabel(value?: string) {
  if (!value || value === 'ar') return 'العربية';
  if (value.startsWith('custom:')) return value.slice('custom:'.length).trim() || 'لغة أخرى';
  return CONSULTATION_LANGUAGES.find(language => language.code === value)?.label ?? 'العربية';
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

const localized = (lang: string, ar: string, en: string) => lang === 'ar' ? ar : en;
const countryName = (code: string, lang: string) => {
  const names: Record<string, string> = {
    SA: 'Saudi Arabia', AE: 'United Arab Emirates', KW: 'Kuwait',
    QA: 'Qatar', BH: 'Bahrain', OM: 'Oman',
  };
  const country = COUNTRIES.find(item => item.code === code);
  return lang === 'ar' ? country?.name ?? '' : names[code] ?? '';
};

interface VerificationSource {
  name: string;
  similarity: number;
  verified: boolean;
  snippet: string;
  sourceType: 'kb' | 'web';
  url?: string;
  documentId?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
}
interface MessageVerification {
  confidence: 'high' | 'medium' | 'low';
  confidenceScore: number;
  blockedCount: number;
  sufficientSources: boolean;
  sources: VerificationSource[];
}
// Shape returned by GET /consultations/:id/messages for stored sources
interface StoredSource {
  name: string;
  similarity: number;
  verified: boolean;
  snippet: string;
  sourceType: 'kb' | 'web';
  url?: string;
  documentId?: number;
  pageStart?: number | null;
  pageEnd?: number | null;
}

interface ChatMessage {
  id?: number;
  messageId?: number;
  role: 'user' | 'assistant';
  content: string;
  attachmentName?: string | null;
  createdAt?: string;
  error?: boolean;
  verification?: MessageVerification;
  rated?: boolean;
  usedLiveSearch?: boolean;
  // Raw stored sources returned when loading a saved consultation
  sources?: StoredSource[] | null;
  // Suggested follow-up questions returned by the backend
  suggestedQuestions?: string[];
}

interface PreparedAttachment {
  fileName: string;
  text: string;
  truncated: boolean;
}

const ATTACHMENT_CONTEXT_START = '[محتوى مرفق للتحليل]';
const ATTACHMENT_CONTEXT_END = '[/محتوى مرفق للتحليل]';
const ATTACHMENT_INTAKE_PROMPT = 'يرجى تحليل المرفق وبدء الحوار بسؤال واحد في كل مرة لاستكمال المعلومات المؤثرة قبل تقديم الإجابة الختامية.';

function withoutAttachmentContext(content: string): string {
  const start = content.indexOf(ATTACHMENT_CONTEXT_START);
  if (start === -1) return content.trim();
  return content.slice(0, start).trim();
}

function ConsultationAttachmentPicker({
  attachment,
  onAttachmentChange,
  disabled = false,
}: {
  attachment: PreparedAttachment | null;
  onAttachmentChange: (attachment: PreparedAttachment | null) => void;
  disabled?: boolean;
}) {
  const [extracting, setExtracting] = useState(false);
  const [review, setReview] = useState<{ open: boolean; text: string; fileName: string; truncated: boolean }>({
    open: false, text: '', fileName: '', truncated: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);

  const openFilePicker = () => {
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      toast({ title: t('سجّل الدخول لإرفاق المستند', 'Sign in to attach a document'), description: t('نحتاج إلى حسابك لحماية مستنداتك أثناء تحليل الاستشارة.', 'An account protects your documents during analysis.') });
      setLocation(`/login?returnTo=${returnTo}`);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${API_BASE}/api/contract/extract`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t('فشل استخراج النص من المرفق', 'Could not extract text from the attachment'));
      setReview({
        open: true,
        text: data.extractedText ?? '',
        fileName: data.filename ?? file.name,
        truncated: !!data.wasTruncated,
      });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('تعذر قراءة المرفق', 'Unable to read attachment'), description: error.message || t('حاول رفع ملف آخر.', 'Try another file.') });
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmAttachment = () => {
    onAttachmentChange({
      fileName: review.fileName,
      text: review.text,
      truncated: review.truncated,
    });
    setReview({ open: false, text: '', fileName: '', truncated: false });
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.docx,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="rounded-xl border border-dashed border-primary-foreground/45 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <Paperclip className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-primary">{t('أرفق مستنداً للاستشارة', 'Attach a consultation document')} <span className="font-normal text-muted-foreground">{t('(اختياري)', '(optional)')}</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('PDF أو Word أو TXT أو صورة، حتى 20 م.ب. نقرأه أولاً ثم يبدأ الحوار، ويمكنك متابعة شرح طلبك بنفسك.', 'PDF, Word, TXT, or image, up to 20 MB. We read it before the conversation begins.')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={disabled || extracting}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-primary-foreground/65 bg-primary-foreground/10 px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary-foreground/20 hover:border-primary-foreground transition-colors disabled:opacity-50"
          >
            {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
            {extracting ? t('جارٍ القراءة...', 'Reading...') : attachment ? t('استبدال المرفق', 'Replace attachment') : t('إضافة مرفق', 'Add attachment')}
          </button>
        </div>
        {attachment && (
          <div className="flex items-center gap-2 rounded-lg border border-primary-foreground/35 bg-background px-3 py-2">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs font-medium text-foreground flex-1 truncate">{attachment.fileName}</span>
            <button
              type="button"
              onClick={() => onAttachmentChange(null)}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label={t('إزالة المرفق', 'Remove attachment')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {review.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl shadow-primary/15 border-2 border-primary/50 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">{t('مراجعة النص المستخرج', 'Review extracted text')}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-xs">{review.fileName}</p>
                </div>
              </div>
              <button onClick={() => setReview({ open: false, text: '', fileName: '', truncated: false })} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
              <p className="text-xs text-blue-700">{t('راجِع النص وعدّله إن لزم. سيُستخدم في التحليل فقط ولن يظهر كاملاً داخل فقاعة رسالتك.', 'Review and edit the text if needed. It is used only for analysis and will not appear in full in your message bubble.')}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {review.truncated && (
                <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{t('النص طويل وتم اقتصاصه عند الحد الأقصى. يمكنك تعديل الجزء المتاح قبل المتابعة.', 'The text is long and was truncated at the limit. You can edit the available portion before continuing.')}</span>
                </div>
              )}
              <textarea
                value={review.text}
                onChange={event => setReview(prev => ({ ...prev, text: event.target.value }))}
                className="w-full h-64 text-sm leading-relaxed bg-muted/30 border-2 border-primary/40 rounded-xl p-3 resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors font-mono"
                dir="auto"
              />
            </div>
            <div className="flex items-center gap-3 px-5 py-4 border-t border-border/40 shrink-0">
              <button onClick={confirmAttachment} className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                {t('تأكيد المرفق', 'Confirm attachment')}
              </button>
              <button onClick={() => setReview({ open: false, text: '', fileName: '', truncated: false })} className="h-10 px-5 border border-primary/40 rounded-xl text-sm text-muted-foreground hover:border-primary hover:bg-primary/5 transition-colors">
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Build a MessageVerification from the stored SourcePanelItem array. */
function sourcesToVerification(sources: StoredSource[]): MessageVerification | undefined {
  if (!sources || sources.length === 0) return undefined;
  const verifiedCount = sources.filter(s => s.verified).length;
  const confidenceScore = Math.round((verifiedCount / sources.length) * 100);
  const confidence: 'high' | 'medium' | 'low' =
    confidenceScore >= 70 ? 'high' : confidenceScore >= 40 ? 'medium' : 'low';
  return {
    confidence,
    confidenceScore,
    blockedCount: 0,
    sufficientSources: sources.length >= 3,
    sources: sources.map(s => ({
      name: s.name,
      similarity: s.similarity ?? 0,
      verified: s.verified,
      snippet: s.snippet ?? '',
      sourceType: s.sourceType ?? 'kb',
      url: s.url,
      documentId: s.documentId,
      pageStart: s.pageStart,
      pageEnd: s.pageEnd,
    })),
  };
}

// ─── Quota Exhausted Modal ─────────────────────────────────────────────────────
function QuotaExhaustedModal({ onGoToPricing }: { onGoToPricing: () => void }) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-card w-full sm:max-w-md sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Top accent */}
        <div className="h-1.5 bg-gradient-to-l from-secondary via-yellow-400 to-secondary" />

        <div className="p-8 text-center">
          {/* Icon */}
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-5" style={{background:'hsl(47 100% 48% / 0.15)'}}>
            <ShieldAlert className="w-12 h-12" style={{color:'hsl(47 100% 48%)'}} />
          </div>

          <h2 className="text-2xl font-bold text-primary mb-2">{t('انتهت استشاراتك المجانية', 'Your free consultations have ended')}</h2>
          <p className="text-muted-foreground text-sm leading-relaxed mb-6 max-w-xs mx-auto">
            {t('لقد استهلكتِ الاستشارات الثلاث المجانية. اختاري باقة مناسبة للحصول على مشورة قانونية متواصلة.', 'You have used your three free consultations. Choose a plan for continued legal guidance.')}
          </p>

          {/* Package highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-6 text-xs">
            {[
              { label: t('باقة الأسئلة', 'Questions plan'), price: '129', qty: t('7 أسئلة', '7 questions') },
              { label: t('الشهري', 'Monthly'), price: '299', qty: t('غير محدود', 'Unlimited'), popular: true },
              { label: t('الأعمال', 'Business'), price: '599', qty: t('غير محدود', 'Unlimited') },
            ].map(pkg => (
              <div key={pkg.label} className={cn(
                "rounded-xl p-3 border text-center",
                pkg.popular
                  ? "border-secondary bg-secondary/10"
                  : "border-border bg-muted/30"
              )}>
                {pkg.popular && (
                  <span className="inline-flex items-center gap-0.5 text-secondary font-bold text-[10px] mb-1">
                    <Star className="w-2.5 h-2.5 fill-secondary" /> {t('الأشهر', 'Popular')}
                  </span>
                )}
                <p className="font-bold text-primary" dir="ltr">{pkg.price} {t('ر.س', 'SAR')}</p>
                <p className="text-muted-foreground leading-tight mt-0.5">{pkg.qty}</p>
                <p className="text-muted-foreground/70 text-[10px] mt-0.5">{pkg.label}</p>
              </div>
            ))}
          </div>

          <Button
            onClick={onGoToPricing}
            className="w-full h-13 text-base font-bold shadow-lg mb-3"
            size="lg"
          >
            {t('اختاري الباقة المناسبة', 'Choose a plan')}
          </Button>
          <p className="text-[11px] text-muted-foreground/60">{t('الأسعار لا تشمل ضريبة القيمة المضافة 15%', 'Prices exclude 15% VAT')}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Quota Badge ──────────────────────────────────────────────────────────────
function QuotaBadge({ remaining, total, size = 'md', onDark = false }: { remaining: number; total: number; size?: 'sm' | 'md'; onDark?: boolean }) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const isFree = total <= 10;
  const isLow = remaining <= 1;
  const isExhausted = remaining <= 0;

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full border font-bold",
      size === 'sm' ? "px-2.5 py-0.5 text-xs" : "px-4 py-1.5 text-sm",
      isExhausted
        ? "bg-destructive/10 border-destructive/30 text-destructive"
        : "bg-muted border-border text-foreground"
    )}>
      {isFree && !isExhausted && <Gift className={cn(size === 'sm' ? "w-3 h-3" : "w-3.5 h-3.5", "text-secondary")} />}
      {isExhausted
        ? <span>{t('انتهت الاستشارات المجانية', 'Free consultations ended')}</span>
        : <span className="text-foreground">
            {isFree ? t('التجربة المجانية: ', 'Free trial: ') : t('المتبقي: ', 'Remaining: ')}
            <span style={{color:'hsl(47 100% 48%)'}}>{remaining}</span>
            {t(' من ', ' of ')}
            <span style={{color:'hsl(47 100% 48%)'}}>{total}</span>
          </span>
      }
    </div>
  );
}

// ─── Task Types Configuration ────────────────────────────────────────────────
interface TaskField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  rows?: number;
  options?: { value: string; label: string }[];
}
interface TaskTypeConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  group: string;
  fields: TaskField[];
}

// Shared field templates
const F: Record<string, TaskField> = {
  facts:        { key: 'facts',        label: 'وقائع الاستشارة',           type: 'textarea', required: true,  placeholder: 'الأطراف، ما جرى، التسلسل الزمني...', rows: 4 },
  documents:    { key: 'documents',    label: 'المستندات المتوفرة',        type: 'textarea', required: false, placeholder: 'عقود، فواتير، مراسلات، صكوك...', rows: 2 },
  subject:      { key: 'subject',      label: 'موضوع النزاع',              type: 'text',     required: true,  placeholder: 'مثال: إنهاء عقد / مطالبة مالية...' },
  dispute_type: { key: 'dispute_type', label: 'نوع النزاع',                type: 'text',     required: false, placeholder: 'عمالي / تجاري / عقاري...' },
  dispute_date: { key: 'dispute_date', label: 'تاريخ نشأة النزاع (تقريبي)', type: 'text',    required: false, placeholder: 'مثال: يناير 2024' },
  contract_terms:      { key: 'contract_terms',      label: 'بنود العقد ذات الصلة', type: 'textarea', required: false, placeholder: 'انسخ البنود المتعلقة بالنزاع...', rows: 3 },
  termination_clause:  { key: 'termination_clause',  label: 'بند الإنهاء في العقد', type: 'text',     required: false, placeholder: 'مثال: المادة 12 من العقد...' },
  service_details:     { key: 'service_details',     label: 'مدة الخدمة والراتب',   type: 'text',     required: false, placeholder: 'مثال: 3 سنوات، راتب 8000 ر.س' },
  property_info:       { key: 'property_info',       label: 'العقار ونوعه',          type: 'text',     required: false, placeholder: 'مثال: شقة سكنية في الرياض' },
  enforcement_deed:    { key: 'enforcement_deed',    label: 'السند التنفيذي ونوعه',  type: 'text',     required: true,  placeholder: 'مثال: حكم ابتدائي نهائي بتاريخ...' },
  arbitration_clause:  { key: 'arbitration_clause',  label: 'شرط التحكيم',           type: 'textarea', required: false, placeholder: 'انسخ نص بند التحكيم من العقد...', rows: 2 },
  arbitration_session_details: { key: 'arbitration_session_details', label: 'تفاصيل جلسة التحكيم', type: 'textarea', required: true, placeholder: 'رقم القضية، المركز، موعد الجلسة، الأطراف، الطلبات والموضوعات المطروحة...', rows: 4 },
  session_notes:       { key: 'session_notes',       label: 'ملاحظات الجلسة',        type: 'textarea', required: true,  placeholder: 'الحضور، ما قُدم من طلبات ودفوع، قرارات الهيئة، والإجراءات اللاحقة...', rows: 5 },
  arbitration_award:   { key: 'arbitration_award',   label: 'نص حكم التحكيم أو ملخصه', type: 'textarea', required: true, placeholder: 'الصق الحكم أو لخّص الوقائع والمنطوق والأسباب...', rows: 5 },
  settlement_parties:  { key: 'settlement_parties',  label: 'أطراف الصلح وصفاتهم',       type: 'textarea', required: false, placeholder: 'أسماء الأطراف وصفاتهم وبيانات التمثيل إن وجدت...', rows: 3 },
  settlement_terms:    { key: 'settlement_terms',    label: 'بنود التسوية المتفق عليها', type: 'textarea', required: false, placeholder: 'ما تم الاتفاق عليه بنداً بنداً...', rows: 4 },
  settlement_commitments: { key: 'settlement_commitments', label: 'التزامات كل طرف',      type: 'textarea', required: false, placeholder: 'التزامات الطرف الأول والطرف الثاني ومواعيد التنفيذ...', rows: 4 },
  opinion_text:        { key: 'opinion_text',        label: 'نص الاستشارة',          type: 'textarea', required: true,  placeholder: 'الصق نص الاستشارة كاملاً هنا...', rows: 5 },
  initial_info:        { key: 'initial_info',        label: 'المعلومات الأولية المتاحة', type: 'textarea', required: false, placeholder: 'ما تعرفه حتى الآن...', rows: 3 },
  events:              { key: 'events',              label: 'الأحداث والتواريخ',     type: 'textarea', required: true,  placeholder: 'رتّب الأحداث مع تواريخها...', rows: 4 },
  planned_action:      { key: 'planned_action',      label: 'الإجراء المُقترح',      type: 'text',     required: true,  placeholder: 'مثال: رفع دعوى فسخ العقد...' },
  goal:                { key: 'goal',                label: 'الهدف المنشود',          type: 'text',     required: false, placeholder: 'مثال: استرداد المبلغ المدفوع...' },
  amount:              { key: 'amount',              label: 'قيمة النزاع التقريبية', type: 'text',     required: false, placeholder: 'مثال: 150,000 ر.س' },
  questions:           { key: 'questions',           label: 'الأسئلة المُحالة',       type: 'textarea', required: true,  placeholder: 'اذكر الأسئلة القانونية المطلوب الرأي فيها...', rows: 3 },
  settlement_willingness: {
    key: 'settlement_willingness', label: 'مستوى الاستعداد للتسوية', type: 'select', required: false,
    options: [
      { value: '', label: '-- اختر --' },
      { value: 'مرتفع', label: 'مرتفع — أُرجّح التسوية' },
      { value: 'متوسط', label: 'متوسط — منفتح على الخيارين' },
      { value: 'منخفض', label: 'منخفض — أُفضّل المضي قضائياً' },
    ],
  },
};

const TASK_TYPES: TaskTypeConfig[] = [
  // ── Group 1: التحليل الشامل ──────────────────────────────────────────────
  { id: 'judicial',            group: 'التحليل الشامل',        icon: '🏛️',  name: 'الاستشارة القضائية',          description: 'تحدّث بحرية عن وضعك القانوني ورباب ستحلّل وتُرشدك',          fields: [] },
  { id: 'case_management',     group: 'التحليل الشامل',        icon: '🗂️',  name: 'إدارة القضية',                description: 'نظّم مراحل القضية ومستنداتها وحدّد الإجراء التالي',          fields: [F.subject, F.facts, F.documents] },
  { id: 'judgment_analysis',   group: 'التحليل الشامل',        icon: '⚖️',  name: 'تحليل الأحكام',               description: 'حلّل الحكم وأسبابه ونقاطه المؤثرة وخيارات الاعتراض',         fields: [F.facts, F.documents] },
  { id: 'comprehensive',       group: 'التحليل الشامل',        icon: '⚖️',  name: 'الاستشارة الشاملة',          description: 'تحليل قانوني متكامل يغطي كل جوانب القضية',                   fields: [] },
  { id: 'fact_gathering',      group: 'التحليل الشامل',        icon: '🔍',  name: 'جمع الوقائع',                  description: 'قائمة أسئلة منظمة لاستيفاء وقائع القضية',                    fields: [F.subject, F.initial_info] },
  { id: 'legal_classification', group: 'التحليل الشامل',       icon: '🏷️',  name: 'التكييف القانوني',             description: 'تحديد الوصف القانوني الدقيق والتكييفات البديلة',             fields: [F.facts] },
  { id: 'evidence_analysis',   group: 'التحليل الشامل',        icon: '📋',  name: 'تحليل الأدلة',                 description: 'تقييم الأدلة وفق نظام الإثبات وتصنيف حجيتها',               fields: [F.facts, F.documents] },
  { id: 'case_strength',       group: 'التحليل الشامل',        icon: '💪',  name: 'تقييم قوة القضية',             description: 'قياس قوة الموقف القانوني والإثباتي',                         fields: [F.facts, F.documents] },

  // ── Group 2: الاستراتيجية ────────────────────────────────────────────────
  { id: 'strengths_weaknesses', group: 'الاستراتيجية',         icon: '⚡',  name: 'نقاط القوة والضعف',           description: 'تحليل مفصّل لكلا الطرفين',                                    fields: [F.facts] },
  { id: 'opponent_defenses',   group: 'الاستراتيجية',          icon: '🛡️',  name: 'توقع دفوع الخصم',             description: 'استباق دفوع الطرف الآخر مع الردود المضادة',                  fields: [F.facts] },
  { id: 'final_recommendation', group: 'الاستراتيجية',         icon: '🎯',  name: 'التوصية النهائية',             description: 'خطة تنفيذية قابلة للتطبيق بخيارات مرتبة',                   fields: [F.facts, F.goal] },

  // ── Group 3: الإجراءات ───────────────────────────────────────────────────
  { id: 'pleadings',           group: 'الإجراءات',              icon: '📝',  name: 'الاعتراضات واللوائح',         description: 'إعداد لائحة أو مذكرة أو اعتراض وفق وقائع القضية',             fields: [F.subject, F.facts, F.documents] },
  { id: 'jurisdiction',        group: 'الإجراءات',              icon: '🏛️',  name: 'تحديد الاختصاص',             description: 'الجهة القضائية المختصة نوعاً وقيمةً ومكاناً',                fields: [F.facts, F.dispute_type] },
  { id: 'deadlines',           group: 'الإجراءات',              icon: '⏰',  name: 'المدد النظامية',              description: 'التقادم والمواعيد الحرجة ترتيباً زمنياً',                    fields: [F.facts, F.dispute_type, F.dispute_date] },
  { id: 'claims',              group: 'الإجراءات',              icon: '📝',  name: 'تحديد الطلبات',               description: 'جميع الطلبات الأصلية والاحتياطية والمستعجلة',                fields: [F.facts] },

  // ── Group 4: المسؤولية والتعويض ──────────────────────────────────────────
  { id: 'risk_analysis',       group: 'المسؤولية والتعويض',    icon: '🧭',  name: 'دراسة المخاطر والتوصيات',     description: 'تحليل المخاطر القانونية وتقديم توصيات عملية قبل اتخاذ القرار', fields: [F.planned_action, F.facts] },
  { id: 'contractual_liability', group: 'المسؤولية والتعويض', icon: '📄',  name: 'المسؤولية العقدية',            description: 'تحليل الأركان والإخلال ونطاق المسؤولية',                     fields: [F.facts, F.contract_terms] },
  { id: 'tortious_liability',  group: 'المسؤولية والتعويض',    icon: '⚖️',  name: 'المسؤولية التقصيرية',         description: 'أركان الضرر والخطأ وعلاقة السببية',                           fields: [F.facts] },
  { id: 'contract_termination', group: 'المسؤولية والتعويض',  icon: '🔓',  name: 'فسخ العقد وإنهاؤه',           description: 'مسارات الإنهاء وآثاره ومخاطره',                               fields: [F.facts, F.termination_clause] },

  // ── Group 5: قضايا متخصصة ───────────────────────────────────────────────
  { id: 'commercial_dispute',  group: 'قضايا متخصصة',          icon: '🏢',  name: 'النزاع التجاري',              description: 'تحليل النزاعات التجارية والإجراءات المناسبة',                 fields: [F.facts, F.amount] },
  { id: 'labor_dispute',       group: 'قضايا متخصصة',          icon: '👷',  name: 'النزاع العمالي',               description: 'المستحقات العمالية وسلامة إجراءات الإنهاء',                  fields: [F.facts, F.service_details] },
  { id: 'real_estate_dispute', group: 'قضايا متخصصة',          icon: '🏠',  name: 'النزاع العقاري',               description: 'الصكوك والحقوق العينية والاختصاص العقاري',                   fields: [F.facts, F.property_info] },
  { id: 'personal_status',     group: 'قضايا متخصصة',          icon: '👨‍👩‍👧',  name: 'الأحوال الشخصية',              description: 'الأسرة والنفقة والحضانة والطلاق والتركات',                   fields: [F.facts] },
  { id: 'enforcement',         group: 'قضايا متخصصة',          icon: '⚒️',  name: 'قضايا التنفيذ',               description: 'إجراءات التنفيذ وأساليبه ودفوع المنفذ ضده',                  fields: [F.enforcement_deed, F.facts] },
  { id: 'arbitration',         group: 'قضايا متخصصة',          icon: '🔐',  name: 'التحكيم',                     description: 'صحة شرط التحكيم والمركز المختص وتنفيذ الحكم',                fields: [F.arbitration_clause, F.facts] },
  { id: 'arbitration_session_management', group: 'التحكيم التجاري', icon: '🗓️', name: 'إدارة جلسات التحكيم', description: 'تنظيم الجلسات والطلبات والإجراءات والمواعيد التالية', fields: [F.arbitration_session_details, F.events, F.documents] },
  { id: 'arbitration_minutes', group: 'التحكيم التجاري',       icon: '📝', name: 'تحرير محاضر التحكيم', description: 'صياغة محضر جلسة منظم ودقيق للمراجعة والاعتماد', fields: [F.session_notes, F.documents] },
  { id: 'arbitration_award_analysis', group: 'التحكيم التجاري', icon: '⚖️', name: 'تحليل أحكام التحكيم', description: 'دراسة الحكم وأسبابه وخيارات التصحيح أو البطلان والتنفيذ', fields: [F.arbitration_award, F.documents] },
  { id: 'settlement',          group: 'قضايا متخصصة',          icon: '🤝',  name: 'تحرير محاضر الصلح',             description: 'إعداد مسودة محضر صلح منظمة من وقائع الاتفاق وبنوده والتزامات الأطراف', fields: [F.subject, F.facts, F.settlement_parties, F.settlement_terms, F.settlement_commitments, F.documents] },

  // ── Group 6: التوثيق والمراجعة ───────────────────────────────────────────
  { id: 'legal_opinion',       group: 'التوثيق والمراجعة',     icon: '📜',  name: 'الرأي القانوني المكتوب',      description: 'رأي رسمي جاهز للتسليم بالبنية المعيارية',                   fields: [F.questions, F.facts] },
  { id: 'peer_review',         group: 'التوثيق والمراجعة',     icon: '🔎',  name: 'مراجعة استشارة خارجية',       description: 'نقد مهني لاستشارة صادرة من محامٍ آخر',                       fields: [F.opinion_text] },
  { id: 'gap_analysis',        group: 'التوثيق والمراجعة',     icon: '🕳️',  name: 'كشف المعلومات الناقصة',       description: 'تحديد الثغرات قبل الشروع في الاستشارة',                      fields: [F.facts, F.subject] },
  { id: 'timeline',            group: 'التوثيق والمراجعة',     icon: '📅',  name: 'بناء التسلسل الزمني',         description: 'ترتيب الأحداث وتحديد الأحداث القانونية الحاسمة',             fields: [F.events] },
  { id: 'client_explanation',  group: 'التوثيق والمراجعة',     icon: '💬',  name: 'شرح للموكّل',                 description: 'تبسيط الرأي القانوني بلغة غير متخصصة',                       fields: [F.opinion_text] },
  { id: 'quality_audit',       group: 'التوثيق والمراجعة',     icon: '✅',  name: 'تدقيق جودة الاستشارة',        description: 'تقرير تدقيق شامل مع تصنيف قابلية التسليم',                   fields: [F.opinion_text] },
];

const TASK_GROUPS = Array.from(new Set(TASK_TYPES.map(t => t.group)));

const TASK_GROUP_EN: Record<string, string> = {
  'التحليل الشامل': 'Comprehensive analysis', 'الاستراتيجية': 'Strategy', 'الإجراءات': 'Procedures',
  'المسؤولية والتعويض': 'Liability and compensation', 'قضايا متخصصة': 'Specialized matters',
  'التحكيم التجاري': 'Commercial arbitration', 'التوثيق والمراجعة': 'Documentation and review',
};
const TASK_EN: Record<string, [string, string]> = {
  judicial: ['Judicial consultation', 'Discuss your legal situation freely and Rabab will analyze and guide you'],
  case_management: ['Case management', 'Organize case stages and documents and identify the next step'],
  judgment_analysis: ['Judgment analysis', 'Analyze the judgment, its reasoning, key points, and objection options'],
  comprehensive: ['Comprehensive consultation', 'Integrated legal analysis covering every aspect of the case'],
  fact_gathering: ['Fact gathering', 'An organized question list to complete the case facts'],
  legal_classification: ['Legal classification', 'Identify the precise legal characterization and alternatives'],
  evidence_analysis: ['Evidence analysis', 'Assess evidence and its probative value'], case_strength: ['Case strength assessment', 'Measure the legal and evidentiary position'],
  strengths_weaknesses: ['Strengths and weaknesses', 'Detailed analysis for both parties'], opponent_defenses: ['Anticipate opponent defenses', 'Anticipate the other party’s defenses and responses'],
  final_recommendation: ['Final recommendation', 'An actionable plan with prioritized options'], pleadings: ['Pleadings and objections', 'Prepare a pleading, memorandum, or objection based on the facts'],
  jurisdiction: ['Jurisdiction', 'Identify the competent judicial authority by type, value, and place'], deadlines: ['Statutory deadlines', 'Limitation periods and critical dates in chronological order'],
  claims: ['Claims', 'Primary, alternative, and urgent claims'], risk_analysis: ['Risk analysis and recommendations', 'Analyze legal risks and provide practical recommendations before a decision'],
  contractual_liability: ['Contractual liability', 'Analyze elements, breach, and scope of liability'], tortious_liability: ['Tort liability', 'Elements of harm, fault, and causation'],
  contract_termination: ['Contract termination', 'Termination routes, effects, and risks'], commercial_dispute: ['Commercial dispute', 'Analyze commercial disputes and suitable procedures'],
  labor_dispute: ['Labor dispute', 'Employment entitlements and termination procedures'], real_estate_dispute: ['Real estate dispute', 'Title deeds, property rights, and real-estate jurisdiction'],
  personal_status: ['Personal status', 'Family, maintenance, custody, divorce, and estates'], enforcement: ['Enforcement matters', 'Enforcement procedures and debtor defenses'],
  arbitration: ['Arbitration', 'Arbitration-clause validity, competent center, and award enforcement'], arbitration_session_management: ['Arbitration session management', 'Organize sessions, requests, procedures, and upcoming dates'],
  arbitration_minutes: ['Arbitration minutes drafting', 'Draft organized, accurate session minutes for review and approval'], arbitration_award_analysis: ['Arbitration award analysis', 'Review the award, its grounds, and correction, annulment, or enforcement options'],
  settlement: ['Settlement minutes drafting', 'Prepare an organized settlement-minutes draft from the agreement facts, terms, and commitments'],
  legal_opinion: ['Written legal opinion', 'A formal opinion ready for delivery in a standard structure'], peer_review: ['External consultation review', 'Professional critique of an opinion issued by another lawyer'],
  gap_analysis: ['Missing-information review', 'Identify gaps before beginning the consultation'], timeline: ['Timeline building', 'Arrange events and identify decisive legal events'],
  client_explanation: ['Client explanation', 'Explain the opinion in non-specialist language'], quality_audit: ['Consultation quality audit', 'Comprehensive audit report with delivery-readiness classification'],
};
const FIELD_EN: Record<string, [string, string]> = {
  facts: ['Consultation facts', 'Parties, what happened, and the timeline...'], documents: ['Available documents', 'Contracts, invoices, correspondence, title deeds...'],
  subject: ['Dispute subject', 'Example: contract termination / financial claim...'], dispute_type: ['Dispute type', 'Labor / commercial / real estate...'],
  dispute_date: ['Approximate dispute date', 'Example: January 2024'], contract_terms: ['Relevant contract terms', 'Paste the terms related to the dispute...'],
  termination_clause: ['Contract termination clause', 'Example: Article 12 of the contract...'], service_details: ['Service period and salary', 'Example: 3 years, SAR 8,000'],
  property_info: ['Property and type', 'Example: residential apartment in Riyadh'], enforcement_deed: ['Enforcement instrument and type', 'Example: final first-instance judgment dated...'],
  arbitration_clause: ['Arbitration clause', 'Paste the arbitration clause from the contract...'], arbitration_session_details: ['Arbitration session details', 'Case number, center, session date, parties, requests, and issues...'],
  session_notes: ['Session notes', 'Attendance, requests and defenses presented, tribunal decisions, and next steps...'], arbitration_award: ['Arbitration award text or summary', 'Paste the award or summarize its facts, ruling, and reasons...'],
  settlement_parties: ['Settlement parties and capacities', 'Names, capacities, and representation details if any...'], settlement_terms: ['Agreed settlement terms', 'What was agreed, term by term...'],
  settlement_commitments: ['Each party’s commitments', 'First and second party commitments and performance dates...'], opinion_text: ['Consultation text', 'Paste the complete consultation text here...'],
  initial_info: ['Available preliminary information', 'What you know so far...'], events: ['Events and dates', 'List events in chronological order with their dates...'],
  planned_action: ['Proposed action', 'Example: file a contract-rescission claim...'], goal: ['Desired outcome', 'Example: recover the amount paid...'],
  amount: ['Approximate amount in dispute', 'Example: SAR 150,000'], questions: ['Questions referred', 'List the legal questions requiring an opinion...'],
  settlement_willingness: ['Willingness to settle', ''],
};
function localizedTaskTypes(lang: string): TaskTypeConfig[] {
  if (lang === 'ar') return TASK_TYPES;
  return TASK_TYPES.map(task => {
    const [name, description] = TASK_EN[task.id] ?? [task.name, task.description];
    return {
      ...task, name, description, group: TASK_GROUP_EN[task.group] ?? task.group,
      fields: task.fields.map(field => {
        const [label, placeholder] = FIELD_EN[field.key] ?? [field.label, field.placeholder ?? ''];
        return {
          ...field, label, placeholder: placeholder || undefined,
          options: field.key === 'settlement_willingness'
            ? [{ value: '', label: '-- Select --' }, { value: 'مرتفع', label: 'High — I prefer settlement' }, { value: 'متوسط', label: 'Medium — open to both options' }, { value: 'منخفض', label: 'Low — I prefer to proceed judicially' }]
            : field.options,
        };
      }),
    };
  });
}

function getServiceTitle(
  taskType?: string,
  service?: string,
  hasIntellectualPropertyType = false,
) {
  if (service === 'corporate-governance-compliance') return 'حوكمة وامتثال الشركات';
  if (service === 'intellectual-property' || hasIntellectualPropertyType) return 'خدمات الملكية الفكرية';
  if (taskType === 'settlement') return 'الصلح والتراضي';
  if (taskType === 'contract_draft' || taskType === 'contract_review' || taskType === 'contract_analysis') {
    return 'صياغة ومراجعة العقود';
  }
  if (taskType === 'arbitration' || taskType?.startsWith('arbitration_')) {
    return 'التحكيم التجاري والوساطة';
  }
  if (taskType === 'consultation' || taskType === 'legal_opinion') return 'الاستشارات القانونية';
  if (taskType) return 'الاستشارات القضائية';
  return undefined;
}

function ServiceContextHeader({ title }: { title?: string }) {
  const { lang } = useLang();
  if (!title) return null;

  return (
    <div className="border-b border-primary/15 bg-primary/5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="w-full flex items-center gap-3 px-3 sm:px-5 lg:px-7 py-3">
        <span className="rounded-full bg-secondary/15 px-2.5 py-1 text-xs font-bold text-secondary">{localized(lang, 'الخدمة', 'Service')}</span>
        <h1 className="text-base font-black text-primary sm:text-lg">{title}</h1>
      </div>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({
  onStart,
  remaining,
  questionsAllowed,
  isStarting,
  requestedTaskType,
  serviceTitle,
  requestedServiceMode,
}: {
  onStart: (
    area: string,
    title: string,
    taskType: string,
    taskParams: Record<string, string>,
    attachment?: PreparedAttachment | null,
    initialMessage?: string,
  ) => void;
  remaining: number | null;
  questionsAllowed: number | null;
  isStarting: boolean;
  requestedTaskType?: string;
  serviceTitle?: string;
  requestedServiceMode?: string;
}) {
  type SetupPhase = 'type-select' | 'country-select' | 'legal-intake' | 'task-select' | 'task-form';
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const taskTypes = localizedTaskTypes(lang);
  const taskGroups = Array.from(new Set(taskTypes.map(task => task.group)));
  const requestedTask = requestedTaskType
    ? taskTypes.find(task => task.id === requestedTaskType)
    : undefined;
  const hasJudicialRequest = requestedTask !== undefined || requestedTaskType === 'judicial';
  const hasLegalRequest = requestedTaskType === 'consultation';
  const [phase, setPhase] = useState<SetupPhase>(
    hasJudicialRequest || hasLegalRequest ? 'country-select' : 'type-select',
  );
  const [selectedTask, setSelectedTask] = useState<TaskTypeConfig | null>(null);
  const [consultationMode, setConsultationMode] = useState<'legal' | 'judicial' | null>(
    hasJudicialRequest ? 'judicial' : hasLegalRequest ? 'legal' : null,
  );
  const [activeGroup, setActiveGroup] = useState(taskGroups[0]);
  const [agreed, setAgreed] = useState(false);
  const [country, setCountry] = useState('');
  const [title, setTitle] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [initialAttachment, setInitialAttachment] = useState<PreparedAttachment | null>(null);
  const responseLanguage = lang;
  const currentServiceTitle = serviceTitle ??
    (consultationMode === 'judicial'
      ? 'الاستشارات القضائية'
      : consultationMode === 'legal'
        ? 'الاستشارات القانونية'
        : 'الاستشارات القانونية والقضائية');

  const setParam = (key: string, val: string) => {
    setParams(prev => ({ ...prev, [key]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const handleTaskSelect = (task: TaskTypeConfig, selectedCountryCode = country) => {
    setSelectedTask(task);
    setTitle(task.name);
    setParams(
      task.id === 'settlement' && requestedServiceMode
        ? { settlement_service: requestedServiceMode }
        : {},
    );
    setErrors({});
    setPhase('task-form');
  };

  const handleCountrySelect = (countryCode: string) => {
    const countryInfo = COUNTRIES.find(c => c.code === countryCode);
    if (!countryInfo) return;
    setCountry(countryCode);

    if (consultationMode === 'legal') {
      setTitle('استشارة قانونية');
      setParams({});
      setPhase('legal-intake');
      return;
    }

    if (requestedTask) {
      handleTaskSelect(requestedTask, countryCode);
      return;
    }

    setPhase('task-select');
  };

  const handleFormSubmit = () => {
    if (!selectedTask) return;
    const e: Record<string, string> = {};
    const clientRequest = params.client_request?.trim() ?? '';
    const hasIntakeContext = Boolean(clientRequest || initialAttachment);
    if (!hasIntakeContext) {
      e.client_request = t('اكتب تفاصيل طلبك أو أرفق مستنداً للبدء', 'Enter request details or attach a document to begin');
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    const countryInfo = COUNTRIES.find(c => c.code === country);
    const areaWithCountry = countryInfo
      ? `${selectedTask.name} — ${countryInfo.flag} ${countryInfo.name}`
      : selectedTask.name;
    onStart(areaWithCountry, title.trim(), selectedTask.id, {
      ...params,
      country: countryInfo?.name ?? '',
      countryCode: country,
      responseLanguage,
    }, initialAttachment, clientRequest || (initialAttachment ? ATTACHMENT_INTAKE_PROMPT : ''));
  };

  // ── Phase 0: نوع الاستشارة ─────────────────────────────────────────────────
  if (phase === 'type-select') {
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden bg-gradient-to-b from-muted/30 to-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <ServiceContextHeader title={currentServiceTitle} />
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-12 max-w-none">
          <div className="text-center mb-10">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-4 shadow-lg">
              <Scale className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold text-primary-foreground mb-2">{t('اختر نوع الاستشارة', 'Choose consultation type')}</h1>
            <p className="text-muted-foreground text-lg">{t('حدّد نوع الاستشارة التي تحتاجها لتحصل على الدعم المناسب', 'Select the consultation you need for the right support')}</p>
            {remaining !== null && questionsAllowed !== null && (
              <div className="mt-4">
                <QuotaBadge remaining={remaining} total={questionsAllowed} />
              </div>
            )}
          </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {/* استشارة قانونية */}
            <button
              onClick={() => {
                setConsultationMode('legal');
                setPhase('country-select');
              }}
              className="group flex flex-col items-center text-center gap-4 p-8 rounded-2xl border-2 border-primary-foreground/75 bg-card shadow-sm shadow-primary-foreground/10 hover:border-primary-foreground hover:shadow-xl transition-all focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
            >
              <span className="text-5xl">📋</span>
              <div>
                <p className="text-lg font-bold text-secondary mb-2">{t('استشارة قانونية', 'Legal consultation')}</p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {t('استفسارات قانونية عامة، حقوق وواجبات، عقود، أنظمة — تحدّث بحرية ورباب تُرشدك', 'General legal questions, rights, obligations, contracts, and regulations — discuss your matter freely.')}
                </p>
              </div>
              <span className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary-foreground/10 text-primary-foreground text-xs font-semibold border border-primary-foreground/30 group-hover:bg-primary-foreground group-hover:text-primary transition-colors">
                {t('ابدأ الدردشة', 'Start chat')}
              </span>
            </button>

            {/* استشارة قضائية */}
            <button
              onClick={() => {
                setConsultationMode('judicial');
                setPhase('country-select');
              }}
              className="group flex flex-col items-center text-center gap-4 p-8 rounded-2xl border-2 border-primary-foreground/75 bg-card shadow-sm shadow-primary-foreground/10 hover:border-primary-foreground hover:shadow-xl transition-all focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
            >
              <span className="text-5xl">🏛️</span>
              <div>
                <p className="text-lg font-bold text-secondary mb-2">{t('استشارة قضائية', 'Judicial consultation')}</p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {t('قضايا أمام المحاكم، دفوع، مذكرات، تكييف قانوني، تحليل متخصص بحسب نوع النزاع', 'Court cases, defenses, pleadings, legal classification, and specialized dispute analysis.')}
                </p>
              </div>
              <span className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary-foreground/10 text-primary-foreground text-xs font-semibold border border-primary-foreground/30 group-hover:bg-primary-foreground group-hover:text-primary transition-colors">
                {t('اختر نوع المهمة', 'Choose task type')}
              </span>
            </button>
          </div>
        </main>
      </div>
    );
  }

  // ── Phase 0.5: mandatory country selection before any consultation ─────────
  if (phase === 'country-select') {
    const isLegal = consultationMode === 'legal';
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden bg-gradient-to-b from-muted/30 to-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <ServiceContextHeader title={currentServiceTitle} />
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-12 max-w-none">
          <button
            type="button"
            onClick={() => setPhase('type-select')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-7"
          >
            <ChevronRight className="w-4 h-4" />
            {t('تغيير نوع الاستشارة', 'Change consultation type')}
          </button>
          <div className="bg-card border-2 border-primary-foreground/75 rounded-2xl shadow-md shadow-primary-foreground/10 p-6 sm:p-8 text-center">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-4 shadow-lg">
              <Globe className="w-7 h-7" />
            </div>
            <p className="text-sm font-bold text-secondary mb-2">{t('الخطوة الأولى', 'First step')}</p>
            <h1 className="text-2xl font-bold text-primary mb-2">
              {t(`اختر دولة ${isLegal ? 'الاستشارة القانونية' : 'القضية'}`, `Choose the ${isLegal ? 'legal consultation' : 'case'} country`)}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl mx-auto mb-7">
              {t('لأن النصوص والاختصاص والإجراءات تختلف بين الدول، سنبني التحليل والمراجع على الدولة التي تختارها.', 'Laws, jurisdiction, and procedures vary by country, so your analysis and references will be based on your selection.')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {COUNTRIES.map(c => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleCountrySelect(c.code)}
                  disabled={isStarting}
                  className="flex flex-col items-center gap-2 rounded-xl border-2 border-primary-foreground/70 bg-muted/30 hover:bg-primary-foreground/5 hover:border-primary-foreground transition-all py-4 px-3 group disabled:opacity-50"
                >
                  <span className="text-4xl leading-none">{c.flag}</span>
                  <span className="text-sm font-bold text-foreground group-hover:text-primary leading-tight text-center">{countryName(c.code, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Phase 0.75: legal consultation intake ─────────────────────────────────
  if (phase === 'legal-intake') {
    const countryInfo = COUNTRIES.find(c => c.code === country);
    const directQuery = params.direct_query?.trim() ?? '';
    const startLegalConsultation = () => {
      if (!directQuery && !initialAttachment) return;
      onStart(
        `استشارة قانونية — ${countryInfo?.flag ?? ''} ${countryInfo?.name ?? ''}`.trim(),
        'استشارة قانونية',
        'consultation',
        { country: countryInfo?.name ?? '', countryCode: country, responseLanguage },
        initialAttachment,
        directQuery || ATTACHMENT_INTAKE_PROMPT,
      );
    };
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden bg-gradient-to-b from-muted/30 to-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <ServiceContextHeader title={currentServiceTitle} />
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-8 max-w-none">
          <button
            type="button"
            onClick={() => setPhase('country-select')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
          >
            <ChevronRight className="w-4 h-4" />
            {t('تغيير الدولة', 'Change country')}
          </button>
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-secondary mb-2">{t('اعرض موضوعك أو أرفق مستنداً', 'Describe your matter or attach a document')}</h1>
            <p className="text-sm text-foreground/80">{t('سنبدأ الحوار بتحليل المعلومات المتاحة، ثم نسأل فقط عن البيانات المؤثرة قبل الإجابة الختامية.', 'We will analyze the available information, then ask only about details that affect the final answer.')}</p>
          </div>
          <div className="bg-card border-2 border-primary-foreground/75 rounded-2xl shadow-sm shadow-primary-foreground/10 p-6 space-y-5">
            <div className="flex items-center gap-2 rounded-xl border border-primary-foreground/35 bg-primary-foreground/5 px-3 py-2 text-xs font-bold text-primary">
              <span>{countryInfo?.flag}</span>
               <span>{countryInfo ? countryName(countryInfo.code, lang) : ''}</span>
            </div>
            <ConsultationAttachmentPicker
              attachment={initialAttachment}
              onAttachmentChange={setInitialAttachment}
              disabled={isStarting}
            />
            <div className="space-y-1.5">
              <label className="text-sm font-bold text-foreground">{t('أدرج استشارتك ووقائعك', 'Enter your consultation and facts')} <span className="font-normal text-muted-foreground">{t('(اختياري عند إرفاق ملف)', '(optional when attaching a file)')}</span></label>
              <textarea
                value={params.direct_query ?? ''}
                onChange={event => setParam('direct_query', event.target.value)}
                placeholder={t('اكتب ما لديك من وقائع أو سؤالك، وسنستخرج المعلومات من كتابتك أو من المرفق...', 'Write the facts or your question; we will extract information from your text or attachment...')}
                rows={5}
                className="w-full rounded-xl border-2 border-primary-foreground/70 bg-background px-3 py-3 text-sm leading-relaxed focus:outline-none focus:border-primary-foreground focus:ring-2 focus:ring-primary-foreground/40"
                dir="auto"
              />
            </div>
            <Button
              onClick={startLegalConsultation}
              disabled={(!directQuery && !initialAttachment) || isStarting}
              className="w-full h-12 text-base font-bold shadow-md"
            >
              {isStarting ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <MessageSquare className="w-5 h-5 ml-2" />}
              {isStarting ? t('جارٍ إنشاء الاستشارة...', 'Creating consultation...') : t('ابدأ الحوار القانوني', 'Start legal conversation')}
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ── Phase 1: Task Type Selector ────────────────────────────────────────────
  if (phase === 'task-select') {
    const visibleTasks = taskTypes.filter(t => t.group === activeGroup);
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden bg-gradient-to-b from-muted/30 to-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <ServiceContextHeader title={currentServiceTitle} />
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-8 max-w-none">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-secondary mx-auto mb-3 shadow-lg">
              <Scale className="w-7 h-7" />
            </div>
             <h1 className="text-2xl font-bold text-primary-foreground mb-1">{t('اختر نوع المهمة القانونية', 'Choose legal task type')}</h1>
            <p className="text-muted-foreground text-sm mb-3">
               {t('حدّد نوع الاستشارة لتحصل على تحليل متخصص ودقيق', 'Select a consultation type for focused, accurate analysis')}
            </p>
            {country && (
              <button
                type="button"
                onClick={() => setPhase('country-select')}
                className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 transition-colors"
              >
                <span>{COUNTRIES.find(c => c.code === country)?.flag}</span>
                <span>{countryName(country, lang)}</span>
                 <span className="text-primary/60 underline">{t('تغيير', 'Change')}</span>
              </button>
            )}
            {remaining !== null && questionsAllowed !== null && (
              <QuotaBadge remaining={remaining} total={questionsAllowed} />
            )}
          </div>

          <div className="mb-4">
            <ConsultationAttachmentPicker
              attachment={initialAttachment}
              onAttachmentChange={setInitialAttachment}
              disabled={isStarting}
            />
          </div>

          {/* حقل الكتابة المباشر */}
          <div className="mb-8">
            <div className="relative bg-card border-2 border-primary-foreground/45 rounded-2xl shadow-sm focus-within:border-primary-foreground transition-colors">
              <textarea
                value={params['direct_query'] ?? ''}
                onChange={e => setParam('direct_query', e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey && ((params['direct_query'] ?? '').trim().length > 3 || initialAttachment)) {
                    e.preventDefault();
                    const q = (params['direct_query'] ?? '').trim();
                    const countryInfo = COUNTRIES.find(c => c.code === country);
                    const area = countryInfo ? `استشارة قضائية — ${countryInfo.flag} ${countryInfo.name}` : 'استشارة قضائية';
                    onStart(area, 'استشارة قضائية', 'judicial', {
                      facts: q,
                      country: countryInfo?.name ?? '',
                      countryCode: country,
                      responseLanguage,
                    }, initialAttachment, q || ATTACHMENT_INTAKE_PROMPT);
                  }
                }}
                 placeholder={t('أدرج استشارتك أو الوقائع المتاحة لديك، وسنستخرج المعلومات منها...', 'Enter your consultation or available facts and we will extract the information...')}
                rows={3}
                className="w-full bg-transparent resize-none rounded-2xl px-5 py-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                 dir="auto"
              />
                <div className="flex items-center justify-between px-4 pb-3">
                 <p className="text-xs text-muted-foreground">{t('أو اختر نوعاً متخصصاً من البطاقات أدناه', 'Or choose a specialized type from the cards below')}</p>
                <button
                  onClick={() => {
                    const q = (params['direct_query'] ?? '').trim();
                      if (q.length < 4 && !initialAttachment) return;
                    const countryInfo = COUNTRIES.find(c => c.code === country);
                    const area = countryInfo ? `استشارة قضائية — ${countryInfo.flag} ${countryInfo.name}` : 'استشارة قضائية';
                    onStart(area, 'استشارة قضائية', 'judicial', {
                      facts: q,
                      country: countryInfo?.name ?? '',
                      countryCode: country,
                      responseLanguage,
                      }, initialAttachment, q || ATTACHMENT_INTAKE_PROMPT);
                  }}
                    disabled={(params['direct_query'] ?? '').trim().length < 4 && !initialAttachment}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-secondary text-primary font-bold text-sm hover:bg-secondary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
                >
                  <MessageSquare className="w-4 h-4" />
                   {t('ابدأ الاستشارة', 'Start consultation')}
                </button>
              </div>
            </div>
          </div>

          {/* Group Tabs */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {taskGroups.map(g => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors",
                  activeGroup === g
                    ? "bg-primary-foreground text-primary border-primary-foreground"
                    : "bg-card text-muted-foreground border-primary-foreground/50 hover:border-primary-foreground hover:text-primary-foreground"
                )}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Task Cards Grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visibleTasks.map(task => (
              <button
                key={task.id}
                onClick={() => handleTaskSelect(task)}
                className="group text-start bg-card border-2 border-primary-foreground/70 rounded-xl p-4 hover:border-primary-foreground hover:shadow-md hover:shadow-primary-foreground/10 transition-all focus:outline-none focus:ring-2 focus:ring-primary-foreground/50"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0 mt-0.5">{task.icon}</span>
                  <div className="min-w-0">
                    <p className="font-bold text-base text-primary-foreground group-hover:text-primary-foreground leading-snug">{task.name}</p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{task.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // ── Phase 2: Task Form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden bg-gradient-to-b from-muted/30 to-background" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <Navbar />
      <ServiceContextHeader title={currentServiceTitle} />
        <main className="flex-1 w-full px-3 sm:px-5 lg:px-7 py-8 max-w-none">
        {/* Back + Task chip */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setPhase('task-select')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <span className="text-lg leading-none">←</span>
            <span>{t('تغيير نوع المهمة', 'Change task type')}</span>
          </button>
          {selectedTask && (
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1 text-sm font-bold text-primary">
              <span>{selectedTask.icon}</span>
              <span>{selectedTask.name}</span>
            </div>
          )}
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary mb-1">{selectedTask?.name}</h1>
          <p className="text-muted-foreground text-base">{selectedTask?.description}</p>
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl p-5 mb-5 border-2 bg-destructive/10 border-destructive/60">
          <div className="flex gap-3 items-start">
            <ShieldAlert className="w-6 h-6 shrink-0 mt-0.5 text-destructive" />
            <div>
              <h4 className="font-bold mb-2 text-lg text-destructive">{t('إخلاء مسؤولية قانوني', 'Legal disclaimer')}</h4>
              <p className="text-base leading-relaxed mb-3 text-foreground">
                {t('الإجابات ', 'Responses are ')}<strong>{t('أولية وإرشادية', 'preliminary and informational')}</strong>{t(' مدعومة بالذكاء الاصطناعي،', ', supported by AI, and ')}
                <strong>{t(' ولا تُعدّ رأياً قانونياً نهائياً', 'do not constitute a final legal opinion')}</strong>{t(' يُعتد به أمام المحاكم. RABAB LEGAL AI تخلي مسؤوليتها عن أي تصرف دون الرجوع لمستشار قانوني مختص.', 'that can be relied on before courts. RABAB LEGAL AI disclaims responsibility for action taken without consulting a qualified legal adviser.')}
              </p>
              <p className="text-base leading-relaxed mb-3 text-foreground">
                {t('عند الرغبة في التأكيد أو الحصول على رأي متخصص، يمكنك ', 'For confirmation or a specialist opinion, you can ')}
                <Link href="/appointment" className="font-extrabold text-secondary underline decoration-secondary/60 underline-offset-4 hover:text-secondary/80">
                  {t('الرجوع إلى المحامية د. رباب أحمد المعبي', 'consult Dr. Rabab Ahmed Al-Moabi')}
                </Link>
                .
              </p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div
                  onClick={() => setAgreed(!agreed)}
                  className={cn(
                    "w-6 h-6 rounded border-2 flex items-center justify-center transition-colors cursor-pointer flex-shrink-0",
                    agreed ? "bg-secondary border-secondary" : "bg-white"
                  )}
                >
                  {agreed && <CheckCircle2 className="w-4 h-4 text-primary" />}
                </div>
                <span className="text-base font-bold text-foreground">{t('قرأت إخلاء المسؤولية وأوافق عليه', 'I have read and agree to the disclaimer')}</span>
              </label>
            </div>
          </div>
        </div>

        {/* Country Gate — must pick before the form appears */}
        {!country && (
          <div className="bg-card border-2 border-primary-foreground/75 rounded-2xl shadow-md shadow-primary-foreground/10 p-6 mb-4 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-secondary">
              <Globe className="w-5 h-5" />
              <h2 className="text-lg font-bold">{t('اختاري دولة الإقامة / النزاع أولاً', 'Choose the country of residence / dispute first')}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('تختلف الأنظمة القانونية بين دول الخليج — الاختيار يضمن دقة الرأي القانوني وصحة المراجع', 'Legal systems differ across Gulf states; your selection helps ensure accurate analysis and sources.')}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              {COUNTRIES.map(c => (
                <button
                  key={c.code}
                  onClick={() => setCountry(c.code)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-primary-foreground/70 bg-muted/30 hover:bg-primary-foreground/5 hover:border-primary-foreground transition-all py-3 px-2 group"
                >
                  <span className="text-3xl leading-none">{c.flag}</span>
                  <span className="text-sm font-bold text-foreground group-hover:text-primary leading-tight text-center">{countryName(c.code, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form — shown only after country is selected */}
        <div className={cn("bg-card border-2 border-primary-foreground/75 rounded-xl shadow-sm shadow-primary-foreground/10 p-6 space-y-5", !country && "opacity-40 pointer-events-none select-none")}>
          {/* Country — shown as selected chip once chosen */}
          <div className="space-y-1.5">
            <label className="text-base font-bold text-foreground">{t('دولة الإقامة / النزاع', 'Country of residence / dispute')}</label>
            {country ? (
              <div className="flex items-center justify-between rounded-xl border-2 border-primary-foreground/60 bg-primary-foreground/5 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{COUNTRIES.find(c => c.code === country)?.flag}</span>
                  <span className="font-bold text-base text-foreground">{countryName(country, lang)}</span>
                </div>
                <button
                  onClick={() => setCountry('')}
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors underline"
                >
                  {t('تغيير', 'Change')}
                </button>
              </div>
            ) : (
              <div className="h-11 rounded-xl border-2 border-dashed border-primary-foreground/40 bg-primary-foreground/5 flex items-center justify-center text-sm text-muted-foreground">
                {t('← اختاري الدولة من الأعلى أولاً', '← Choose a country above first')}
              </div>
            )}
          </div>

          <ConsultationAttachmentPicker
            attachment={initialAttachment}
            onAttachmentChange={setInitialAttachment}
            disabled={isStarting}
          />

          <div className="rounded-xl border border-primary-foreground/30 bg-primary-foreground/5 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
            {t('يمكنك الاكتفاء بالمرفق أو كتابة استشارتك أدناه. جميع الحقول التالية اختيارية وتساعد على تنظيم التحليل فقط.', 'You may use only an attachment or write your consultation below. All following fields are optional and only help organize the analysis.')}
          </div>

          <div className="space-y-1.5">
            <label className="text-base font-bold text-primary">
              {t('تفاصيل طلبك', 'Request details')} <span className="font-normal text-muted-foreground">{t('(اكتب بحرية)', '(write freely)')}</span>
            </label>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('اكتب ما لديك من وقائع أو ما تريد الوصول إليه. سنستخرج المعلومات من كتابتك أو من المرفق قبل بدء التحليل.', 'Write the facts you have or the outcome you seek. We will extract information from your text or attachment before analysis begins.')}
            </p>
            <textarea
              value={params.client_request ?? ''}
              onChange={event => setParam('client_request', event.target.value)}
              placeholder={t('مثال: أريد معرفة موقفي القانوني والخطوة المناسبة في هذه الحالة...', 'Example: I want to know my legal position and the appropriate next step...')}
              rows={4}
              className="w-full rounded-xl border-2 border-primary-foreground/70 bg-background px-4 py-3 text-base leading-relaxed focus:outline-none focus:border-primary-foreground focus:ring-2 focus:ring-primary-foreground/40"
              dir="auto"
            />
            {errors.client_request && <p className="text-xs text-destructive">{errors.client_request}</p>}
          </div>

          {/* Task-specific fields — optional guidance */}
          {selectedTask?.fields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-base font-bold text-primary">
                {field.label}
                <span className="font-normal text-muted-foreground mx-1">{t('(اختياري)', '(optional)')}</span>
              </label>
              {field.type === 'textarea' ? (
                <textarea
                  value={params[field.key] ?? ''}
                  onChange={e => setParam(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows ?? 3}
                  dir="auto"
                  style={{ resize: 'vertical' }}
                  className="w-full rounded-lg border-2 border-primary-foreground/70 bg-background px-4 py-3 text-base focus:outline-none focus:border-primary-foreground focus:ring-2 focus:ring-primary-foreground/40"
                />
              ) : field.type === 'select' ? (
                <select
                  value={params[field.key] ?? ''}
                  onChange={e => setParam(field.key, e.target.value)}
                   className="w-full h-12 rounded-lg border-2 border-primary-foreground/70 bg-background px-4 text-base focus:outline-none focus:border-primary-foreground focus:ring-2 focus:ring-primary-foreground/40"
                  dir="auto"
                >
                  {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input
                  value={params[field.key] ?? ''}
                  onChange={e => setParam(field.key, e.target.value)}
                  placeholder={field.placeholder}
                   className="w-full h-12 rounded-lg border-2 border-primary-foreground/70 bg-background px-4 text-base focus:outline-none focus:border-primary-foreground focus:ring-2 focus:ring-primary-foreground/40"
                />
              )}
              {errors[field.key] && <p className="text-xs text-destructive">{errors[field.key]}</p>}
            </div>
          ))}

          <Button
            onClick={handleFormSubmit}
            disabled={!agreed || !country || isStarting}
            className="w-full h-12 text-base font-bold shadow-md"
          >
            {isStarting ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : null}
            {isStarting ? t('جارٍ إنشاء الاستشارة...', 'Creating consultation...') : t('ابدأ الاستشارة الآن', 'Start consultation now')}
          </Button>

          {!country && (
            <p className="text-center text-xs text-destructive font-medium">{t('⬆ اختاري الدولة أولاً قبل المتابعة', '⬆ Choose a country before continuing')}</p>
          )}
          {country && !agreed && (
            <p className="text-center text-xs text-muted-foreground">{t('يجب الموافقة على إخلاء المسؤولية أولاً', 'You must accept the disclaimer first')}</p>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Confidence Badge ─────────────────────────────────────────────────────────
function ConfidenceBadge({ v }: { v: MessageVerification }) {
  const { toast } = useToast();
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);

  const handleCopy = (s: VerificationSource, i: number) => {
    const hasPage = s.sourceType === 'kb' && s.pageStart != null;
    const pageLabel = hasPage
      ? t(`ص${s.pageStart}${s.pageEnd != null && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''}`, `p. ${s.pageStart}${s.pageEnd != null && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''}`)
      : null;
    const text = pageLabel ? `${s.name} — ${pageLabel}` : s.name;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(i);
      toast({ title: t('تم نسخ المرجع', 'Reference copied'), description: text });
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  const cfg = v.confidence === 'high'
    ? { bg: 'bg-green-50 border-green-200 text-green-800', icon: '✓', label: t('موثق من المصادر', 'Verified from sources') }
    : v.confidence === 'medium'
    ? { bg: 'bg-amber-50 border-amber-200 text-amber-800', icon: '⚡', label: t('تحقق جزئي', 'Partially verified') }
    : { bg: 'bg-red-50 border-red-200 text-red-700', icon: '⚠', label: t('يحتاج تحقق يدوي', 'Manual verification needed') };

  return (
    <div className={cn('mt-2 pt-2 border-t border-border/30 space-y-1.5')}>
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className={cn('inline-flex items-center gap-1.5 text-xs font-semibold border rounded-lg px-2 py-0.5', cfg.bg)}>
          <span>{cfg.icon}</span>
          <span>{cfg.label}</span>
          <span className="opacity-60">({v.confidenceScore}%)</span>
          {v.blockedCount > 0 && (
            <span className="mr-1 bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">
               {t(`${v.blockedCount} غير موثق`, `${v.blockedCount} unverified`)}
            </span>
          )}
      </div>
      {v.sources.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
             {t(`📚 ${v.sources.length} مصدر مُستند إليه`, `📚 ${v.sources.length} cited source${v.sources.length === 1 ? '' : 's'}`)}
          </summary>
          <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
            {v.sources.map((s, i) => {
              const hasPage = s.sourceType === 'kb' && s.pageStart != null;
              const pageLabel = hasPage
                ? t(`ص${s.pageStart}${s.pageEnd != null && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''}`, `p. ${s.pageStart}${s.pageEnd != null && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ''}`)
                : null;
              const pdfUrl = hasPage && s.documentId
                ? `${API_BASE}/api/documents/${s.documentId}/view#page=${s.pageStart}`
                : null;
              return (
              <div key={i} className="flex items-start gap-1.5 bg-muted/30 rounded-lg px-2 py-1.5">
                <span className={cn('shrink-0 font-bold', s.sourceType === 'web' ? 'text-blue-600' : 'text-green-600')}>
                  {s.sourceType === 'web' ? '🌐' : '📚'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap">
                     <span className="font-medium text-foreground/80 truncate" dir="auto">{s.name}</span>
                    <span className="text-muted-foreground shrink-0">{s.similarity}%</span>
                    {pageLabel && (
                      <span className="shrink-0 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {pageLabel}
                      </span>
                    )}
                    {pdfUrl && (
                      <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 text-[10px] text-blue-600 hover:underline">
                        {t(`↗ فتح عند ${pageLabel}`, `↗ Open at ${pageLabel}`)}
                      </a>
                    )}
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-600 hover:underline shrink-0">↗</a>
                    )}
                    <button
                      onClick={() => handleCopy(s, i)}
                       title={t('نسخ مرجع الاستشهاد', 'Copy citation reference')}
                       aria-label={t('نسخ مرجع الاستشهاد', 'Copy citation reference')}
                       className="shrink-0 ms-auto p-0.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      {copiedIdx === i
                        ? <ClipboardCheck className="w-3 h-3 text-green-600" />
                        : <Clipboard className="w-3 h-3" />}
                    </button>
                  </div>
                   <p className="text-muted-foreground/70 text-[10px] mt-0.5 line-clamp-2" dir="auto">{s.snippet}</p>
                </div>
              </div>
              );
            })}
          </div>
        </details>
      )}
      </div>
    </div>
  );
}

// ─── Chat Bubble ─────────────────────────────────────────────────────────────
function ChatBubble({
  msg,
  consultationId,
  onRated,
  isTrial,
  isDraftService,
}: {
  msg: ChatMessage;
  consultationId?: number;
  onRated?: (messageId: number) => void;
  isTrial?: boolean;
  isDraftService?: boolean;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const isUser = msg.role === 'user';
  const [rating, setRating] = React.useState<'idle' | 'loading' | 'done'>(
    msg.rated ? 'done' : 'idle'
  );

  const handleRate = async () => {
    if (rating !== 'idle' || !msg.messageId || !consultationId) return;
    setRating('loading');
    try {
      await fetch(`${API_BASE}/api/consultations/${consultationId}/messages/${msg.messageId}/rate`, {
        method: 'POST',
        credentials: 'include',
      });
      setRating('done');
      onRated?.(msg.messageId);
    } catch {
      setRating('idle');
    }
  };

  return (
    <div className={cn("flex gap-3 mb-4", isUser ? "flex-row" : "flex-row-reverse")}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5",
        isUser
          ? "bg-primary text-primary-foreground"
          : "bg-secondary text-primary border border-secondary/50"
      )}>
        {isUser ? t("أنت", "You") : <Scale className="w-4 h-4" />}
      </div>
      <div className={cn(
        "rounded-2xl shadow-sm",
        isUser
          ? "max-w-[72%] px-4 py-3 text-sm leading-relaxed bg-primary text-primary-foreground rounded-tr-sm"
          : msg.error
            ? "max-w-[92%] px-5 py-4 text-sm leading-loose bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm"
            : "max-w-[92%] px-5 py-4 text-[15px] leading-loose bg-card border border-border/60 text-foreground rounded-tl-sm"
      )}>
        {msg.error && <AlertCircle className="w-4 h-4 mb-1" />}
        {isUser ? (
          <div className="space-y-2">
            {msg.attachmentName && (
              <div className="flex items-center gap-1.5 rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 px-2.5 py-1.5 text-xs">
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate" dir="auto">{msg.attachmentName}</span>
              </div>
            )}
            <div className="whitespace-pre-wrap break-words" dir="auto">
              {msg.content}
            </div>
          </div>
        ) : isTrial && isDraftService && !msg.error ? (
          /* علامة مائية للتجربة المجانية على المسودات */
            <div className="relative">
             <div className="select-none pointer-events-none opacity-80" dir="auto"><LegalMarkdown>{msg.content}</LegalMarkdown></div>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none" aria-hidden>
              <span className="text-5xl font-black text-primary/6 rotate-[-30deg] whitespace-nowrap">{t('للمعاينة فقط', 'Preview only')}</span>
            </div>
            <div className="mt-3 pt-2 border-t border-border/30 flex justify-end" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
              <a href="/pricing" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-primary rounded-lg text-xs font-bold hover:bg-secondary/90 transition-colors">
                <Download className="w-3 h-3" />{t('اشترك للتصدير', 'Subscribe to export')}
              </a>
            </div>
          </div>
        ) : (
          <div dir="auto"><LegalMarkdown>{msg.content}</LegalMarkdown></div>
        )}
        {/* مصادر الاستشارة القانونية لا تُعرض هنا — تخص خدمة الاستشارة القضائية */}
        {!isUser && !msg.error && (
          <>
            {/* ── خاتمة الرد الإلزامية ── */}
            <div className="mt-4 pt-3 border-t border-border/30 space-y-2">
              <p className="text-[10px] leading-relaxed text-muted-foreground/50 text-start" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {t('هذه المعلومات لأغراض معرفية وليست استشارة قانونية ملزمة. للاستفسارات الإضافية:', 'This information is for educational purposes and is not binding legal advice. For further questions:')}
              </p>
              <div className="flex justify-end" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <a
                  href="https://wa.me/966504647649"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-200 text-green-700 rounded-full text-[11px] font-bold hover:bg-green-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.555 4.12 1.523 5.85L0 24l6.31-1.502A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.814 9.814 0 01-4.9-1.307l-.351-.208-3.645.868.934-3.542-.228-.363A9.79 9.79 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.432 0 9.818 4.388 9.818 9.818 0 5.432-4.386 9.818-9.818 9.818z"/>
                  </svg>
                  {t('تواصلي معنا عبر واتساب', 'Contact us on WhatsApp')}
                </a>
              </div>
            </div>
            {msg.messageId && consultationId && (
              <div className="flex items-center gap-2 mt-2 pt-1.5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                <button
                  onClick={handleRate}
                  disabled={rating !== 'idle'}
                  className={cn(
                    "flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1 transition-all border",
                    rating === 'done'
                      ? "bg-green-50 border-green-200 text-green-700 cursor-default"
                      : "bg-muted/60 border-border/50 text-muted-foreground hover:bg-primary/10 hover:border-primary/30 hover:text-primary active:scale-95"
                  )}
                >
                  {rating === 'loading' ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <ThumbsUp className={cn("w-3 h-3", rating === 'done' ? "fill-green-600 text-green-600" : "")} />
                  )}
                  {rating === 'done' ? t('شكراً على تقييمكم', 'Thank you for your rating') : t('الإجابة مفيدة؟', 'Was this answer helpful?')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ phase }: { phase?: 'searching' | 'generating' | null }) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const isSearching = phase === 'searching';
  const isGenerating = phase === 'generating';
  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-secondary text-primary border border-secondary/50 flex items-center justify-center shrink-0">
        <Scale className="w-4 h-4" />
      </div>
      {isSearching ? (
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground/70">{t('جارٍ إعداد الرأي القانوني…', 'Preparing legal opinion…')}</span>
          <div className="flex items-center gap-1 mr-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      ) : isGenerating ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm flex items-center gap-2">
          <span className="text-lg leading-none animate-pulse">⚖️</span>
          <span className="text-xs font-semibold text-amber-800">{t('جارٍ صياغة الرأي القانوني…', 'Drafting legal opinion…')}</span>
          <div className="flex items-center gap-1 mr-1">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border/60 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1.5 h-5">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary/40 animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Task Params Summary ──────────────────────────────────────────────────────
const FIELD_LABEL_MAP: Record<string, string> = {
  facts: 'وقائع الاستشارة',
  documents: 'المستندات المتوفرة',
  subject: 'موضوع النزاع',
  dispute_type: 'نوع النزاع',
  dispute_date: 'تاريخ نشأة النزاع',
  contract_terms: 'بنود العقد',
  termination_clause: 'بند الإنهاء',
  service_details: 'مدة الخدمة والراتب',
  property_info: 'العقار ونوعه',
  enforcement_deed: 'السند التنفيذي',
  arbitration_clause: 'شرط التحكيم',
  arbitration_session_details: 'تفاصيل جلسة التحكيم',
  session_notes: 'ملاحظات الجلسة',
  arbitration_award: 'حكم التحكيم',
  opinion_text: 'نص الاستشارة',
  initial_info: 'المعلومات الأولية',
  events: 'الأحداث والتواريخ',
  planned_action: 'الإجراء المُقترح',
  goal: 'الهدف المنشود',
  amount: 'قيمة النزاع',
  questions: 'الأسئلة المُحالة',
  settlement_willingness: 'مستوى الاستعداد للتسوية',
  responseLanguage: 'لغة الاستشارة',
};

function TaskParamsSummary({
  taskParams,
  onEdit,
}: {
  taskParams: Record<string, string>;
  onEdit?: () => void;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(taskParams).filter(([, v]) => v?.trim());
  if (entries.length === 0) return null;

  return (
    <div className="shrink-0 bg-secondary/5 border-b border-secondary/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="px-4 py-1.5 flex items-center justify-between">
        <button
          onClick={() => setExpanded(p => !p)}
          className="flex items-center gap-1.5 text-xs text-secondary/80 hover:text-secondary transition-colors"
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span className="font-semibold">{t(`📋 معطيات المهمة المحفوظة (${entries.length} حقل)`, `📋 Saved task details (${entries.length} field${entries.length === 1 ? '' : 's'})`)}</span>
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="flex items-center gap-1 text-xs text-primary/60 hover:text-primary transition-colors border border-border/40 rounded-md px-2 py-0.5 hover:bg-primary/5"
          >
            <Pencil className="w-3 h-3" />
            <span>{t('تعديل المعطيات', 'Edit details')}</span>
          </button>
        )}
      </div>
      {expanded && (
        <div className="px-4 pb-3 space-y-1.5 max-h-52 overflow-y-auto">
          {entries.map(([key, val]) => (
            <div key={key} className="text-xs">
              <span className="font-bold text-primary/70">{lang === 'ar' ? (FIELD_LABEL_MAP[key] ?? key) : (FIELD_EN[key]?.[0] ?? (key === 'responseLanguage' ? 'Consultation language' : key))}:</span>{' '}
              <span className="text-foreground/80 whitespace-pre-wrap" dir="auto">{key === 'responseLanguage' ? responseLanguageLabel(val) : val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edit Params Modal ────────────────────────────────────────────────────────
function EditParamsModal({
  taskType,
  currentParams,
  area,
  onSave,
  onClose,
}: {
  taskType: string;
  currentParams: Record<string, string>;
  area: string;
  onSave: (params: Record<string, string>) => void;
  onClose: () => void;
}) {
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const taskConfig = localizedTaskTypes(lang).find(t => t.id === taskType);
  const [params, setParams] = useState<Record<string, string>>({ ...currentParams });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setParam = (key: string, val: string) => {
    setParams(prev => ({ ...prev, [key]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const handleSave = () => {
    if (!taskConfig) { onSave(params); return; }
    const e: Record<string, string> = {};
    for (const f of taskConfig.fields) {
      if (f.required && !params[f.key]?.trim()) {
        e[f.key] = t(`حقل "${f.label}" إلزامي`, `The "${f.label}" field is required`);
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onSave(params);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <div className="bg-card w-full sm:max-w-lg sm:mx-4 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">
        {/* accent bar */}
        <div className="h-1.5 bg-gradient-to-l from-secondary via-yellow-400 to-secondary shrink-0" />

        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
          <div>
            <h3 className="font-bold text-base text-primary">{t('تعديل معطيات المهمة', 'Edit task details')}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {taskConfig ? `${taskConfig.icon} ${taskConfig.name}` : area}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
            {t('✏️ التعديلات هنا ستُحقن في رسالة النظام للرسالة التالية فقط — المحادثة السابقة لن تتغير.', '✏️ Changes here are added to the system message for the next message only; the prior conversation will not change.')}
          </div>

          {taskConfig ? (
            taskConfig.fields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-sm font-bold text-foreground">
                  {field.label}
                  {field.required && <span className="text-destructive mr-0.5">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={params[field.key] ?? ''}
                    onChange={e => setParam(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={field.rows ?? 3}
                    dir="auto"
                    style={{ resize: 'vertical' }}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={params[field.key] ?? ''}
                    onChange={e => setParam(field.key, e.target.value)}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    value={params[field.key] ?? ''}
                    onChange={e => setParam(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full h-11 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
                {errors[field.key] && <p className="text-xs text-destructive">{errors[field.key]}</p>}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">{t('لا توجد حقول قابلة للتعديل لهذا النوع من المهام.', 'There are no editable fields for this task type.')}</p>
          )}
        </div>

        {/* footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border/40 flex gap-3">
          <Button onClick={handleSave} className="flex-1 font-bold">
            {t('حفظ التعديلات', 'Save changes')}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1">
            {t('إلغاء', 'Cancel')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Chat Screen ──────────────────────────────────────────────────────────────
function ChatScreen({
  consultationId,
  area,
  title,
  taskType,
  taskParams: initialTaskParams,
  initialMessages,
  initialAttachment,
  initialMessage,
  remaining,
  questionsAllowed,
  onReset,
}: {
  consultationId: number;
  area: string;
  title: string;
  taskType?: string;
  taskParams?: Record<string, string>;
  initialMessages: ChatMessage[];
  initialAttachment?: PreparedAttachment | null;
  initialMessage?: string;
  remaining: number | null;
  questionsAllowed: number | null;
  onReset: () => void;
}) {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState(initialMessage ?? '');
  const [sending, setSending] = useState(false);
  const [sendingPhase, setSendingPhase] = useState<'searching' | 'generating' | null>(null);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [confirmedAttachment, setConfirmedAttachment] = useState<PreparedAttachment | null>(initialAttachment ?? null);
  const [extracting, setExtracting] = useState(false);
  const [extractReview, setExtractReview] = useState<{
    open: boolean;
    text: string;
    fileName: string;
    truncated: boolean;
  }>({ open: false, text: '', fileName: '', truncated: false });
  const [quota, setQuota] = useState(remaining);
  const [localTaskParams, setLocalTaskParams] = useState<Record<string, string>>(initialTaskParams ?? {});
  const serviceTitle = getServiceTitle(
    taskType,
    localTaskParams.service,
    Boolean(localTaskParams.ipType),
  );
  const [editingParams, setEditingParams] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);
  const queryClient = useQueryClient();
  const { data: sub } = useGetMySubscription();
  const isTrial = sub?.package?.type === 'free';
  const canExport = sub != null && !isTrial;
  const isDraftService = taskType === 'pleadings' || taskType === 'contract_draft';
  const { confirm: confirmQuota } = useQuotaConfirm();
  const [isMaximized, setIsMaximized] = React.useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [customLanguage, setCustomLanguage] = useState('');
  const autoStartInitialMessageRef = useRef(false);
  const selectedResponseLanguage = responseLanguageLabel(localTaskParams.responseLanguage);

  const setResponseLanguage = async (languageCode: string) => {
    const updatedParams = { ...localTaskParams, responseLanguage: languageCode };
    setLocalTaskParams(updatedParams);
    setLanguageMenuOpen(false);

    try {
      const response = await fetch(`${API_BASE}/api/consultations/${consultationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ taskParams: updatedParams }),
      });
      if (!response.ok) throw new Error(t('تعذر حفظ لغة الاستشارة', 'Unable to save consultation language'));
      toast({
        title: t('تم تحديث لغة الاستشارة', 'Consultation language updated'),
        description: t(`ستظهر الردود التالية باللغة: ${responseLanguageLabel(languageCode)}`, `Future answers will be in: ${responseLanguageLabel(languageCode)}`),
      });
    } catch {
      toast({
        variant: 'destructive',
        title: t('تعذر حفظ لغة الاستشارة', 'Unable to save consultation language'),
        description: t('سيُطبّق اختيارك على الرسالة الحالية، ثم يمكنك المحاولة مرة أخرى.', 'Your selection applies to the current message; please try again later.'),
      });
    }
  };

  // Task types that do NOT trigger proactive KB search (return null from buildProactiveQuery)
  const NO_PROACTIVE_TASK_TYPES = new Set([
    'peer_review', 'fact_gathering', 'legal_classification', 'gap_analysis',
    'case_strength', 'strengths_weaknesses', 'opponent_defenses', 'legal_opinion', 'timeline',
  ]);
  const hasProactiveSearch = !!taskType && !NO_PROACTIVE_TASK_TYPES.has(taskType);

  // True while the server-side proactive KB search is still running (polled via API)
  const [preparingSources, setPreparingSources] = useState<boolean>(
    () => hasProactiveSearch && initialMessages.length === 0
  );
  // Whether the search completed with a valid cache hit (vs. errored / skipped)
  const [sourcesReady, setSourcesReady] = useState(false);

  // Poll /proactive-status until search completes or 15 s safety cap
  useEffect(() => {
    if (!preparingSources) return;
    let cancelled = false;
    const maxUntil = Date.now() + 15_000;
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() >= maxUntil) {
        if (!cancelled) setPreparingSources(false);
        return;
      }
      try {
        const r = await fetch(`${API_BASE}/api/consultations/${consultationId}/proactive-status`, {
          credentials: 'include',
        });
        if (r.ok) {
          const d = await r.json();
          if (d.ready) {
            if (!cancelled) {
              setSourcesReady(!!d.hasCachedResult);
              setPreparingSources(false);
            }
            return;
          }
        }
      } catch { /* network hiccup — keep polling */ }
      if (!cancelled) setTimeout(poll, 1500);
    };
    const t = setTimeout(poll, 600); // first check after 0.6 s
    return () => { cancelled = true; clearTimeout(t); };
  }, [consultationId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Also clear immediately when first AI reply arrives (belt-and-suspenders)
  useEffect(() => {
    if (preparingSources && messages.some(m => m.role === 'assistant')) {
      setPreparingSources(false);
    }
  }, [messages]);  // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    const hasConfirmedAttachment = !!confirmedAttachment;
    if ((!text && !hasConfirmedAttachment) || sending) return;
    if (quota !== null && quota <= 0) return;

    // تأكيد الخصم عند أول رسالة فقط (رسائل المتابعة لا تُخصم)
    if (messages.length === 0 && quota !== null) {
      const ok = await confirmQuota({ cost: 1, remaining: quota, serviceLabel: 'الاستشارة القانونية' });
      if (!ok) return;
    }

    const visibleText = text || 'يرجى تحليل المستند المرفق وتحديد المعلومات اللازمة لاستكمال الاستشارة.';
    const messageForAnalysis = hasConfirmedAttachment
      ? `${visibleText}\n\n${ATTACHMENT_CONTEXT_START}\nاسم الملف: ${confirmedAttachment.fileName}\n${confirmedAttachment.text}\n${ATTACHMENT_CONTEXT_END}`
      : visibleText;
    const userMsg: ChatMessage = {
      role: 'user',
      content: visibleText,
      attachmentName: confirmedAttachment?.fileName ?? null,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachedFile(null);
    setConfirmedAttachment(null);
    setSending(true);
    setSendingPhase(null);

    // Open SSE stream to receive real-time phase updates from the server.
    // We connect before sending the POST so we don't miss the 'searching' event.
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_BASE}/api/consultations/${consultationId}/chat-status`, { withCredentials: true });
      es.onmessage = (e) => {
        const p = e.data as string;
        if (p === 'searching' || p === 'generating') setSendingPhase(p as 'searching' | 'generating');
        if (p === 'done') { es?.close(); es = null; setSendingPhase(null); }
      };
      es.onerror = () => { es?.close(); es = null; };
    } catch {
      // SSE not critical — fall back to generic indicator
    }

    try {
      const resp = await fetch(`${API_BASE}/api/consultations/${consultationId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: messageForAnalysis,
          taskType,
          taskParams: localTaskParams,
          attachmentName: confirmedAttachment?.fileName,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (err.code === 'QUOTA_EXHAUSTED' || err.code === 'TRIAL_EXHAUSTED' || err.code === 'NO_SUBSCRIPTION') {
          setQuota(0);
        } else {
          throw new Error(err.error || t('خطأ في الخادم', 'Server error'));
        }
        return;
      }

      const data = await resp.json();
      setMessages(prev => {
        // Clear suggestedQuestions on all previous messages when new one arrives
        const cleared = prev.map(m => m.suggestedQuestions ? { ...m, suggestedQuestions: undefined } : m);
        return [...cleared, {
          role: 'assistant' as const,
          content: data.reply,
          messageId: data.messageId ?? undefined,
          verification: data.verification ?? undefined,
          usedLiveSearch: data.usedLiveSearch ?? false,
          suggestedQuestions: data.suggestedQuestions ?? undefined,
        }];
      });
      if (data.questionsRemaining !== null && data.questionsRemaining !== undefined) {
        setQuota(data.questionsRemaining);
      }
      queryClient.invalidateQueries({ queryKey: getGetMySubscriptionQueryKey() });
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.message || t('حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.', 'A connection error occurred. Please try again.'),
        error: true,
      }]);
    } finally {
      es?.close();
      setSending(false);
      setSendingPhase(null);
      textareaRef.current?.focus();
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // عند إدخال طلب أو إرفاق مستند في مرحلة تجهيز الاستشارة، يبدأ الحوار بعد
  // إنشائها. تأكيد الحصة يبقى في send()، لذلك لا يُخصم شيء دون موافقة المستخدم.
  useEffect(() => {
    if (
      !initialMessage ||
      messages.length > 0 ||
      sending ||
      autoStartInitialMessageRef.current
    ) return;
    autoStartInitialMessageRef.current = true;
    void send();
  // send deliberately stays out of dependencies to run this one-time transfer only.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, messages.length, sending]);

  // ── رفع الملفات لجميع أنواع الاستشارات ──
  const attachmentsAvailable = true; // المرفقات متاحة لجميع الاستشارات

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachedFile(file);
    setConfirmedAttachment(null);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/contract/extract`, {
        method: 'POST', credentials: 'include', body: formData,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('فشل استخراج النص', 'Failed to extract text'));
      const data = await res.json();
      // عرض النص في drawer للمراجعة قبل الإرسال
      setExtractReview({ open: true, text: data.extractedText, fileName: file.name, truncated: !!data.wasTruncated });
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('خطأ في استخراج الملف', 'File extraction error'), description: err.message });
      setAttachedFile(null);
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const confirmExtractedText = () => {
    const { text, fileName, truncated } = extractReview;
    setConfirmedAttachment({ fileName, text, truncated });
    setExtractReview({ open: false, text: '', fileName: '', truncated: false });
    textareaRef.current?.focus();
  };

  const cancelExtractedText = () => {
    setExtractReview({ open: false, text: '', fileName: '', truncated: false });
    setAttachedFile(null);
  };

  const quotaExhausted = quota !== null && quota <= 0;
  const showTotal = questionsAllowed !== null && questionsAllowed < 999;

  return (
    <div className="h-[100svh] flex flex-col overflow-x-hidden bg-muted/10" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {/* Quota exhausted full modal */}
      {quotaExhausted && (
        <QuotaExhaustedModal onGoToPricing={() => setLocation('/pricing')} />
      )}

      {/* ── مراجعة النص المستخرج قبل الإرسال ── */}
      {extractReview.open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="w-full max-w-2xl bg-background rounded-2xl shadow-2xl shadow-primary/15 border-2 border-primary/50 flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-sm font-bold text-foreground">{t('مراجعة النص المستخرج', 'Review extracted text')}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-xs">{extractReview.fileName}</p>
                </div>
              </div>
              <button onClick={cancelExtractedText} className="p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {/* Instruction */}
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 shrink-0">
              <p className="text-xs text-blue-700">
                ✏️ {t('تحقق من دقة النص المستخرج وعدّله إن لزم — خاصةً في ملفات المسح الضوئي. عند تأكيده سيُرسل للتحليل.', 'Check the extracted text and edit it if needed—especially for scanned files. Once confirmed, it will be sent for analysis.')}
              </p>
            </div>
            {/* Editable text area */}
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {extractReview.truncated && (
                <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{t('النص طويل — تم اقتصاصه عند الحد الأقصى. يمكنك تعديله قبل الإرسال.', 'The text is long and was truncated at the limit. You can edit it before sending.')}</span>
                </div>
              )}
              <textarea
                value={extractReview.text}
                onChange={e => setExtractReview(prev => ({ ...prev, text: e.target.value }))}
                className="w-full h-64 text-sm leading-relaxed bg-muted/30 border-2 border-primary/40 rounded-xl p-3 resize-none focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors font-mono"
                dir="auto"
                placeholder={t('النص المستخرج...', 'Extracted text...')}
              />
            </div>
            {/* Actions */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-border/40 shrink-0">
              <button
                onClick={confirmExtractedText}
                className="flex-1 h-10 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t('تأكيد واستمرار', 'Confirm and continue')}
              </button>
              <button
                onClick={cancelExtractedText}
                className="h-10 px-5 border border-primary/40 rounded-xl text-sm text-muted-foreground hover:border-primary hover:bg-primary/5 transition-colors"
              >
                {t('إلغاء', 'Cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Navbar — مخفي عند التكبير */}
      {!isMaximized && <Navbar />}
      {!isMaximized && <ServiceContextHeader title={serviceTitle} />}

      {/* Area chip + consultation controls */}
      <div className="shrink-0 bg-muted/50 border-b border-border/40 px-4 py-2 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          {/* زر الرجوع */}
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold text-secondary hover:bg-secondary/10 transition-colors shrink-0 border border-secondary/30"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            <span>{t('رجوع', 'Back')}</span>
          </button>
          <span className="font-bold text-secondary shrink-0" dir="auto">{area}</span>
          <span className="text-secondary/40">·</span>
          <span className="truncate text-secondary/80" dir="auto">{title}</span>
          {/* زر تحرير مذكرة مرتبطة بالقضية */}
          {taskType === 'case_management' && (
            <a
              href={`/legal-assistant?service=pleadings&caseId=${consultationId}`}
              className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-colors border border-primary/20"
              title={t('افتح محرر المذكرات مع ربط هذه القضية تلقائياً', 'Open the pleadings editor linked to this case')}
            >
              <Pencil className="w-3 h-3" />
              {t('تحرير مذكرة', 'Edit pleading')}
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {quota !== null && showTotal && questionsAllowed !== null && (
            <QuotaBadge remaining={quota} total={questionsAllowed} size="sm" />
          )}
          {quota !== null && !showTotal && (
            <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5">{t('غير محدود', 'Unlimited')}</Badge>
          )}
          <div className="relative">
            <button
              onClick={() => setLanguageMenuOpen(open => !open)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors text-[11px] text-muted-foreground font-medium"
              title={`لغة الاستشارة: ${selectedResponseLanguage}`}
              aria-haspopup="menu"
              aria-expanded={languageMenuOpen}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectedResponseLanguage}</span>
            </button>
            {languageMenuOpen && (
              <div
                className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-border bg-card p-2 shadow-xl"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                role="menu"
                aria-label={t('اختيار لغة الاستشارة', 'Select consultation language')}
              >
                <p className="px-2 pb-2 text-xs font-bold text-foreground">{t('لغة الاستشارة', 'Consultation language')}</p>
                <p className="px-2 pb-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t('تُطبَّق اللغة المختارة على الردود التالية فقط، دون تغيير لغة واجهة المنصة.', 'The selected language applies only to future answers and does not change the platform interface.')}
                </p>
                <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                  {CONSULTATION_LANGUAGES.map(language => {
                    const active = localTaskParams.responseLanguage === language.code ||
                      (!localTaskParams.responseLanguage && language.code === 'ar');
                    return (
                      <button
                        key={language.code}
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => setResponseLanguage(language.code)}
                        className={cn(
                          'rounded-lg px-2 py-1.5 text-start text-xs transition-colors',
                          active
                            ? 'bg-primary/10 font-bold text-primary'
                            : 'text-foreground hover:bg-muted'
                        )}
                      >
                        {language.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 border-t border-border/60 pt-2">
                  <label className="block px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                    {t('لغة أخرى', 'Other language')}
                  </label>
                  <div className="flex gap-1">
                    <input
                      value={customLanguage}
                      onChange={event => setCustomLanguage(event.target.value)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' && customLanguage.trim().length >= 2) {
                          setResponseLanguage(`custom:${customLanguage.trim()}`);
                        }
                      }}
                      placeholder={t('اكتب اسم اللغة', 'Enter language name')}
                      maxLength={50}
                      className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => setResponseLanguage(`custom:${customLanguage.trim()}`)}
                      disabled={customLanguage.trim().length < 2}
                      className="rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t('تطبيق', 'Apply')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          {messages.length > 0 && (
            canExport ? (
              <button
                onClick={() => exportWordDocx({ messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })), area, title })}
                title={t('تنزيل Word قابل للتحرير', 'Download editable Word document')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors text-[11px] text-muted-foreground font-medium"
              >
                <Download className="w-3.5 h-3.5" />Word
              </button>
            ) : (
              <a href="/pricing" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/10 hover:bg-secondary/20 transition-colors text-[11px] text-secondary font-bold">
                <Download className="w-3.5 h-3.5" />{t('اشترك للتصدير', 'Subscribe to export')}
              </a>
            )
          )}
          {/* زر التكبير — يخفي الـ Navbar ويوسّع منطقة العمل */}
          <button
            onClick={() => setIsMaximized(prev => !prev)}
            title={isMaximized ? t("استعادة العرض", "Restore view") : t("تكبير منطقة العمل", "Maximize workspace")}
            className="flex items-center px-2 py-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Saved task params summary (collapsible) */}
      {Object.entries(localTaskParams).filter(([, v]) => v?.trim()).length > 0 && (
        <TaskParamsSummary
          taskParams={localTaskParams}
          onEdit={taskType ? () => setEditingParams(true) : undefined}
        />
      )}

      {/* Edit params modal */}
      {editingParams && taskType && (
        <EditParamsModal
          taskType={taskType}
          currentParams={localTaskParams}
          area={area}
          onSave={async (updated) => {
            setLocalTaskParams(updated);
            setEditingParams(false);
            toast({ title: 'تم حفظ التعديلات', description: 'ستُطبَّق المعطيات الجديدة على رسالتك التالية.' });
            // Persist to DB so params survive page reload
            try {
              await fetch(`${API_BASE}/api/consultations/${consultationId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ taskParams: updated }),
              });
            } catch {
              // Non-fatal: params already applied in local state
            }
          }}
          onClose={() => setEditingParams(false)}
        />
      )}

      {/* hidden file input — available for every consultation */}
      {attachmentsAvailable && (
        <input ref={fileInputRef} type="file" accept=".pdf,.txt,.docx,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileSelect} />
      )}

      {/* ── Intake welcome — shown only before any message is sent ── */}
      {messages.length === 0 && (
        <div className="flex gap-3 mb-4 px-1 pt-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="w-8 h-8 rounded-full bg-secondary text-primary border border-secondary/50 flex items-center justify-center shrink-0 mt-1">
            <Scale className="w-4 h-4" />
          </div>
          <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm max-w-2xl">
            <p className="text-sm font-semibold text-foreground mb-3">
              {t('أهلاً بك في خدمة الاستشارة القانونية', 'Welcome to the legal consultation service')}
              {localTaskParams.country ? t(` في ${localTaskParams.country}`, ` for ${localTaskParams.country}`) : ''} — {t('لأقدّم لك رأياً دقيقاً أحتاج إلى المعلومات التالية:', 'to provide an accurate opinion, I need the following information:')}
            </p>
            <ol className="space-y-1.5 text-sm text-foreground/80 list-none">
              {[
                t('الدولة والمدينة أو الإمارة (إن كانت مؤثرة في الاختصاص)', 'Country and city or emirate (if relevant to jurisdiction)'),
                t('نوع المسألة القانونية', 'Type of legal matter'),
                t('صفتك في النزاع أو العلاقة القانونية', 'Your role in the dispute or legal relationship'),
                t('ملخص الوقائع بترتيب زمني', 'Chronological summary of facts'),
                t('تاريخ الواقعة وأهم التواريخ والمواعيد', 'Incident date and key dates or deadlines'),
                t('الأطراف ذات العلاقة وصفة كل طرف', 'Relevant parties and each party’s role'),
                t('العقود والمستندات والمراسلات والأدلة المتاحة', 'Available contracts, documents, correspondence, and evidence'),
                t('الإجراءات التي اتخذتها حتى الآن', 'Steps you have taken so far'),
                t('هل يوجد دعوى أو بلاغ أو مطالبة أو إنذار قائم؟', 'Is there an existing lawsuit, report, claim, or notice?'),
                t('النتيجة التي تريد الوصول إليها', 'The outcome you want to achieve'),
              ].map((item, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground/60 border-t border-border/40 pt-3">
              {t('يمكنك الكتابة بصورة حرة أو إرفاق مستند — سأحلل الوقائع والمرفقات، ثم أطلب فقط المعلومات المؤثرة قبل إعطاء الرأي النهائي.', 'You can write freely or attach a document. I will analyze the facts and attachments, then request only the information that matters before providing a final opinion.')}
            </p>
          </div>
        </div>
      )}

      {/* ── Proactive KB search banner — visible until server confirms readiness ── */}
      {preparingSources && (
        <div className="shrink-0 flex justify-center px-4 py-1.5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/8 border border-primary/20 text-primary text-sm animate-pulse">
            <span className="text-base">⚡</span>
            <span className="font-medium">{t('جارٍ تحضير مصادر قانونية ذات صلة…', 'Preparing relevant legal sources…')}</span>
          </div>
        </div>
      )}

      {/* ── Input bar — always at TOP ── */}
      <div className="shrink-0 border-b border-border/50 bg-background px-4 py-3">
        {/* Quick-action chips: only when there are messages and not sending */}
        {messages.length >= 2 && !sending && (
        <div className="flex gap-2 mb-2 w-full flex-wrap" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
            <button
              onClick={() => { setInput('حوّل هذا الحوار إلى تقرير قانوني منظم'); textareaRef.current?.focus(); }}
              className="text-[11px] flex items-center gap-1.5 bg-muted/60 border border-border/50 text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/30 rounded-full px-3 py-1 transition-colors"
            >
              <FileText className="w-3 h-3" />
              <span>{t('تحويل لتقرير', 'Convert to report')}</span>
            </button>
            <button
              onClick={() => { setInput('ما الخطوة الأولى التي أبدأ بها الآن؟'); textareaRef.current?.focus(); }}
              className="text-[11px] flex items-center gap-1.5 bg-muted/60 border border-border/50 text-muted-foreground hover:bg-secondary/10 hover:text-secondary hover:border-secondary/30 rounded-full px-3 py-1 transition-colors"
            >
              <span>{t('الخطوة الأولى', 'First step')}</span>
            </button>
          </div>
        )}
        {/* attached file badge */}
        {confirmedAttachment && (
        <div className="flex items-center gap-2 mb-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-1.5 w-full">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="text-xs text-primary flex-1 truncate">{t('مرفق جاهز للتحليل:', 'Attachment ready for analysis:')} {confirmedAttachment.fileName}</span>
            <button onClick={() => { setAttachedFile(null); setConfirmedAttachment(null); }} className="text-muted-foreground hover:text-destructive" aria-label={t('إزالة المرفق', 'Remove attachment')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end w-full">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={sending || quotaExhausted}
              placeholder={
                quotaExhausted ? t('انتهت استشاراتك المجانية — اختاري باقة للمتابعة', 'Your free consultations have ended — choose a plan to continue')
                : extracting ? t('جارٍ استخراج نص المرفق...', 'Extracting attachment text...')
                : t('اكتب تفاصيل طلبك أو استفسارك هنا…', 'Write your request details or question here…')
              }
              rows={1}
               dir="auto"
               style={{ resize: 'none', minHeight: '44px', maxHeight: '120px', ...(attachmentsAvailable ? { paddingBottom: '32px' } : {}) }}
              className={cn("w-full rounded-xl border-[3px] border-secondary/70 bg-muted/40 px-4 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-secondary/40 transition-all", quotaExhausted && "opacity-50 cursor-not-allowed")}
              onInput={e => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }}
              maxLength={2000}
            />
            {attachmentsAvailable && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || quotaExhausted || extracting}
                className="absolute bottom-3 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
              >
                {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" /> : <Paperclip className="w-3.5 h-3.5" />}
                <span>{extracting ? t('جارٍ الاستخراج...', 'Extracting...') : t('إضافة مرفق', 'Add attachment')}</span>
              </button>
            )}
          </div>
          <Button onClick={send} disabled={(!input.trim() && !confirmedAttachment) || sending || quotaExhausted} size="icon" className="h-11 w-11 rounded-xl shrink-0">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* ── Messages area — scrolls below input ── */}
        <div className="flex-1 overflow-y-auto" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="w-full px-4 sm:px-8 lg:px-12 py-6">
          {messages.map((m, i) => (
            <ChatBubble
              key={i}
              msg={m}
              consultationId={consultationId}
              onRated={(mid) => setMessages(prev => prev.map(x => x.messageId === mid ? { ...x, rated: true } : x))}
              isTrial={isTrial}
              isDraftService={isDraftService}
            />
          ))}
          {sending && <TypingIndicator phase={sendingPhase} />}

          {/* ── Suggested follow-up questions chips ── */}
          {!sending && (() => {
            const lastAsst = [...messages].reverse().find(m => m.role === 'assistant' && !m.error);
            if (!lastAsst?.suggestedQuestions?.length) return null;
            return (
              <div className="flex flex-wrap gap-2 px-1 pb-2 pt-1 justify-end" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
                {lastAsst.suggestedQuestions.map((q, qi) => (
                  <button
                    key={qi}
                    onClick={() => {
                      setInput(q);
                      textareaRef.current?.focus();
                    }}
                    className="text-xs bg-secondary/8 border border-secondary/25 text-secondary hover:bg-secondary/18 hover:border-secondary/50 rounded-full px-3 py-1.5 transition-colors text-start leading-snug max-w-[90%]"
                    dir="auto"
                  >
                    {q}
                  </button>
                ))}
              </div>
            );
          })()}

          {messages.length > 0 && !sending && (
            <p className="text-center text-[11px] text-muted-foreground/40 mt-4 mb-1">
              {t('الإجابات إرشادية أولية · لا تُعدّ رأيًا قانونيًا نهائيًا', 'Answers are preliminary guidance · not final legal advice')}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function Consultation() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const { lang } = useLang();
  const t = (ar: string, en: string) => localized(lang, ar, en);

  const [phase, setPhase] = useState<'setup' | 'chat'>('setup');
  const [consultationId, setConsultationId] = useState<number | null>(null);
  const [area, setArea] = useState('');
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState('');
  const [taskParams, setTaskParams] = useState<Record<string, string>>({});
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([]);
  const [initialAttachment, setInitialAttachment] = useState<PreparedAttachment | null>(null);
  const [initialMessage, setInitialMessage] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isRecoveringSubscription, setIsRecoveringSubscription] = useState(false);

  const { data: subscription, isLoading: subLoading } = useGetMySubscription({
    query: { queryKey: getGetMySubscriptionQueryKey(), retry: false, gcTime: 0 },
  });

  const createCons = useCreateConsultation();

  const questionsAllowed = subscription?.questionsAllowed ?? null;
  const remaining =
    subscription?.status === 'active'
      ? subscription.questionsAllowed >= 999
        ? null
        : subscription.questionsAllowed - subscription.questionsUsed
      : 0;

  const hasAccess =
    subscription?.status === 'active' &&
    (subscription.questionsAllowed >= 999 ||
      subscription.questionsAllowed - subscription.questionsUsed > 0);

  const quotaExhaustedNoAccess =
    subscription?.status === 'active' &&
    subscription.questionsAllowed < 999 &&
    subscription.questionsAllowed - subscription.questionsUsed <= 0;

  const handleStart = async (
    selectedArea: string,
    selectedTitle: string,
    selectedTaskType: string,
    selectedTaskParams: Record<string, string>,
    attachment: PreparedAttachment | null = null,
    message = '',
  ) => {
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      setLocation(`/login?returnTo=${returnTo}`);
      return;
    }
    setIsStarting(true);
    // Generate a per-session UUID for grace-period dedup (10 min edit window)
    const clientSession = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);
    createCons.mutate(
      { data: { title: selectedTitle, areaAr: selectedArea, taskType: selectedTaskType, taskParams: selectedTaskParams, clientSession } as any },
      {
        onSuccess: res => {
          setConsultationId(res.id);
          setArea(selectedArea);
          setTitle(selectedTitle);
          setTaskType(selectedTaskType);
          setTaskParams(selectedTaskParams);
          setInitialAttachment(attachment);
          setInitialMessage(message);
          setPhase('chat');
          setIsStarting(false);
        },
        onError: (err: any) => {
          const code = (err as any)?.code ?? '';
          if (code === 'TRIAL_EXHAUSTED') {
            // Redirect to pricing with explanation
            toast({ variant: 'destructive', title: t('انتهت خدماتك المجانية', 'Your free services have ended'), description: t('اشترك في إحدى الباقات للمتابعة', 'Subscribe to a plan to continue') });
            setLocation('/pricing');
          } else {
            toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: err.error || t('فشل إنشاء الاستشارة', 'Could not create the consultation') });
          }
          setIsStarting(false);
        },
      }
    );
  };

  const handleReset = () => {
    setPhase('setup');
    setConsultationId(null);
    setArea('');
    setTitle('');
    setTaskType('');
    setTaskParams({});
    setInitialAttachment(null);
    setInitialMessage('');
    // Remove id param from URL if present
    setLocation('/consultation');
  };

  // ── Load existing consultation by URL param ──────────────────────────────
  const params = useParams<{ id?: string }>();
  const urlConsultationId = params?.id ? parseInt(params.id, 10) : null;
  const consultationSearchParams = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const requestedTaskType = consultationSearchParams.get('type') ?? undefined;
  const requestedServiceMode = consultationSearchParams.get('settlementService') ?? undefined;
  const serviceTitle = getServiceTitle(
    requestedTaskType,
    consultationSearchParams.get('service') ?? undefined,
    consultationSearchParams.has('ipType'),
  );

  useEffect(() => {
    if (!urlConsultationId || isNaN(urlConsultationId)) return;
    if (phase === 'chat' && consultationId === urlConsultationId) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/consultations/${urlConsultationId}`, {
          credentials: 'include',
        });
        if (!res.ok) {
          toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('تعذّر تحميل الاستشارة', 'Unable to load the consultation') });
          return;
        }
        const data = await res.json();

        // Load messages
        const msgsRes = await fetch(`${API_BASE}/api/consultations/${urlConsultationId}/messages`, {
          credentials: 'include',
        });
        const rawMsgs: ChatMessage[] = msgsRes.ok ? await msgsRes.json() : [];
        // For assistant messages that have stored sources, reconstruct the
        // verification panel so CitationCards render on re-open.
        const msgs: ChatMessage[] = rawMsgs.map(m => {
          const displayMessage = m.role === 'user'
            ? { ...m, content: withoutAttachmentContext(m.content) }
            : m;
          if (displayMessage.role === 'assistant' && displayMessage.sources && displayMessage.sources.length > 0 && !displayMessage.verification) {
            return { ...displayMessage, verification: sourcesToVerification(displayMessage.sources) };
          }
          return displayMessage;
        });

        setConsultationId(urlConsultationId);
        setArea(data.areaAr ?? '');
        setTitle(data.title ?? '');
        setTaskType(data.taskType ?? '');
        setTaskParams((data.taskParams as Record<string, string>) ?? {});
        setInitialMessages(msgs);
        setInitialAttachment(null);
        setInitialMessage('');
        setPhase('chat');
      } catch {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: t('تعذّر تحميل الاستشارة', 'Unable to load the consultation') });
      }
    })();
  }, [urlConsultationId]);

  if (subLoading) {
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  // No subscription at all → offer recovery first, then pricing
  if (!subscription) {
    if (!isAuthenticated) {
      return (
        <SetupScreen
          onStart={handleStart}
          remaining={null}
          questionsAllowed={null}
          isStarting={false}
          requestedTaskType={requestedTaskType}
          serviceTitle={serviceTitle}
          requestedServiceMode={requestedServiceMode}
        />
      );
    }
    return (
      <div className="min-h-screen flex flex-col overflow-x-hidden bg-muted/20" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-sm space-y-4">
            <Scale className="w-16 h-16 text-primary/30 mx-auto" />
            <h2 className="text-2xl font-bold text-primary">{t('لا يوجد اشتراك نشط', 'No active subscription')}</h2>
            <p className="text-muted-foreground text-sm">
              {t('سجّلي حساباً جديداً للحصول على 3 استشارات مجانية، أو اختاري إحدى الباقات للمتابعة.', 'Create a new account to receive 3 free consultations, or choose a plan to continue.')}
            </p>
            <Button onClick={() => setLocation('/pricing')} size="lg" className="w-full">
              {t('عرض الباقات والأسعار', 'View plans and pricing')}
            </Button>
            {/* Recovery path: user already paid but callback didn't complete */}
            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2">{t('دفعتِ مسبقاً ولا تزالين ترين هذه الرسالة؟', 'Already paid and still seeing this message?')}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                disabled={isRecoveringSubscription}
                onClick={async () => {
                  setIsRecoveringSubscription(true);
                  try {
                    const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
                    const r = await fetch(`${BASE}/api/payments/recover`, {
                      method: 'POST',
                      credentials: 'include',
                    });
                    const data = await r.json();
                    if (data.recovered) {
                      // Subscription was just activated — reload page
                      toast({ title: t('تمت استعادة الاشتراك', 'Subscription recovered'), description: t('جارٍ تحديث الوصول إلى الاستشارة…', 'Refreshing your consultation access…') });
                      window.location.reload();
                    } else {
                      toast({ title: t('جارٍ التحقق من الدفع', 'Verifying payment'), description: t('سنكمل التحقق من عملية الدفع الآن.', 'We will now complete payment verification.') });
                      window.location.href = `${BASE}/payment/callback${window.location.search}`;
                    }
                  } catch {
                    toast({ variant: 'destructive', title: t('تعذّرت استعادة الاشتراك تلقائياً', 'Could not recover the subscription automatically'), description: t('سننقلك إلى صفحة التحقق من الدفع لإكمال العملية.', 'We will take you to payment verification to complete the process.') });
                    setLocation('/payment/callback');
                  } finally {
                    setIsRecoveringSubscription(false);
                  }
                }}
              >
                {isRecoveringSubscription ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {isRecoveringSubscription ? t('جارٍ استعادة الاشتراك…', 'Recovering subscription…') : t('استعادة الاشتراك تلقائياً', 'Recover subscription automatically')}
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Quota exhausted (subscription exists but used all questions) → show setup with modal overlay
  if (quotaExhaustedNoAccess && phase === 'setup') {
    return (
      <>
        <SetupScreen
          onStart={handleStart}
          remaining={0}
          questionsAllowed={questionsAllowed}
          isStarting={false}
          requestedTaskType={requestedTaskType}
          serviceTitle={serviceTitle}
          requestedServiceMode={requestedServiceMode}
        />
        <QuotaExhaustedModal onGoToPricing={() => setLocation('/pricing')} />
      </>
    );
  }

  if (phase === 'chat' && consultationId !== null) {
    return (
      <ChatScreen
        consultationId={consultationId}
        area={area}
        title={title}
        taskType={taskType}
        taskParams={taskParams}
        initialMessages={initialMessages}
        initialAttachment={initialAttachment}
        initialMessage={initialMessage}
        remaining={remaining}
        questionsAllowed={questionsAllowed}
        onReset={handleReset}
      />
    );
  }

  return (
    <SetupScreen
      onStart={handleStart}
      remaining={remaining}
      questionsAllowed={questionsAllowed}
      isStarting={isStarting}
      requestedTaskType={requestedTaskType}
      serviceTitle={serviceTitle}
      requestedServiceMode={requestedServiceMode}
    />
  );
}
