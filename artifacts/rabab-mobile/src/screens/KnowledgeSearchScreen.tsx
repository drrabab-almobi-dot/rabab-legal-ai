import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuth, apiFetch } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LegalArticle {
  article: string;
  law: string;
  text?: string;
  relevance?: string;
}

interface LegalOption {
  title: string;
  description: string;
  recommendation: string;
  pros?: string;
  cons?: string;
}

interface ProcedureStep {
  step: number;
  action: string;
  authority: string;
  note?: string;
}

interface KeyDeadline {
  event: string;
  duration: string;
  source?: string;
}

interface LegalReference {
  title: string;
  excerpt?: string;
}

interface LegalReport {
  summary: string;
  articles: LegalArticle[];
  strengths: string[];
  weaknesses: string[];
  options: LegalOption[];
  procedure_steps: ProcedureStep[];
  key_deadlines: KeyDeadline[];
  memo: string;
  hasCitations?: boolean;
  references: LegalReference[];
  disclaimer?: string;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: { fontSize: 22 },
  headerSub: { fontSize: 13, textAlign: 'right', marginTop: 4 },
  searchBox: {
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 10,
  },
  searchLabel: { fontSize: 13, textAlign: 'right' },
  searchInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlign: 'right',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  searchBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 15 },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 32,
  },
  loadingStep: { fontSize: 14, textAlign: 'center' },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  reportScroll: { flex: 1 },
  reportContent: { paddingHorizontal: 16, paddingBottom: 32 },
  exportRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 11,
    borderWidth: 1,
  },
  exportBtnText: { fontSize: 14 },
  section: {
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionTitle: { fontSize: 14, flex: 1, textAlign: 'right' },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 12 },
  bodyText: { fontSize: 13, lineHeight: 22, textAlign: 'right' },
  articleItem: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
  },
  articleBadge: { fontSize: 12, fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  articleText: { fontSize: 12, lineHeight: 20, textAlign: 'right' },
  articleRelevance: { fontSize: 11, marginTop: 4, textAlign: 'right' },
  swRow: { flexDirection: 'row-reverse', gap: 8, marginBottom: 8 },
  swBlock: { flex: 1, borderRadius: 8, borderWidth: 1, padding: 8 },
  swHeading: { fontSize: 12, fontWeight: '700', marginBottom: 4, textAlign: 'right' },
  swItem: { fontSize: 12, marginBottom: 3, textAlign: 'right' },
  optionCard: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
  },
  optionTitle: { fontSize: 13, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  optionDesc: { fontSize: 12, lineHeight: 19, textAlign: 'right' },
  optionNote: { fontSize: 11, marginTop: 3, textAlign: 'right' },
  stepItem: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginBottom: 8,
  },
  stepNum: { fontSize: 12, fontWeight: '700', minWidth: 22, textAlign: 'center' },
  stepTextBlock: { flex: 1 },
  stepAction: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  stepAuthority: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  stepNote: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  deadlineItem: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 6,
  },
  deadlineEvent: { fontSize: 12, fontWeight: '700', flex: 1, textAlign: 'right' },
  deadlineDuration: { fontSize: 12, marginStart: 8 },
  refItem: { marginBottom: 8 },
  refTitle: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  refExcerpt: { fontSize: 11, lineHeight: 18, textAlign: 'right', marginTop: 3 },
  disclaimer: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  disclaimerText: { fontSize: 12, lineHeight: 20, textAlign: 'right' },
});

// ─── Section wrapper ──────────────────────────────────────────────────────────

function ReportSection({
  icon,
  title,
  accentColor,
  children,
  colors,
}: {
  icon: string;
  title: string;
  accentColor: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.sectionHeader, { backgroundColor: accentColor + '18', borderBottomWidth: 1, borderBottomColor: colors.border }]}>
        <Text style={{ fontSize: 16 }}>{icon}</Text>
        <Text style={[styles.sectionTitle, { color: accentColor, fontFamily: 'Cairo_700Bold' }]}>
          {title}
        </Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

