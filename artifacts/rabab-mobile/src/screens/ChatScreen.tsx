import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal,
  ScrollView, Pressable, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGetConsultation } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useAuth, apiFetch } from '@/contexts/AuthContext';

export const LAST_CHAT_STORAGE_KEY = 'rabab_last_chat_id';

const chatStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, textAlign: 'center' },
  headerSub: { fontSize: 11, textAlign: 'center', marginTop: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messagesList: { paddingTop: 16, paddingHorizontal: 4 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 20, textAlign: 'center' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 22, marginTop: 6 },
  inputBarWrap: {
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
  inputField: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    maxHeight: 100,
    lineHeight: 20,
  },
  sendBtn: {
    width: 42, height: 42,
    borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  proactiveBanner: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  proactiveBannerText: { fontSize: 13, textAlign: 'center' },
});

const summaryStyles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  titleText: {
    fontSize: 11,
    flexShrink: 1,
  },
  editBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginStart: 8,
  },
  editText: { fontSize: 11 },
  expandedArea: {
    marginTop: 8,
    maxHeight: 180,
  },
  fieldRow: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    marginBottom: 5,
  },
  fieldLabel: { fontSize: 11 },
  fieldValue: { fontSize: 11, flex: 1 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  accentBar: {
    height: 4,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16 },
  headerSub: { fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4, marginStart: 8 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  notice: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  noticeText: { fontSize: 12, lineHeight: 18 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, marginBottom: 6, textAlign: 'right' },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlign: 'right',
  },
  fieldTextarea: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 4, textAlign: 'right' },
  noFieldsText: { fontSize: 14, textAlign: 'center', paddingVertical: 32 },
  footer: {
    flexDirection: 'row-reverse',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
  },
  saveBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 15 },
  cancelBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtnText: { fontSize: 15 },
});

const attachStyles = createAttachmentStyles();
const citationStyles = createCitationStyles();
function CitationCard({ source, colors }: { source: CitationSource; colors: ReturnType<typeof useColors> }) {
  const pageLabel = source.pageStart != null
    ? source.pageEnd != null && source.pageEnd !== source.pageStart
      ? `ص ${source.pageStart}–${source.pageEnd}`
      : `ص ${source.pageStart}`
    : null;
  const isWeb = !!source.url;

  const handlePress = async () => {
    Haptics.selectionAsync();
    if (source.url) {
      try {
        const canOpen = await Linking.canOpenURL(source.url);
        if (canOpen) {
          await Linking.openURL(source.url);
        } else {
          Alert.alert('تنبيه', 'تعذّر فتح الرابط على هذا الجهاز.');
        }
      } catch {
        Alert.alert('خطأ', 'تعذّر فتح الرابط.');
      }
    } else {
      // KB document — no in-app detail view yet; confirm the source name to the user
      Alert.alert('المصدر', source.name + (pageLabel ? `\n${pageLabel}` : ''));
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={handlePress}
      style={[
        citationStyles.card,
        { backgroundColor: colors.primary + '0d', borderColor: colors.primary + '30' },
      ]}
    >
      <View style={citationStyles.iconWrap}>
        <Text style={citationStyles.icon}>{isWeb ? '🌐' : '📄'}</Text>
      </View>
      <View style={citationStyles.body}>
        <Text
          style={[citationStyles.name, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}
          numberOfLines={2}
        >
          {source.name}
        </Text>
        {pageLabel && (
          <Text style={[citationStyles.page, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            {pageLabel}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {source.verified && (
          <View style={[citationStyles.badge, { backgroundColor: '#16a34a22' }]}>
            <Text style={[citationStyles.badgeText, { color: '#16a34a' }]}>✓</Text>
          </View>
        )}
        <Ionicons
          name={isWeb ? 'open-outline' : 'information-circle-outline'}
          size={14}
          color={colors.primary + '99'}
        />
      </View>
    </TouchableOpacity>
  );
}

const bubbleStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    marginBottom: 10,
    paddingHorizontal: 12,
    alignItems: 'flex-end',
    gap: 8,
  },
  wrapperUser: { flexDirection: 'row-reverse' },
  wrapperAssistant: { flexDirection: 'row' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  avatarEmoji: { fontSize: 14 },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
  },
  bubbleText: { fontSize: 14, lineHeight: 22, textAlign: 'right' },
  citationsWrap: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.07)' },
  citationsHeader: { fontSize: 11, marginBottom: 2, textAlign: 'right' },
  attachmentBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-end',
  },
  attachmentName: { fontSize: 11, flexShrink: 1 },
});


// ─── Field label map (mirrors web) ───────────────────────────────────────────
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
  opinion_text: 'نص الاستشارة',
  initial_info: 'المعلومات الأولية',
  events: 'الأحداث والتواريخ',
  planned_action: 'الإجراء المُقترح',
  goal: 'الهدف المنشود',
  amount: 'قيمة النزاع',
  questions: 'الأسئلة المُحالة',
  settlement_willingness: 'مستوى الاستعداد للتسوية',
};

// ─── Task type fields config (mirrors web) ────────────────────────────────────
interface TaskField {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required: boolean;
  placeholder?: string;
}

interface TaskTypeConfig {
  id: string;
  name: string;
  icon: string;
  fields: TaskField[];
}

