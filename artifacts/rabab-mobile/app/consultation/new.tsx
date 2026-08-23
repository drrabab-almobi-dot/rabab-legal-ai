import React, { useState, useEffect } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { useCreateConsultation } from '@workspace/api-client-react';

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: { fontSize: 20, flex: 1, textAlign: 'right' },
  backBtn: { padding: 4 },

  // type-select
  typeSelectContent: { padding: 20, gap: 16 },
  typeSelectHint: { fontSize: 14, textAlign: 'center', marginBottom: 4 },
  typeCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  typeCardIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typeCardEmoji: { fontSize: 28 },
  typeCardBody: { flex: 1, gap: 6 },
  typeCardTitle: { fontSize: 17, textAlign: 'right' },
  typeCardDesc: { fontSize: 13, textAlign: 'right', lineHeight: 20 },
  typeCardBadge: {
    alignSelf: 'flex-end',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  typeCardBadgeText: { fontSize: 11 },

  // legal-form / task-form shared
  formContent: { padding: 20, gap: 6 },
  typeChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-end',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 12,
  },
  typeChipEmoji: { fontSize: 16 },
  typeChipText: { fontSize: 13 },
  formLabel: { fontSize: 14, textAlign: 'right', marginBottom: 6 },
  formInput: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    fontSize: 14,
    minHeight: 90,
    lineHeight: 22,
  },
  formInputSingle: { minHeight: 46 },
  areaSelect: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  areaSelectText: { flex: 1, fontSize: 14, textAlign: 'right' },
  areaPicker: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  areaItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1 },
  areaItemText: { fontSize: 14, textAlign: 'right' },
  submitBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  submitBtnText: { fontSize: 16 },

  // task-select
  groupTabsRow: { maxHeight: 52, borderBottomWidth: 1 },
  groupTabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  groupTab: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  groupTabText: { fontSize: 13 },
  taskList: { padding: 16, gap: 10 },
  taskCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  taskCardEmoji: { fontSize: 24, flexShrink: 0 },
  taskCardBody: { flex: 1, gap: 4 },
  taskCardName: { fontSize: 15, textAlign: 'right' },
  taskCardDesc: { fontSize: 13, textAlign: 'right', lineHeight: 20 },
  fieldsBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  fieldsBadgeText: { fontSize: 11 },
  centeredLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 14 },

  // country row (task-select)
  countryRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
  },
  countryChips: { paddingHorizontal: 4, gap: 8, alignItems: 'center' },
  countryChip: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  countryChipText: { fontSize: 12 },
});

const COUNTRY_STORAGE_KEY = 'rabab_last_selected_country';
const AREA_STORAGE_KEY = 'rabab_last_selected_area';

// ─── Data ─────────────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'SA', name: 'المملكة العربية السعودية', flag: '🇸🇦' },
  { code: 'AE', name: 'الإمارات العربية المتحدة', flag: '🇦🇪' },
  { code: 'KW', name: 'الكويت',                   flag: '🇰🇼' },
  { code: 'QA', name: 'قطر',                       flag: '🇶🇦' },
  { code: 'BH', name: 'البحرين',                   flag: '🇧🇭' },
  { code: 'OM', name: 'سلطنة عُمان',               flag: '🇴🇲' },
];

const AREAS = [
  'عقود تجارية',
  'نزاعات عمالية',
  'قضايا عقارية',
  'أحوال شخصية',
  'مسائل جنائية',
  'قانون الشركات',
  'الملكية الفكرية',
  'أخرى',
];

interface FieldDef {
  key: string;
  label: string;
  placeholder: string;
  multiline?: boolean;
  required?: boolean;
}

