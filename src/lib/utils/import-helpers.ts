// ═══════════════════════════════════════════════════════
// Excel import helpers (extracted for testability)
// ═══════════════════════════════════════════════════════

export type FieldKey = 'companyName' | 'exactName' | 'inn' | 'contactName' | 'email' | 'phone' | 'position' | 'website' | 'notes' | 'skip';

export function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[1], lastName: parts[0] };
}

export function autoDetectMapping(header: string): FieldKey {
  const h = String(header).toLowerCase().trim();
  if (h.includes('точное')) return 'exactName';
  if (h.includes('название') || h.includes('компани') || h.includes('организац')) return 'companyName';
  if (h.includes('инн') || h === 'inn') return 'inn';
  if (h.includes('почта') || h.includes('email') || h.includes('e-mail') || h.includes('mail')) return 'email';
  if (h.includes('телефон') || h.includes('тел') || h.includes('phone') || h.includes('моб')) return 'phone';
  if (h.includes('контакт') || h.includes('имя') || h.includes('фио') || h.includes('лицо')) return 'contactName';
  if (h.includes('должность') || h.includes('позиция') || h.includes('position')) return 'position';
  if (h.includes('сайт') || h.includes('site') || h.includes('url') || h.includes('web')) return 'website';
  if (h.includes('коммент') || h.includes('замет') || h.includes('notes') || h.includes('примечан')) return 'notes';
  if (h.includes('менеджер') || h.includes('ответствен')) return 'skip';
  return 'skip';
}