const F: Record<string, TaskField> = {
  facts:        { key: 'facts',        label: 'وقائع الاستشارة',           type: 'textarea', required: true,  placeholder: 'الأطراف، ما جرى، التسلسل الزمني...' },
  documents:    { key: 'documents',    label: 'المستندات المتوفرة',        type: 'textarea', required: false, placeholder: 'عقود، فواتير، مراسلات، صكوك...' },
  subject:      { key: 'subject',      label: 'موضوع النزاع',              type: 'text',     required: true,  placeholder: 'مثال: إنهاء عقد / مطالبة مالية...' },
  dispute_type: { key: 'dispute_type', label: 'نوع النزاع',                type: 'text',     required: false, placeholder: 'عمالي / تجاري / عقاري...' },
  dispute_date: { key: 'dispute_date', label: 'تاريخ نشأة النزاع',        type: 'text',     required: false, placeholder: 'مثال: يناير 2024' },
  contract_terms:     { key: 'contract_terms',     label: 'بنود العقد ذات الصلة', type: 'textarea', required: false, placeholder: 'انسخ البنود المتعلقة بالنزاع...' },
  termination_clause: { key: 'termination_clause', label: 'بند الإنهاء في العقد', type: 'text',     required: false, placeholder: 'مثال: المادة 12 من العقد...' },
  service_details:    { key: 'service_details',    label: 'مدة الخدمة والراتب',   type: 'text',     required: false, placeholder: 'مثال: 3 سنوات، راتب 8000 ر.س' },
  property_info:      { key: 'property_info',      label: 'العقار ونوعه',          type: 'text',     required: false, placeholder: 'مثال: شقة سكنية في الرياض' },
  enforcement_deed:   { key: 'enforcement_deed',   label: 'السند التنفيذي ونوعه', type: 'text',     required: true,  placeholder: 'مثال: حكم ابتدائي نهائي...' },
  arbitration_clause: { key: 'arbitration_clause', label: 'شرط التحكيم',           type: 'textarea', required: false, placeholder: 'انسخ نص بند التحكيم...' },
  opinion_text:       { key: 'opinion_text',       label: 'نص الاستشارة',          type: 'textarea', required: true,  placeholder: 'الصق نص الاستشارة كاملاً...' },
  initial_info:       { key: 'initial_info',       label: 'المعلومات الأولية',     type: 'textarea', required: false, placeholder: 'ما تعرفه حتى الآن...' },
  events:             { key: 'events',             label: 'الأحداث والتواريخ',     type: 'textarea', required: true,  placeholder: 'رتّب الأحداث مع تواريخها...' },
  planned_action:     { key: 'planned_action',     label: 'الإجراء المُقترح',      type: 'text',     required: true,  placeholder: 'مثال: رفع دعوى فسخ العقد...' },
  goal:               { key: 'goal',               label: 'الهدف المنشود',          type: 'text',     required: false, placeholder: 'مثال: استرداد المبلغ المدفوع...' },
  amount:             { key: 'amount',             label: 'قيمة النزاع التقريبية', type: 'text',     required: false, placeholder: 'مثال: 150,000 ر.س' },
  questions:          { key: 'questions',          label: 'الأسئلة المُحالة',       type: 'textarea', required: true,  placeholder: 'اذكر الأسئلة القانونية المطلوب الرأي فيها...' },
};

const TASK_TYPES: TaskTypeConfig[] = [
  { id: 'judicial',            icon: '🏛️', name: 'الاستشارة القضائية',      fields: [] },
  { id: 'comprehensive',       icon: '⚖️', name: 'الاستشارة الشاملة',       fields: [] },
  { id: 'fact_gathering',      icon: '🔍', name: 'جمع الوقائع',               fields: [F.subject, F.initial_info] },
  { id: 'legal_classification',icon: '🏷️', name: 'التكييف القانوني',          fields: [F.facts] },
  { id: 'evidence_analysis',   icon: '📋', name: 'تحليل الأدلة',              fields: [F.facts, F.documents] },
  { id: 'case_strength',       icon: '💪', name: 'تقييم قوة القضية',          fields: [F.facts, F.documents] },
  { id: 'strengths_weaknesses',icon: '⚡', name: 'نقاط القوة والضعف',         fields: [F.facts] },
  { id: 'opponent_defenses',   icon: '🛡️', name: 'توقع دفوع الخصم',          fields: [F.facts] },
  { id: 'risk_analysis',       icon: '⚠️', name: 'تحليل المخاطر',             fields: [F.planned_action, F.facts] },
  { id: 'final_recommendation',icon: '🎯', name: 'التوصية النهائية',           fields: [F.facts, F.goal] },
  { id: 'jurisdiction',        icon: '🏛️', name: 'تحديد الاختصاص',           fields: [F.facts, F.dispute_type] },
  { id: 'deadlines',           icon: '⏰', name: 'المدد النظامية',             fields: [F.facts, F.dispute_type, F.dispute_date] },
  { id: 'claims',              icon: '📝', name: 'تحديد الطلبات',              fields: [F.facts] },
  { id: 'damages',             icon: '💰', name: 'تقييم التعويض',              fields: [F.facts] },
  { id: 'contractual_liability',icon: '📄',name: 'المسؤولية العقدية',          fields: [F.facts, F.contract_terms] },
  { id: 'tortious_liability',  icon: '⚖️', name: 'المسؤولية التقصيرية',       fields: [F.facts] },
  { id: 'contract_termination',icon: '🔓', name: 'فسخ العقد وإنهاؤه',         fields: [F.facts, F.termination_clause] },
  { id: 'commercial_dispute',  icon: '🏢', name: 'النزاع التجاري',             fields: [F.facts, F.amount] },
  { id: 'labor_dispute',       icon: '👷', name: 'النزاع العمالي',              fields: [F.facts, F.service_details] },
  { id: 'real_estate_dispute', icon: '🏠', name: 'النزاع العقاري',             fields: [F.facts, F.property_info] },
  { id: 'personal_status',     icon: '👨‍👩‍👧',name: 'الأحوال الشخصية',           fields: [F.facts] },
  { id: 'enforcement',         icon: '⚒️', name: 'قضايا التنفيذ',              fields: [F.enforcement_deed, F.facts] },
  { id: 'arbitration',         icon: '🔐', name: 'التحكيم',                    fields: [F.arbitration_clause, F.facts] },
  { id: 'settlement',          icon: '🤝', name: 'التسوية والصلح',             fields: [F.facts] },
  { id: 'legal_opinion',       icon: '📜', name: 'الرأي القانوني المكتوب',     fields: [F.questions, F.facts] },
  { id: 'peer_review',         icon: '🔎', name: 'مراجعة استشارة خارجية',      fields: [F.opinion_text] },
  { id: 'gap_analysis',        icon: '🕳️', name: 'كشف المعلومات الناقصة',     fields: [F.facts, F.subject] },
  { id: 'timeline',            icon: '📅', name: 'بناء التسلسل الزمني',        fields: [F.events] },
  { id: 'client_explanation',  icon: '💬', name: 'شرح للموكّل',                fields: [F.opinion_text] },
  { id: 'quality_audit',       icon: '✅', name: 'تدقيق جودة الاستشارة',       fields: [F.opinion_text] },
];

