import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { getListPackagesQueryKey, useListPackages, useInitiatePayment, type Package } from '@workspace/api-client-react';
import { useAuth, type AuthUser } from '@/contexts/AuthContext';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetTitle: { fontSize: 17 },
  sheetContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 12 },
  subheading: {
    fontSize: 13,
    textAlign: 'right',
    lineHeight: 20,
    marginBottom: 4,
  },

  // Package card
  pkgCard: {
    borderRadius: 14,
    padding: 16,
    gap: 12,
    overflow: 'hidden',
  },
  popularBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomRightRadius: 10,
  },
  popularText: { fontSize: 11 },
  pkgTop: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12, marginTop: 4 },
  pkgNameCol: { flex: 1, gap: 3 },
  pkgPriceCol: { alignItems: 'flex-end', gap: 2 },
  pkgName: { fontSize: 16, textAlign: 'right' },
  pkgDesc: { fontSize: 12, textAlign: 'right', lineHeight: 18 },
  pkgPrice: { fontSize: 26, lineHeight: 30 },
  pkgCurrency: { fontSize: 12 },
  featureList: { gap: 6 },
  featureRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, fontSize: 13, textAlign: 'right', lineHeight: 20 },
  subscribeBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  subscribeBtnText: { fontSize: 15 },

  // Billing step
  billingStep: { gap: 14 },
  backBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'flex-end' },
  backText: { fontSize: 14 },
  selectedPkg: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
    alignItems: 'flex-end',
  },
  selectedPkgLabel: { fontSize: 12 },
  selectedPkgName: { fontSize: 16 },
  selectedPkgPrice: { fontSize: 20 },
  billingFields: { gap: 8 },
  billingTitle: { fontSize: 15, textAlign: 'right', marginBottom: 2 },
  billingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  billingLabel: { fontSize: 12, minWidth: 48 },
  billingValue: { flex: 1, fontSize: 14, textAlign: 'right' },
  phoneRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  phoneInput: { flex: 1, fontSize: 14, padding: 0 },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  confirmBtnText: { fontSize: 15 },
  secureNote: { fontSize: 12, textAlign: 'center' },

  // Loading
  loadingState: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  loadingText: { fontSize: 14, textAlign: 'center' },
});

interface SubscriptionSheetProps {
  visible: boolean;
  onClose: () => void;
}

