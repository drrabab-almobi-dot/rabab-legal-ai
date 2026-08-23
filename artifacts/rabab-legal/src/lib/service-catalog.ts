import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Briefcase,
  CheckCircle2,
  Clock,
  FileSearch,
  FileSignature,
  FileText,
  Gavel,
  Handshake,
  Landmark,
  Lightbulb,
  Lock,
  MessageSquare,
  PenLine,
  Search,
  Shield,
} from 'lucide-react';
import { buildWhatsAppContactLink } from '@/lib/whatsapp-contact';

export interface ServiceBranch {
  id: string;
  label: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  external?: boolean;
}

export interface ServiceDefinition {
  id: string;
  title: string;
  summary: string;
  description: string;
  icon: LucideIcon;
  branches: ServiceBranch[];
}

export const SERVICE_CATALOG: ServiceDefinition[] = [
  {
    id: 'legal-consultation',
    title: 'الاستشارات القانونية',
    summary: 'رأي قانوني مستند إلى الأنظمة',
    description: 'استشارة قانونية واضحة تساعدك على فهم موقفك والخيارات المتاحة وفق الأنظمة المعمول بها.',
    icon: MessageSquare,
    branches: [
      { id: 'general-consultation', label: 'استشارة قانونية', detail: 'رأي قانوني موثّق لحالتك', href: '/consultation?type=consultation', icon: MessageSquare },
    ],
  },
  {
    id: 'judicial',
    title: 'الاستشارات القضائية',
    summary: 'إدارة القضايا وتحليل الأحكام',
    description: 'خدمات عملية لمتابعة القضية وتحليل الحكم القضائي وفهم الإجراءات والمسارات الممكنة.',
    icon: Gavel,
    branches: [
      { id: 'case-management', label: 'إدارة القضية', detail: 'تنظيم مراحل ومستندات القضية', href: '/consultation?type=case_management', icon: Briefcase },
      { id: 'pleadings', label: 'تحرير الصحائف والمذكرات', detail: 'إعداد اللوائح والمذكرات ضمن إدارة القضية', href: '/legal-assistant?service=pleadings', icon: PenLine },
      { id: 'judgment-analysis', label: 'تحليل الأحكام القضائية', detail: 'دراسة الحكم وأسبابه وآثاره', href: '/consultation?type=judgment_analysis', icon: Gavel },
    ],
  },
  {
    id: 'contracts',
    title: 'صياغة ومراجعة العقود',
    summary: 'عقود نظامية وتحليل للمخاطر',
    description: 'صياغة العقود ومراجعتها وتحليل بنودها لتوضيح الالتزامات والمخاطر قبل اتخاذ القرار.',
    icon: FileText,
    branches: [
      { id: 'draft', label: 'صياغة عقد جديد', detail: 'مسودة قانونية تلائم احتياجك', href: '/contracts?tab=draft', icon: FileText },
      { id: 'analyze', label: 'دراسة المخاطر والتوصيات', detail: 'كشف البنود والمخاطر وتقديم التوصيات', href: '/contracts?tab=analyze', icon: FileSearch },
      { id: 'review', label: 'مراجعة عقد وتقديم النصح', detail: 'فحص البنود وتقديم النصح', href: '/contracts?tab=review', icon: FileSignature },
      { id: 'extract', label: 'استخراج البيانات والتلخيص', detail: 'تلخيص البيانات الجوهرية للعقد', href: '/contracts?tab=extract', icon: Search },
    ],
  },
  {
    id: 'intellectual-property',
    title: 'خدمات الملكية الفكرية',
    summary: 'حماية الحقوق والابتكارات',
    description: 'خدمات استشارية لحماية العلامات والمصنفات والابتكارات وتنظيم حقوق استغلالها.',
    icon: Lightbulb,
    branches: [
      { id: 'trademark', label: 'تسجيل وتجديد العلامات التجارية', detail: 'تسجيل العلامة وتجديدها وحمايتها', href: '/consultation?type=legal_opinion&ipType=trademark', icon: Lightbulb },
      { id: 'copyright', label: 'حقوق المؤلف والمصنفات', detail: 'حماية المصنفات والمحتوى', href: '/consultation?type=legal_opinion&ipType=copyright', icon: FileText },
      { id: 'patent', label: 'براءات الاختراع', detail: 'تقييم الحماية وإجراءات التسجيل', href: '/consultation?type=legal_opinion&ipType=patent', icon: Gavel },
      { id: 'industrial-design', label: 'الرسوم والنماذج الصناعية', detail: 'حماية التصميم والشكل الصناعي', href: '/consultation?type=legal_opinion&ipType=industrial-design', icon: Briefcase },
      { id: 'trade-secret', label: 'الأسرار التجارية', detail: 'حماية المعلومات والمعرفة السرية', href: '/consultation?type=legal_opinion&ipType=trade-secret', icon: Shield },
      { id: 'licensing-transfer', label: 'الترخيص ونقل ملكية الحقوق', detail: 'تنظيم التراخيص واتفاقيات نقل الحقوق', href: '/consultation?type=legal_opinion&ipType=licensing-transfer', icon: FileSignature },
      { id: 'infringement', label: 'التعدي والمنازعات الفكرية', detail: 'تحليل التعدي وخيارات المعالجة', href: '/consultation?type=legal_opinion&ipType=infringement', icon: Gavel },
      { id: 'international', label: 'حماية الحقوق دولياً', detail: 'استشارات حماية الحقوق خارج المملكة', href: '/consultation?type=legal_opinion&ipType=international', icon: Landmark },
    ],
  },
  {
    id: 'corporate-governance-compliance',
    title: 'حوكمة وامتثال الشركات',
    summary: 'سياسات وضوابط وإدارة المخاطر',
    description: 'حلول قانونية لبناء الحوكمة والامتثال، وتنظيم السياسات وضوابط العمل وإدارة المخاطر.',
    icon: Shield,
    branches: [
      { id: 'framework', label: 'تأسيس وإطار الحوكمة', detail: 'بناء إطار حوكمة واضح للشركة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=framework', icon: Shield },
      { id: 'policies', label: 'سياسات ولوائح الشركات', detail: 'إعداد ومراجعة اللوائح والسياسات الداخلية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=policies', icon: FileText },
      { id: 'regulatory-compliance', label: 'الامتثال النظامي والرقابي', detail: 'تقييم الالتزامات ومتطلبات الجهات الرقابية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=regulatory-compliance', icon: CheckCircle2 },
      { id: 'legal-risk', label: 'إدارة المخاطر القانونية', detail: 'رصد المخاطر ووضع ضوابط المعالجة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=legal-risk', icon: Gavel },
      { id: 'board-committees', label: 'مجلس الإدارة واللجان', detail: 'تنظيم الصلاحيات والاجتماعات والقرارات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=board-committees', icon: Landmark },
      { id: 'conflicts-disclosure', label: 'تضارب المصالح والإفصاح', detail: 'ضوابط الإفصاح وتعارض المصالح', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=conflicts-disclosure', icon: FileSignature },
      { id: 'ownership-partners', label: 'هيكل الملكية وحقوق الشركاء', detail: 'تنظيم الملكية وحقوق الشركاء والمساهمين', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=ownership-partners', icon: Landmark },
      { id: 'delegation-authority', label: 'الصلاحيات والتفويض', detail: 'تحديد المسؤوليات وحدود التفويض', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=delegation-authority', icon: FileSignature },
      { id: 'related-parties', label: 'الأطراف ذات العلاقة', detail: 'ضوابط التعاملات مع الأطراف المرتبطة', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=related-parties', icon: Handshake },
      { id: 'anti-bribery-aml', label: 'مكافحة الرشوة وغسل الأموال', detail: 'سياسات النزاهة ومكافحة الجرائم المالية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=anti-bribery-aml', icon: Shield },
      { id: 'data-privacy', label: 'حماية البيانات والخصوصية', detail: 'الامتثال لمتطلبات البيانات والخصوصية', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=data-privacy', icon: Lock },
      { id: 'whistleblowing', label: 'الإبلاغ عن المخالفات', detail: 'قنوات البلاغات وحماية المبلّغين', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=whistleblowing', icon: MessageSquare },
      { id: 'internal-investigations', label: 'المراجعة الداخلية والتحقيقات', detail: 'فحص المخالفات وإجراءات التحقيق الداخلي', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=internal-investigations', icon: Search },
      { id: 'compliance-remediation', label: 'تقييم الامتثال وخطط المعالجة', detail: 'قياس مستوى الامتثال وإغلاق الملاحظات', href: '/consultation?type=legal_opinion&service=corporate-governance-compliance&governanceType=compliance-remediation', icon: CheckCircle2 },
    ],
  },
  {
    id: 'commercial-arbitration',
    title: 'التحكيم التجاري والوساطة',
    summary: 'إدارة التحكيم والوساطة والتسوية',
    description: 'خدمات تنظيم إجراءات التحكيم والوساطة والصلح للوصول إلى معالجة مناسبة للنزاع.',
    icon: Landmark,
    branches: [
      { id: 'session-management', label: 'إدارة جلسات التحكيم', detail: 'جدول الجلسة والإجراءات والمتابعة', href: '/consultation?type=arbitration_session_management', icon: Clock },
      { id: 'minutes', label: 'تحرير محاضر التحكيم', detail: 'مسودة محضر دقيقة للمراجعة والاعتماد', href: '/consultation?type=arbitration_minutes', icon: FileText },
      { id: 'award-analysis', label: 'تحليل أحكام التحكيم', detail: 'الأسباب والمنطوق ومسارات التنفيذ', href: '/consultation?type=arbitration_award_analysis', icon: Gavel },
      { id: 'settlement', label: 'الصلح', detail: 'حل ودي للنزاع بموافقة الأطراف', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الصلح ضمن التحكيم التجاري والوساطة.'), icon: Handshake, external: true },
      { id: 'mediation', label: 'الوساطة', detail: 'وساطة قانونية للوصول إلى تسوية', href: buildWhatsAppContactLink('السلام عليكم، أرغب في طلب خدمة الوساطة ضمن التحكيم التجاري والوساطة.'), icon: Handshake, external: true },
    ],
  },
  {
    id: 'conciliation',
    title: 'الصلح والتراضي',
    summary: 'حل النزاعات ودياً واتفاقياً',
    description: 'مسارات عملية للصلح والتفاوض والتسوية الودية وصياغة اتفاقيات تحفظ حقوق الأطراف.',
    icon: Handshake,
    branches: [
      { id: 'negotiation', label: 'تحرير محاضر الصلح', detail: 'تحويل ما انتهى إليه التفاوض إلى محضر منظم', href: '/consultation?type=settlement&settlementService=negotiation', icon: MessageSquare },
      { id: 'settlement-agreement', label: 'إعداد اتفاقية الصلح', detail: 'صياغة اتفاق يحفظ الالتزامات والحقوق المتفق عليها', href: '/consultation?type=settlement&settlementService=settlement-agreement', icon: FileSignature },
      { id: 'settlement-agreement-review', label: 'مراجعة محضر أو اتفاقية الصلح', detail: 'فحص المحضر والتنبيه إلى المخاطر والثغرات', href: '/consultation?type=settlement&settlementService=settlement-agreement-review', icon: FileSearch },
    ],
  },
  {
    id: 'research',
    title: 'الباحثة الذكية',
    summary: 'بحث في المصادر والوثائق القانونية',
    description: 'بحث قانوني ذكي في السوابق والمدونات والتعاميم والقرارات ضمن واجهة واحدة.',
    icon: Search,
    branches: [
      { id: 'judicial', label: 'السوابق القضائية', detail: 'بحث في الأحكام والمبادئ القضائية', href: '/legal-search?filter=judicial', icon: Gavel },
      { id: 'codex', label: 'المدونات القانونية', detail: 'بحث في المدونات والأنظمة ذات الصلة', href: '/legal-search?filter=codex', icon: BookOpen },
      { id: 'circulars', label: 'التعاميم', detail: 'الوصول إلى التعاميم الرسمية', href: '/legal-search?filter=circulars', icon: Search },
      { id: 'decisions', label: 'القرارات', detail: 'البحث في القرارات القانونية', href: '/legal-search?filter=decisions', icon: Landmark },
      { id: 'all', label: 'بحث في الكل', detail: 'بحث شامل في جميع المصادر', href: '/legal-search', icon: Search },
    ],
  },
];

export function getServiceById(serviceId: string | undefined) {
  return SERVICE_CATALOG.find((service) => service.id === serviceId);
}