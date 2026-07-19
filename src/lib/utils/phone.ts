/** Нормализация телефона для сравнения: только цифры, 8 → 7 */
export function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').replace(/^8/, '7');
}

/** Display-format RU phone → +7 (XXX) XXX-XX-XX.
 *  Недеструктивно: непарсируемое (напр. "7110") возвращаем как есть. */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let n = raw.replace(/\D/g, '');
  if (n.length === 11 && n[0] === '8') n = '7' + n.slice(1);
  else if (n.length === 10) n = '7' + n;
  if (n.length === 11 && n[0] === '7') {
    return `+7 (${n.slice(1, 4)}) ${n.slice(4, 7)}-${n.slice(7, 9)}-${n.slice(9, 11)}`;
  }
  return raw;
}