// ─── PDF HTML builder ─────────────────────────────────────────────────────────

function buildPdfHtml(report: LegalReport, question: string): string {
  const dateStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  const refCount = report.references?.length ?? 0;
  const refColor = refCount > 0 ? '#16a34a' : '#dc2626';

  const esc = (s?: string) =>
    (s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br/>');

  let body = '';

  // 1. Summary
  if (report.summary) {
    body += `
    <div class="section">
      <div class="section-heading">أولاً: الملخص القانوني</div>
      <p class="body-text">${esc(report.summary)}</p>
    </div>`;
  }

  // 2. Articles
  if (report.articles?.length) {
    body += `<div class="section"><div class="section-heading">ثانياً: المواد النظامية ذات الصلة</div>`;
    for (const a of report.articles) {
      body += `
      <div class="article-item">
        <div class="article-badge">المادة (${esc(a.article)}) — ${esc(a.law)}</div>
        ${a.text ? `<div class="article-text">«${esc(a.text)}»</div>` : ''}
        ${a.relevance ? `<div class="article-relevance">وجه الصلة: ${esc(a.relevance)}</div>` : ''}
      </div>`;
    }
    body += '</div>';
  }

  // 3. Strengths & Weaknesses
  if (report.strengths?.length || report.weaknesses?.length) {
    body += `<div class="section"><div class="section-heading">ثالثاً: تقييم الموقف القانوني</div><div class="sw-row">`;
    if (report.strengths?.length) {
      body += `<div class="sw-block strengths"><div class="sw-heading">نقاط القوة</div>`;
      for (const s of report.strengths) body += `<div class="sw-item">✓ ${esc(s)}</div>`;
      body += '</div>';
    }
    if (report.weaknesses?.length) {
      body += `<div class="sw-block weaknesses"><div class="sw-heading">نقاط الضعف</div>`;
      for (const w of report.weaknesses) body += `<div class="sw-item">⚠ ${esc(w)}</div>`;
      body += '</div>';
    }
    body += '</div></div>';
  }

  // 4. Options
  if (report.options?.length) {
    body += `<div class="section"><div class="section-heading">رابعاً: الخيارات القانونية المتاحة</div>`;
    report.options.forEach((opt, i) => {
      body += `
      <div class="option-card">
        <div class="option-title">${i + 1}. ${esc(opt.title)} [${esc(opt.recommendation)}]</div>
        <div class="option-desc">${esc(opt.description)}</div>
        ${opt.pros ? `<div class="option-note green">+ ${esc(opt.pros)}</div>` : ''}
        ${opt.cons ? `<div class="option-note red">− ${esc(opt.cons)}</div>` : ''}
      </div>`;
    });
    body += '</div>';
  }

  // 5. Steps
  if (report.procedure_steps?.length) {
    body += `<div class="section"><div class="section-heading">خامساً: خطوات الإجراء</div>`;
    for (const s of report.procedure_steps) {
      body += `
      <div class="step-item">
        <div class="step-num">${s.step}.</div>
        <div class="step-text">
          <div class="step-action">${esc(s.action)}</div>
          <div class="step-authority">${esc(s.authority)}</div>
          ${s.note ? `<div class="step-note">${esc(s.note)}</div>` : ''}
        </div>
      </div>`;
    }
    body += '</div>';
  }

  // 6. Deadlines
  if (report.key_deadlines?.length) {
    body += `<div class="section"><div class="section-heading">سادساً: المهل والمواعيد القانونية</div>`;
    for (const d of report.key_deadlines) {
      body += `
      <div class="deadline-item">
        <span class="deadline-event">${esc(d.event)}</span>
        <span class="deadline-duration">${esc(d.duration)}</span>
        ${d.source ? `<span class="deadline-source">(${esc(d.source)})</span>` : ''}
      </div>`;
    }
    body += '</div>';
  }

  // 7. Memo
  if (report.memo) {
    body += `
    <div class="section">
      <div class="section-heading memo-heading">
        <span>سابعاً: المذكرة القانونية</span>
        <span class="ref-count" style="color:${refColor}">عدد المراجع الموثّقة: ${refCount}</span>
      </div>
      <p class="body-text">${esc(report.memo)}</p>
    </div>`;
  }

  // 8. References
  if (refCount > 0) {
    body += `<div class="section"><div class="section-heading">المراجع والمصادر</div>`;
    for (const r of report.references) {
      body += `
      <div class="ref-item">
        <div class="ref-title">• ${esc(r.title)}</div>
        ${r.excerpt ? `<div class="ref-excerpt">«${esc(r.excerpt)}»</div>` : ''}
      </div>`;
    }
    body += '</div>';
  }

  // 9. Disclaimer
  const disclaimer = report.disclaimer ||
    'هذا التقرير لأغراض البحث والتوعية القانونية — يُنصح بمراجعة محامٍ مرخّص والتحقق من المصادر الرسمية قبل الاستخدام الرسمي.';
  body += `<div class="disclaimer">⚠️ ${esc(disclaimer)}</div>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 13pt; direction: rtl; color: #111; background: #fff; padding: 2cm 2.5cm; }
    .page-header { border-bottom: 3px solid #7c3a00; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 16pt; font-weight: bold; color: #7c3a00; }
    .brand-sub { font-size: 9pt; color: #888; margin-top: 2px; }
    .date { font-size: 9pt; color: #888; }
    .subject-box { background: #fef9f0; border-right: 4px solid #c47a0a; padding: 10px 14px; margin-bottom: 18px; border-radius: 4px; }
    .subject-text { font-size: 12pt; font-weight: bold; }
    .section { margin-bottom: 22px; border: 1px solid #e5e5e5; border-radius: 6px; overflow: hidden; }
    .section-heading { font-size: 12pt; font-weight: bold; color: #7c3a00; background: #fef6ee; padding: 8px 14px; border-bottom: 1px solid #e5d4b0; display: flex; justify-content: space-between; align-items: center; }
    .memo-heading { display: flex; justify-content: space-between; align-items: center; }
    .ref-count { font-size: 10pt; font-weight: bold; }
    .body-text { font-size: 11pt; line-height: 1.9; text-align: right; padding: 10px 14px; }
    .article-item { border: 1px solid #e8d9a0; border-radius: 6px; padding: 8px 12px; margin: 8px 14px; }
    .article-badge { font-size: 10pt; font-weight: bold; color: #7c3a00; margin-bottom: 4px; }
    .article-text { font-size: 10pt; color: #333; background: #fafafa; border-right: 3px solid #c47a0a; padding: 5px 8px; margin-top: 4px; border-radius: 3px; }
    .article-relevance { font-size: 9pt; color: #666; margin-top: 4px; }
    .sw-row { display: flex; gap: 10px; padding: 10px 14px; }
    .sw-block { flex: 1; border-radius: 6px; padding: 8px; }
    .strengths { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .weaknesses { background: #fff1f2; border: 1px solid #fecdd3; }
    .sw-heading { font-size: 11pt; font-weight: bold; margin-bottom: 4px; }
    .strengths .sw-heading { color: #166534; }
    .weaknesses .sw-heading { color: #991b1b; }
    .sw-item { font-size: 10pt; margin-bottom: 3px; }
    .strengths .sw-item { color: #166534; }
    .weaknesses .sw-item { color: #991b1b; }
    .option-card { border: 1px solid #e5e5e5; border-radius: 6px; padding: 10px; margin: 8px 14px; background: #fafaf8; }
    .option-title { font-size: 11pt; font-weight: bold; margin-bottom: 4px; }
    .option-desc { font-size: 10pt; color: #444; line-height: 1.7; }
    .option-note { font-size: 9pt; margin-top: 3px; }
    .option-note.green { color: #166534; }
    .option-note.red { color: #991b1b; }
    .step-item { display: flex; flex-direction: row-reverse; gap: 10px; margin: 8px 14px; }
    .step-num { font-size: 11pt; font-weight: bold; color: #7c3a00; min-width: 22px; text-align: center; }
    .step-text { flex: 1; }
    .step-action { font-size: 11pt; font-weight: bold; }
    .step-authority { font-size: 9pt; color: #7c3a00; margin-top: 2px; }
    .step-note { font-size: 9pt; color: #666; margin-top: 2px; }
    .deadline-item { display: flex; flex-direction: row-reverse; justify-content: space-between; background: #fffbea; border-radius: 6px; padding: 6px 10px; margin: 6px 14px; }
    .deadline-event { font-size: 10pt; font-weight: bold; color: #92400e; }
    .deadline-duration { font-size: 10pt; color: #b45309; }
    .deadline-source { font-size: 9pt; color: #b45309; }
    .ref-item { margin: 6px 14px 8px; }
    .ref-title { font-size: 10pt; font-weight: bold; }
    .ref-excerpt { font-size: 9pt; color: #555; margin-top: 2px; }
    .disclaimer { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 10px 14px; margin-top: 22px; font-size: 10pt; color: #7a5f00; line-height: 1.6; }
    .page-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 9pt; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="page-header">
    <div>
      <div class="brand">⚖️ &nbsp;RABAB LEGAL</div>
      <div class="brand-sub">محاميتك الرقمية · التقرير القانوني الكامل</div>
    </div>
    <div class="date">${dateStr}</div>
  </div>
  <div class="subject-box">
    <div class="subject-text">الموضوع: ${esc(question)}</div>
  </div>
  ${body}
  <div class="page-footer">رباب محاميتك الرقمية · RABAB LEGAL AI · للاسترشاد فقط</div>
</body>
</html>`;
}

// ─── Loading steps ─────────────────────────────────────────────────────────────

const LOADING_STEPS = [
  'جارٍ قراءة قاعدة المعرفة…',
  'جارٍ البحث في المصادر الرسمية…',
  'جارٍ استخراج المواد النظامية…',
  'جارٍ إعداد التقرير القانوني…',
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function KnowledgeSearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [question, setQuestion] = useState('');
  const [report, setReport] = useState<LegalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleSearch = useCallback(async () => {
    if (!question.trim() || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    setError('');
    setReport(null);
    setLoadingStep(0);

    const stepInterval = setInterval(() => {
      setLoadingStep(s => Math.min(s + 1, LOADING_STEPS.length - 1));
    }, 3500);

    try {
      const data = await apiFetch<LegalReport>('/api/knowledge/legal-research', {
        method: 'POST',
        body: JSON.stringify({ question: question.trim() }),
      });
      setReport(data);
    } catch (e: any) {
      setError(e?.message ?? 'حدث خطأ أثناء البحث، حاولي مرة أخرى.');
    } finally {
      clearInterval(stepInterval);
      setLoading(false);
    }
  }, [question, loading]);

  const handleExportPdf = useCallback(async () => {
    if (!report || exportingPdf) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setExportingPdf(true);
    try {
      const html = buildPdfHtml(report, question);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'مشاركة التقرير القانوني',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز');
      }
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل تصدير PDF');
    } finally {
      setExportingPdf(false);
    }
  }, [report, exportingPdf, question]);

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            البحث القانوني
          </Text>
        </View>
        <View style={styles.emptyWrap}>
          <Ionicons name="search-outline" size={56} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            تسجيل الدخول مطلوب
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            سجّلي الدخول لاستخدام البحث القانوني الذكي
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            البحث القانوني
          </Text>
        </View>
        <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          أدخلي سؤالك القانوني للحصول على تقرير شامل بالمواد والمراجع
        </Text>
      </View>

      {/* Search input */}
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.searchLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          موضوع البحث
        </Text>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
          value={question}
          onChangeText={setQuestion}
          placeholder="مثال: ما هي حقوق العامل عند إنهاء العقد تعسفياً؟"
          placeholderTextColor={colors.mutedForeground}
          multiline
          textAlign="right"
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.searchBtn, { backgroundColor: question.trim() && !loading ? colors.primary : colors.border }]}
          onPress={handleSearch}
          disabled={!question.trim() || loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.searchBtnText, { color: '#fff', fontFamily: 'Cairo_700Bold' }]}>
              🔍 &nbsp;ابدأ البحث
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingStep, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            {LOADING_STEPS[loadingStep]}
          </Text>
        </View>
      )}

      {/* Error */}
      {!loading && error ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={[styles.emptyTitle, { color: '#ef4444', fontFamily: 'Cairo_700Bold' }]}>
            حدث خطأ
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            {error}
          </Text>
        </View>
      ) : null}

      {/* Empty state */}
      {!loading && !error && !report && (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '33' }]}>
            <Ionicons name="library-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            ابدئي بحثك القانوني
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            سيقدّم لك التقرير المواد النظامية ذات الصلة، الخيارات القانونية، الخطوات، المهل، ومذكرة قانونية كاملة
          </Text>
        </View>
      )}

      {/* Report */}
      {!loading && report && (
        <>
          <ScrollView
            style={styles.reportScroll}
            contentContainerStyle={[styles.reportContent, { paddingBottom: bottomPad + 80 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Summary */}
            {report.summary ? (
              <ReportSection icon="📋" title="أولاً: الملخص القانوني" accentColor={colors.primary} colors={colors}>
                <Text style={[styles.bodyText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                  {report.summary}
                </Text>
              </ReportSection>
            ) : null}

            {/* 2. Articles */}
            {report.articles?.length > 0 ? (
              <ReportSection icon="📖" title="ثانياً: المواد النظامية ذات الصلة" accentColor="#b45309" colors={colors}>
                {report.articles.map((a, i) => (
                  <View key={i} style={[styles.articleItem, { backgroundColor: colors.background, borderColor: '#e8d9a0' }]}>
                    <Text style={[styles.articleBadge, { color: '#b45309', fontFamily: 'Cairo_700Bold' }]}>
                      المادة ({a.article}) — {a.law}
                    </Text>
                    {a.text ? (
                      <Text style={[styles.articleText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                        «{a.text}»
                      </Text>
                    ) : null}
                    {a.relevance ? (
                      <Text style={[styles.articleRelevance, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                        وجه الصلة: {a.relevance}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ReportSection>
            ) : null}

            {/* 3. Strengths & Weaknesses */}
            {(report.strengths?.length > 0 || report.weaknesses?.length > 0) ? (
              <ReportSection icon="⚡" title="ثالثاً: تقييم الموقف القانوني" accentColor="#7c3aed" colors={colors}>
                <View style={styles.swRow}>
                  {report.strengths?.length > 0 ? (
                    <View style={[styles.swBlock, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
                      <Text style={[styles.swHeading, { color: '#166534', fontFamily: 'Cairo_700Bold' }]}>نقاط القوة</Text>
                      {report.strengths.map((s, i) => (
                        <Text key={i} style={[styles.swItem, { color: '#166534', fontFamily: 'Cairo_400Regular' }]}>✓ {s}</Text>
                      ))}
                    </View>
                  ) : null}
                  {report.weaknesses?.length > 0 ? (
                    <View style={[styles.swBlock, { backgroundColor: '#fff1f2', borderColor: '#fecdd3' }]}>
                      <Text style={[styles.swHeading, { color: '#991b1b', fontFamily: 'Cairo_700Bold' }]}>نقاط الضعف</Text>
                      {report.weaknesses.map((w, i) => (
                        <Text key={i} style={[styles.swItem, { color: '#991b1b', fontFamily: 'Cairo_400Regular' }]}>⚠ {w}</Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              </ReportSection>
            ) : null}

            {/* 4. Options */}
            {report.options?.length > 0 ? (
              <ReportSection icon="🎯" title="رابعاً: الخيارات القانونية المتاحة" accentColor="#0369a1" colors={colors}>
                {report.options.map((opt, i) => (
                  <View key={i} style={[styles.optionCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                    <Text style={[styles.optionTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                      {i + 1}. {opt.title}  [{opt.recommendation}]
                    </Text>
                    <Text style={[styles.optionDesc, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                      {opt.description}
                    </Text>
                    {opt.pros ? (
                      <Text style={[styles.optionNote, { color: '#166534', fontFamily: 'Cairo_400Regular' }]}>+ {opt.pros}</Text>
                    ) : null}
                    {opt.cons ? (
                      <Text style={[styles.optionNote, { color: '#991b1b', fontFamily: 'Cairo_400Regular' }]}>− {opt.cons}</Text>
                    ) : null}
                  </View>
                ))}
              </ReportSection>
            ) : null}

            {/* 5. Steps */}
            {report.procedure_steps?.length > 0 ? (
              <ReportSection icon="🪜" title="خامساً: خطوات الإجراء" accentColor="#047857" colors={colors}>
                {report.procedure_steps.map((s, i) => (
                  <View key={i} style={styles.stepItem}>
                    <Text style={[styles.stepNum, { color: '#047857', fontFamily: 'Cairo_700Bold' }]}>{s.step}.</Text>
                    <View style={styles.stepTextBlock}>
                      <Text style={[styles.stepAction, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>{s.action}</Text>
                      <Text style={[styles.stepAuthority, { color: '#047857', fontFamily: 'Cairo_400Regular' }]}>{s.authority}</Text>
                      {s.note ? (
                        <Text style={[styles.stepNote, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>{s.note}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ReportSection>
            ) : null}

            {/* 6. Deadlines */}
            {report.key_deadlines?.length > 0 ? (
              <ReportSection icon="⏰" title="سادساً: المهل والمواعيد القانونية" accentColor="#92400e" colors={colors}>
                {report.key_deadlines.map((d, i) => (
                  <View key={i} style={[styles.deadlineItem, { backgroundColor: '#fffbea' }]}>
                    <Text style={[styles.deadlineEvent, { fontFamily: 'Cairo_700Bold' }]}>{d.event}</Text>
                    <Text style={[styles.deadlineDuration, { color: '#b45309', fontFamily: 'Cairo_600SemiBold' }]}>{d.duration}</Text>
                  </View>
                ))}
              </ReportSection>
            ) : null}

            {/* 7. Memo */}
            {report.memo ? (
              <ReportSection icon="📝" title="سابعاً: المذكرة القانونية" accentColor={colors.secondary} colors={colors}>
                <Text style={[styles.bodyText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                  {report.memo}
                </Text>
              </ReportSection>
            ) : null}

            {/* 8. References */}
            {report.references?.length > 0 ? (
              <ReportSection icon="📚" title="المراجع والمصادر" accentColor="#475569" colors={colors}>
                {report.references.map((r, i) => (
                  <View key={i} style={styles.refItem}>
                    <Text style={[styles.refTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                      • {r.title}
                    </Text>
                    {r.excerpt ? (
                      <Text style={[styles.refExcerpt, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                        «{r.excerpt}»
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ReportSection>
            ) : null}

            {/* 9. Disclaimer */}
            <View style={[styles.disclaimer, { backgroundColor: '#fff8e1', borderColor: '#ffe082' }]}>
              <Text style={[styles.disclaimerText, { color: '#7a5f00', fontFamily: 'Cairo_400Regular' }]}>
                ⚠️ {report.disclaimer || 'هذا التقرير لأغراض البحث والتوعية القانونية — يُنصح بمراجعة محامٍ مرخّص والتحقق من المصادر الرسمية قبل الاستخدام الرسمي.'}
              </Text>
            </View>
          </ScrollView>

          {/* Export bar */}
          <View style={[styles.exportRow, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: bottomPad + 8 }]}>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={handleExportPdf}
              disabled={exportingPdf}
              activeOpacity={0.85}
            >
              {exportingPdf ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={18} color="#fff" />
                  <Text style={[styles.exportBtnText, { color: '#fff', fontFamily: 'Cairo_700Bold' }]}>
                    تصدير PDF الكامل
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}
