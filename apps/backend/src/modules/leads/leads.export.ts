import ExcelJS from 'exceljs';

type Column = { header: string; key: string; width: number; type?: 'date' | 'number' | 'money' | 'text' };

export const EXPORT_COLUMNS: Column[] = [
  { header: 'Prénom', key: 'firstName', width: 16 },
  { header: 'Nom', key: 'lastName', width: 18 },
  { header: 'Téléphone', key: 'phone', width: 18 },
  { header: 'Email', key: 'email', width: 26 },
  { header: 'Entreprise', key: 'company', width: 20 },
  { header: 'Type client', key: 'customerType', width: 13 },
  { header: 'B2B', key: 'isB2B', width: 6 },
  { header: 'VIP', key: 'isVip', width: 6 },
  { header: 'Offre sélectionnée', key: 'recommendedOffer', width: 34 },
  { header: 'Prix communiqué', key: 'quotedPrice', width: 20 },
  { header: 'Montant estimé (FCFA)', key: 'estimatedAmount', width: 18, type: 'money' },
  { header: 'Participants', key: 'participantsCount', width: 11, type: 'number' },
  { header: 'Date souhaitée', key: 'preferredDate', width: 18 },
  { header: 'Budget client', key: 'budget', width: 18 },
  { header: 'Besoin exprimé', key: 'need', width: 36 },
  { header: "Intention d'achat", key: 'purchaseIntent', width: 15 },
  { header: 'Étape', key: 'conversationStage', width: 16 },
  { header: 'Score', key: 'qualificationScore', width: 7, type: 'number' },
  { header: 'Statut', key: 'leadStatus', width: 18 },
  { header: 'Prochaine étape', key: 'nextStep', width: 20 },
  { header: 'Objections', key: 'objections', width: 28 },
  { header: 'Conseiller', key: 'agent', width: 18 },
  { header: 'Mode', key: 'mode', width: 9 },
  { header: 'Source', key: 'source', width: 12 },
  { header: 'Campagne', key: 'campaign', width: 18 },
  { header: 'Nb messages', key: 'messagesCount', width: 10, type: 'number' },
  { header: 'Premier contact', key: 'createdAt', width: 17, type: 'date' },
  { header: 'Dernier msg prospect', key: 'lastInboundAt', width: 17, type: 'date' },
  { header: 'Dernier msg envoyé', key: 'lastOutboundAt', width: 17, type: 'date' },
  { header: 'Relances auto envoyées', key: 'followUpCount', width: 12, type: 'number' },
  { header: 'Prochaine relance', key: 'nextFollowUpAt', width: 17, type: 'date' },
  { header: 'Désinscrit (STOP)', key: 'optOut', width: 10 },
  { header: 'Notes closing', key: 'closingNotes', width: 36 },
  { header: 'HubSpot', key: 'hubspotSyncStatus', width: 10 },
  { header: 'ID interne', key: 'id', width: 26 },
];

export function leadToExportRow(lead: any): Record<string, any> {
  const yesNo = (b: any) => (b ? 'Oui' : 'Non');
  const objections = Array.isArray(lead.objections)
    ? lead.objections
    : typeof lead.objections === 'string'
    ? (() => {
        try {
          return JSON.parse(lead.objections);
        } catch {
          return [];
        }
      })()
    : [];
  const phone = lead.realPhone || (String(lead.phone || '').includes('@lid') ? 'Masqué (LID)' : lead.phone);
  return {
    ...lead,
    phone,
    isB2B: yesNo(lead.isB2B),
    isVip: yesNo(lead.isVip),
    optOut: yesNo(lead.optOut),
    objections: objections.join(' | '),
    agent: lead.assignedAgent?.name || '',
    mode: lead.aiDisabled ? 'Humain' : 'IA',
    messagesCount: lead._count?.messages ?? '',
    firstName: lead.firstName && lead.firstName !== 'Prospect' ? lead.firstName : '',
  };
}

function formatDateFr(d: any): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { timeZone: 'Africa/Douala', dateStyle: 'short', timeStyle: 'short' });
}

/** CSV compatible Excel FR : BOM UTF-8 + séparateur point-virgule. */
export function buildCsv(leads: any[]): Buffer {
  const esc = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/\r?\n/g, ' ');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [EXPORT_COLUMNS.map((c) => esc(c.header)).join(';')];
  for (const lead of leads) {
    const row = leadToExportRow(lead);
    lines.push(
      EXPORT_COLUMNS.map((c) => {
        const v = row[c.key];
        if (c.type === 'date') return esc(formatDateFr(v));
        return esc(v);
      }).join(';')
    );
  }
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
}

/** Classeur Excel (.xlsx) avec en-têtes stylés, filtres automatiques et volet figé. */
export async function buildXlsx(leads: any[], meta: { generatedBy?: string; filters?: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ICT WhatsApp AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1, xSplit: 2 }] });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  for (const lead of leads) {
    const row = leadToExportRow(lead);
    const values: Record<string, any> = {};
    for (const c of EXPORT_COLUMNS) {
      const v = row[c.key];
      if (c.type === 'date') values[c.key] = v ? new Date(v) : null;
      else if (c.type === 'number' || c.type === 'money') values[c.key] = typeof v === 'number' ? v : v ? Number(v) || null : null;
      else values[c.key] = v ?? '';
    }
    const added = ws.addRow(values);
    const status = lead.leadStatus;
    if (status === 'Opportunite chaude') added.getCell('leadStatus').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } };
    if (status === 'Prospect qualifie') added.getCell('leadStatus').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 30;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  EXPORT_COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.type === 'date') col.numFmt = 'dd/mm/yyyy hh:mm';
    if (c.type === 'money') col.numFmt = '#,##0';
  });

  // Feuille de synthèse
  const summary = wb.addWorksheet('Synthèse');
  const total = leads.length;
  const sumAmount = leads.reduce((acc, l) => acc + (l.estimatedAmount || 0), 0);
  const byStatus: Record<string, number> = {};
  const byOffer: Record<string, { count: number; amount: number }> = {};
  for (const l of leads) {
    byStatus[l.leadStatus || 'Non défini'] = (byStatus[l.leadStatus || 'Non défini'] || 0) + 1;
    const o = l.recommendedOffer || 'Non définie';
    byOffer[o] = byOffer[o] || { count: 0, amount: 0 };
    byOffer[o].count++;
    byOffer[o].amount += l.estimatedAmount || 0;
  }
  summary.columns = [{ width: 40 }, { width: 16 }, { width: 22 }];
  summary.addRow(['Export Leads — Inside Cameroon Tourism']).font = { bold: true, size: 14 };
  summary.addRow(['Généré le', formatDateFr(new Date())]);
  if (meta.generatedBy) summary.addRow(['Par', meta.generatedBy]);
  if (meta.filters) summary.addRow(['Filtres', meta.filters]);
  summary.addRow([]);
  summary.addRow(['Total prospects', total]).font = { bold: true };
  const amountRow = summary.addRow(['Pipeline estimé (FCFA)', sumAmount]);
  amountRow.font = { bold: true };
  amountRow.getCell(2).numFmt = '#,##0';
  summary.addRow([]);
  summary.addRow(['Statut', 'Nombre']).font = { bold: true };
  Object.entries(byStatus).forEach(([k, v]) => summary.addRow([k, v]));
  summary.addRow([]);
  summary.addRow(['Offre', 'Nombre', 'Montant estimé (FCFA)']).font = { bold: true };
  Object.entries(byOffer)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([k, v]) => {
      const r = summary.addRow([k, v.count, v.amount]);
      r.getCell(3).numFmt = '#,##0';
    });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