interface CitationSource {
  name: string;
  verified: boolean;
  url?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
}
interface ChatAttachment {
  name: string;
  mimeType?: string;
}
interface ChatMessage {
  id?: number;

  role: 'user' | 'assistant';

  content: string;

  sources?: CitationSource[] | null;
  /** Attachment metadata shown in the bubble (actual text is already in content) */

  attachment?: ChatAttachment | null;

  attachmentName?: string | null;
}

/** Strip inline [مصدر N: …] blocks the model may echo back into the reply text */
function stripSourceBlocks(text: string): string {
  return text
    .replace(/\[مصدر\s*(?:مسترجع\s*مسبقاً\s*)?\d+[^\]]*\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function TaskParamsSummary({
  taskParams,
  taskType,
  title,
  onEdit,
}: {
  taskParams: Record<string, string>;
  taskType?: string | null;
  title: string;
  onEdit?: () => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(taskParams).filter(([, v]) => v?.trim());
  if (entries.length === 0) return null;

  const taskConfig = taskType ? TASK_TYPES.find(t => t.id === taskType) : null;
  const displayName = taskConfig ? `${taskConfig.icon} ${taskConfig.name}` : title;

  return (
    <View style={[summaryStyles.container, { backgroundColor: colors.secondary + '10', borderBottomColor: colors.secondary + '30' }]}>
      {/* Header row */}
      <View style={summaryStyles.headerRow}>
        <TouchableOpacity
          style={summaryStyles.toggleBtn}
          onPress={() => { setExpanded(p => !p); Haptics.selectionAsync(); }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={colors.secondary}
          />
          <Text style={[summaryStyles.titleText, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]}>
            📋 معطيات المهمة · {displayName} · ({entries.length} حقل)
          </Text>
        </TouchableOpacity>

        {onEdit && (
          <TouchableOpacity
            style={[summaryStyles.editBtn, { borderColor: colors.border }]}
            onPress={() => { onEdit(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil-outline" size={12} color={colors.primary + 'aa'} />
            <Text style={[summaryStyles.editText, { color: colors.primary + 'aa', fontFamily: 'Cairo_400Regular' }]}>
              تعديل المعطيات
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Expanded content */}
      {expanded && (
        <ScrollView style={summaryStyles.expandedArea} nestedScrollEnabled>
          {entries.map(([key, val]) => (
            <View key={key} style={summaryStyles.fieldRow}>
              <Text style={[summaryStyles.fieldLabel, { color: colors.primary + 'bb', fontFamily: 'Cairo_600SemiBold' }]}>
                {FIELD_LABEL_MAP[key] ?? key}:{'  '}
              </Text>
              <Text style={[summaryStyles.fieldValue, { color: colors.foreground + 'cc', fontFamily: 'Cairo_400Regular' }]}>
                {val}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Edit Params Modal ────────────────────────────────────────────────────────
function EditParamsModal({
  visible,
  taskType,
  currentParams,
  onSave,
  onClose,
}: {
  visible: boolean;
  taskType?: string | null;
  currentParams: Record<string, string>;
  onSave: (params: Record<string, string>) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const [params, setParams] = useState<Record<string, string>>({ ...currentParams });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (visible) {
      setParams({ ...currentParams });
      setErrors({});
    }
  }, [visible, currentParams]);

  const taskConfig = taskType ? TASK_TYPES.find(t => t.id === taskType) : null;

  const setParam = (key: string, val: string) => {
    setParams(prev => ({ ...prev, [key]: val }));
    setErrors(prev => { const e = { ...prev }; delete e[key]; return e; });
  };

  const handleSave = () => {
    if (!taskConfig) { onSave(params); return; }
    const e: Record<string, string> = {};
    for (const f of taskConfig.fields) {
      if (f.required && !params[f.key]?.trim()) {
        e[f.key] = `حقل "${f.label}" إلزامي`;
      }
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    onSave(params);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={[modalStyles.sheet, { backgroundColor: colors.card }]} onPress={() => {}}>
          {/* Accent bar */}
          <View style={[modalStyles.accentBar, { backgroundColor: colors.secondary }]} />

          {/* Header */}
          <View style={[modalStyles.header, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[modalStyles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
                تعديل معطيات المهمة
              </Text>
              {taskConfig && (
                <Text style={[modalStyles.headerSub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  {taskConfig.icon} {taskConfig.name}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false}>
            {/* Notice */}
            <View style={[modalStyles.notice, { backgroundColor: '#fffbeb', borderColor: '#fcd34d' }]}>
              <Text style={[modalStyles.noticeText, { color: '#92400e', fontFamily: 'Cairo_400Regular' }]}>
                ✏️ التعديلات هنا ستُحقن في رسالة النظام للرسالة التالية فقط — المحادثة السابقة لن تتغير.
              </Text>
            </View>

            {(() => {
              // When there is a task type, show its configured fields.
              // When there is no task type, fall back to the two free-form
              // fields (facts + subject) so the lawyer can still edit them.
              const fields: TaskField[] =
                taskConfig && taskConfig.fields.length > 0
                  ? taskConfig.fields
                  : [F.facts, F.subject];
              return fields.map(field => (
                <View key={field.key} style={modalStyles.fieldGroup}>
                  <Text style={[modalStyles.fieldLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
                    {field.label}
                    {field.required && <Text style={{ color: '#ef4444' }}> *</Text>}
                  </Text>
                  <TextInput
                    style={[
                      modalStyles.fieldInput,
                      field.type === 'textarea' && modalStyles.fieldTextarea,
                      { backgroundColor: colors.muted, color: colors.foreground, borderColor: errors[field.key] ? '#ef4444' : colors.border, fontFamily: 'Cairo_400Regular' },
                    ]}
                    value={params[field.key] ?? ''}
                    onChangeText={val => setParam(field.key, val)}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    multiline={field.type === 'textarea'}
                    numberOfLines={field.type === 'textarea' ? 3 : 1}
                    textAlign="right"
                    textAlignVertical={field.type === 'textarea' ? 'top' : 'center'}
                  />
                  {errors[field.key] && (
                    <Text style={[modalStyles.errorText, { fontFamily: 'Cairo_400Regular' }]}>
                      {errors[field.key]}
                    </Text>
                  )}
                </View>
              ));
            })()}
          </ScrollView>

          {/* Footer */}
          <View style={[modalStyles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[modalStyles.saveBtn, { backgroundColor: colors.primary }]}
              onPress={handleSave}
              activeOpacity={0.85}
            >
              <Text style={[modalStyles.saveBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                حفظ التعديلات
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[modalStyles.cancelBtn, { borderColor: colors.border }]}
              onPress={onClose}
              activeOpacity={0.85}
            >
              <Text style={[modalStyles.cancelBtnText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                إلغاء
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Attachment Card inside bubble ───────────────────────────────────────────
function AttachmentCard({ attachment, colors }: { attachment: ChatAttachment; colors: ReturnType<typeof useColors> }) {
  const isPdf = attachment.mimeType === 'application/pdf' || attachment.name.toLowerCase().endsWith('.pdf');
  const isDocx = attachment.mimeType?.includes('wordprocessingml') || attachment.name.toLowerCase().endsWith('.docx');
  const icon = isPdf ? '📕' : isDocx ? '📘' : '📄';
  const ext = isPdf ? 'PDF' : isDocx ? 'DOCX' : 'TXT';
  return (
    <View style={attachStyles.card}>
      <Text style={attachStyles.icon}>{icon}</Text>
      <View style={attachStyles.body}>
        <Text style={[attachStyles.name, { color: colors.primaryForeground, fontFamily: 'Cairo_600SemiBold' }]} numberOfLines={2}>
          {attachment.name}
        </Text>
        <Text style={[attachStyles.ext, { color: colors.primaryForeground + 'aa', fontFamily: 'Cairo_400Regular' }]}>
          {ext}
        </Text>
      </View>
    </View>
  );
}

// ─── Chat Bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ msg, colors }: { msg: ChatMessage; colors: ReturnType<typeof useColors> }) {
  const isUser = msg.role === 'user';
  const displayText = isUser ? msg.content : stripSourceBlocks(msg.content);
  const verifiedSources = !isUser
    ? (msg.sources ?? []).filter(s => s.verified)
    : [];
  const hasAttachment = isUser && (!!msg.attachment || !!msg.attachmentName);

  return (
    <View style={[bubbleStyles.wrapper, isUser ? bubbleStyles.wrapperUser : bubbleStyles.wrapperAssistant]}>
      {!isUser && (
        <View style={[bubbleStyles.avatar, { backgroundColor: colors.primary + '22' }]}>
          <Text style={bubbleStyles.avatarEmoji}>⚖️</Text>
        </View>
      )}
      <View style={[
        bubbleStyles.bubble,
        isUser
          ? [bubbleStyles.bubbleUser, { backgroundColor: colors.primary }]
          : [bubbleStyles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.border }],
        // Widen slightly when we have citation cards or attachment so they don't get too squished
        (!isUser && verifiedSources.length > 0) || hasAttachment ? { maxWidth: '86%' } : undefined,
      ]}>
        {/* Live attachment card (full preview) — shown when sending a new message with a file */}
        {isUser && msg.attachment && (
          <AttachmentCard attachment={msg.attachment} colors={colors} />
        )}
        {/* Historical attachment badge — shown when re-opening a consultation that had a file attached */}
        {isUser && !msg.attachment && !!msg.attachmentName && (
          <View style={[bubbleStyles.attachmentBadge, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Ionicons name="document-attach-outline" size={13} color={colors.primaryForeground} />
            <Text
              style={[bubbleStyles.attachmentName, { color: colors.primaryForeground, fontFamily: 'Cairo_400Regular' }]}
              numberOfLines={1}
            >
              {msg.attachmentName}
            </Text>
          </View>
        )}
        <Text style={[
          bubbleStyles.bubbleText,
          { color: isUser ? colors.primaryForeground : colors.foreground, fontFamily: 'Cairo_400Regular' },
          hasAttachment ? { marginTop: 8 } : undefined,
        ]}>
          {displayText}
        </Text>
        {verifiedSources.length > 0 && (
          <View style={bubbleStyles.citationsWrap}>
            <Text style={[bubbleStyles.citationsHeader, { color: colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' }]}>
              📚 المصادر ({verifiedSources.length})
            </Text>
            {verifiedSources.map((s, i) => (
              <CitationCard key={`${s.name}-${i}`} source={s} colors={colors} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ colors, phase }: { colors: ReturnType<typeof useColors>; phase?: 'searching' | 'generating' | null }) {
  const isSearching = phase === 'searching';
  const isGenerating = phase === 'generating';
  return (
    <View style={[bubbleStyles.wrapper, bubbleStyles.wrapperAssistant]}>
      <View style={[bubbleStyles.avatar, { backgroundColor: colors.primary + '22' }]}>
        <Text style={bubbleStyles.avatarEmoji}>⚖️</Text>
      </View>
      {isSearching ? (
        <View style={[bubbleStyles.bubble, bubbleStyles.bubbleAssistant, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }]}>
          <Text style={{ fontSize: 14 }}>🌐</Text>
          <Text style={{ fontSize: 12, color: '#1D4ED8', fontFamily: 'Cairo_600SemiBold' }}>جارٍ البحث في الإنترنت…</Text>
          <ActivityIndicator size="small" color="#3B82F6" />
        </View>
      ) : isGenerating ? (
        <View style={[bubbleStyles.bubble, bubbleStyles.bubbleAssistant, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }]}>
          <Text style={{ fontSize: 14 }}>⚖️</Text>
          <Text style={{ fontSize: 12, color: '#92400E', fontFamily: 'Cairo_600SemiBold' }}>جارٍ صياغة الرأي القانوني…</Text>
          <ActivityIndicator size="small" color="#D97706" />
        </View>
      ) : (
        <View style={[bubbleStyles.bubble, bubbleStyles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontSize: 18, letterSpacing: 4 }}>•••</Text>
        </View>
      )}
    </View>
  );
}

// ─── Suggested Follow-up Questions ───────────────────────────────────────────

/**
 * Generates 2-3 contextual follow-up question suggestions based on the
 * assistant's Arabic reply and the optional task type.
 * Runs entirely client-side — no extra API call required.
 */
function generateSuggestions(replyText: string, taskType?: string | null): string[] {
  const text = replyText.toLowerCase();
  const suggestions: string[] = [];

  // ── Domain-specific signals ──────────────────────────────────────────────
  if (text.includes('عقد') || text.includes('بند') || text.includes('شرط')) {
    suggestions.push('هل يمكنك توضيح البنود التي قد تكون مجحفة أو غير نظامية؟');
  }
  if (text.includes('نظام') || text.includes('لائحة') || text.includes('مادة')) {
    suggestions.push('ما النص النظامي الكامل للمادة المذكورة؟');
  }
  if (text.includes('تعويض') || text.includes('غرامة') || text.includes('مبلغ')) {
    suggestions.push('كيف يُحسب التعويض المستحق وفق النظام السعودي؟');
  }
  if (text.includes('دعوى') || text.includes('محكمة') || text.includes('قضاء')) {
    suggestions.push('ما الخطوات العملية لرفع الدعوى؟');
  }
  if (text.includes('مدة') || text.includes('أجل') || text.includes('ميعاد')) {
    suggestions.push('ما هي المدد النظامية للطعن أو التقاضي في هذه القضية؟');
  }
  if (text.includes('إثبات') || text.includes('دليل') || text.includes('مستند')) {
    suggestions.push('ما المستندات المطلوبة لإثبات هذه الواقعة أمام القضاء؟');
  }
  if (text.includes('تسوية') || text.includes('صلح') || text.includes('وساطة')) {
    suggestions.push('ما فرص نجاح التسوية الودية في هذه الحالة؟');
  }
  if (text.includes('تنفيذ') || text.includes('حكم') || text.includes('سند')) {
    suggestions.push('كيف يمكن تنفيذ الحكم أو اتخاذ إجراءات التنفيذ الجبري؟');
  }
  if (text.includes('استئناف') || text.includes('طعن') || text.includes('مراجعة')) {
    suggestions.push('ما شروط قبول الاستئناف ومهله في هذا النوع من القضايا؟');
  }
  if (text.includes('عمل') || text.includes('موظف') || text.includes('صاحب العمل')) {
    suggestions.push('هل توجد حماية إضافية للعامل في نظام العمل السعودي لهذه الحالة؟');
  }

  // ── Task-type-specific suggestions ──────────────────────────────────────
  if (suggestions.length < 2) {
    const taskSuggestions: Record<string, string[]> = {
      legal_classification: [
        'ما التكييف القانوني الدقيق لهذه الوقائع؟',
        'هل يمكن الجمع بين أكثر من دعوى في نفس الوقت؟',
      ],
      case_strength: [
        'ما نقاط الضعف الرئيسية في القضية وكيف يمكن معالجتها؟',
        'ما احتمالية الفوز بناءً على المعطيات الحالية؟',
      ],
      damages: [
        'هل يشمل التعويض الضرر المعنوي؟',
        'كيف يمكن إثبات الضرر الفعلي أمام القضاء؟',
      ],
      deadlines: [
        'هل انقضاء المدة يُسقط الحق نهائياً؟',
        'هل يوجد استثناء يُمدّد هذه المدة؟',
      ],
      risk_analysis: [
        'ما البديل الأقل مخاطرة قانونياً في هذه الحالة؟',
        'هل التسوية الودية أفضل من التقاضي في هذه الحالة؟',
      ],
      settlement: [
        'ما الحد الأدنى المقبول للتسوية من منظور قانوني؟',
        'هل يمكن صياغة الصلح بشكل يضمن عدم الرجوع لاحقاً؟',
      ],
    };
    const extra = taskType ? (taskSuggestions[taskType] ?? []) : [];
    for (const q of extra) {
      if (!suggestions.includes(q)) suggestions.push(q);
      if (suggestions.length >= 3) break;
    }
  }

  // ── Generic fallbacks ────────────────────────────────────────────────────
  const fallbacks = [
    'هل يمكنك تبسيط الإجابة بمثال عملي؟',
    'ما الخطوة القانونية الأولى التي أنصح باتخاذها الآن؟',
    'هل هناك نصوص نظامية أو أحكام قضائية تدعم هذا الموقف؟',
    'ما مدى قوة موقفي القانوني في هذه المسألة؟',
  ];
  for (const f of fallbacks) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(f)) suggestions.push(f);
  }

  return suggestions.slice(0, 3);
}

const suggestStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
  },
});

function SuggestedQuestions({
  questions,
  onSelect,
  colors,
}: {
  questions: string[];
  onSelect: (q: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (questions.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={suggestStyles.row}
    >
      {questions.map((q) => (
        <TouchableOpacity
          key={q}
          style={[suggestStyles.chip, { borderColor: colors.secondary + '80', backgroundColor: colors.secondary + '12' }]}
          onPress={() => { Haptics.selectionAsync(); onSelect(q); }}
          activeOpacity={0.75}
        >
          <Text style={[suggestStyles.chipText, { color: colors.secondary, fontFamily: 'Cairo_400Regular' }]}>
            {q}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Main ChatScreen ──────────────────────────────────────────────────────────
interface ChatScreenProps {
  consultationId: number;
  onBack: () => void;
  onNewConversation?: () => void;
}

export function ChatScreen({ consultationId, onBack, onNewConversation }: ChatScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sendingPhase, setSendingPhase] = useState<'searching' | 'generating' | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [localTaskParams, setLocalTaskParams] = useState<Record<string, string>>({});
  const [editingParams, setEditingParams] = useState(false);
  // NOTE: File upload (pendingAttachment / isExtracting / handleAttachFile) is intentionally
  // absent from this screen. It belongs exclusively to the contract namespace
  // (app/contract/drafter.tsx + hooks/useContractFileUpload.ts).
  // Unique verified source keys (name+url) across the full consultation history.
  // Using a ref so the Set is mutated without triggering re-renders; count is
  // stored separately in state so the UI (PDF button / export) stays reactive.
  const citedSourceKeys = useRef<Set<string>>(new Set());
  const [citedSourceCount, setCitedSourceCount] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);

  // ── Proactive KB search indicator ────────────────────────────────────────
  const NO_PROACTIVE_TASK_TYPES = new Set([
    'peer_review', 'fact_gathering', 'legal_classification', 'gap_analysis',
    'case_strength', 'strengths_weaknesses', 'opponent_defenses', 'legal_opinion', 'timeline',
  ]);
  const [preparingSources, setPreparingSources] = useState(false);
  const proactivePollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop polling on unmount
  useEffect(() => {
    return () => { if (proactivePollingRef.current) clearTimeout(proactivePollingRef.current); };
  }, []);

  const { data: consultation } = useGetConsultation(consultationId);

  // Persist the last active consultation ID so the hub tab can restore it
  useEffect(() => {
    AsyncStorage.setItem(LAST_CHAT_STORAGE_KEY, String(consultationId)).catch(() => {});
  }, [consultationId]);

  // Sync task params from consultation
  useEffect(() => {
    if (consultation?.taskParams) {
      setLocalTaskParams(consultation.taskParams as Record<string, string>);
    }
  }, [consultation?.taskParams]);

  // Load message history and derive citation count from persisted source data.
  // This ensures reopening an existing consultation shows the correct reference
  // count rather than starting from 0.
  const loadMessages = useCallback(async () => {
    try {
      const data = await apiFetch<Array<{
        role: string;
        content: string;
        id?: number;
        attachmentName?: string | null;
        sources?: Array<{ name: string; verified: boolean; url?: string | null; pageStart?: number | null; pageEnd?: number | null }> | null;
      }>>(
        `/api/consultations/${consultationId}/messages`
      );
      const filtered = data
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          attachmentName: m.attachmentName ?? null,
          sources: m.sources ?? null,
        }));
      setMessages(filtered);

      // Seed suggestions from the last assistant message in history
      const lastAssistant = [...filtered].reverse().find(m => m.role === 'assistant');
      if (lastAssistant) {
        setSuggestedQuestions(generateSuggestions(lastAssistant.content));
      }

      // Rebuild the unique-source Set from persisted data so the count is
      // accurate regardless of when the user opens the consultation.
      const keys = new Set<string>();
      for (const msg of filtered) {
        if (msg.role === 'assistant' && Array.isArray(msg.sources)) {
          for (const s of msg.sources) {
            if (s.verified) {
              // Stable deduplication key: prefer url for web sources,
              // fall back to name (documentName) for KB sources.
              keys.add(s.url ?? s.name);
            }
          }
        }
      }
      citedSourceKeys.current = keys;
      setCitedSourceCount(keys.size);
    } catch {
      // Non-fatal
    } finally {
      setLoadingMessages(false);
    }
  }, [consultationId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Start proactive-status polling once messages are loaded and consultation is known
  useEffect(() => {
    if (loadingMessages || !consultation) return;
    const hasProactive = !!consultation.taskType && !NO_PROACTIVE_TASK_TYPES.has(consultation.taskType as string);
    const ageMs = Date.now() - new Date(consultation.createdAt as string).getTime();
    const noReplies = !messages.some((m) => m.role === 'assistant');
    if (!hasProactive || ageMs >= 30_000 || !noReplies) return;

    setPreparingSources(true);
    const maxUntil = Date.now() + 20_000;
    const poll = async () => {
      if (Date.now() >= maxUntil) { setPreparingSources(false); return; }
      try {
        const d = await apiFetch<{ ready: boolean }>(
          `/api/consultations/${consultationId}/proactive-status`
        );
        if (d.ready) { setPreparingSources(false); return; }
      } catch (err: any) {
        const msg = String(err?.message ?? '');
        if (/40[134]/.test(msg)) { setPreparingSources(false); return; }
      }
      proactivePollingRef.current = setTimeout(poll, 1500);
    };
    proactivePollingRef.current = setTimeout(poll, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMessages, consultation?.id]);

  // Clear banner as soon as the first assistant reply arrives
  useEffect(() => {
    if (preparingSources && messages.some((m) => m.role === 'assistant')) {
      setPreparingSources(false);
      if (proactivePollingRef.current) { clearTimeout(proactivePollingRef.current); proactivePollingRef.current = null; }
    }
  }, [messages, preparingSources]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput('');
    setSuggestedQuestions([]);
    setSending(true);
    setSendingPhase(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      attachment: null,
    };
    setMessages(prev => [...prev, userMsg]);

    // Poll phase endpoint every 600 ms to show real-time indicator
    const phaseInterval = setInterval(async () => {
      try {
        const d = await apiFetch<{ phase: 'searching' | 'generating' | null }>(
          `/api/consultations/${consultationId}/chat-phase`,
        );
        setSendingPhase(d.phase);
      } catch { /* non-critical */ }
    }, 600);

    try {
      const data = await apiFetch<{
        reply?: string;
        message?: string;
        verification?: { sources?: Array<{ name: string; verified: boolean; url?: string | null; pageStart?: number | null; pageEnd?: number | null }> };
      }>(
        `/api/consultations/${consultationId}/chat`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: text,
            taskType: consultation?.taskType ?? undefined,
            taskParams: localTaskParams,
          }),
        }
      );
      const allSources = data.verification?.sources ?? null;
      const replyText = data.reply ?? data.message ?? '';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: replyText,
        sources: allSources,
      }]);
      setSuggestedQuestions(generateSuggestions(replyText, consultation?.taskType));
      // Merge verified sources into the unique-key Set to avoid double-counting
      // sources that appear across multiple turns in the same consultation.
      const verifiedSources = allSources?.filter(s => s.verified) ?? [];
      if (verifiedSources.length > 0) {
        let changed = false;
        for (const s of verifiedSources) {
          const key = s.url ?? s.name;
          if (!citedSourceKeys.current.has(key)) {
            citedSourceKeys.current.add(key);
            changed = true;
          }
        }
        if (changed) setCitedSourceCount(citedSourceKeys.current.size);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      // Remove the optimistic user message on error
      setMessages(prev => prev.slice(0, -1));
      if (e?.status === 401) {
        // Session expired — restore the draft so the user doesn't lose their text
        setInput(text);
        Alert.alert(
          'انتهت الجلسة',
          'انتهت صلاحية جلستك. رسالتك محفوظة — سجّل الدخول مجدداً ثم أرسلها.',
          [{ text: 'حسناً', style: 'default' }],
        );
      } else {
        Alert.alert('خطأ', e?.message ?? 'فشل إرسال الرسالة. يرجى المحاولة مجدداً.');
      }
    } finally {
      clearInterval(phaseInterval);
      setSending(false);
      setSendingPhase(null);
    }
  };

  // Save edited params to server
  const handleParamsSaved = async (updated: Record<string, string>) => {
    setLocalTaskParams(updated);
    setEditingParams(false);
    try {
      await apiFetch(`/api/consultations/${consultationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ taskParams: updated }),
      });
    } catch {
      // Non-fatal: params already applied in local state
    }
  };

  const handleSuggestSelect = useCallback((q: string) => {
    setSuggestedQuestions([]);
    setInput('');
    setSending(true);
    setSendingPhase(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: ChatMessage = { role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);

    const phaseInterval = setInterval(async () => {
      try {
        const d = await apiFetch<{ phase: 'searching' | 'generating' | null }>(
          `/api/consultations/${consultationId}/chat-phase`,
        );
        setSendingPhase(d.phase);
      } catch { /* non-critical */ }
    }, 600);

    apiFetch<{
      reply?: string;
      message?: string;
      verification?: { sources?: Array<{ name: string; verified: boolean; url?: string | null; pageStart?: number | null; pageEnd?: number | null }> };
    }>(
      `/api/consultations/${consultationId}/chat`,
      {
        method: 'POST',
        body: JSON.stringify({
          message: q,
          taskType: consultation?.taskType ?? undefined,
          taskParams: localTaskParams,
          attachmentName: null,
        }),
      }
    ).then(data => {
      const allSources = data.verification?.sources ?? null;
      const replyText = data.reply ?? data.message ?? '';
      setMessages(prev => [...prev, { role: 'assistant', content: replyText, sources: allSources }]);
      setSuggestedQuestions(generateSuggestions(replyText, consultation?.taskType));
      const verifiedSources = allSources?.filter(s => s.verified) ?? [];
      if (verifiedSources.length > 0) {
        let changed = false;
        for (const s of verifiedSources) {
          const key = s.url ?? s.name;
          if (!citedSourceKeys.current.has(key)) { citedSourceKeys.current.add(key); changed = true; }
        }
        if (changed) setCitedSourceCount(citedSourceKeys.current.size);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }).catch((e: any) => {
      setMessages(prev => prev.slice(0, -1));
      setSuggestedQuestions(generateSuggestions(q, consultation?.taskType));
      Alert.alert('خطأ', e?.message ?? 'فشل إرسال الرسالة. يرجى المحاولة مجدداً.');
    }).finally(() => {
      clearInterval(phaseInterval);
      setSending(false);
      setSendingPhase(null);
    });
  }, [consultationId, consultation?.taskType, localTaskParams]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const hasTaskParams = Object.entries(localTaskParams).filter(([, v]) => v?.trim()).length > 0;

  // ── Memo PDF Export ────────────────────────────────────────────────────────
  const exportMemoPDF = useCallback(async () => {
    if (exportingPdf || messages.length === 0) return;
    setExportingPdf(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const title = consultation?.title ?? 'استشارة قانونية';
      const area  = consultation?.areaAr ?? '';
      const dateStr = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
      const refCount = citedSourceCount;
      const refColor = refCount > 0 ? '#16a34a' : '#dc2626';
      const refLabel = refCount > 0
        ? `عدد المراجع الموثّقة: ${refCount}`
        : 'عدد المراجع الموثّقة: 0';

      const rows = messages.map(m => {
          const escaped = (m.content ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br/>');
          if (m.role === 'user') {
            return `<div class="user-msg"><div class="role">👤 السائل</div><div class="body">${escaped}</div></div>`;
          }
          return `<div class="ai-msg"><div class="role">⚖️ رباب للاستشارات القانونية</div><div class="body">${escaped}</div></div>`;
        }).join('');

      const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size: 13pt; direction: rtl; color: #111; background: #fff; padding: 2cm 2.5cm; }
    .header { border-bottom: 2px solid #1a3a6b; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-end; }
    .brand { font-size: 11pt; font-weight: bold; color: #1a3a6b; }
    .brand-sub { font-size: 9pt; color: #888; margin-top: 2px; }
    .date { font-size: 9pt; color: #888; }
    .meta { background: #f8f8f0; border: 1px solid #e0d9a8; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; font-size: 11pt; }
    .disclaimer { background: #fff8e1; border: 1px solid #ffe082; border-radius: 6px; padding: 10px 14px; margin-bottom: 20px; font-size: 10pt; color: #7a5f00; line-height: 1.6; }
    .memo-heading { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .memo-title { font-size: 13pt; font-weight: bold; color: #1a3a6b; }
    .ref-count { font-size: 10pt; font-weight: bold; color: ${refColor}; }
    .user-msg { background: #1a3a6b; color: #fff; border-radius: 10px; border-top-right-radius: 2px; padding: 10px 14px; margin: 8px 0 8px auto; max-width: 82%; }
    .ai-msg { background: #f9f6e8; border: 1px solid #e8e0b0; border-radius: 10px; border-top-left-radius: 2px; padding: 10px 14px; margin: 8px auto 8px 0; max-width: 85%; }
    .role { font-size: 9pt; font-weight: bold; margin-bottom: 5px; opacity: 0.75; }
    .body { line-height: 1.8; font-size: 12pt; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 9pt; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">⚖️ &nbsp;رباب محاميتك الرقمية</div>
      <div class="brand-sub">RABAB LEGAL AI &nbsp;·&nbsp; استشارة قانونية</div>
    </div>
    <div class="date">${dateStr}</div>
  </div>
  <div class="meta">
    <b>الموضوع:</b> ${title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
    ${area ? `&nbsp;|&nbsp;<b>التخصص:</b> ${area.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}` : ''}
  </div>
  <div class="disclaimer">
    ⚠️ هذه إجابة صادرة عن الذكاء الاصطناعي، وهي للاسترشاد ولا تُعدّ رأياً قانونياً ملزماً، ولا تغني عن مراجعة المحامي المختص.
  </div>
  <div class="memo-heading">
    <div class="memo-title">المذكرة القانونية</div>
    <div class="ref-count">${refLabel}</div>
  </div>
  ${rows}
  <div class="footer">رباب محاميتك الرقمية · RABAB LEGAL AI · للاسترشاد فقط</div>
</body>
</html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'مشاركة المذكرة القانونية',
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
  }, [exportingPdf, messages, consultation, citedSourceCount]);

  return (
    <View style={[chatStyles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[chatStyles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={onBack} style={chatStyles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <View style={chatStyles.headerCenter}>
          <Text style={[chatStyles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]} numberOfLines={1}>
            {consultation?.title ?? 'المحادثة'}
          </Text>
          {consultation?.areaAr && (
            <View style={{
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 8,
              borderWidth: 1,
              backgroundColor: colors.accent + '22',
              borderColor: colors.accent + '44',
              marginTop: 3,
            }}>
              <Text style={{ fontSize: 11, color: colors.accent, fontFamily: 'Cairo_400Regular' }}>
                {consultation.areaAr}
              </Text>
            </View>
          )}
        </View>
        {/* Right-side action buttons */}
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
          {/* New Conversation — clears saved session */}
          <TouchableOpacity
            style={[chatStyles.backBtn, { backgroundColor: colors.secondary + '18' }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              AsyncStorage.removeItem(LAST_CHAT_STORAGE_KEY).catch(() => {});
              if (onNewConversation) {
                onNewConversation();
              } else {
                onBack();
              }
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-outline" size={22} color={colors.secondary} />
          </TouchableOpacity>
          {/* PDF Export — visible when there are messages */}
          {messages.length > 0 ? (
            <TouchableOpacity
              style={[chatStyles.backBtn, { backgroundColor: colors.primary + '18' }]}
              onPress={exportMemoPDF}
              disabled={exportingPdf}
              activeOpacity={0.7}
            >
              {exportingPdf
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="download-outline" size={20} color={colors.primary} />
              }
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>
      </View>

      {/* ── Task Params Summary Bar ── */}
      {hasTaskParams && (
        <TaskParamsSummary
          taskParams={localTaskParams}
          taskType={consultation?.taskType}
          title={consultation?.title ?? ''}
          onEdit={() => setEditingParams(true)}
        />
      )}

      {/* ── Proactive KB search banner ── */}
      {preparingSources && (
        <View style={[chatStyles.proactiveBanner, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '33' }]}>
          <Text style={[chatStyles.proactiveBannerText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
            ⚡ جارٍ تحضير مصادر قانونية ذات صلة…
          </Text>
        </View>
      )}

      {/* ── Messages ── */}
      {loadingMessages ? (
        <View style={chatStyles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => <ChatBubble msg={item} colors={colors} />}
            contentContainerStyle={[chatStyles.messagesList, { paddingBottom: 12 }]}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={chatStyles.emptyWrap}>
                <Text style={chatStyles.emptyEmoji}>⚖️</Text>
                <Text style={[chatStyles.emptyTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                  أهلاً بك!
                </Text>
                <Text style={[chatStyles.emptySub, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                  اكتب سؤالك القانوني وسأرد عليك فوراً
                </Text>
              </View>
            }
            ListFooterComponent={sending ? <TypingIndicator colors={colors} phase={sendingPhase} /> : null}
          />

          {/* ── Suggested Questions ── */}
          {!sending && suggestedQuestions.length > 0 && (
            <SuggestedQuestions
              questions={suggestedQuestions}
              onSelect={handleSuggestSelect}
              colors={colors}
            />
          )}

          {/* ── Input Bar ── */}
          {/* File upload intentionally absent — belongs to contract screens only (useContractFileUpload) */}
          <View style={[chatStyles.inputBarWrap, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: insets.bottom + 8 }]}>
            <View style={chatStyles.inputBar}>
              <TextInput
                style={[chatStyles.inputField, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
                placeholder="اكتب سؤالك القانوني هنا..."
                placeholderTextColor={colors.mutedForeground}
                value={input}
                onChangeText={setInput}
                multiline
                textAlign="right"
                textAlignVertical="center"
                editable={!sending}
              />
              <TouchableOpacity
                style={[chatStyles.sendBtn, { backgroundColor: !input.trim() || sending ? colors.muted : colors.primary }]}
                onPress={send}
                disabled={!input.trim() || sending}
                activeOpacity={0.85}
              >
                {sending
                  ? <ActivityIndicator size="small" color={colors.mutedForeground} />
                  : <Ionicons name="send" size={18} color={!input.trim() ? colors.mutedForeground : colors.primaryForeground} />
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* ── Edit Params Modal ── */}
      <EditParamsModal
        visible={editingParams}
        taskType={consultation?.taskType}
        currentParams={localTaskParams}
        onSave={handleParamsSaved}
        onClose={() => setEditingParams(false)}
      />
    </View>
  );
}
function createAttachmentStyles() {
  return StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  icon: { fontSize: 22 },
  body: { flex: 1 },
  name: { fontSize: 13, lineHeight: 18, textAlign: 'right' },
  ext: { fontSize: 10, marginTop: 2, textAlign: 'right' },
  });
}

function createCitationStyles() {
  return StyleSheet.create({
  card: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
    gap: 8,
  },
  iconWrap: { width: 24, alignItems: 'center' },
  icon: { fontSize: 14 },
  body: { flex: 1 },
  name: { fontSize: 12, lineHeight: 17, textAlign: 'right' },
  page: { fontSize: 11, marginTop: 1, textAlign: 'right' },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  });
}
