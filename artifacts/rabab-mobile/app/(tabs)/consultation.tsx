import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, ActivityIndicator, Platform,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter, useFocusEffect } from 'expo-router';
import { getListMyConsultationsQueryKey, useListMyConsultations, type Consultation } from '@workspace/api-client-react';
import { useAuth, apiFetch } from '@/contexts/AuthContext';

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSimple: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  headerTitle: { fontSize: 22, textAlign: 'right' },
  newBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  consultCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  consultHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, marginLeft: 'auto' },
  dateText: { fontSize: 12 },
  consultTitle: { fontSize: 15, textAlign: 'right', lineHeight: 24 },
  areaBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  areaText: { fontSize: 12 },
  typeBadge: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 12 },
  openBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  openBtnText: { fontSize: 14 },
  contractBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 12,
  },
  contractBannerTitle: { fontSize: 14, textAlign: 'right' },
  contractBannerSub: { fontSize: 12, textAlign: 'right', marginTop: 1 },
  snippetRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  snippetText: { fontSize: 12, lineHeight: 18, flex: 1, textAlign: 'right' },
  proactiveBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  proactiveBannerText: { fontSize: 14, textAlign: 'center' },
});

function ConsultationCard({ item }: { item: Consultation }) {
  const colors = useColors();
  const router = useRouter();

  const statusColors: Record<string, string> = {
    pending: colors.accent,
    answered: colors.secondary,
    closed: colors.mutedForeground,
  };

  const statusLabels: Record<string, string> = {
    pending: 'قيد المراجعة',
    answered: 'تمت الإجابة',
    closed: 'مغلقة',
  };

  const isJudicial = item.taskType === 'judicial';
  const typeEmoji = isJudicial ? '🏛️' : '⚖️';
  const typeLabel = isJudicial ? 'قضائية' : 'قانونية';
  const typeColor = isJudicial ? colors.secondary : colors.primary;

  const handleOpen = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/chat/${item.id}` as any);
  };

  const date = new Date(item.createdAt).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <TouchableOpacity
      style={[styles.consultCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handleOpen}
      activeOpacity={0.8}
    >
      <View style={styles.consultHeader}>
        <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] ?? colors.mutedForeground }]} />
        <Text style={[styles.statusText, { color: statusColors[item.status] ?? colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' }]}>
          {statusLabels[item.status] ?? item.status}
        </Text>
        <Text style={[styles.dateText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          {date}
        </Text>
      </View>
      <Text style={[styles.consultTitle, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
        {item.title}
      </Text>
      <View style={[styles.typeBadge, { backgroundColor: typeColor + '18', borderColor: typeColor + '40' }]}>
        <Text style={[styles.typeBadgeText, { color: typeColor, fontFamily: 'Cairo_600SemiBold' }]}>
          {typeEmoji} {typeLabel}
        </Text>
      </View>
      {item.areaAr && (
        <View style={[styles.areaBadge, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[styles.areaText, { color: colors.accent, fontFamily: 'Cairo_400Regular' }]}>
            {item.areaAr}
          </Text>
        </View>
      )}
      {item.lastMessageSnippet ? (
        <View style={[styles.snippetRow, { borderTopColor: colors.border }]}>
          <Ionicons
            name={item.lastMessageRole === 'user' ? 'person-outline' : 'sparkles-outline'}
            size={13}
            color={colors.mutedForeground}
            style={{ marginTop: 1 }}
          />
          <Text
            style={[styles.snippetText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}
            numberOfLines={2}
          >
            {item.lastMessageSnippet}
          </Text>
        </View>
      ) : null}
      <View style={[styles.openBtn, { backgroundColor: colors.primary + '18', borderColor: colors.primary + '44', borderWidth: 1 }]}>
        <Ionicons name="chatbubble-ellipses-outline" size={15} color={colors.primary} />
        <Text style={[styles.openBtnText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
          فتح المحادثة
        </Text>
        <Ionicons name="arrow-back" size={14} color={colors.primary} style={{ marginRight: 'auto' }} />
      </View>
    </TouchableOpacity>
  );
}

export default function ConsultationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  const { data: consultations, isLoading, refetch } = useListMyConsultations({
    query: { queryKey: getListMyConsultationsQueryKey(), enabled: !!user, staleTime: 30_000 },
  });

  // ── Proactive KB search indicator ─────────────────────────────────────────
  // When the user returns to this screen after creating a consultation,
  // poll the server's proactive-status endpoint for the newest consultation
  // (if it was created within the last 30 s) and show a banner while the
  // background KB pre-fetch is still running.
  const [preparingSources, setPreparingSources] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polledIdRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (pollingRef.current) clearTimeout(pollingRef.current); };
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Refetch list so we see the newest consultation immediately
      refetch();
    }, [refetch])
  );

  // Start polling when a fresh consultation appears at the top of the list
  useEffect(() => {
    const newest = consultations?.[0];
    if (!newest) return;
    if (polledIdRef.current === newest.id) return; // already handled this one

    const ageMs = Date.now() - new Date(newest.createdAt).getTime();
    if (ageMs > 30_000) return; // too old — proactive search already done or irrelevant

    polledIdRef.current = newest.id;
    const consultationId = newest.id;
    setPreparingSources(true);

    if (pollingRef.current) clearTimeout(pollingRef.current);
    const maxUntil = Date.now() + 20_000; // 20 s safety cap

    const poll = async () => {
      if (Date.now() >= maxUntil) { setPreparingSources(false); return; }
      try {
        // apiFetch injects the stored Bearer token and uses EXPO_PUBLIC_DOMAIN as base URL
        const d = await apiFetch<{ ready: boolean }>(
          `/api/consultations/${consultationId}/proactive-status`
        );
        if (d.ready) { setPreparingSources(false); return; }
      } catch (err: any) {
        // Stop on auth/not-found errors; keep polling on transient network errors
        const msg = String(err?.message ?? '');
        if (/40[134]/.test(msg)) { setPreparingSources(false); return; }
      }
      pollingRef.current = setTimeout(poll, 1500);
    };

    pollingRef.current = setTimeout(poll, 600);
  }, [consultations]);

  const handleNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/consultation/new' as any);
  };

  const handleContractDrafter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/contract/drafter' as any);
  };

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 84 : insets.bottom + 90;

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.headerSimple, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            الاستشارات
          </Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={56} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            تسجيل الدخول مطلوب
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            سجّل الدخول لطلب استشارة قانونية
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
            onPress={handleNew}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color={colors.primaryForeground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            الاستشارات
          </Text>
        </View>

        {/* Contract Drafter quick-access banner */}
        <TouchableOpacity
          style={[styles.contractBanner, { backgroundColor: colors.card, borderColor: colors.secondary + '55' }]}
          onPress={handleContractDrafter}
          activeOpacity={0.82}
        >
          <Ionicons name="arrow-back" size={16} color={colors.secondary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.contractBannerTitle, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
              صياغة عقد بالذكاء الاصطناعي
            </Text>
            <Text style={[styles.contractBannerSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              اصطح عقداً وصدّره PDF مباشرةً
            </Text>
          </View>
          <Text style={{ fontSize: 22 }}>📄</Text>
        </TouchableOpacity>
      </View>

      {/* Proactive KB search indicator — shown while server-side KB pre-fetch is running */}
      {preparingSources && (
        <View style={[styles.proactiveBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
          <Text style={[styles.proactiveBannerText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
            ⚡ جارٍ تحضير مصادر قانونية ذات صلة…
          </Text>
        </View>
      )}

      {/* Consultations List */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !consultations || consultations.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubbles-outline" size={52} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            لا توجد استشارات
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            اضغط + لطلب استشارتك الأولى
          </Text>
        </View>
      ) : (
        <FlatList
          data={consultations}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <ConsultationCard item={item} />}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled
        />
      )}
    </View>
  );
}
