import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Alert, Platform, Modal, Share, Linking,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGetMySubscription, useListMyPayments, useListMyInvoices, customFetch } from '@workspace/api-client-react';
import type { Payment, Invoice } from '@workspace/api-client-react';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { SubscriptionSheet } from '@/components/SubscriptionSheet';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as SecureStore from '@/utils/storage';
import { useAuth, PhoneVerificationRequiredError } from '@/contexts/AuthContext';

type Mode = 'login' | 'register' | 'verify';

const STATUS_LABEL: Record<string, string> = {
  paid: 'مدفوع',
  pending: 'معلّق',
  failed: 'فاشل',
  refunded: 'مُسترد',
};

const TOKEN_STORAGE_KEY = '@rabab_legal_jwt';

const invStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16 },
  numBadge: {
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
  numText: { fontSize: 18, letterSpacing: 0.5 },
  numLabel: { fontSize: 12 },
  rows: { marginTop: 8 },
  row: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 14 },
  actionRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 16,
  },
  pdfBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  shareBtnText: { fontSize: 15 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Profile
  profileScroll: { paddingHorizontal: 16, gap: 14 },
  avatarSection: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28 },
  welcomeName: { fontSize: 20, textAlign: 'center' },
  welcomeRole: { fontSize: 14 },
  section: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  sectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, padding: 14, paddingBottom: 10 },
  sectionTitle: { fontSize: 15 },
  infoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  infoLeft: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  infoLabel: { fontSize: 13 },
  infoValue: { fontSize: 14 },
  subBadge: {
    alignSelf: 'flex-end',
    marginRight: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  subBadgeText: { fontSize: 14 },
  expiryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  expiryText: { fontSize: 13, textAlign: 'right', flex: 1 },
  quotaSection: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 12, gap: 6 },
  quotaHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  quotaNumbers: { fontSize: 13 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  quotaRemaining: { fontSize: 13, textAlign: 'right' },
  quotaRow: { flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, paddingHorizontal: 14, paddingBottom: 14 },
  quotaValue: { fontSize: 28 },
  quotaLabel: { fontSize: 13 },
  renewBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 10,
    borderRadius: 10,
    justifyContent: 'center',
    borderWidth: 1,
  },
  renewBtnText: { fontSize: 14 },
  noSub: { paddingHorizontal: 14, paddingTop: 4, textAlign: 'right', fontSize: 14 },
  upgradeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 11,
    borderRadius: 10,
    justifyContent: 'center',
  },
  upgradeBtnText: { fontSize: 14 },
  whatsappBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  whatsappBtnText: { fontSize: 15 },
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  logoutText: { fontSize: 15 },
  recoverBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 9,
    borderRadius: 10,
    justifyContent: 'center',
    borderWidth: 1,
  },
  recoverBtnText: { fontSize: 13 },
  payLoading: { paddingVertical: 20, alignItems: 'center' },
  noPayments: { paddingHorizontal: 14, paddingVertical: 14, textAlign: 'right', fontSize: 13 },

  // Auth
  authScroll: { paddingHorizontal: 20, gap: 16 },
  authHeader: { alignItems: 'center', paddingVertical: 12, gap: 8 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 4,
  },
  authTitle: { fontSize: 24, letterSpacing: 1 },
  authSub: { fontSize: 14 },
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  modeTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  modeTabText: { fontSize: 14 },
  form: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  authBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  authBtnText: { fontSize: 16 },
});

