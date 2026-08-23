import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, Platform, Pressable, Alert,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSearchKnowledge, type KnowledgeChunk } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SubscriptionSheet } from '@/components/SubscriptionSheet';
import { router } from 'expo-router';

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, marginBottom: 14, textAlign: 'right' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  categories: { flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' },
  catPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  catText: { fontSize: 13 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 18, textAlign: 'center', marginTop: 8 },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 4 },
  list: { padding: 16, gap: 12 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  docName: { flex: 1, fontSize: 13, textAlign: 'right' },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  scoreText: { fontSize: 12 },
  pageBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  pageText: { fontSize: 11 },
  content: { fontSize: 14, lineHeight: 24, textAlign: 'right' },
  upgradeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  upgradeBtnText: { fontSize: 15 },
  citationBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  citationBadgeText: { fontSize: 13 },
  exportBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginHorizontal: 4,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  exportBtnText: { fontSize: 14, color: '#fff' },
  insufficientBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: '#fef9c3',
    borderColor: '#fde047',
  },
  insufficientBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    textAlign: 'right',
    lineHeight: 20,
  },
});

type Category = 'all' | 'judicial' | 'circular' | 'regulation';

// ─── PDF Brief Export ─────────────────────────────────────────────────────────
async function exportBriefPDF(
  query: string,
  chunks: KnowledgeChunk[],
  hasCitations: boolean,
): Promise<void> {
  const today = new Date().toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const watermarkStyle = hasCitations
    ? ''
    : `
    .watermark {
      position: fixed;
      top: 38%;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 36pt;
      font-weight: bold;
      color: rgba(180,0,0,0.10);
      transform: rotate(-40deg);
      pointer-events: none;
      z-index: 9999;
      white-space: nowrap;
    }`;

  const watermarkHtml = hasCitations
    ? ''
    : `<div class="watermark">مذكرة غير موثّقة — للاسترشاد فقط</div>`;

  const resultsHtml = chunks
    .map((chunk, i) => {
      const score = Math.round((chunk.similarity ?? 0) * 100);
      const escapedContent = (chunk.content ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      const escapedDoc = (chunk.documentName ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `
      <div class="result-card">
        <div class="result-header">
          <span class="result-num">${i + 1}</span>
          <span class="result-doc">${escapedDoc}</span>
          <span class="result-score">${score}%</span>
        </div>
        <div class="result-body">${escapedContent}</div>
      </div>`;
    })
    .join('');

  const unverifiedBanner = hasCitations
    ? ''
    : `<div class="unverified-banner">
        ⚠️ هذه المذكرة لا تحتوي على استشهادات قانونية موثّقة — تُستخدم للاسترشاد فقط ولا تُعدّ رأياً قانونياً.
       </div>`;

  const escapedQuery = query
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 12pt; direction: rtl; color: #111; background: #fff; }
    .page { padding: 2cm 2.5cm; }
    .header { border-bottom: 3px solid #7c3a00; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand-name { font-size: 16pt; font-weight: bold; color: #7c3a00; }
    .brand-sub { font-size: 9pt; color: #888; margin-top: 2px; }
    .meta-date { font-size: 10pt; color: #555; text-align: left; }
    .query-box { background: #fef9f0; border-right: 4px solid #c47a0a; padding: 10px 14px; border-radius: 4px; margin-bottom: 22px; }
    .query-label { font-size: 10pt; color: #888; margin-bottom: 4px; }
    .query-text { font-size: 13pt; font-weight: bold; color: #1a1a1a; }
    .unverified-banner { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px 14px; margin-bottom: 18px; font-size: 10pt; color: #856404; line-height: 1.7; }
    .result-card { border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px 14px; margin-bottom: 14px; background: #fafaf8; page-break-inside: avoid; }
    .result-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-direction: row-reverse; }
    .result-num { background: #7c3a00; color: #fff; font-size: 10pt; font-weight: bold; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .result-doc { font-size: 11pt; font-weight: bold; color: #7c3a00; flex: 1; text-align: right; }
    .result-score { font-size: 10pt; color: #555; background: #f0f0f0; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
    .result-body { font-size: 11pt; line-height: 1.9; color: #1a1a1a; text-align: right; }
    .disclaimer { margin-top: 24px; padding: 10px 14px; background: #fffbea; border: 1px solid #ffe08a; border-radius: 4px; font-size: 9pt; color: #7a5f00; line-height: 1.7; }
    .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 9pt; color: #aaa; text-align: center; }
    ${watermarkStyle}
  </style>
</head>
<body>
  ${watermarkHtml}
  <div class="page">
    <div class="header">
      <div>
        <div class="brand-name">⚖️ رباب محاميتك الرقمية</div>
        <div class="brand-sub">RABAB LEGAL AI · مذكرة البحث القانوني</div>
      </div>
      <div class="meta-date">${today}</div>
    </div>

    <div class="query-box">
      <div class="query-label">موضوع البحث</div>
      <div class="query-text">${escapedQuery}</div>
    </div>

    ${unverifiedBanner}

    ${resultsHtml}

    <div class="disclaimer">⚠️ هذه المذكرة للاسترشاد فقط ولا تُعدّ رأياً قانونياً ملزماً — يُنصح بمراجعة محامٍ مرخّص قبل اتخاذ أي إجراء قانوني.</div>
    <div class="footer">تم إنشاء هذه المذكرة بواسطة رباب للذكاء الاصطناعي القانوني · للاسترشاد فقط</div>
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'مشاركة مذكرة البحث القانوني',
      UTI: 'com.adobe.pdf',
    });
  } else {
    Alert.alert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز');
  }
}

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'all', label: 'الكل', icon: 'layers-outline' },
  { key: 'judicial', label: 'أحكام', icon: 'hammer-outline' },
  { key: 'circular', label: 'تعاميم', icon: 'document-text-outline' },
  { key: 'regulation', label: 'لوائح', icon: 'book-outline' },
];

function CitationSummaryBadge({ citableCount }: { citableCount: number }) {
  const colors = useColors();
  const hasCitations = citableCount > 0;
  return (
    <View
      style={[
        styles.citationBadge,
        {
          backgroundColor: hasCitations ? '#16a34a22' : colors.destructive + '22',
          borderColor: hasCitations ? '#16a34a66' : colors.destructive + '66',
        },
      ]}
    >
      <Ionicons
        name={hasCitations ? 'checkmark-circle-outline' : 'alert-circle-outline'}
        size={15}
        color={hasCitations ? '#16a34a' : colors.destructive}
      />
      <Text
        style={[
          styles.citationBadgeText,
          {
            color: hasCitations ? '#16a34a' : colors.destructive,
            fontFamily: 'Cairo_600SemiBold',
          },
        ]}
      >
        {hasCitations ? `${citableCount} مرجع موثّق` : 'بدون استشهادات'}
      </Text>
    </View>
  );
}

function ResultCard({ chunk }: { chunk: KnowledgeChunk }) {
  const colors = useColors();
  const score = Math.round((chunk.similarity ?? 0) * 100);

  const pageLabel =
    chunk.pageStart != null
      ? chunk.pageEnd != null && chunk.pageEnd !== chunk.pageStart
        ? `ص. ${chunk.pageStart}–${chunk.pageEnd}`
        : `ص. ${chunk.pageStart}`
      : null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.scoreBadge, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.scoreText, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            {score}%
          </Text>
        </View>
        {pageLabel && (
          <View style={[styles.pageBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Text style={[styles.pageText, { color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' }]}>
              {pageLabel}
            </Text>
          </View>
        )}
        <Text
          style={[styles.docName, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]}
          numberOfLines={1}
        >
          {chunk.documentName}
        </Text>
      </View>
      <Text
        style={[styles.content, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
        numberOfLines={5}
      >
        {chunk.content}
      </Text>
    </View>
  );
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSubscription, setShowSubscription] = useState(false);
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 600);
  }, []);

  const STALE_TIME = 60_000;
  const lastFetchedAt = useRef<number | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useSearchKnowledge(
    {
      q: debouncedQuery,
      ...(category !== 'all' ? { category } : {}),
    } as any,
    {
      query: {
        enabled: !!user && debouncedQuery.length >= 2,
        retry: false,
        staleTime: STALE_TIME,
      },
    }
  );

  // Track when data was last successfully fetched
  useEffect(() => {
    if (data && !isFetching) {
      lastFetchedAt.current = Date.now();
    }
  }, [data, isFetching]);

  const is403 = (error as any)?.status === 403;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 84 : insets.bottom + 90;

  const handleExportPDF = useCallback(() => {
    const results = data?.results ?? [];
    const citableCount = data?.citableCount ?? 0;
    const hasCitations = citableCount > 0;

    const doExport = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsExportingPDF(true);
      try {
        await exportBriefPDF(debouncedQuery, results, hasCitations);
      } catch (e: any) {
        Alert.alert('خطأ', e?.message ?? 'فشل تصدير المذكرة');
      } finally {
        setIsExportingPDF(false);
      }
    };

    if (!hasCitations) {
      Alert.alert(
        'مذكرة غير موثّقة',
        'نتائج البحث لا تحتوي على استشهادات قانونية موثّقة. سيتم إضافة علامة مائية تحذيرية على كل صفحة.\n\nهل تريدين المتابعة؟',
        [
          { text: 'إلغاء', style: 'cancel' },
          { text: 'تصدير مع تحذير', style: 'destructive', onPress: doExport },
        ],
      );
    } else {
      doExport();
    }
  }, [data, debouncedQuery]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        {/* Header row: title + smart researcher button */}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold', marginBottom: 0 }]}>
            البحث القانوني
          </Text>
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/legal-research'); }}
            style={{
              flexDirection: 'row-reverse',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 7,
              borderRadius: 10,
              backgroundColor: colors.primary + '22',
              borderWidth: 1,
              borderColor: colors.primary + '55',
            }}
            activeOpacity={0.75}
          >
            <Ionicons name="sparkles" size={14} color={colors.primary} />
            <Text style={{ fontSize: 12, color: colors.primary, fontFamily: 'Cairo_700Bold' }}>الباحثة الذكية</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: debouncedQuery.length >= 2 ? colors.primary + '66' : colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
            placeholder="ابحث في المستندات القانونية..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={handleQueryChange}
            returnKeyType="search"
            textAlign="right"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setDebouncedQuery(''); }}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* Category pills */}
        <View style={styles.categories}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.catPill,
                {
                  backgroundColor: category === cat.key ? colors.primary : colors.muted,
                  borderColor: category === cat.key ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                Haptics.selectionAsync();
                const isNewCategory = cat.key !== category;
                setCategory(cat.key);
                if (
                  isNewCategory &&
                  debouncedQuery.length >= 2 &&
                  lastFetchedAt.current !== null &&
                  Date.now() - lastFetchedAt.current > STALE_TIME
                ) {
                  refetch();
                }
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.catText,
                  {
                    color: category === cat.key ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: 'Cairo_600SemiBold',
                  },
                ]}
              >
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Insufficient sources warning banner */}
        {data?.noSufficientSources && (
          <View style={styles.insufficientBanner}>
            <Ionicons name="warning-outline" size={16} color="#92400e" />
            <Text style={[styles.insufficientBannerText, { fontFamily: 'Cairo_600SemiBold' }]}>
              النتائج قد لا تكون كافية للاستشهاد – جرّب صياغة مختلفة
            </Text>
          </View>
        )}
      </View>

      {/* Body */}
      {!user ? (
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={52} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            تسجيل الدخول مطلوب
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            سجّل الدخول للوصول إلى الباحثة القانونية
          </Text>
        </View>
      ) : is403 ? (
        <View style={styles.centered}>
          <Ionicons name="ribbon-outline" size={52} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            مطلوب اشتراك مدفوع
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            الباحثة القانونية الذكية متاحة للمشتركين في الباقات المدفوعة
          </Text>
          <TouchableOpacity
            style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
            onPress={() => setShowSubscription(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="rocket-outline" size={18} color={colors.primaryForeground} />
            <Text style={[styles.upgradeBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
              اشترك الآن
            </Text>
          </TouchableOpacity>
          <SubscriptionSheet
            visible={showSubscription}
            onClose={() => {
              setShowSubscription(false);
              if (debouncedQuery.length >= 2) refetch();
            }}
          />
        </View>
      ) : isLoading || isFetching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', marginTop: 12 }]}>
            جاري البحث...
          </Text>
        </View>
      ) : debouncedQuery.length < 2 ? (
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={56} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            ابدأ البحث
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            اكتب أي مصطلح قانوني أو موضوع للبحث في قاعدة المعرفة
          </Text>
        </View>
      ) : data?.results?.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            لا توجد نتائج
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            جرّب كلمات مختلفة أو تغيير الفئة
          </Text>
        </View>
      ) : (
        <FlatList
          data={data?.results ?? []}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => <ResultCard chunk={item} />}
          ListHeaderComponent={
            data?.results && data.results.length > 0 ? (
              <CitationSummaryBadge citableCount={data.citableCount ?? 0} />
            ) : null
          }
          ListFooterComponent={
            data?.results && data.results.length > 0 ? (
              <TouchableOpacity
                style={[
                  styles.exportBtn,
                  {
                    backgroundColor: (data.citableCount ?? 0) > 0
                      ? colors.primary
                      : colors.destructive,
                    opacity: isExportingPDF ? 0.7 : 1,
                  },
                ]}
                onPress={handleExportPDF}
                disabled={isExportingPDF}
                activeOpacity={0.85}
              >
                {isExportingPDF ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="document-text-outline" size={17} color="#fff" />
                )}
                <Text style={[styles.exportBtnText, { fontFamily: 'Cairo_700Bold' }]}>
                  {isExportingPDF
                    ? 'جارٍ التصدير…'
                    : (data.citableCount ?? 0) > 0
                      ? 'تصدير المذكرة PDF'
                      : 'تصدير مع علامة مائية'}
                </Text>
              </TouchableOpacity>
            ) : null
          }
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          scrollEnabled={!!(data?.results && data.results.length > 0)}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
