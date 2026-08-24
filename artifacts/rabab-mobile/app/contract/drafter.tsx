import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerMeta: { flex: 1, alignItems: 'flex-end' },
  headerTitle: { fontSize: 18, textAlign: 'right' },
  headerSub: { fontSize: 11, marginTop: 1, textAlign: 'right' },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Tab bar
  tabBar: {
    flexDirection: 'row-reverse',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  tabLabel: { fontSize: 14 },

  // Welcome
  welcomeWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  welcomeCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  welcomeEmoji: { fontSize: 40, marginBottom: 4 },
  welcomeTitle: { fontSize: 20, textAlign: 'center' },
  welcomeBody: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  welcomeHint: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
    width: '100%',
  },
  welcomeHintText: { fontSize: 13, textAlign: 'right', lineHeight: 20 },

  // Resume banner
  resumeBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  resumeTitle: { fontSize: 13, textAlign: 'right' },
  resumeSub: { fontSize: 11, textAlign: 'right', marginTop: 2 },
  resumeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resumeBtnText: { fontSize: 12 },

  // Messages
  messageList: { paddingHorizontal: 12, paddingTop: 12, gap: 10 },
  bubbleWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginVertical: 4,
  },
  bubbleWrapperUser: { justifyContent: 'flex-start' },
  bubbleWrapperAssistant: { justifyContent: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: { borderRadius: 16, padding: 12 },
  bubbleUser: { borderBottomLeftRadius: 4 },
  bubbleAssistant: { borderWidth: 1, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  attachedFileCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  attachedFileName: { fontSize: 12, flex: 1, textAlign: 'right' },

  // Draft card
  draftCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  draftToolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 8,
  },
  draftLabel: { fontSize: 12 },
  wordCount: { fontSize: 11 },
  pdfBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 90,
    justifyContent: 'center',
  },
  pdfBtnText: { fontSize: 12 },
  draftBody: {
    fontSize: 13,
    lineHeight: 24,
    textAlign: 'right',
    padding: 14,
  },
  draftEditInput: {
    minHeight: 200,
    borderWidth: 1,
    borderRadius: 8,
    margin: 10,
    padding: 10,
  },
  draftDisclaimer: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  disclaimerText: { fontSize: 11, flex: 1, textAlign: 'right', lineHeight: 18 },

  // Typing
  typingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  typingBubble: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typingText: { fontSize: 13 },

  // Input (draft tab)
  inputBarWrapper: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 6,
  },
  inputBar: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-end',
    gap: 8,
  },
  textInput: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    maxHeight: 120,
    lineHeight: 20,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  attachedBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachedName: {
    flex: 1,
    fontSize: 12,
    textAlign: 'right',
  },

  // Analyze tab
  analyzeScroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionTitle: { fontSize: 15, marginBottom: 10, textAlign: 'right' },
  modeRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  modeCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 2,
    padding: 12,
    alignItems: 'flex-end',
    gap: 4,
  },
  modeLabel: { fontSize: 12, textAlign: 'right' },
  modeSublabel: { fontSize: 10, textAlign: 'right', lineHeight: 15 },
  textInputContainer: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  analyzeInput: {
    fontSize: 14,
    lineHeight: 22,
    padding: 14,
    minHeight: 160,
    textAlign: 'right',
  },
  charCount: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  charCountText: { fontSize: 11 },
  clearText: { fontSize: 12 },
  analyzeBtn: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzeBtnText: { fontSize: 15 },
  loadingCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingTitle: { fontSize: 14, textAlign: 'center' },
  loadingHint: { fontSize: 12, textAlign: 'center' },

  // Analyze tab welcome header (consultation-style)
  analyzeWelcomeHeader: {
    alignItems: 'center',
    paddingBottom: 18,
    marginBottom: 20,
    borderBottomWidth: 1,
    gap: 6,
  },
  analyzeAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  analyzeWelcomeBrand: { fontSize: 14, textAlign: 'center' },
  analyzeWelcomeTitle: { fontSize: 17, textAlign: 'center', lineHeight: 26 },
  analyzeWelcomeSub: { fontSize: 13, textAlign: 'center', lineHeight: 20 },

  // Result success row (consultation-style)
  resultSuccessRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
  },
  resultSuccessLabel: { fontSize: 14 },

  // Result card
  resultCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  resultToolbar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  resultLabel: { fontSize: 13 },
  actionBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 60,
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: 12 },
  resultBody: {
    fontSize: 13,
    lineHeight: 23,
    textAlign: 'right',
    padding: 14,
  },
  resultDisclaimer: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  resetBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  resetBtnText: { fontSize: 13 },

  // Quota upgrade card
  upgradeCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  upgradeTitle: { fontSize: 17, textAlign: 'center' },
  upgradeBody: { fontSize: 13, textAlign: 'center', lineHeight: 21 },
  upgradeBtn2: {
    marginTop: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
  },
  upgradeBtnText2: { fontSize: 15 },

  // File preview modal
  previewOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  previewSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingTop: 10,
    gap: 14,
  },
  previewHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 4,
  },
  previewHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  previewFileName: {
    fontSize: 14,
    textAlign: 'right',
  },
  previewWordCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 2,
  },
  previewSnippetBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  previewSnippetLabel: {
    fontSize: 11,
    textAlign: 'right',
  },
  previewSnippetText: {
    fontSize: 13,
    lineHeight: 22,
    textAlign: 'right',
  },
  previewActions: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginTop: 2,
  },
  previewConfirmBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
  },
  previewCancelBtn: {
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: { fontSize: 14 },
});