// ── Invoice Modal ─────────────────────────────────────────────────────────────
function InvoiceModal({
  invoice,
  visible,
  onClose,
  colors,
}: {
  invoice: Invoice | null;
  visible: boolean;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [isDownloading, setIsDownloading] = useState(false);

  if (!invoice) return null;

  const date = new Date(invoice.createdAt);
  const dateStr = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

  const handleShare = async () => {
    const base = invoice.amount.toFixed(2);
    const vat  = invoice.vatAmount.toFixed(2);
    const total = invoice.totalAmount.toFixed(2);
    const discount = (invoice.discountAmount ?? 0) > 0 ? `\nالخصم: ${(invoice.discountAmount ?? 0).toFixed(2)} ر.س` : '';
    const text = [
      `فاتورة رسمية – RABAB LEGAL`,
      `رقم الفاتورة: ${invoice.invoiceNumber}`,
      `التاريخ: ${dateStr}`,
      invoice.billingName ? `اسم المشترك: ${invoice.billingName}` : '',
      invoice.billingEmail ? `البريد: ${invoice.billingEmail}` : '',
      `الباقة: ${invoice.packageNameAr ?? invoice.payment?.package?.nameAr ?? '—'}`,
      `المبلغ الأساسي: ${base} ر.س`,
      discount,
      `ضريبة القيمة المضافة (15%): ${vat} ر.س`,
      `الإجمالي: ${total} ر.س`,
    ].filter(Boolean).join('\n');

    try {
      await Share.share({ message: text, title: `فاتورة ${invoice.invoiceNumber}` });
    } catch {
      // user cancelled — ignore
    }
  };

  const handleDownloadPdf = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
      const url = `${baseUrl}/api/invoices/${invoice.id}/pdf`;

      // expo-file-system v57 uses class-based API
      const destination = new FileSystem.File(
        FileSystem.Paths.cache,
        `invoice-${invoice.invoiceNumber}.pdf`,
      );

      const task = FileSystem.File.createDownloadTask(url, destination, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const downloaded = await task.downloadAsync();
      if (!downloaded) {
        Alert.alert('خطأ', 'تعذّر تحميل الفاتورة، يرجى المحاولة لاحقاً.');
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloaded.uri, {
          mimeType: 'application/pdf',
          dialogTitle: `فاتورة ${invoice.invoiceNumber}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('تم التحميل', 'تم حفظ ملف الفاتورة بنجاح.');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message ?? 'تعذّر تحميل الفاتورة');
    } finally {
      setIsDownloading(false);
    }
  };

  const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
    <View style={[invStyles.row, { borderBottomColor: colors.border }]}>
      <Text style={[invStyles.rowValue, { color: colors.foreground, fontFamily: bold ? 'Cairo_700Bold' : 'Cairo_400Regular' }]}>
        {value}
      </Text>
      <Text style={[invStyles.rowLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
        {label}
      </Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={invStyles.overlay}>
        <View style={[invStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={[invStyles.header, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[invStyles.title, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
              فاتورة رسمية
            </Text>
            <Ionicons name="receipt-outline" size={20} color={colors.primary} />
          </View>

          {/* Invoice number badge */}
          <View style={[invStyles.numBadge, { backgroundColor: colors.primary + '15', borderColor: colors.primary + '40' }]}>
            <Text style={[invStyles.numText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
              {invoice.invoiceNumber}
            </Text>
            <Text style={[invStyles.numLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              رقم الفاتورة
            </Text>
          </View>

          {/* Rows */}
          <ScrollView style={invStyles.rows} showsVerticalScrollIndicator={false}>
            <Row label="التاريخ" value={dateStr} />
            {invoice.billingName && <Row label="اسم المشترك" value={invoice.billingName} />}
            {invoice.billingEmail && <Row label="البريد الإلكتروني" value={invoice.billingEmail} />}
            <Row label="الباقة" value={invoice.packageNameAr ?? invoice.payment?.package?.nameAr ?? '—'} />
            <Row label="المبلغ الأساسي" value={`${invoice.amount.toFixed(2)} ر.س`} />
            {(invoice.discountAmount ?? 0) > 0 && (
              <Row label="الخصم" value={`− ${(invoice.discountAmount ?? 0).toFixed(2)} ر.س`} />
            )}
            <Row label="ضريبة القيمة المضافة (15%)" value={`${invoice.vatAmount.toFixed(2)} ر.س`} />
            <Row label="الإجمالي" value={`${invoice.totalAmount.toFixed(2)} ر.س`} bold />
          </ScrollView>

          {/* Action buttons */}
          <View style={invStyles.actionRow}>
            {/* Download PDF */}
            <TouchableOpacity
              style={[invStyles.pdfBtn, { backgroundColor: colors.primary }]}
              onPress={handleDownloadPdf}
              activeOpacity={0.85}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Ionicons name="download-outline" size={18} color={colors.primaryForeground} />
              )}
              <Text style={[invStyles.shareBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                {isDownloading ? 'جارٍ التحميل…' : 'تحميل PDF'}
              </Text>
            </TouchableOpacity>

            {/* Share as text */}
            <TouchableOpacity
              style={[invStyles.shareBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '15' }]}
              onPress={handleShare}
              activeOpacity={0.85}
            >
              <Ionicons name="share-outline" size={18} color={colors.primary} />
              <Text style={[invStyles.shareBtnText, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                مشاركة
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Payment Card ──────────────────────────────────────────────────────────────
const payCardStyles = StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  info: { flex: 1, alignItems: 'flex-end', gap: 3 },
  pkg: { fontSize: 14 },
  date: { fontSize: 12 },
  invoiceBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  invoiceBtnText: { fontSize: 11 },
  meta: { alignItems: 'flex-start', gap: 4, marginRight: 12 },
  amount: { fontSize: 14 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11 },
});

function PaymentCard({
  payment,
  invoice,
  colors,
  onViewInvoice,
}: {
  payment: Payment;
  invoice?: Invoice;
  colors: ReturnType<typeof useColors>;
  onViewInvoice?: (inv: Invoice) => void;
}) {
  const isPaid = payment.status === 'paid';
  const isFailed = payment.status === 'failed';
  const statusColor = isPaid ? '#16a34a' : isFailed ? colors.destructive : colors.mutedForeground;
  const date = new Date(payment.createdAt);
  const dateStr = date.toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <View style={[payCardStyles.card, { borderBottomColor: colors.border }]}>
      {/* Right: package name + date + invoice button */}
      <View style={payCardStyles.info}>
        <Text style={[payCardStyles.pkg, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
          {payment.package?.nameAr ?? `باقة #${payment.packageId}`}
        </Text>
        <Text style={[payCardStyles.date, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          {dateStr}
        </Text>
        {isPaid && invoice && (
          <TouchableOpacity
            style={[payCardStyles.invoiceBtn, { borderColor: colors.primary + '55', backgroundColor: colors.primary + '11' }]}
            onPress={() => onViewInvoice?.(invoice)}
            activeOpacity={0.8}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Ionicons name="document-text-outline" size={12} color={colors.primary} />
            <Text style={[payCardStyles.invoiceBtnText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
              عرض الفاتورة
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {/* Left: amount + status */}
      <View style={payCardStyles.meta}>
        <Text style={[payCardStyles.amount, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
          {payment.totalAmount.toFixed(2)} ر.س
        </Text>
        <View style={[payCardStyles.badge, { backgroundColor: statusColor + '22', borderColor: statusColor + '55' }]}>
          <Text style={[payCardStyles.badgeText, { color: statusColor, fontFamily: 'Cairo_600SemiBold' }]}>
            {STATUS_LABEL[payment.status] ?? payment.status}
          </Text>
        </View>
      </View>
    </View>
  );
}

function InfoRow({ icon, label, value }: { icon: any; label: string; value: string }) {
  const colors = useColors();
  return (
    <View style={[styles.infoRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.infoValue, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
        {value}
      </Text>
      <View style={styles.infoLeft}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
          {label}
        </Text>
        <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, login, register, confirmPhoneOtp, resendPhoneOtp, logout, isLoading: authLoading } = useAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // OTP verification step (shown after register/login when phone is unverified)
  const [otpStep, setOtpStep] = useState(false);
  const [pendingVerifyToken, setPendingVerifyToken] = useState('');
  const [pendingMaskedPhone, setPendingMaskedPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isConfirmingOtp, setIsConfirmingOtp] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);


  const { data: subscription, refetch: refetchSub } = useGetMySubscription({
    query: { enabled: !!user, staleTime: 60_000 },
  });

  const { data: payments, isLoading: paymentsLoading, refetch: refetchPayments } = useListMyPayments({
    query: { enabled: !!user, staleTime: 30_000 },
  });

  const { data: invoices } = useListMyInvoices({
    query: { enabled: !!user, staleTime: 60_000 },
  });

  // Show confirmation when a subscription is activated (e.g. after returning from payment)
  const prevSubscriptionRef = useRef<typeof subscription | undefined>(undefined);
  useEffect(() => {
    const prev = prevSubscriptionRef.current;
    prevSubscriptionRef.current = subscription;
    // Transition: no subscription → subscription found
    if (!prev && subscription) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('🎉 تم تفعيل اشتراكك!', `باقة "${subscription.package?.nameAr ?? 'مدفوعة'}" مفعّلة الآن.`);
    }
  }, [subscription]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 + 84 : insets.bottom + 90;

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال البريد الإلكتروني وكلمة المرور');
      return;
    }
    if (mode === 'register' && (!name.trim() || !phone.trim())) {
      Alert.alert('تنبيه', 'يرجى إدخال الاسم ورقم الجوال');
      return;
    }
    setIsSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password, phone.trim());
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      // Phone OTP required — show verification step
      if (err?.name === 'PhoneVerificationRequiredError') {
        setPendingVerifyToken(err.verifyToken);
        setPendingMaskedPhone(err.maskedPhone);
        setOtpStep(true);
        return;
      }
      Alert.alert('خطأ', err?.message ?? 'فشلت العملية');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmOtp = async () => {
    if (otpCode.length !== 6) {
      Alert.alert('تنبيه', 'أدخلي رمزاً مكوناً من 6 أرقام');
      return;
    }
    setIsConfirmingOtp(true);
    try {
      await confirmPhoneOtp(pendingVerifyToken, otpCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setOtpStep(false);
      setOtpCode('');
    } catch (err: any) {
      Alert.alert('خطأ', err?.message ?? 'الرمز غير صحيح أو منتهي الصلاحية');
    } finally {
      setIsConfirmingOtp(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      const res = await resendPhoneOtp(pendingVerifyToken);
      setPendingVerifyToken(res.verifyToken);
      setPendingMaskedPhone(res.maskedPhone);
      setOtpCode('');
      Alert.alert('تم الإرسال', `رمز جديد أُرسل إلى ${res.maskedPhone}`);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message ?? 'تعذّر إعادة الإرسال');
    }
  };

  const handleLogout = async () => {
    Alert.alert('تسجيل الخروج', 'هل تريد تسجيل الخروج؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'خروج',
        style: 'destructive',
        onPress: async () => {
          await logout();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const handleRecover = async () => {
    setIsRecovering(true);
    try {
      const result = await customFetch<{ recovered: boolean; reason?: string; message?: string }>(
        '/api/payments/recover',
        { method: 'POST' },
      );
      if (result.recovered) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await Promise.all([refetchSub(), refetchPayments()]);
        Alert.alert('✅ تم التفعيل', 'تم استعادة اشتراكك بنجاح.');
      } else if (result.reason === 'already_active') {
        Alert.alert('معلومة', 'اشتراكك مفعّل بالفعل.');
        refetchSub();
      } else {
        Alert.alert('تنبيه', 'لا يوجد دفع مكتمل يمكن استعادته.');
      }
    } catch {
      Alert.alert('خطأ', 'تعذّرت عملية الاستعادة، يرجى المحاولة لاحقاً.');
    } finally {
      setIsRecovering(false);
    }
  };

  if (authLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (user) {
    const subRemaining = subscription
      ? (subscription.questionsRemaining ?? (subscription.questionsAllowed - subscription.questionsUsed))
      : null;

    // Expiry helpers
    const endDate = subscription?.endDate ? new Date(subscription.endDate) : null;
    const now = new Date();
    const daysLeft = endDate
      ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

    const formatDate = (d: Date) =>
      d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

    // Quota progress bar
    const quotaTotal = subscription?.questionsAllowed ?? 0;
    const quotaUsed = subscription?.questionsUsed ?? 0;
    const quotaProgress = quotaTotal > 0 ? Math.min(quotaUsed / quotaTotal, 1) : 0;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[styles.profileScroll, { paddingTop: topPad + 16, paddingBottom: bottomPad }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Avatar / Welcome */}
          <View style={styles.avatarSection}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.avatarText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                {user.name.charAt(0)}
              </Text>
            </View>
            <Text style={[styles.welcomeName, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
              {user.name}
            </Text>
            <Text style={[styles.welcomeRole, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              {user.role === 'admin' ? 'مدير النظام' : 'مستخدم'}
            </Text>
          </View>

          {/* Info */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <InfoRow icon="mail-outline" label="البريد الإلكتروني" value={user.email} />
            {user.phone && <InfoRow icon="call-outline" label="الجوال" value={user.phone} />}
          </View>

          {/* Subscription */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="ribbon-outline" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                الاشتراك
              </Text>
            </View>
            {subscription ? (
              <>
                {/* Package badge + billing cycle chip */}
                <View style={{ alignSelf: 'flex-end', marginRight: 14, marginBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.subBadge, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44', marginRight: 0, marginBottom: 0 }]}>
                    <Text style={[styles.subBadgeText, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                      {subscription.package?.nameAr ?? 'باقة مفعّلة'}
                    </Text>
                  </View>
                  {!!subscription.package?.billingPeriod && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.secondary + '22', borderWidth: 1, borderColor: colors.secondary + '55' }}>
                      <Text style={{ fontSize: 11, color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }}>
                        {subscription.package.billingPeriod === 'annual' ? 'سنوي' : 'شهري'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Expiry / renewal date */}
                {endDate && (() => {
                  const isRecurring = !!subscription.package?.billingPeriod;
                  return (
                    <View style={[styles.expiryRow, { borderTopColor: colors.border }]}>
                      <Ionicons
                        name={isExpiringSoon ? 'warning-outline' : 'calendar-outline'}
                        size={15}
                        color={isExpiringSoon ? colors.destructive : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.expiryText,
                          {
                            color: isExpiringSoon ? colors.destructive : colors.mutedForeground,
                            fontFamily: 'Cairo_400Regular',
                          },
                        ]}
                      >
                        {isExpiringSoon && daysLeft === 0
                          ? 'ينتهي اليوم'
                          : isExpiringSoon
                          ? `ينتهي خلال ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`
                          : isRecurring
                          ? `التجديد القادم: ${formatDate(endDate)}`
                          : `تاريخ الانتهاء: ${formatDate(endDate)}`}
                      </Text>
                    </View>
                  );
                })()}

                {/* Quota progress */}
                <View style={styles.quotaSection}>
                  <View style={styles.quotaHeader}>
                    <Text style={[styles.quotaLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                      الاستشارات المستخدمة
                    </Text>
                    <Text style={[styles.quotaNumbers, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                      {quotaUsed} / {quotaTotal}
                    </Text>
                  </View>
                  <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.round(quotaProgress * 100)}%` as any,
                          backgroundColor: quotaProgress >= 0.9 ? colors.destructive : colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.quotaRemaining, { color: colors.secondary, fontFamily: 'Cairo_400Regular' }]}>
                    <Text style={{ fontFamily: 'Cairo_700Bold' }}>{subRemaining}</Text>
                    {' استشارة متبقية'}
                  </Text>
                  {/* Low-quota warning banner — shown when ≤20% remain */}
                  {quotaTotal > 0 && quotaTotal < 9999 && quotaProgress >= 0.8 && (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowSubscription(true)}
                      style={{
                        flexDirection: 'row-reverse',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginTop: 6,
                        padding: 10,
                        borderRadius: 10,
                        backgroundColor: '#fff7ed',
                        borderWidth: 1,
                        borderColor: '#fdba74',
                      }}
                    >
                      <Ionicons name="warning-outline" size={16} color="#ea580c" style={{ marginTop: 1 }} />
                      <Text style={{ flex: 1, textAlign: 'right', fontSize: 13, color: '#9a3412', fontFamily: 'Cairo_400Regular', lineHeight: 20 }}>
                        {'تبقّت لكِ '}
                        <Text style={{ fontFamily: 'Cairo_700Bold' }}>{subRemaining}</Text>
                        {' استشارة فقط. '}
                        <Text style={{ fontFamily: 'Cairo_700Bold', textDecorationLine: 'underline' }}>جدّدي باقتك</Text>
                        {' قبل النفاد.'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Renew button — visible when expiring soon */}
                {isExpiringSoon && (
                  <TouchableOpacity
                    style={[styles.renewBtn, { borderColor: colors.destructive + '66', backgroundColor: colors.destructive + '11' }]}
                    onPress={() => setShowSubscription(true)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="refresh-outline" size={16} color={colors.destructive} />
                    <Text style={[styles.renewBtnText, { color: colors.destructive, fontFamily: 'Cairo_700Bold' }]}>
                      جدّد اشتراكك
                    </Text>
                  </TouchableOpacity>
                )}

                <SubscriptionSheet visible={showSubscription} onClose={() => setShowSubscription(false)} />
              </>
            ) : (
              <>
                <Text style={[styles.noSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  لا يوجد اشتراك نشط
                </Text>
                <TouchableOpacity
                  style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowSubscription(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="rocket-outline" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.upgradeBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                    اشترك الآن
                  </Text>
                </TouchableOpacity>
                <SubscriptionSheet visible={showSubscription} onClose={() => setShowSubscription(false)} />
              </>
            )}
          </View>

          {/* Payment History */}
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                سجل المدفوعات
              </Text>
            </View>

            {/* Recover button — only when no active sub but paid payments exist */}
            {!subscription && payments && payments.some((p) => p.status === 'paid') && (
              <TouchableOpacity
                style={[styles.recoverBtn, { borderColor: colors.primary + '66', backgroundColor: colors.primary + '11' }]}
                onPress={handleRecover}
                disabled={isRecovering}
                activeOpacity={0.85}
              >
                {isRecovering ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Ionicons name="reload-outline" size={15} color={colors.primary} />
                    <Text style={[styles.recoverBtnText, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                      استعادة الاشتراك
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {paymentsLoading ? (
              <View style={styles.payLoading}>
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              </View>
            ) : payments && payments.length > 0 ? (
              [...payments]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((p) => {
                  const matchedInvoice = invoices?.find((inv) => inv.paymentId === p.id);
                  return (
                    <PaymentCard
                      key={p.id}
                      payment={p}
                      invoice={matchedInvoice}
                      colors={colors}
                      onViewInvoice={setSelectedInvoice}
                    />
                  );
                })
            ) : (
              <Text style={[styles.noPayments, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                لا توجد مدفوعات سابقة
              </Text>
            )}
          </View>

          {/* WhatsApp contact */}
          <TouchableOpacity
            style={[styles.whatsappBtn, { backgroundColor: '#25D366' }]}
            onPress={() => Linking.openURL('https://wa.me/966504647649')}
            activeOpacity={0.85}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={[styles.whatsappBtnText, { color: '#fff', fontFamily: 'Cairo_700Bold' }]}>
              تواصلي مع د. رباب عبر واتساب
            </Text>
          </TouchableOpacity>

          {/* Logout */}
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: colors.destructive + '66' }]}
            onPress={handleLogout}
            activeOpacity={0.8}
          >
            <Text style={[styles.logoutText, { color: colors.destructive, fontFamily: 'Cairo_600SemiBold' }]}>
              تسجيل الخروج
            </Text>
            <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
          </TouchableOpacity>
        </ScrollView>

        {/* Invoice modal */}
        <InvoiceModal
          invoice={selectedInvoice}
          visible={!!selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          colors={colors}
        />
      </View>
    );
  }

  // ── OTP verification step ────────────────────────────────────────────────
  if (otpStep) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[styles.authScroll, { paddingTop: topPad + 32, paddingBottom: bottomPad }]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.authHeader}>
            <View style={[styles.logoCircle, { backgroundColor: colors.secondary + '22', borderColor: colors.secondary + '44' }]}>
              <Ionicons name="shield-checkmark-outline" size={36} color={colors.secondary} />
            </View>
            <Text style={[styles.authTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
              تحقق من رقم جوالك
            </Text>
            <Text style={[styles.authSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              أُرسل رمز تحقق من 6 أرقام إلى
            </Text>
            {!!pendingMaskedPhone && (
              <Text style={[styles.authSub, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold', marginTop: 2 }]}>
                {pendingMaskedPhone}
              </Text>
            )}
          </View>

          <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              style={[styles.input, {
                backgroundColor: colors.muted,
                color: colors.foreground,
                borderColor: colors.border,
                fontFamily: 'Cairo_400Regular',
                textAlign: 'center',
                fontSize: 24,
                letterSpacing: 8,
              }]}
              placeholder="XXXXXX"
              placeholderTextColor={colors.mutedForeground}
              value={otpCode}
              onChangeText={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.authBtn, { backgroundColor: isConfirmingOtp || otpCode.length !== 6 ? colors.muted : colors.primary }]}
              onPress={handleConfirmOtp}
              disabled={isConfirmingOtp || otpCode.length !== 6}
              activeOpacity={0.85}
            >
              {isConfirmingOtp ? (
                <ActivityIndicator size="small" color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.authBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                  تأكيد الرمز
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleResendOtp} style={{ marginTop: 8, alignItems: 'center' }}>
              <Text style={[{ color: colors.secondary, fontFamily: 'Cairo_600SemiBold', fontSize: 14 }]}>
                أعد إرسال الرمز
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => { setOtpStep(false); setOtpCode(''); }} style={{ marginTop: 4, alignItems: 'center' }}>
              <Text style={[{ color: colors.mutedForeground, fontFamily: 'Cairo_400Regular', fontSize: 12 }]}>
                ← العودة
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  // Auth forms
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[styles.authScroll, { paddingTop: topPad + 16, paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo / Title */}
        <View style={styles.authHeader}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '44' }]}>
            <Ionicons name="scale-outline" size={36} color={colors.primary} />
          </View>
          <Text style={[styles.authTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            RABAB LEGAL
          </Text>
          <Text style={[styles.authSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            محاميتك الرقمية الذكية
          </Text>
        </View>

        {/* Tab Toggle */}
        <View style={[styles.modeToggle, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {(['login', 'register'] as Mode[]).map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.modeTab,
                m === mode && { backgroundColor: colors.primary, borderRadius: 8 },
              ]}
              onPress={() => setMode(m)}
            >
              <Text
                style={[
                  styles.modeTabText,
                  {
                    color: m === mode ? colors.primaryForeground : colors.mutedForeground,
                    fontFamily: 'Cairo_600SemiBold',
                  },
                ]}
              >
                {m === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form */}
        <View style={[styles.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {mode === 'register' && (
            <>
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
                placeholder="الاسم الكامل"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                textAlign="right"
                returnKeyType="next"
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
                placeholder="رقم الجوال"
                placeholderTextColor={colors.mutedForeground}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                textAlign="right"
                returnKeyType="next"
              />
            </>
          )}
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
            placeholder="البريد الإلكتروني"
            placeholderTextColor={colors.mutedForeground}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            textAlign="right"
            returnKeyType="next"
          />
          <TextInput
            style={[styles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
            placeholder="كلمة المرور"
            placeholderTextColor={colors.mutedForeground}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textAlign="right"
            returnKeyType="done"
            onSubmitEditing={handleAuth}
          />

          <TouchableOpacity
            style={[styles.authBtn, { backgroundColor: isSubmitting ? colors.muted : colors.primary }]}
            onPress={handleAuth}
            disabled={isSubmitting}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.authBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                {mode === 'login' ? 'دخول' : 'إنشاء حساب'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}
