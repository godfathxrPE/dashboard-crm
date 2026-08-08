// ⚠️ S-TG-3: определение `normalizePhone` переехало в
//    `supabase/functions/_shared/capture-helpers.ts` (под именем `normalizePhoneDigits`).
//    Причина механическая: тот же ключ телефона считает дедуп быстрого ввода из
//    Telegram, а Deno-функция до этого файла не дотягивается — здесь есть импортеры
//    с алиасом `@/`, которых у неё нет. Копия правила «8 → 7» в двух местах
//    означала бы, что дедуп из бота и дедуп из формы однажды разойдутся.
//    Для всех потребителей ничего не изменилось: имя, путь и поведение прежние.
/** Нормализация телефона для сравнения: только цифры, 8 → 7 */
export { normalizePhoneDigits as normalizePhone } from '../../../supabase/functions/_shared/capture-helpers';

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