// ─── Package Card ────────────────────────────────────────────────────────────
function PackageCard({
  pkg,
  onSubscribe,
  isLoading,
}: {
  pkg: Package;
  onSubscribe: (pkg: Package) => void;
  isLoading: boolean;
}) {
  const colors = useColors();
  const isFree = pkg.type === 'free';

  return (
    <View
      style={[
        styles.pkgCard,
        {
          backgroundColor: colors.card,
          borderColor: pkg.isPopular ? colors.primary : colors.border,
          borderWidth: pkg.isPopular ? 2 : 1,
        },
      ]}
    >
      {pkg.isPopular && (
        <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
          <Text style={[styles.popularText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
            الأكثر طلباً
          </Text>
        </View>
      )}

      {/* Name + Price */}
      <View style={styles.pkgTop}>
        <View style={styles.pkgPriceCol}>
          {isFree ? (
            <Text style={[styles.pkgPrice, { color: colors.secondary, fontFamily: 'Cairo_700Bold' }]}>
              مجاني
            </Text>
          ) : (
            <>
              <Text style={[styles.pkgPrice, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                {pkg.price.toLocaleString('ar-SA')}
              </Text>
              <Text style={[styles.pkgCurrency, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                ريال
              </Text>
            </>
          )}
        </View>
        <View style={styles.pkgNameCol}>
          <Text style={[styles.pkgName, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            {pkg.nameAr}
          </Text>
          {pkg.descriptionAr ? (
            <Text style={[styles.pkgDesc, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              {pkg.descriptionAr}
            </Text>
          ) : (
            <Text style={[styles.pkgDesc, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              {pkg.questionsAllowed} استشارة قانونية
            </Text>
          )}
        </View>
      </View>

      {/* Features */}
      {pkg.features && pkg.features.length > 0 && (
        <View style={styles.featureList}>
          {pkg.features.map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.secondary} />
              <Text style={[styles.featureText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                {f}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Subscribe button */}
      {!isFree && (
        <TouchableOpacity
          style={[
            styles.subscribeBtn,
            {
              backgroundColor: pkg.isPopular ? colors.primary : colors.muted,
              borderColor: pkg.isPopular ? colors.primary : colors.primary + '66',
              borderWidth: pkg.isPopular ? 0 : 1,
            },
          ]}
          onPress={() => onSubscribe(pkg)}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={pkg.isPopular ? colors.primaryForeground : colors.primary} />
          ) : (
            <Text
              style={[
                styles.subscribeBtnText,
                {
                  color: pkg.isPopular ? colors.primaryForeground : colors.primary,
                  fontFamily: 'Cairo_700Bold',
                },
              ]}
            >
              اشترك الآن
            </Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Billing Form Step ───────────────────────────────────────────────────────
function BillingStep({
  pkg,
  user,
  onConfirm,
  onBack,
  isLoading,
}: {
  pkg: Package;
  user: AuthUser;
  onConfirm: (phone: string) => void;
  onBack: () => void;
  isLoading: boolean;
}) {
  const colors = useColors();
  const [phone, setPhone] = useState(user.phone ?? '');

  const handleConfirm = () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      Alert.alert('تنبيه', 'يرجى إدخال رقم الجوال');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <View style={styles.billingStep}>
      {/* Back */}
      <TouchableOpacity style={styles.backBtn} onPress={onBack} disabled={isLoading}>
        <Ionicons name="arrow-back" size={20} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
          تغيير الباقة
        </Text>
      </TouchableOpacity>

      {/* Selected package summary */}
      <View style={[styles.selectedPkg, { backgroundColor: colors.primary + '11', borderColor: colors.primary + '33' }]}>
        <Text style={[styles.selectedPkgLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          الباقة المختارة
        </Text>
        <Text style={[styles.selectedPkgName, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
          {pkg.nameAr}
        </Text>
        <Text style={[styles.selectedPkgPrice, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
          {pkg.price.toLocaleString('ar-SA')} ريال
        </Text>
      </View>

      {/* Billing fields */}
      <View style={styles.billingFields}>
        <Text style={[styles.billingTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
          بيانات الفوترة
        </Text>

        <View style={[styles.billingRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="person-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.billingValue, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
            {user.name}
          </Text>
          <Text style={[styles.billingLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            الاسم
          </Text>
        </View>

        <View style={[styles.billingRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="mail-outline" size={16} color={colors.mutedForeground} />
          <Text style={[styles.billingValue, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
            {user.email}
          </Text>
          <Text style={[styles.billingLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            البريد
          </Text>
        </View>

        <View style={[styles.phoneRow, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.billingLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            الجوال
          </Text>
          <TextInput
            style={[styles.phoneInput, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="05xxxxxxxx"
            placeholderTextColor={colors.mutedForeground}
            textAlign="right"
            editable={!isLoading}
          />
        </View>
      </View>

      {/* Confirm button */}
      <TouchableOpacity
        style={[styles.confirmBtn, { backgroundColor: isLoading ? colors.muted : colors.primary }]}
        onPress={handleConfirm}
        disabled={isLoading}
        activeOpacity={0.85}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primaryForeground} />
        ) : (
          <>
            <Ionicons name="lock-closed" size={16} color={colors.primaryForeground} />
            <Text style={[styles.confirmBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
              الدفع الآمن – {pkg.price.toLocaleString('ar-SA')} ريال
            </Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={[styles.secureNote, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
        سيتم توجيهك إلى بوابة الدفع الآمنة
      </Text>
    </View>
  );
}

// ─── Main Sheet ──────────────────────────────────────────────────────────────
export function SubscriptionSheet({ visible, onClose }: SubscriptionSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [initiatingId, setInitiatingId] = useState<number | null>(null);

  const { data: packages, isLoading: pkgLoading } = useListPackages({
    query: { queryKey: getListPackagesQueryKey(), enabled: visible, staleTime: 5 * 60_000 },
  });

  const { mutateAsync: initiatePayment } = useInitiatePayment();

  // Only show paid packages (exclude free)
  const paidPackages = (packages ?? []).filter((p) => p.type !== 'free' && p.isActive);

  const handleSelectPackage = (pkg: Package) => {
    Haptics.selectionAsync();
    setSelectedPkg(pkg);
  };

  const handleBillingConfirm = async (phone: string) => {
    if (!user || !selectedPkg) return;
    setInitiatingId(selectedPkg.id);
    try {
      const session = await initiatePayment({
        data: {
          packageId: selectedPkg.id,
          billingName: user.name,
          billingEmail: user.email,
          billingPhone: phone,
        },
      });

      if (session.checkoutUrl) {
        onClose();
        await WebBrowser.openBrowserAsync(session.checkoutUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('تنبيه', 'تعذّر الحصول على رابط الدفع. يرجى المحاولة لاحقاً.');
      }
    } catch (err: any) {
      Alert.alert('خطأ', err?.message ?? 'تعذّر بدء عملية الدفع');
    } finally {
      setInitiatingId(null);
    }
  };

  const handleClose = () => {
    setSelectedPkg(null);
    setInitiatingId(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent={Platform.OS === 'android'}
    >
      {/* Backdrop */}
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

      {/* Sheet */}
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Handle */}
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[styles.sheetTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            {selectedPkg ? 'تأكيد الاشتراك' : 'الباقات المتاحة'}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
        >
          {selectedPkg && user ? (
            <BillingStep
              pkg={selectedPkg}
              user={user}
              onConfirm={handleBillingConfirm}
              onBack={() => setSelectedPkg(null)}
              isLoading={initiatingId === selectedPkg.id}
            />
          ) : pkgLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                جاري تحميل الباقات...
              </Text>
            </View>
          ) : paidPackages.length === 0 ? (
            <View style={styles.loadingState}>
              <Ionicons name="cube-outline" size={48} color={colors.border} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                لا توجد باقات متاحة حالياً
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.subheading, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                فعّل اشتراكك للوصول إلى الباحث القانوني الذكي وجميع الميزات المتقدمة
              </Text>
              {paidPackages.map((pkg) => (
                <PackageCard
                  key={pkg.id}
                  pkg={pkg}
                  onSubscribe={handleSelectPackage}
                  isLoading={initiatingId === pkg.id}
                />
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
