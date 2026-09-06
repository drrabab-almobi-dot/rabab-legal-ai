/**
 * الخدمة هي وحدة مستقلة لها دورة حياة وسياسات موحّدة.
 *
 * هذا السجل هو مصدر الخادم لتوجيه الموضوعات وإتاحة الخدمات. لا تصبح أي
 * خدمة قابلة للاستخدام بمجرد إضافتها هنا: يلزم مخرج قانوني معتمد، معالج
 * خادمي، صلاحيات/حصة، مسار مراجعة بشرية، واختبارات قبل تغيير حالتها إلى active.
 */

export type ServiceModuleStatus = "active" | "planned" | "retired";

export interface TopicRoutingDefinition {
  enabled: boolean;
  branches: readonly string[];
  intakeFields: readonly string[];
}

export interface ServiceModule {
  id: string;
  labelAr: string;
  descriptionAr: string;
  status: ServiceModuleStatus;
  requiresDedicatedWorkflow: boolean;
  supervision: {
    required: true;
    supervisor: "د. رباب أحمد المعبي";
    humanConfirmationAvailable: true;
  };
  capabilities: {
    acceptsBeneficiaryFiles: true;
    wordExport: true;
    humanConfirmation: true;
  };
  topicRouting?: TopicRoutingDefinition;
}

/**
 * الخدمات النشطة فقط تكون متاحة للتوجيه الذكي. تبقى الوحدات المخططة في
 * السجل لتجهيز عقود الواجهة والجوال، مع استحالة توجيه مستخدم إليها بالخطأ.
 */