const FIELDS: Record<string, FieldDef> = {
  facts:         { key: 'facts',         label: 'وقائع القضية',       placeholder: 'اكتب وقائع القضية بإيجاز…',              multiline: true, required: true },
  subject:       { key: 'subject',       label: 'موضوع النزاع',       placeholder: 'موضوع النزاع أو القضية…',                 multiline: false, required: true },
  initial_info:  { key: 'initial_info',  label: 'معلومات أولية',      placeholder: 'أي معلومات أولية…',                       multiline: true },
  documents:     { key: 'documents',     label: 'الوثائق المتاحة',    placeholder: 'العقود، المستندات، الإثباتات…',            multiline: true },
  planned_action:{ key: 'planned_action',label: 'الإجراء المخطط',     placeholder: 'ما الخطوة التي تنوي اتخاذها؟',            multiline: false },
  goal:          { key: 'goal',          label: 'الهدف المطلوب',      placeholder: 'ما النتيجة التي تريد تحقيقها؟',           multiline: false },
  dispute_type:  { key: 'dispute_type',  label: 'نوع النزاع',         placeholder: 'تجاري / عمالي / مدني…',                   multiline: false },
  dispute_date:  { key: 'dispute_date',  label: 'تاريخ النزاع',       placeholder: 'متى حدث النزاع؟',                         multiline: false },
  contract_terms:{ key: 'contract_terms',label: 'بنود العقد',         placeholder: 'البنود ذات الصلة من العقد…',               multiline: true },
  questions:     { key: 'questions',     label: 'الأسئلة المحددة',    placeholder: 'الأسئلة التي تحتاج إجابة عنها…',          multiline: true },
};

interface TaskType {
  id: string;
  group: string;
  icon: string;
  name: string;
  description: string;
  fields: FieldDef[];
}

const TASK_TYPES: TaskType[] = [
  // Group 1
  { id: 'judicial',             group: 'التحليل الشامل',       icon: '🏛️', name: 'الاستشارة القضائية',        description: 'تحدّث بحرية عن وضعك القانوني ورباب ستحلّل وتُرشدك',        fields: [] },
  { id: 'comprehensive',        group: 'التحليل الشامل',       icon: '⚖️', name: 'الاستشارة الشاملة',        description: 'تحليل قانوني متكامل يغطي كل جوانب القضية',                   fields: [] },
  { id: 'fact_gathering',       group: 'التحليل الشامل',       icon: '🔍', name: 'جمع الوقائع',              description: 'قائمة أسئلة منظمة لاستيفاء وقائع القضية',                    fields: [FIELDS.subject, FIELDS.initial_info] },
  { id: 'legal_classification', group: 'التحليل الشامل',       icon: '🏷️', name: 'التكييف القانوني',          description: 'تحديد الوصف القانوني الدقيق والتكييفات البديلة',             fields: [FIELDS.facts] },
  { id: 'evidence_analysis',    group: 'التحليل الشامل',       icon: '📋', name: 'تحليل الأدلة',             description: 'تقييم الأدلة وفق نظام الإثبات وتصنيف حجيتها',               fields: [FIELDS.facts, FIELDS.documents] },
  { id: 'case_strength',        group: 'التحليل الشامل',       icon: '💪', name: 'تقييم قوة القضية',         description: 'قياس قوة الموقف القانوني والإثباتي',                         fields: [FIELDS.facts, FIELDS.documents] },
  // Group 2
  { id: 'strengths_weaknesses', group: 'الاستراتيجية',         icon: '⚡', name: 'نقاط القوة والضعف',        description: 'تحليل مفصّل لكلا الطرفين',                                    fields: [FIELDS.facts] },
  { id: 'opponent_defenses',    group: 'الاستراتيجية',         icon: '🛡️', name: 'توقع دفوع الخصم',          description: 'استباق دفوع الطرف الآخر مع الردود المضادة',                  fields: [FIELDS.facts] },
  { id: 'risk_analysis',        group: 'الاستراتيجية',         icon: '⚠️', name: 'تحليل المخاطر',            description: 'خريطة مخاطر شاملة قبل اتخاذ إجراء',                          fields: [FIELDS.planned_action, FIELDS.facts] },
  { id: 'final_recommendation', group: 'الاستراتيجية',         icon: '🎯', name: 'التوصية النهائية',          description: 'خطة تنفيذية قابلة للتطبيق بخيارات مرتبة',                   fields: [FIELDS.facts, FIELDS.goal] },
  // Group 3
  { id: 'jurisdiction',         group: 'الإجراءات',             icon: '🏛️', name: 'تحديد الاختصاص',           description: 'الجهة القضائية المختصة نوعاً وقيمةً ومكاناً',                fields: [FIELDS.facts, FIELDS.dispute_type] },
  { id: 'deadlines',            group: 'الإجراءات',             icon: '⏰', name: 'المدد النظامية',            description: 'التقادم والمواعيد الحرجة ترتيباً زمنياً',                    fields: [FIELDS.facts, FIELDS.dispute_type, FIELDS.dispute_date] },
  { id: 'claims',               group: 'الإجراءات',             icon: '📝', name: 'تحديد الطلبات',            description: 'جميع الطلبات الأصلية والاحتياطية والمستعجلة',                fields: [FIELDS.facts] },
  // Group 4
  { id: 'damages',              group: 'المسؤولية والتعويض',   icon: '💰', name: 'تقييم التعويض',            description: 'عناصر التعويض وأسس الاحتساب وشروط الإثبات',                  fields: [FIELDS.facts] },
  { id: 'contractual_liability',group: 'المسؤولية والتعويض',   icon: '📄', name: 'المسؤولية العقدية',         description: 'تحليل الأركان والإخلال ونطاق المسؤولية',                     fields: [FIELDS.facts, FIELDS.contract_terms] },
];