import * as Sharing from 'expo-sharing';
import { useColors } from '@/hooks/useColors';
import { useContractFileUpload } from '@/hooks/useContractFileUpload';
import { apiFetch, getBaseUrl, getStoredToken } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
import * as Clipboard from 'expo-clipboard';

interface ChatMsg {
  id: number;
  role: 'user' | 'rabab';
  text: string;
  isDraft?: boolean;
  attachedFileName?: string;
}

type ApiMsg = { role: 'user' | 'assistant'; content: string };

type ActiveTab = 'draft' | 'analyze';
async function exportContractPDF(contractText: string): Promise<void> {
  const escaped = contractText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 13pt; direction: rtl; color: #111; background: #fff; }
    .page { padding: 2cm 2.5cm; min-height: 27cm; }
    .header { border-bottom: 2px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 18px; }
    .header-brand { font-size: 11pt; font-weight: bold; color: #1a3a6b; }
    .header-sub { font-size: 9pt; color: #888; margin-top: 2px; }
    .disclaimer { font-size: 10pt; color: #7a5f00; background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 10px 14px; margin-bottom: 22px; line-height: 1.7; }
    .contract-body { font-size: 13pt; line-height: 2; text-align: right; white-space: pre-wrap; color: #111; }
    .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 9pt; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-brand">⚖️ &nbsp;رباب محاميتك الرقمية</div>
      <div class="header-sub">RABAB LEGAL AI &nbsp;·&nbsp; مسودة عقد قانوني</div>
    </div>
    <div class="disclaimer">⚠️ هذه المسودة للاسترشاد ولا تُعدّ رأياً قانونياً ملزماً — يُنصح بمراجعة محامٍ مرخّص قبل التوقيع.</div>
    <div class="contract-body">${escaped}</div>
    <div class="footer">تم إنشاء هذه المسودة بواسطة رباب للذكاء الاصطناعي القانوني &nbsp;·&nbsp; للاسترشاد فقط</div>
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'مشاركة مسودة العقد',
      UTI: 'com.adobe.pdf',
    });
  } else {
    Alert.alert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز');
  }
}

async function exportReviewPDF(reviewText: string, modeLabel: string): Promise<void> {
  const escaped = reviewText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 12pt; direction: rtl; color: #111; background: #fff; }
    .page { padding: 2cm 2.5cm; min-height: 27cm; }
    .header { border-bottom: 2px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 18px; }
    .header-brand { font-size: 11pt; font-weight: bold; color: #1a3a6b; }
    .header-sub { font-size: 9pt; color: #888; margin-top: 2px; }
    .mode-label { font-size: 14pt; font-weight: bold; color: #1a3a6b; margin-bottom: 16px; }
    .body { font-size: 12pt; line-height: 1.9; text-align: right; white-space: pre-wrap; color: #111; }
    .disclaimer { font-size: 9pt; color: #7a5f00; background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 10px 14px; margin-top: 22px; line-height: 1.7; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 9pt; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="header-brand">⚖️ &nbsp;رباب محاميتك الرقمية</div>
      <div class="header-sub">RABAB LEGAL AI &nbsp;·&nbsp; تحليل عقد</div>
    </div>
    <div class="mode-label">${modeLabel}</div>
    <div class="body">${escaped}</div>
    <div class="disclaimer">⚠️ هذه النتيجة للاسترشاد ولا تُعدّ رأياً قانونياً ملزماً — يُنصح بمراجعة محامٍ مرخّص.</div>
    <div class="footer">رباب للذكاء الاصطناعي القانوني &nbsp;·&nbsp; للاسترشاد فقط</div>
  </div>
</body>
</html>`;

  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'مشاركة نتيجة التحليل',
      UTI: 'com.adobe.pdf',
    });
  } else {
    Alert.alert('تنبيه', 'المشاركة غير متاحة على هذا الجهاز');
  }
}
function MessageBubble({
  msg,
  colors,
  onExportPDF,
  isExporting,
  onUpdateDraft,
  isSavingDraft,
}: {
  msg: ChatMsg;
  colors: ReturnType<typeof useColors>;
  onExportPDF: (text: string) => void;
  isExporting: boolean;
  onUpdateDraft: (id: number, newText: string) => Promise<void>;
  isSavingDraft?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);
  const [copied, setCopied] = useState(false);

  const handleCopyDraft = useCallback(async () => {
    await Clipboard.setStringAsync(msg.text);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopied(false), 2000);
  }, [msg.text]);

  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <View style={[styles.bubbleWrapper, styles.bubbleWrapperUser]}>
        <View style={{ maxWidth: '80%', gap: 6 }}>
          {msg.attachedFileName && (
            <View style={[styles.attachedFileCard, { backgroundColor: colors.primary + 'cc', borderColor: colors.primaryForeground + '33' }]}>
              <Ionicons name="document-attach-outline" size={16} color={colors.primaryForeground} style={{ flexShrink: 0 }} />
              <Text
                style={[styles.attachedFileName, { color: colors.primaryForeground, fontFamily: 'Cairo_600SemiBold' }]}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {msg.attachedFileName}
              </Text>
            </View>
          )}
          <View style={[styles.bubble, styles.bubbleUser, { backgroundColor: colors.primary }]}>
            <Text style={[styles.bubbleText, { color: colors.primaryForeground, fontFamily: 'Cairo_400Regular' }]}>
              {msg.text}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const isError = msg.text.startsWith('⚠️') || msg.text.startsWith('🔒');

  // Keep isEditing=true while the server save is in progress so the spinner is visible.
  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || isSavingDraft) return;
    await onUpdateDraft(msg.id, trimmed);
    setIsEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCancelEdit = () => {
    setEditText(msg.text);
    setIsEditing(false);
  };

  return (
    <View style={[styles.bubbleWrapper, styles.bubbleWrapperAssistant]}>
      <View style={[styles.avatar, { backgroundColor: colors.secondary + '33' }]}>
        <Text style={{ fontSize: 14 }}>⚖️</Text>
      </View>
      <View style={{ flex: 1 }}>
        {msg.isDraft ? (
          /* ── Contract draft card ── */
          <View style={[styles.draftCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Toolbar */}
            <View style={[styles.draftToolbar, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
              <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                <Ionicons name="document-text-outline" size={14} color={colors.primary} />
                <Text style={[styles.draftLabel, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
                  مسودة العقد
                </Text>
                <Text style={[styles.wordCount, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  {msg.text.split(/\s+/).length} كلمة
                </Text>
              </View>
              {isEditing ? (
                /* Edit mode: Save + Cancel */
                <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.pdfBtn, { backgroundColor: colors.secondary }]}
                    onPress={handleSaveEdit}
                    disabled={isSavingDraft}
                    activeOpacity={0.8}
                  >
                    {isSavingDraft ? (
                      <>
                        <ActivityIndicator size="small" color={colors.background} />
                        <Text style={[styles.pdfBtnText, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                          جارٍ الحفظ
                        </Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={13} color={colors.background} />
                        <Text style={[styles.pdfBtnText, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                          حفظ
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdfBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                    onPress={handleCancelEdit}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="close" size={13} color={colors.mutedForeground} />
                    <Text style={[styles.pdfBtnText, { color: colors.mutedForeground, fontFamily: 'Cairo_700Bold' }]}>
                      إلغاء
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* View mode: Copy + Edit + Export */
                <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.pdfBtn, { backgroundColor: copied ? '#16a34a18' : colors.primary + '18', borderWidth: 1, borderColor: copied ? '#16a34a44' : colors.primary + '44' }]}
                    onPress={handleCopyDraft}
                    activeOpacity={0.8}
                  >
                    <Ionicons name={copied ? 'checkmark-done-outline' : 'copy-outline'} size={13} color={copied ? '#16a34a' : colors.primary} />
                    <Text style={[styles.pdfBtnText, { color: copied ? '#16a34a' : colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                      {copied ? 'تم!' : 'نسخ'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdfBtn, { backgroundColor: colors.primary + '18', borderWidth: 1, borderColor: colors.primary + '44' }]}
                    onPress={() => { setEditText(msg.text); setIsEditing(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={13} color={colors.primary} />
                    <Text style={[styles.pdfBtnText, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                      تعديل
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pdfBtn, { backgroundColor: colors.secondary }]}
                    onPress={() => onExportPDF(msg.text)}
                    disabled={isExporting}
                    activeOpacity={0.8}
                  >
                    {isExporting ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <>
                        <Ionicons name="download-outline" size={13} color={colors.background} />
                        <Text style={[styles.pdfBtnText, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                          PDF
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {/* Contract body — editable or read-only */}
            {isEditing ? (
              <TextInput
                style={[
                  styles.draftBody,
                  styles.draftEditInput,
                  {
                    color: colors.foreground,
                    fontFamily: 'Cairo_400Regular',
                    backgroundColor: colors.muted,
                    borderColor: colors.primary + '44',
                  },
                ]}
                value={editText}
                onChangeText={setEditText}
                multiline
                textAlign="right"
                textAlignVertical="top"
                autoFocus
              />
            ) : (
              <Text
                style={[styles.draftBody, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
                selectable
              >
                {msg.text}
              </Text>
            )}
            {/* Disclaimer */}
            <View style={[styles.draftDisclaimer, { backgroundColor: '#7a5f0022', borderTopColor: '#7a5f0044' }]}>
              <Ionicons name="alert-circle-outline" size={13} color="#c0a030" style={{ flexShrink: 0 }} />
              <Text style={[styles.disclaimerText, { color: '#c0a030', fontFamily: 'Cairo_400Regular' }]}>
                للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص قبل التوقيع.
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.bubble,
              styles.bubbleAssistant,
              {
                backgroundColor: isError ? colors.destructive + '18' : colors.card,
                borderColor: isError ? colors.destructive + '44' : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                { color: isError ? colors.destructive : colors.foreground, fontFamily: 'Cairo_400Regular' },
              ]}
            >
              {msg.text}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Review mode definitions ───────────────────────────────────────────────────

const REVIEW_MODES = [
  {
    key: 'review' as const,
    label: 'مراجعة قانونية شاملة',
    sublabel: '17 محوراً — البنود الغامضة والمتعارضة والناقصة',
    icon: '🔍',
    endpoint: '/api/contract/review',
    resultKey: 'review',
    loadingMsg: 'جارٍ المراجعة القانونية الشاملة…',
  },
  {
    key: 'enforce' as const,
    label: 'فحص قابلية التنفيذ',
    sublabel: 'قابل / يحتاج تعديل / مرتفع المخاطر',
    icon: '⚖️',
    endpoint: '/api/contract/enforce-check',
    resultKey: 'result',
    loadingMsg: 'جارٍ فحص قابلية التنفيذ أمام القضاء…',
  },
  {
    key: 'final' as const,
    label: 'مراجعة نهائية قبل التوقيع',
    sublabel: 'قائمة تحقق — صالح / يحتاج تعديلات / غير صالح',
    icon: '✅',
    endpoint: '/api/contract/final-check',
    resultKey: 'result',
    loadingMsg: 'جارٍ المراجعة النهائية قبل التوقيع…',
  },
] as const;

type ReviewModeKey = typeof REVIEW_MODES[number]['key'];

function AnalyzeTab({ colors, bottomPad, user }: {
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
  user: any;
}) {
  const router = useRouter();
  const [contractText, setContractText] = useState('');
  const [selectedMode, setSelectedMode] = useState<ReviewModeKey>('review');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [copied, setCopied] = useState(false);
  const [quotaExhausted, setQuotaExhausted] = useState(false);

  // File upload — via shared contract hook (keeps DocumentPicker out of consultation screens)
  const { pickAndExtract: pickFileForAnalyze, isExtracting: isExtractingFile } = useContractFileUpload({ maxBytes: 20 * 1024 * 1024 });
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [wasTruncated, setWasTruncated] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [pendingText, setPendingText] = useState('');
  const [pendingFilename, setPendingFilename] = useState('');
  const [pendingWasTruncated, setPendingWasTruncated] = useState(false);

  const clientSession = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  const mode = REVIEW_MODES.find(m => m.key === selectedMode)!;

  const handleAnalyze = useCallback(async () => {
    const text = contractText.trim();
    if (!text || isAnalyzing) return;
    if (!user) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول أولاً');
      return;
    }
    if (text.length < 100) {
      Alert.alert('تنبيه', 'النص قصير جداً. الرجاء لصق نص العقد كاملاً.');
      return;
    }

    setIsAnalyzing(true);
    setResult('');
    setQuotaExhausted(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const data = await apiFetch<{
        review?: string;
        result?: string;
        error?: string;
        code?: string;
        needsUpgrade?: boolean;
      }>(mode.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractText: text,
          clientSession: clientSession.current,
        }),
      });

      const reviewText = (data as any)[mode.resultKey] ?? '';
      setResult(reviewText);
      clientSession.current =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const code = (e as any)?.data?.code ?? (e as any)?.code;
      if (code === 'TRIAL_EXHAUSTED' || code === 'QUOTA_EXHAUSTED') {
        setQuotaExhausted(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        const msg =
          e?.message?.startsWith('🔒') || e?.message?.startsWith('⚠️')
            ? e.message
            : `⚠️ ${e?.message ?? 'تعذّر التحليل، حاول مرة أخرى'}`;
        Alert.alert('خطأ', msg);
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [contractText, isAnalyzing, user, mode]);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await Clipboard.setStringAsync(result);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  }, [result]);

  const handleSharePDF = useCallback(async () => {
    if (!result || isExportingPDF) return;
    setIsExportingPDF(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await exportReviewPDF(result, mode.label);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل تصدير PDF');
    } finally {
      setIsExportingPDF(false);
    }
  }, [result, isExportingPDF, mode.label]);

  const handleReset = useCallback(() => {
    setContractText('');
    setResult('');
    setCopied(false);
    setQuotaExhausted(false);
    setUploadedFileName('');
    setWasTruncated(false);
  }, []);

  const handlePickFile = useCallback(async () => {
    if (!user) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول أولاً');
      return;
    }
    const attachment = await pickFileForAnalyze();
    if (!attachment) return;
    setPendingText(attachment.extractedText);
    setPendingFilename(attachment.fileName);
    setPendingWasTruncated(attachment.wasTruncated);
    setShowPreview(true);
  }, [user, pickFileForAnalyze]);

  const handleConfirmFileText = useCallback(() => {
    setContractText(pendingText);
    setUploadedFileName(pendingFilename);
    setWasTruncated(pendingWasTruncated);
    setResult('');
    setShowPreview(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pendingText, pendingFilename, pendingWasTruncated]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.analyzeScroll, { paddingBottom: bottomPad + 16 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Welcome header (consultation-style) ── */}
        <View style={[styles.analyzeWelcomeHeader, { borderBottomColor: colors.border }]}>
          <View style={[styles.analyzeAvatar, { backgroundColor: colors.secondary + '33', borderColor: colors.secondary + '66' }]}>
            <Text style={{ fontSize: 16 }}>⚖️</Text>
          </View>
          <Text style={[styles.analyzeWelcomeBrand, { color: colors.secondary, fontFamily: 'Cairo_700Bold' }]}>
            رباب · محاميتك الرقمية
          </Text>
          <Text style={[styles.analyzeWelcomeTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
            مرحباً 👋 أنا رباب، أساعدك في مراجعة عقودك وتحليل بنودها.
          </Text>
          <Text style={[styles.analyzeWelcomeSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            الصقي نص العقد أو ارفعي ملفاً واختاري نوع المراجعة — شاملة، فحص التنفيذ، أو نهائية.
          </Text>
        </View>

        {/* Mode selector */}
        <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
          نوع المراجعة
        </Text>
        <View style={styles.modeRow}>
          {REVIEW_MODES.map((m) => {
            const isActive = m.key === selectedMode;
            return (
              <TouchableOpacity
                key={m.key}
                style={[
                  styles.modeCard,
                  {
                    backgroundColor: isActive ? colors.secondary + '18' : colors.card,
                    borderColor: isActive ? colors.secondary : colors.border,
                  },
                ]}
                onPress={() => { setSelectedMode(m.key); setResult(''); setQuotaExhausted(false); }}
                activeOpacity={0.7}
              >
                <Text style={{ fontSize: 20 }}>{m.icon}</Text>
                <Text
                  style={[
                    styles.modeLabel,
                    { color: isActive ? colors.secondary : colors.foreground, fontFamily: 'Cairo_600SemiBold' },
                  ]}
                >
                  {m.label}
                </Text>
                <Text
                  style={[styles.modeSublabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}
                  numberOfLines={2}
                >
                  {m.sublabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Contract text input header row — label + file picker button */}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', marginTop: 20, marginBottom: 10 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold', marginBottom: 0, flex: 1 }]}>
            نص العقد
          </Text>
          <TouchableOpacity
            style={[
              styles.pdfBtn,
              {
                backgroundColor: colors.primary + '18',
                borderWidth: 1,
                borderColor: colors.primary + '44',
                minWidth: 0,
                paddingHorizontal: 12,
              },
            ]}
            onPress={handlePickFile}
            disabled={isExtractingFile}
            activeOpacity={0.8}
          >
            {isExtractingFile ? (
              <>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.pdfBtnText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
                  جارٍ القراءة…
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="document-attach-outline" size={15} color={colors.primary} />
                <Text style={[styles.pdfBtnText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
                  رفع ملف
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Uploaded file badge */}
        {uploadedFileName ? (
          <View
            style={[
              styles.attachedBadge,
              { backgroundColor: colors.secondary + '18', borderColor: colors.secondary + '44', marginBottom: 8 },
            ]}
          >
            <Ionicons name="document-text-outline" size={15} color={colors.secondary} style={{ flexShrink: 0 }} />
            <Text
              style={[styles.attachedName, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {uploadedFileName}
            </Text>
            <TouchableOpacity
              onPress={() => { setUploadedFileName(''); setWasTruncated(false); setContractText(''); setResult(''); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View
          style={[
            styles.textInputContainer,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[
              styles.analyzeInput,
              { color: colors.foreground, fontFamily: 'Cairo_400Regular' },
            ]}
            placeholder="الصق نص العقد هنا أو ارفع ملف PDF / DOCX / TXT…"
            placeholderTextColor={colors.mutedForeground}
            value={contractText}
            onChangeText={(t) => {
              setContractText(t);
              if (uploadedFileName) { setUploadedFileName(''); setWasTruncated(false); }
            }}
            multiline
            textAlign="right"
            textAlignVertical="top"
            maxLength={15000}
          />
          {contractText.length > 0 && (
            <View style={[styles.charCount, { borderTopColor: colors.border }]}>
              <Text style={[styles.charCountText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                {contractText.length.toLocaleString('ar-SA')} / ١٥٬٠٠٠ حرف
              </Text>
              <TouchableOpacity onPress={() => { setContractText(''); setUploadedFileName(''); setWasTruncated(false); }}>
                <Text style={[styles.clearText, { color: colors.destructive, fontFamily: 'Cairo_400Regular' }]}>
                  مسح
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Truncation notice */}
        {wasTruncated && (
          <View
            style={[
              styles.attachedBadge,
              { backgroundColor: '#7a5f0018', borderColor: '#c0a03044', marginTop: 6, gap: 6 },
            ]}
          >
            <Ionicons name="information-circle-outline" size={15} color="#c0a030" style={{ flexShrink: 0 }} />
            <Text style={[{ flex: 1, fontSize: 12, textAlign: 'right', lineHeight: 18, color: '#c0a030', fontFamily: 'Cairo_400Regular' }]}>
              تم اقتصار النص على أول ١٥٬٠٠٠ حرف نظراً لحجم الملف الكبير — يُنصح بتقسيم العقد إلى أجزاء لتحليل أكثر دقة.
            </Text>
          </View>
        )}

        {/* Analyze button */}
        <TouchableOpacity
          style={[
            styles.analyzeBtn,
            {
              backgroundColor:
                contractText.trim().length >= 100 && !isAnalyzing
                  ? colors.secondary
                  : colors.muted,
            },
          ]}
          onPress={handleAnalyze}
          disabled={contractText.trim().length < 100 || isAnalyzing}
          activeOpacity={0.85}
        >
          {isAnalyzing ? (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color={colors.background} />
              <Text style={[styles.analyzeBtnText, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                {mode.loadingMsg}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 16 }}>{mode.icon}</Text>
              <Text
                style={[
                  styles.analyzeBtnText,
                  {
                    color:
                      contractText.trim().length >= 100
                        ? colors.background
                        : colors.mutedForeground,
                    fontFamily: 'Cairo_700Bold',
                  },
                ]}
              >
                {mode.label}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Loading card */}
        {isAnalyzing && (
          <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator size="large" color={colors.secondary} />
            <Text style={[styles.loadingTitle, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
              {mode.loadingMsg}
            </Text>
            <Text style={[styles.loadingHint, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              قد يستغرق حتى 60 ثانية للعقود الطويلة
            </Text>
          </View>
        )}

        {/* Quota exhausted upgrade card */}
        {quotaExhausted && !isAnalyzing && (
          <View style={[styles.upgradeCard, { backgroundColor: colors.card, borderColor: colors.secondary + '66' }]}>
            <Text style={{ fontSize: 36 }}>🔒</Text>
            <Text style={[styles.upgradeTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
              استنفدتِ رصيدك المجاني
            </Text>
            <Text style={[styles.upgradeBody, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              للاستمرار في مراجعة العقود يرجى الترقية إلى إحدى الباقات المدفوعة.
            </Text>
            <TouchableOpacity
              style={[styles.upgradeBtn2, { backgroundColor: colors.secondary }]}
              onPress={() => {
                setQuotaExhausted(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(tabs)/profile');
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="diamond-outline" size={16} color={colors.background} style={{ flexShrink: 0 }} />
              <Text style={[styles.upgradeBtnText2, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                عرض الباقات
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Result card */}
        {result ? (
          <>
            {/* ── Success row (consultation-style) ── */}
            <View style={[styles.resultSuccessRow]}>
              <Text style={{ fontSize: 16 }}>✅</Text>
              <Text style={[styles.resultSuccessLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
                اكتملت {mode.label}
              </Text>
            </View>

            <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Result toolbar */}
              <View style={[styles.resultToolbar, { backgroundColor: colors.muted, borderBottomColor: colors.border }]}>
                <View style={{ flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>⚖️</Text>
                  <Text style={[styles.resultLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
                    {mode.label}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                  {/* Copy button */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.border }]}
                    onPress={handleCopy}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={14}
                      color={copied ? '#22c55e' : colors.foreground}
                    />
                    <Text style={[styles.actionBtnText, { color: copied ? '#22c55e' : colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
                      {copied ? 'تم' : 'نسخ'}
                    </Text>
                  </TouchableOpacity>
                  {/* Share as PDF button */}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
                    onPress={handleSharePDF}
                    disabled={isExportingPDF}
                    activeOpacity={0.7}
                  >
                    {isExportingPDF ? (
                      <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                      <>
                        <Ionicons name="share-outline" size={14} color={colors.background} />
                        <Text style={[styles.actionBtnText, { color: colors.background, fontFamily: 'Cairo_600SemiBold' }]}>
                          PDF
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Result body */}
              <Text
                style={[styles.resultBody, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
                selectable
              >
                {result}
              </Text>

              {/* Disclaimer */}
              <View style={[styles.resultDisclaimer, { backgroundColor: '#7a5f0022', borderTopColor: '#7a5f0044' }]}>
                <Ionicons name="alert-circle-outline" size={13} color="#c0a030" style={{ flexShrink: 0 }} />
                <Text style={[styles.disclaimerText, { color: '#c0a030', fontFamily: 'Cairo_400Regular' }]}>
                  للاسترشاد فقط — يُنصح بمراجعة محامٍ مرخّص والتحقق من المصدر الرسمي.
                </Text>
              </View>

              {/* Reset button */}
              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: colors.border }]}
                onPress={handleReset}
                activeOpacity={0.7}
              >
                <Ionicons name="refresh-outline" size={15} color={colors.mutedForeground} />
                <Text style={[styles.resetBtnText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  تحليل عقد جديد
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>

      {/* ── File text preview sheet ── */}
      <Modal
        visible={showPreview}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.previewOverlay}>
          <View style={[styles.previewSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.previewHandle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[styles.previewHeader, { borderBottomColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={22} color={colors.primary} style={{ flexShrink: 0 }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.previewFileName, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {pendingFilename}
                </Text>
                <Text style={[styles.previewWordCount, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  {pendingText.length.toLocaleString('ar-SA')} حرف · {pendingText.trim().split(/\s+/).length.toLocaleString('ar-SA')} كلمة
                  {pendingWasTruncated ? ' · مُقتصر على أول ١٥٬٠٠٠ حرف' : ''}
                </Text>
              </View>
            </View>

            {/* Snippet */}
            <View style={[styles.previewSnippetBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.previewSnippetLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                معاينة أول ٣٠٠ حرف:
              </Text>
              <Text
                style={[styles.previewSnippetText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}
                numberOfLines={5}
              >
                {pendingText.slice(0, 300)}
              </Text>
            </View>

            {/* Truncation notice */}
            {pendingWasTruncated && (
              <View style={[styles.attachedBadge, { backgroundColor: '#7a5f0018', borderColor: '#c0a03044', gap: 6 }]}>
                <Ionicons name="information-circle-outline" size={14} color="#c0a030" style={{ flexShrink: 0 }} />
                <Text style={[{ flex: 1, fontSize: 12, textAlign: 'right', lineHeight: 18, color: '#c0a030', fontFamily: 'Cairo_400Regular' }]}>
                  الملف كبير — تم أخذ أول ١٥٬٠٠٠ حرف فقط للتحليل.
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.previewConfirmBtn, { backgroundColor: colors.secondary }]}
                onPress={handleConfirmFileText}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.background} />
                <Text style={[styles.previewBtnText, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                  تحميل النص للتحليل
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.previewCancelBtn, { borderColor: colors.border }]}
                onPress={() => setShowPreview(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.previewBtnText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  إلغاء
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
export default function ContractDrafterScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('draft');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [apiHistory, setApiHistory] = useState<ApiMsg[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  // File upload — via shared contract hook (keeps DocumentPicker out of consultation screens)
  const { pickAndExtract: pickFileForDraft, isExtracting } = useContractFileUpload();
  const [pendingAttachment, setPendingAttachment] = useState<{
    fileName: string;
    extractedText: string;
    wasTruncated: boolean;
  } | null>(null);
  /** ID of the service_session for the current draft — used to persist edits */
  const [draftSessionId, setDraftSessionId] = useState<number | undefined>(undefined);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  /** Resume banner: shown when a saved draft is loaded on mount */
  const [showResumeBanner, setShowResumeBanner] = useState(false);
  const [resumeDraftSavedAt, setResumeDraftSavedAt] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMsg>>(null);
  const reservedSid = useRef<number | undefined>(undefined);
  const clientSession = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 8 : insets.bottom;

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ── Load latest saved draft on mount ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch<{ draft: { id: number; serviceSessionId: number | null; draftText: string; updatedAt: string } | null }>(
      '/api/contract/sessions/latest',
    ).then((data) => {
      if (cancelled || !data.draft) return;
      const { draft } = data;
      setDraftSessionId(draft.serviceSessionId ?? undefined);
      setMessages([
        { id: Date.now(), role: 'rabab', text: draft.draftText, isDraft: true },
      ]);
      setApiHistory([
        { role: 'assistant', content: draft.draftText },
      ]);
      setResumeDraftSavedAt(draft.updatedAt);
      setShowResumeBanner(true);
    }).catch(() => {/* silently ignore — no previous draft */});
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    if (!user) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول أولاً');
      return;
    }

    const fileNameSnapshot = attachedFileName;
    setInputText('');
    setAttachedFileName(null);
    setShowResumeBanner(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const newApiHistory: ApiMsg[] = [...apiHistory, { role: 'user', content: text }];
    setMessages((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', text, attachedFileName: fileNameSnapshot ?? undefined },
    ]);
    setApiHistory(newApiHistory);
    setIsSending(true);

    try {
      const data = await apiFetch<{
        reply: string;
        isDraft?: boolean;
        sessionId?: number;
        needsUpgrade?: boolean;
        code?: string;
        error?: string;
      }>('/api/contract/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newApiHistory,
          clientSession: clientSession.current,
          reservedSessionId: reservedSid.current,
        }),
      });

      if (data.sessionId) reservedSid.current = data.sessionId;

      const reply = data.reply ?? '';
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'rabab', text: reply, isDraft: !!data.isDraft },
      ]);
      setApiHistory((prev) => [...prev, { role: 'assistant', content: reply }]);

      if (data.isDraft) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Persist the session ID so edits can be saved to the server
        if (data.sessionId) setDraftSessionId(data.sessionId);
        clientSession.current =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2);
        reservedSid.current = undefined;
        // Save the initial draft to the server automatically
        if (data.sessionId) {
          apiFetch('/api/contract/sessions/' + data.sessionId, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftText: reply }),
          }).catch(() => {/* ignore silent initial save error */});
        }
      }
    } catch (e: any) {
      const errText =
        e?.message?.startsWith('🔒') || e?.message?.startsWith('⚠️')
          ? e.message
          : `⚠️ ${e?.message ?? 'تعذّر الإرسال، حاول مرة أخرى'}`;
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'rabab', text: errText },
      ]);
      setApiHistory((prev) => prev.slice(0, -1)); // revert the optimistic push
    } finally {
      setIsSending(false);
    }
  }, [inputText, isSending, apiHistory, user, attachedFileName]);

  const handleUpdateDraft = useCallback(async (id: number, newText: string) => {
    // Update local state immediately
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, text: newText } : m))
    );
    setApiHistory((prev) => {
      const updated = [...prev];
      for (let i = updated.length - 1; i >= 0; i--) {
        if (updated[i].role === 'assistant') {
          updated[i] = { ...updated[i], content: newText };
          break;
        }
      }
      return updated;
    });

    // Persist to server
    if (draftSessionId) {
      setIsSavingDraft(true);
      try {
        await apiFetch('/api/contract/sessions/' + draftSessionId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftText: newText }),
        });
      } catch {
        Alert.alert('تنبيه', 'تعذّر حفظ التعديلات على الخادم — تم الحفظ محلياً فقط');
      } finally {
        setIsSavingDraft(false);
      }
    }
  }, [draftSessionId]);

  const handleExportPDF = useCallback(async (text: string) => {
    if (isExporting) return;
    setIsExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await exportContractPDF(text);
    } catch (e: any) {
      Alert.alert('خطأ', e?.message ?? 'فشل تصدير PDF');
    } finally {
      setIsExporting(false);
    }
  }, [isExporting]);

  const handleAttachFile = useCallback(async () => {
    if (isExtracting || isSending) return;
    const attachment = await pickFileForDraft();
    if (!attachment) { setAttachedFileName(null); return; }
    setAttachedFileName(attachment.fileName);
    // Show preview before committing to the input
    setPendingAttachment(attachment);
  }, [isExtracting, isSending, pickFileForDraft]);

  const handleConfirmAttach = useCallback(() => {
    if (!pendingAttachment) return;
    const { fileName, extractedText, wasTruncated } = pendingAttachment;
    const prefix = `📄 **${fileName}**\n\n`;
    setInputText(prev => prefix + (prev ? prev + '\n\n' : '') + extractedText + (wasTruncated ? '\n\n[تم اقتصاص النص]' : ''));
    setAttachedFileName(fileName);
    setPendingAttachment(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [pendingAttachment]);

  const handleCancelAttach = useCallback(() => {
    setAttachedFileName(null);
    setPendingAttachment(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-forward" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerMeta}>
          <Text style={[styles.headerTitle, { color: colors.secondary, fontFamily: 'Cairo_700Bold' }]}>
            {activeTab === 'draft' ? 'صياغة عقد' : 'تحليل عقد'}
          </Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            RABAB LEGAL AI
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.secondary + '20' }]}>
          <Text style={{ fontSize: 18 }}>⚖️</Text>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {([
          { key: 'draft' as const, label: 'صياغة عقد', icon: 'create-outline' as const },
          { key: 'analyze' as const, label: 'تحليل عقد', icon: 'search-outline' as const },
        ]).map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabItem,
                { borderBottomColor: isActive ? colors.secondary : 'transparent' },
              ]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={tab.icon}
                size={16}
                color={isActive ? colors.secondary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? colors.secondary : colors.mutedForeground,
                    fontFamily: isActive ? 'Cairo_700Bold' : 'Cairo_400Regular',
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tab content ── */}
      {activeTab === 'draft' ? (
        /* ── Draft chat area ── */
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          {/* ── Resume saved draft banner ── */}
          {showResumeBanner && resumeDraftSavedAt && (
            <View style={[styles.resumeBanner, { backgroundColor: colors.card, borderColor: colors.primary + '44' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.resumeTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                  📋 مسودة محفوظة
                </Text>
                <Text style={[styles.resumeSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]} numberOfLines={1}>
                  {new Date(resumeDraftSavedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.resumeBtn, { backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border }]}
                onPress={() => setShowResumeBanner(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.resumeBtnText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>إخفاء</Text>
              </TouchableOpacity>
            </View>
          )}

          {messages.length === 0 ? (
            /* ── Welcome state ── */
            <View style={styles.welcomeWrapper}>
              <View style={[styles.welcomeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.welcomeEmoji]}>⚖️</Text>
                <Text style={[styles.welcomeTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                  مرحباً، أنا رباب
                </Text>
                <Text style={[styles.welcomeBody, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  صِف العقد المطلوب — نوعه، الأطراف، الغرض، وأي شروط خاصة — وسأصيغه فوراً وفق الأنظمة السعودية.
                </Text>
                <View style={[styles.welcomeHint, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Text style={[styles.welcomeHintText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                    مثال: أريد عقد عمل بين شركة مقاولات ومحاسب براتب 8000 ريال
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => String(m.id)}
              renderItem={({ item }) => (
                <MessageBubble
                  msg={item}
                  colors={colors}
                  onExportPDF={handleExportPDF}
                  isExporting={isExporting}
                  onUpdateDraft={handleUpdateDraft}
                  isSavingDraft={item.isDraft ? isSavingDraft : false}
                />
              )}
              contentContainerStyle={[styles.messageList, { paddingBottom: 12 }]}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            />
          )}

          {/* ── Typing indicator ── */}
          {isSending && (
            <View style={[styles.typingRow, { paddingHorizontal: 16 }]}>
              <View style={[styles.avatar, { backgroundColor: colors.secondary + '33' }]}>
                <Text style={{ fontSize: 14 }}>⚖️</Text>
              </View>
              <View style={[styles.typingBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <ActivityIndicator size="small" color={colors.mutedForeground} />
                <Text style={[styles.typingText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  جارٍ صياغة العقد…
                </Text>
              </View>
            </View>
          )}

          {/* ── Input bar ── */}
          <View
            style={[
              styles.inputBarWrapper,
              {
                borderTopColor: colors.border,
                backgroundColor: colors.background,
                paddingBottom: bottomPad + 8,
              },
            ]}
          >
            {/* Attached file badge */}
            {attachedFileName && (
              <View style={[styles.attachedBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                <Ionicons name="document-text-outline" size={13} color={colors.primary} style={{ flexShrink: 0 }} />
                <Text
                  style={[styles.attachedName, { color: colors.primary, fontFamily: 'Cairo_400Regular' }]}
                  numberOfLines={1}
                >
                  {attachedFileName}
                </Text>
                <TouchableOpacity
                  onPress={() => { setAttachedFileName(null); setInputText(''); }}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputBar}>
              {/* Send button */}
              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  { backgroundColor: inputText.trim() && !isSending && !isExtracting ? colors.secondary : colors.muted },
                ]}
                onPress={handleSend}
                disabled={!inputText.trim() || isSending || isExtracting}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={inputText.trim() && !isSending ? colors.background : colors.mutedForeground}
                />
              </TouchableOpacity>

              {/* Text input */}
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: colors.muted,
                    color: colors.foreground,
                    borderColor: colors.border,
                    fontFamily: 'Cairo_400Regular',
                  },
                ]}
                placeholder={isExtracting ? 'جارٍ استخراج نص الملف...' : 'صف العقد المطلوب…'}
                placeholderTextColor={colors.mutedForeground}
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={2000}
                textAlign="right"
                textAlignVertical="center"
                returnKeyType="default"
                editable={!isExtracting}
              />

              {/* Paperclip button */}
              <TouchableOpacity
                style={[styles.attachBtn, { backgroundColor: colors.muted }]}
                onPress={handleAttachFile}
                disabled={isExtracting || isSending}
                activeOpacity={0.7}
                hitSlop={6}
              >
                {isExtracting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="attach" size={20} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : (
        /* ── Analyze tab ── */
        <AnalyzeTab colors={colors} bottomPad={bottomPad} user={user} />
      )}

      {/* ── File Preview Modal ── */}
      <Modal
        visible={!!pendingAttachment}
        transparent
        animationType="slide"
        onRequestClose={handleCancelAttach}
      >
        <View style={styles.previewOverlay}>
          <View style={[styles.previewSheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            {/* Handle bar */}
            <View style={[styles.previewHandle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={[styles.previewHeader, { borderBottomColor: colors.border }]}>
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text
                  style={[styles.previewFileName, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}
                  numberOfLines={1}
                >
                  {pendingAttachment?.fileName ?? ''}
                </Text>
                <Text style={[styles.previewWordCount, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  {pendingAttachment
                    ? `${pendingAttachment.extractedText.trim().split(/\s+/).length.toLocaleString('ar-SA')} كلمة مستخرجة`
                    : ''}
                  {pendingAttachment?.wasTruncated ? ' · تم اقتصاص النص' : ''}
                </Text>
              </View>
            </View>

            {/* Preview snippet */}
            <View style={[styles.previewSnippetBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <Text style={[styles.previewSnippetLabel, { color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' }]}>
                معاينة أول 100 حرف:
              </Text>
              <ScrollView style={{ maxHeight: 100 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.previewSnippetText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                  {pendingAttachment
                    ? (pendingAttachment.extractedText.trim().slice(0, 100) +
                        (pendingAttachment.extractedText.trim().length > 100 ? '…' : ''))
                    : ''}
                </Text>
              </ScrollView>
            </View>

            {/* Actions */}
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={[styles.previewCancelBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}
                onPress={handleCancelAttach}
                activeOpacity={0.8}
              >
                <Text style={[styles.previewBtnText, { color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' }]}>
                  إلغاء
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.previewConfirmBtn, { backgroundColor: colors.secondary }]}
                onPress={handleConfirmAttach}
                activeOpacity={0.8}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.background} />
                <Text style={[styles.previewBtnText, { color: colors.background, fontFamily: 'Cairo_700Bold' }]}>
                  استخدم هذا الملف
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
