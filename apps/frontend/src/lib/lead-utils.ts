export interface LeadContactInfo {
  phone?: string | null;
  realPhone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Retourne le nom d'affichage propre d'un prospect :
 * - Nom complet si renseigné
 * - Numéro réel si disponible
 * - 'Contact WhatsApp' si identifiant masqué (@lid)
 * - Numéro standard sinon
 */
export function getLeadDisplayName(lead?: LeadContactInfo | null): string {
  if (!lead) return 'Prospect';
  const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
  if (fullName) return fullName;
  if (lead.realPhone) return lead.realPhone;
  if (lead.phone && lead.phone.includes('@lid')) return 'Contact WhatsApp';
  return lead.phone || 'Prospect';
}

/**
 * Indique si le prospect est un compte avec identifiant WhatsApp masqué (LID)
 * et pour lequel nous n'avons pas encore de vrai numéro de téléphone.
 */
export function isLidAccount(lead?: LeadContactInfo | null): boolean {
  if (!lead || !lead.phone) return false;
  return lead.phone.includes('@lid') && !lead.realPhone;
}

/**
 * Retourne les détails de présentation du téléphone d'un prospect
 */
export function getLeadPhoneDisplay(lead?: LeadContactInfo | null): {
  text: string;
  isLid: boolean;
  lidJid?: string;
  hasRealPhone: boolean;
} {
  if (!lead) {
    return { text: 'Inconnu', isLid: false, hasRealPhone: false };
  }
  if (lead.realPhone) {
    return {
      text: lead.realPhone,
      isLid: false,
      hasRealPhone: true,
      lidJid: lead.phone?.includes('@lid') ? lead.phone : undefined,
    };
  }
  if (lead.phone && lead.phone.includes('@lid')) {
    return {
      text: 'Numéro masqué (LID)',
      isLid: true,
      lidJid: lead.phone,
      hasRealPhone: false,
    };
  }
  return {
    text: lead.phone || 'Non renseigné',
    isLid: false,
    hasRealPhone: Boolean(lead.phone),
  };
}