export const SERVICE_MODULES: readonly ServiceModule[] = [
  {
    id: "consultation",
    labelAr: "استشارة قانونية عامة",
    descriptionAr: "فهم الحقوق والالتزامات والخطوات العملية بمصادر موثقة.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: [],
      intakeFields: ["الموضوع", "الدولة والولاية القضائية", "صفة المستفيد", "التواريخ المؤثرة", "وجود مستندات"],
    },
  },
  {
    id: "judicial",
    labelAr: "استشارة قضائية",
    descriptionAr: "تحليل قضائي للمختصين وملف قضية منضبط بالمصادر والاختصاص.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["مذكرة دفاع", "مذكرة اعتراض", "جلسة استماع", "طعن", "تنفيذ"],
      intakeFields: ["نوع المذكرة", "المسار القضائي", "صفة الموكل", "الخصم", "الوقائع", "المستندات", "تاريخ التبليغ"],
    },
  },
  {
    id: "pleadings",
    labelAr: "تحرير مذكرات قانونية",
    descriptionAr: "إعداد مسودات المذكرات والصحائف القابلة للمراجعة القانونية.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["مذكرة دفاع", "مذكرة اعتراض", "مذكرة ابتدائية", "مذكرة استئناف", "مذكرة طعن"],
      intakeFields: ["نوع المذكرة", "المسار القضائي", "صفة الموكل", "الخصم", "الوقائع", "المستندات", "تاريخ التبليغ"],
    },
  },
  {
    id: "contracts",
    labelAr: "صياغة ومراجعة العقود",
    descriptionAr: "صياغة العقود وتحليلها واستخراج بياناتها ضمن الإطار القانوني المعتمد.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["صياغة عقد", "مراجعة عقد", "تحليل عقد", "استخراج بنود"],
      intakeFields: ["نوع العقد", "الأطراف وصفاتهم", "محل العقد", "القيمة", "المدة", "الولاية القضائية"],
    },
  },
  {
    id: "intellectual-property",
    labelAr: "خدمات الملكية الفكرية",
    descriptionAr: "استشارات حماية العلامات والمصنفات والابتكارات وحقوق استغلالها.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["علامة تجارية", "حقوق مؤلف", "براءة اختراع", "تصميم صناعي", "سر تجاري", "ترخيص", "تعدٍ على حق"],
      intakeFields: ["موضوع الحق", "صاحب الحق وصفته", "الدولة والولاية القضائية", "حالة التسجيل", "وصف التعدي أو الطلب", "المستندات"],
    },
  },
  {
    id: "corporate-governance-compliance",
    labelAr: "حوكمة وامتثال الشركات",
    descriptionAr: "سياسات وضوابط قانونية للحوكمة والامتثال وإدارة المخاطر في الشركات.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["إطار حوكمة", "سياسات الشركات", "امتثال نظامي", "مخاطر قانونية", "تضارب مصالح", "حماية بيانات", "تحقيق داخلي"],
      intakeFields: ["اسم المنشأة والصفة", "الدولة والولاية القضائية", "نوع الالتزام أو السياسة", "المشكلة أو المخالفة", "المستندات والسياسات القائمة"],
    },
  },
  {
    id: "commercial-arbitration",
    labelAr: "التحكيم التجاري والوساطة",
    descriptionAr: "تنظيم إجراءات التحكيم والوساطة والصلح ودراسة أحكام التحكيم.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["شرط تحكيم", "جلسة تحكيم", "محضر تحكيم", "حكم تحكيم", "وساطة", "صلح"],
      intakeFields: ["الدولة والولاية القضائية", "شرط التحكيم أو المركز", "الأطراف وصفاتهم", "مرحلة النزاع", "الوقائع", "المستندات والمواعيد"],
    },
  },
  {
    id: "conciliation",
    labelAr: "الصلح والتراضي",
    descriptionAr: "إعداد محاضر الصلح واتفاقيات التسوية ومراجعتها ضمن وقائع واتفاق الأطراف.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["محضر صلح", "اتفاقية صلح", "مراجعة اتفاقية صلح", "تفاوض", "تسوية ودية"],
      intakeFields: ["الأطراف وصفاتهم", "موضوع النزاع", "شروط التسوية", "التزامات كل طرف", "الدولة والولاية القضائية", "المستندات"],
    },
  },
  {
    id: "research",
    labelAr: "الباحثة الذكية القانونية",
    descriptionAr: "بحث قانوني موثّق في المصادر والوثائق القانونية المعتمدة.",
    status: "active",
    requiresDedicatedWorkflow: false,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
    topicRouting: {
      enabled: true,
      branches: ["بحث تشريعي", "بحث قضائي", "بحث تنظيمي"],
      intakeFields: ["موضوع البحث", "الفرع القانوني", "الدولة والولاية القضائية", "المستندات ذات الصلة"],
    },
  },
  {
    id: "inheritance-distribution",
    labelAr: "توزيع الميراث",
    descriptionAr: "خدمة مستقبلية مستقلة لحصر الورثة والتحقق من المعطيات وإعداد مسودة توزيع قابلة لمراجعة المحامية.",
    status: "planned",
    requiresDedicatedWorkflow: true,
    supervision: {
      required: true,
      supervisor: "د. رباب أحمد المعبي",
      humanConfirmationAvailable: true,
    },
    capabilities: {
      acceptsBeneficiaryFiles: true,
      wordExport: true,
      humanConfirmation: true,
    },
  },
] as const;

export type ServiceModuleId = (typeof SERVICE_MODULES)[number]["id"];

export function getServiceModule(id: string | null | undefined): ServiceModule | undefined {
  return SERVICE_MODULES.find((service) => service.id === id);
}

export function getActiveServiceModules(): readonly ServiceModule[] {
  return SERVICE_MODULES.filter((service) => service.status === "active");
}

export function getTopicRoutingServices(): readonly (ServiceModule & { topicRouting: TopicRoutingDefinition })[] {
  return SERVICE_MODULES.filter(
    (service): service is ServiceModule & { topicRouting: TopicRoutingDefinition } =>
      service.status === "active" && service.topicRouting?.enabled === true,
  );
}

/**
 * لا تكشف واجهة المستفيد أو الـ API العام الخدمات المخططة. تبقى الخدمة
 * المخططة مرئية للسجل الداخلي فقط إلى أن تعتمد صاحبة المنصة إظهارها.
 */
export function getPublicServiceModules() {
  return SERVICE_MODULES.filter((service) => service.status === "active").map((service) => ({
    id: service.id,
    labelAr: service.labelAr,
    descriptionAr: service.descriptionAr,
    status: service.status,
    requiresDedicatedWorkflow: service.requiresDedicatedWorkflow,
    supervision: service.supervision,
    capabilities: service.capabilities,
    available: service.status === "active",
  }));
}
