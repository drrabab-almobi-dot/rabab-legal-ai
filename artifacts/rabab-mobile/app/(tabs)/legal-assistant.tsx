/**
 * Legal Assistant Hub — matches the web legal-assistant.tsx design:
 *   • Two service cards with thick secondary-color (cyan/gold) borders
 *   • Features list per card
 *   • AI disclaimer at the bottom
 *
 * Session restore: on mount we check AsyncStorage for the last active
 * consultation ID and navigate directly to it. A "New Conversation"
 * button in the chat header clears the key so this redirect is skipped.
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { LAST_CHAT_STORAGE_KEY } from '@/src/screens/ChatScreen';

const SECTIONS = [
  {
    icon: 'chatbubble-ellipses-outline' as const,
    title: 'الاستشارات القانونية',
    subtitle: 'استشارة متخصصة',
    desc: 'احصل على استشارة قانونية متخصصة بـ 28 نوع مهمة: تكييف قانوني، تقييم قوة القضية، صياغة المذكرات، تحليل الأدلة، وغيرها — مع الاستناد للأنظمة المعتمدة فقط.',
    route: '/consultation/new' as const,
    badge: '✓ الأكثر طلباً',
    features: [
      '28 نوع مهمة قانونية متخصصة',
      'استشهاد من الأنظمة المعتمدة فقط',
      'مذكرات وصحائف دعوى جاهزة للتصدير',
    ],
  },
  {
    icon: 'document-text-outline' as const,
    title: 'صياغة ومراجعة العقود',
    subtitle: 'الخدمة الرئيسية',
    desc: 'صِغ عقوداً جديدة بمعايير نظامية، راجع العقود القائمة واكشف ثغراتها، واستخرج بياناتها الجوهرية — متوافق مع أنظمة المملكة العربية السعودية ودول الخليج.',
    route: '/contract/drafter' as const,
    badge: '✓ الأكثر استقراراً',
    features: [
      'صياغة عقود العمل والتجارة والخدمات',
      'مراجعة شاملة وكشف الثغرات',
      'استخراج البنود الجوهرية بالذكاء الاصطناعي',
    ],
  },
] as const;

export default function LegalAssistantScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // undefined = still checking, null = no saved session, number = saved id
  const [restoredId, setRestoredId] = useState<number | null | undefined>(undefined);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 84 : insets.bottom + 90;

  // On mount: check AsyncStorage for the last active consultation
  useEffect(() => {
    AsyncStorage.getItem(LAST_CHAT_STORAGE_KEY)
      .then((val) => {
        const id = val ? parseInt(val, 10) : NaN;
        setRestoredId(Number.isFinite(id) && id > 0 ? id : null);
      })
      .catch(() => setRestoredId(null));
  }, []);

  // Auto-navigate once we know the saved ID
  useEffect(() => {
    if (typeof restoredId === 'number') {
      router.replace(`/chat/${restoredId}` as any);
    }
  }, [restoredId]);

  const handlePress = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  // Show spinner while checking AsyncStorage (usually <50 ms)
  if (restoredId === undefined || typeof restoredId === 'number') {
    return (
      <View style={[s.root, s.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: topPad + 16, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.secondary, fontFamily: 'Cairo_700Bold' }]}>
          المساعدة القانونية
        </Text>
        <Text style={[s.headerSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          خدمات متخصصة
        </Text>
        <Text style={[s.headerDesc, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
          خدمات قانونية وقضائية متكاملة؛ من تقديم الاستشارات القانونية والقضائية المتخصصة إلى
          صياغة العقود وفق الأنظمة السعودية ودول مجلس التعاون.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Service Cards ─────────────────────────────────── */}
        {SECTIONS.map((sec) => (
          <TouchableOpacity
            key={sec.route}
            activeOpacity={0.82}
            onPress={() => handlePress(sec.route)}
            style={[
              s.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.secondary,
              },
            ]}
          >
            {/* Badge */}
            <View style={[s.badge, { backgroundColor: colors.secondary }]}>
              <Text style={[s.badgeText, { color: colors.secondaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                {sec.badge}
              </Text>
            </View>

            {/* Icon circle */}
            <View style={[s.iconWrap, { backgroundColor: colors.secondary + '1a' }]}>
              <Ionicons name={sec.icon} size={32} color={colors.secondary} />
            </View>

            {/* Subtitle */}
            <Text style={[s.subtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' }]}>
              {sec.subtitle}
            </Text>

            {/* Title */}
            <Text style={[s.cardTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
              {sec.title}
            </Text>

            {/* Description */}
            <Text style={[s.cardDesc, { color: colors.foreground + 'e6', fontFamily: 'Cairo_400Regular' }]}>
              {sec.desc}
            </Text>

            {/* Features */}
            <View style={s.featuresList}>
              {sec.features.map((f) => (
                <View key={f} style={s.featureRow}>
                  <View style={[s.featureDot, { backgroundColor: colors.secondary + '99' }]} />
                  <Text style={[s.featureText, { color: colors.foreground + 'cc', fontFamily: 'Cairo_400Regular' }]}>
                    {f}
                  </Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <View style={s.cta}>
              <Text style={[s.ctaText, { color: colors.secondary, fontFamily: 'Cairo_700Bold' }]}>
                فتح
              </Text>
              <Ionicons name="arrow-back" size={16} color={colors.secondary} />
            </View>
          </TouchableOpacity>
        ))}

        {/* ── Disclaimer ────────────────────────────────────── */}
        <View style={[s.disclaimer, { backgroundColor: '#1e3a5f', borderColor: '#60a5fa99' }]}>
          <Text style={[s.disclaimerText, { color: '#bfdbfe', fontFamily: 'Cairo_400Regular' }]}>
            ⚠️ جميع المخرجات إرشادية أولية صادرة عن الذكاء الاصطناعي، ولا تُعدّ رأياً قانونياً ملزماً ولا تُغني عن مراجعة محامٍ مرخّص.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 26,
    textAlign: 'right',
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 12,
    textAlign: 'right',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerDesc: {
    fontSize: 13,
    textAlign: 'right',
    lineHeight: 22,
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 20,
    gap: 16,
  },

  card: {
    borderWidth: 3,
    borderRadius: 20,
    padding: 20,
    marginBottom: 4,
  },

  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 10,
  },

  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },

  subtitle: {
    fontSize: 10,
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },

  cardTitle: {
    fontSize: 20,
    textAlign: 'right',
    marginBottom: 10,
    lineHeight: 30,
  },

  cardDesc: {
    fontSize: 13,
    textAlign: 'right',
    lineHeight: 22,
    marginBottom: 14,
  },

  featuresList: {
    gap: 8,
    marginBottom: 18,
  },
  featureRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  featureText: {
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },

  cta: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  ctaText: {
    fontSize: 14,
  },

  disclaimer: {
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 20,
    textAlign: 'right',
  },
});
