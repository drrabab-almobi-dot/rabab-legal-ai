import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, FlatList,
  ActivityIndicator, Platform, Pressable, TouchableOpacity,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getSearchKnowledgeQueryKey, useSearchKnowledge, type KnowledgeChunk } from '@workspace/api-client-react';
import { useAuth } from '@/contexts/AuthContext';
import { SubscriptionSheet } from '@/components/SubscriptionSheet';

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 4 },
  headerTitle: { fontSize: 20, textAlign: 'right' },
  headerSub: { fontSize: 13, textAlign: 'right', marginBottom: 14 },
  categoryTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryTagText: { fontSize: 12 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
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
  cardTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  indexBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexText: { fontSize: 14 },
  cardMeta: { flex: 1, gap: 4 },
  docName: { fontSize: 14, textAlign: 'right' },
  scorePill: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  scoreText: { fontSize: 11 },
  divider: { height: 1 },
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
});

function CircularCard({ chunk, index }: { chunk: KnowledgeChunk; index: number }) {
  const colors = useColors();
  const score = Math.round((chunk.similarity ?? 0) * 100);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.indexBadge, { backgroundColor: colors.secondary + '22' }]}>
          <Text style={[styles.indexText, { color: colors.secondary, fontFamily: 'Cairo_700Bold' }]}>
            {index + 1}
          </Text>
        </View>
        <View style={styles.cardMeta}>
          <Text style={[styles.docName, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]} numberOfLines={1}>
            {chunk.documentName}
          </Text>
          <View style={[styles.scorePill, { backgroundColor: colors.primary + '22' }]}>
            <Text style={[styles.scoreText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
              {score}% تطابق
            </Text>
          </View>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Text style={[styles.content, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]} numberOfLines={5}>
        {chunk.content}
      </Text>
    </View>
  );
}

export default function CircularsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSubscription, setShowSubscription] = useState(false);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(text), 600);
  }, []);

  const searchParams = { q: debouncedQuery, category: 'circular' } as any;
  const { data, isLoading, isFetching, error } = useSearchKnowledge(
    searchParams,
    {
      query: {
        queryKey: getSearchKnowledgeQueryKey(searchParams),
        enabled: !!user && debouncedQuery.length >= 2,
        retry: false,
        staleTime: 60_000,
      },
    }
  );

  const is403 = (error as any)?.status === 403;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 84 : insets.bottom + 90;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 16, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerRow}>
          <View style={[styles.categoryTag, { backgroundColor: colors.secondary + '22', borderColor: colors.secondary + '44' }]}>
            <Text style={[styles.categoryTagText, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]}>
              تعاميم
            </Text>
          </View>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            باحث التعاميم الذكي
          </Text>
        </View>
        <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          ابحث في تعاميم الجهات الحكومية والتنظيمية
        </Text>

        {/* Search Bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.muted, borderColor: debouncedQuery.length >= 2 ? colors.secondary + '88' : colors.border }]}>
          <Ionicons name="search" size={18} color={colors.secondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
            placeholder="ابحث عن تعميم..."
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
      </View>

      {/* Results / States */}
      {!user ? (
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={52} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            تسجيل الدخول مطلوب
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            سجّل الدخول للبحث في التعاميم
          </Text>
        </View>
      ) : is403 ? (
        <View style={styles.centered}>
          <Ionicons name="ribbon-outline" size={52} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            مطلوب اشتراك مدفوع
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            باحث التعاميم متاح للمشتركين في الباقات المدفوعة
          </Text>
          <TouchableOpacity
            style={[styles.upgradeBtn, { backgroundColor: colors.secondary }]}
            onPress={() => setShowSubscription(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="rocket-outline" size={18} color="#fff" />
            <Text style={[styles.upgradeBtnText, { color: '#fff', fontFamily: 'Cairo_700Bold' }]}>
              اشترك الآن
            </Text>
          </TouchableOpacity>
          <SubscriptionSheet visible={showSubscription} onClose={() => setShowSubscription(false)} />
        </View>
      ) : isLoading || isFetching ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.secondary} />
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', marginTop: 12 }]}>
            جاري البحث في التعاميم...
          </Text>
        </View>
      ) : debouncedQuery.length < 2 ? (
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={56} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            ابحث في التعاميم
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            أدخل رقم التعميم أو موضوعه للبحث الفوري
          </Text>
        </View>
      ) : data?.results?.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="search-outline" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            لا توجد تعاميم
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            جرّب كلمات بحث مختلفة
          </Text>
        </View>
      ) : (
        <FlatList
          data={data?.results ?? []}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => <CircularCard chunk={item} index={index} />}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          scrollEnabled={!!(data?.results && data.results.length > 0)}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