const TASK_GROUPS = Array.from(new Set(TASK_TYPES.map(t => t.group)));

// ─── Phases ───────────────────────────────────────────────────────────────────

type Phase = 'type-select' | 'legal-form' | 'task-select' | 'task-form';

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function NewConsultationScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('type-select');

  // Legal form state
  const [title, setTitle] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [showAreaPicker, setShowAreaPicker] = useState(false);

  // Country picker state (shared across phases)
  const [selectedCountry, setSelectedCountry] = useState('SA');
  const [showCountryPicker, setShowCountryPicker] = useState(false);

  // Load persisted country and area on mount
  useEffect(() => {
    AsyncStorage.multiGet([COUNTRY_STORAGE_KEY, AREA_STORAGE_KEY]).then((pairs) => {
      const country = pairs[0][1];
      const area = pairs[1][1];
      if (country) setSelectedCountry(country);
      if (area) setSelectedArea(area);
    }).catch(() => {/* ignore */});
  }, []);

  // Persist country and update state
  const handleCountryChange = (code: string) => {
    setSelectedCountry(code);
    AsyncStorage.setItem(COUNTRY_STORAGE_KEY, code).catch(() => {/* ignore */});
  };

  // Persist area and update state
  const handleAreaChange = (area: string) => {
    setSelectedArea(area);
    AsyncStorage.setItem(AREA_STORAGE_KEY, area).catch(() => {/* ignore */});
  };

  // Judicial task-select state
  const [activeGroup, setActiveGroup] = useState(TASK_GROUPS[0]);
  const [selectedTask, setSelectedTask] = useState<TaskType | null>(null);
  const [taskParams, setTaskParams] = useState<Record<string, string>>({});

  const { mutate: createConsultation, isPending: isCreating } = useCreateConsultation({
    mutation: {
      onSuccess: (data: any) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const id = data?.id ?? data?.consultation?.id;
        if (id) {
          router.replace(`/chat/${id}` as any);
        } else {
          router.back();
        }
      },
      onError: (err: any) => {
        Alert.alert('خطأ', err?.message ?? 'فشل إرسال الاستشارة');
      },
    },
  });

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Helper: build areaAr with country label
  const buildAreaWithCountry = (baseName: string) => {
    const c = COUNTRIES.find(c => c.code === selectedCountry);
    return c ? `${baseName} — ${c.flag} ${c.name}` : baseName;
  };

  const handleLegalSubmit = () => {
    if (!title.trim() || title.trim().length < 5) {
      Alert.alert('تنبيه', 'يرجى كتابة وصف للاستشارة (5 أحرف على الأقل)');
      return;
    }
    const base = selectedArea ? `استشارة قانونية – ${selectedArea}` : 'استشارة قانونية';
    createConsultation({
      data: {
        title: title.trim(),
        areaAr: buildAreaWithCountry(base),
        taskType: 'comprehensive',
        taskParams: {},
      } as any,
    });
  };

  const handleTaskSelect = (task: TaskType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTask(task);
    if (task.fields.length === 0) {
      // No form needed — create directly
      createConsultation({
        data: {
          title: task.name,
          areaAr: buildAreaWithCountry(task.name),
          taskType: task.id,
          taskParams: {},
        } as any,
      });
    } else {
      const initial: Record<string, string> = {};
      task.fields.forEach(f => { initial[f.key] = ''; });
      setTaskParams(initial);
      setPhase('task-form');
    }
  };

  const handleTaskFormSubmit = () => {
    if (!selectedTask) return;
    const requiredFields = selectedTask.fields.filter(f => f.required);
    for (const f of requiredFields) {
      if (!taskParams[f.key]?.trim()) {
        Alert.alert('تنبيه', `يرجى تعبئة حقل "${f.label}"`);
        return;
      }
    }
    createConsultation({
      data: {
        title: selectedTask.name,
        areaAr: buildAreaWithCountry(selectedTask.name),
        taskType: selectedTask.id,
        taskParams,
      } as any,
    });
  };

  // ── Phase: type-select ────────────────────────────────────────────────────

  if (phase === 'type-select') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-forward" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            استشارة جديدة
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.typeSelectContent} showsVerticalScrollIndicator={false}>
          <Text style={[styles.typeSelectHint, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
            اختاري نوع الاستشارة المناسب
          </Text>

          {/* Legal Consultation Card */}
          <TouchableOpacity
            style={[styles.typeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPhase('legal-form'); }}
            activeOpacity={0.85}
          >
            <View style={[styles.typeCardIconWrap, { backgroundColor: colors.primary + '18' }]}>
              <Text style={styles.typeCardEmoji}>⚖️</Text>
            </View>
            <View style={styles.typeCardBody}>
              <Text style={[styles.typeCardTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                استشارة قانونية
              </Text>
              <Text style={[styles.typeCardDesc, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                دردشة حرة مع المساعدة القانونية حول حقوقك والأنظمة المتعلقة بها
              </Text>
              <View style={[styles.typeCardBadge, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '30' }]}>
                <Text style={[styles.typeCardBadgeText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
                  مناسب للأسئلة العامة
                </Text>
              </View>
            </View>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
          </TouchableOpacity>

          {/* Judicial Consultation Card */}
          <TouchableOpacity
            style={[styles.typeCard, { backgroundColor: colors.card, borderColor: colors.secondary + '50' }]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPhase('task-select'); }}
            activeOpacity={0.85}
          >
            <View style={[styles.typeCardIconWrap, { backgroundColor: colors.secondary + '18' }]}>
              <Text style={styles.typeCardEmoji}>🏛️</Text>
            </View>
            <View style={styles.typeCardBody}>
              <Text style={[styles.typeCardTitle, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                استشارة قضائية
              </Text>
              <Text style={[styles.typeCardDesc, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                شبكة مهام متخصصة: تحليل القضية، استراتيجية الدفاع، المدد النظامية، وأكثر
              </Text>
              <View style={[styles.typeCardBadge, { backgroundColor: colors.secondary + '14', borderColor: colors.secondary + '40' }]}>
                <Text style={[styles.typeCardBadgeText, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]}>
                  للقضايا والنزاعات
                </Text>
              </View>
            </View>
            <Ionicons name="arrow-back" size={20} color={colors.secondary} />
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Phase: legal-form ─────────────────────────────────────────────────────

  if (phase === 'legal-form') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setPhase('type-select')} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-forward" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            استشارة قانونية
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.typeChip, { backgroundColor: colors.primary + '14', borderColor: colors.primary + '30' }]}>
            <Text style={styles.typeChipEmoji}>⚖️</Text>
            <Text style={[styles.typeChipText, { color: colors.primary, fontFamily: 'Cairo_600SemiBold' }]}>
              استشارة قانونية – دردشة حرة
            </Text>
          </View>

          <Text style={[styles.formLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
            وصف الاستشارة *
          </Text>
          <TextInput
            style={[styles.formInput, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' }]}
            placeholder="اكتب موضوع استشارتك القانونية..."
            placeholderTextColor={colors.mutedForeground}
            value={title}
            onChangeText={setTitle}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            textAlign="right"
          />

          <Text style={[styles.formLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold', marginTop: 14 }]}>
            مجال القضية
          </Text>
          <TouchableOpacity
            style={[styles.areaSelect, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setShowAreaPicker(!showAreaPicker)}
          >
            <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            <Text style={[styles.areaSelectText, { color: selectedArea ? colors.foreground : colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
              {selectedArea || 'اختر المجال...'}
            </Text>
          </TouchableOpacity>

          {showAreaPicker && (
            <View style={[styles.areaPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {AREAS.map((area) => (
                <TouchableOpacity
                  key={area}
                  style={[
                    styles.areaItem,
                    { borderBottomColor: colors.border },
                    selectedArea === area && { backgroundColor: colors.primary + '20' },
                  ]}
                  onPress={() => { handleAreaChange(area); setShowAreaPicker(false); }}
                >
                  <Text style={[styles.areaItemText, { color: selectedArea === area ? colors.primary : colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                    {area}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Country picker */}
          <Text style={[styles.formLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold', marginTop: 14 }]}>
            الدولة / الاختصاص القانوني
          </Text>
          <TouchableOpacity
            style={[styles.areaSelect, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setShowCountryPicker(!showCountryPicker)}
          >
            <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
            <Text style={[styles.areaSelectText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
              {(() => { const c = COUNTRIES.find(c => c.code === selectedCountry); return c ? `${c.flag}  ${c.name}` : 'اختر الدولة…'; })()}
            </Text>
          </TouchableOpacity>

          {showCountryPicker && (
            <View style={[styles.areaPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    styles.areaItem,
                    { borderBottomColor: colors.border },
                    selectedCountry === c.code && { backgroundColor: colors.primary + '20' },
                  ]}
                  onPress={() => { handleCountryChange(c.code); setShowCountryPicker(false); }}
                >
                  <Text style={[styles.areaItemText, { color: selectedCountry === c.code ? colors.primary : colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                    {c.flag}  {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: isCreating ? colors.muted : colors.primary, opacity: isCreating ? 0.7 : 1 }]}
            onPress={handleLegalSubmit}
            disabled={isCreating}
            activeOpacity={0.85}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons name="send-outline" size={16} color={colors.primaryForeground} />
                <Text style={[styles.submitBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                  ابدأ المحادثة
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Phase: task-select ────────────────────────────────────────────────────

  if (phase === 'task-select') {
    const visibleTasks = TASK_TYPES.filter(t => t.group === activeGroup);

    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => setPhase('type-select')} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-forward" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
            استشارة قضائية
          </Text>
        </View>

        {/* Group tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.groupTabs}
          style={[styles.groupTabsRow, { borderBottomColor: colors.border }]}
        >
          {TASK_GROUPS.map(g => (
            <TouchableOpacity
              key={g}
              style={[
                styles.groupTab,
                { borderColor: colors.border },
                activeGroup === g && { backgroundColor: colors.secondary, borderColor: colors.secondary },
              ]}
              onPress={() => { setActiveGroup(g); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            >
              <Text style={[
                styles.groupTabText,
                { color: activeGroup === g ? colors.background : colors.mutedForeground, fontFamily: 'Cairo_600SemiBold' },
              ]}>
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Country row */}
        <View style={[styles.countryRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <Ionicons name="globe-outline" size={14} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.countryChips}>
            {COUNTRIES.map(c => (
              <TouchableOpacity
                key={c.code}
                style={[
                  styles.countryChip,
                  { borderColor: colors.border, backgroundColor: colors.muted },
                  selectedCountry === c.code && { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                ]}
                onPress={() => { handleCountryChange(c.code); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Text style={[styles.countryChipText, { color: selectedCountry === c.code ? colors.primary : colors.foreground, fontFamily: 'Cairo_600SemiBold' }]}>
                  {c.flag} {c.name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Task cards */}
        <ScrollView contentContainerStyle={styles.taskList} showsVerticalScrollIndicator={false}>
          {isCreating ? (
            <View style={styles.centeredLoading}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                جارٍ إنشاء الاستشارة…
              </Text>
            </View>
          ) : (
            visibleTasks.map(task => (
              <TouchableOpacity
                key={task.id}
                style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleTaskSelect(task)}
                activeOpacity={0.8}
              >
                <Text style={styles.taskCardEmoji}>{task.icon}</Text>
                <View style={styles.taskCardBody}>
                  <Text style={[styles.taskCardName, { color: colors.foreground, fontFamily: 'Cairo_700Bold' }]}>
                    {task.name}
                  </Text>
                  <Text style={[styles.taskCardDesc, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                    {task.description}
                  </Text>
                  {task.fields.length > 0 && (
                    <View style={[styles.fieldsBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Ionicons name="create-outline" size={11} color={colors.mutedForeground} />
                      <Text style={[styles.fieldsBadgeText, { color: colors.mutedForeground, fontFamily: 'Cairo_400Regular' }]}>
                        يتطلب تعبئة بيانات
                      </Text>
                    </View>
                  )}
                </View>
                <Ionicons name="arrow-back" size={18} color={colors.border} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Phase: task-form ──────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => setPhase('task-select')} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-forward" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.primary, fontFamily: 'Cairo_700Bold' }]}>
          {selectedTask?.name ?? 'تفاصيل المهمة'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {selectedTask && (
          <View style={[styles.typeChip, { backgroundColor: colors.secondary + '14', borderColor: colors.secondary + '30' }]}>
            <Text style={styles.typeChipEmoji}>{selectedTask.icon}</Text>
            <Text style={[styles.typeChipText, { color: colors.secondary, fontFamily: 'Cairo_600SemiBold' }]}>
              {selectedTask.name}
            </Text>
          </View>
        )}

        {/* Country picker inline for task-form */}
        <Text style={[styles.formLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold', marginTop: 4 }]}>
          الدولة / الاختصاص القانوني
        </Text>
        <TouchableOpacity
          style={[styles.areaSelect, { backgroundColor: colors.muted, borderColor: colors.border }]}
          onPress={() => setShowCountryPicker(!showCountryPicker)}
        >
          <Ionicons name="chevron-down" size={16} color={colors.mutedForeground} />
          <Text style={[styles.areaSelectText, { color: colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
            {(() => { const c = COUNTRIES.find(c => c.code === selectedCountry); return c ? `${c.flag}  ${c.name}` : 'اختر الدولة…'; })()}
          </Text>
        </TouchableOpacity>

        {showCountryPicker && (
          <View style={[styles.areaPicker, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {COUNTRIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[
                  styles.areaItem,
                  { borderBottomColor: colors.border },
                  selectedCountry === c.code && { backgroundColor: colors.primary + '20' },
                ]}
                onPress={() => { handleCountryChange(c.code); setShowCountryPicker(false); }}
              >
                <Text style={[styles.areaItemText, { color: selectedCountry === c.code ? colors.primary : colors.foreground, fontFamily: 'Cairo_400Regular' }]}>
                  {c.flag}  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selectedTask?.fields.map(field => (
          <View key={field.key}>
            <Text style={[styles.formLabel, { color: colors.foreground, fontFamily: 'Cairo_600SemiBold', marginTop: 14 }]}>
              {field.label}{field.required ? ' *' : ''}
            </Text>
            <TextInput
              style={[
                styles.formInput,
                !field.multiline && styles.formInputSingle,
                { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border, fontFamily: 'Cairo_400Regular' },
              ]}
              placeholder={field.placeholder}
              placeholderTextColor={colors.mutedForeground}
              value={taskParams[field.key] ?? ''}
              onChangeText={(v) => setTaskParams(prev => ({ ...prev, [field.key]: v }))}
              multiline={field.multiline}
              numberOfLines={field.multiline ? 4 : 1}
              textAlignVertical={field.multiline ? 'top' : 'center'}
              textAlign="right"
            />
          </View>
        ))}

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: isCreating ? colors.muted : colors.primary, opacity: isCreating ? 0.7 : 1, marginTop: 20 }]}
          onPress={handleTaskFormSubmit}
          disabled={isCreating}
          activeOpacity={0.85}
        >
          {isCreating ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons name="send-outline" size={16} color={colors.primaryForeground} />
              <Text style={[styles.submitBtnText, { color: colors.primaryForeground, fontFamily: 'Cairo_700Bold' }]}>
                ابدأ التحليل
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
