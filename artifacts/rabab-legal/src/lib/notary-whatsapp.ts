import { buildWhatsAppContactLink, WHATSAPP_CONTACT_NUMBER } from './whatsapp-contact';

export const NOTARY_WHATSAPP_NUMBER = WHATSAPP_CONTACT_NUMBER;

export const NOTARY_SERVICES = [
  'الوكالات',
  'حصر ورثة',
  'إفراغ عقاري',
  'إقرار مالي',
  'الرهن وفكه',
  'عقود التأسيس',
  'جميع خدمات الموثق العدلي',
] as const;

export function buildNotaryWhatsAppLink(service?: string) {
  const request = service
    ? `السلام عليكم، أرغب في طلب خدمة التوثيق العدلي: ${service}.`
    : 'السلام عليكم، أرغب في طلب خدمة التوثيق العدلي وتوضيح الخدمة المناسبة لي.';
  return buildWhatsAppContactLink(request);
}