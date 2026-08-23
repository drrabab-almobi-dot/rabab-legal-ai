export const WHATSAPP_CONTACT_NUMBER = '966504647649';

export function buildWhatsAppContactLink(message: string) {
  return `https://wa.me/${WHATSAPP_CONTACT_NUMBER}?text=${encodeURIComponent(message)}`;
}