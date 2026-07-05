/** Нормализация телефона для сравнения: только цифры, 8 → 7 */
export function normalizePhone(p: string): string {
  return p.replace(/\D/g, '').replace(/^8/, '7');
}
