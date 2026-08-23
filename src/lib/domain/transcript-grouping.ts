// ═══════════════════════════════════════════════════════
// S-TR-CREATE-1: группировка расшифровок по РОДИТЕЛЬСКОМУ разговору.
//
// Час разговора расшифровывают кусками, и десять фрагментов одного звонка давали
// десять равноправных строк списка — раздел читался как «десять разговоров».
// Группировка КЛИЕНТСКАЯ: выборка не меняется (в БД группы нет, есть пара
// entity_type+entity_id), и серверные фильтры с поиском продолжают работать как
// работали.
//
// Чистая функция без React и Supabase — чтобы её правила проверялись тестом, а не
// глазами по таблице.
// ═══════════════════════════════════════════════════════

/** Минимум, который нужен группировке от строки списка. */
export type GroupableTranscript = {
  id: string;
  entityType: string;
  entityId: string;
  /** ISO — по нему выбирается главная строка группы (самая свежая). */
  createdAt: string;
};

export type GroupedTranscript<T> = T & {
  /** Ключ группы — `entity_type:entity_id`. */
  groupKey: string;
  /** Сколько ОСТАЛЬНЫХ расшифровок в группе (0 у одиночной строки и у вложенных). */
  childCount: number;
  /** Строка раскрыта под главной, а не сама по себе. */
  isChild: boolean;
};

/** Ключ группы. Экспортируется, чтобы вызывающий складывал в Set то же самое. */
export function transcriptGroupKey(row: GroupableTranscript): string {
  return `${row.entityType}:${row.entityId}`;
}

/**
 * Плоский список строк для таблицы: главная строка каждой группы, а сразу за ней —
 * вложенные, если группа раскрыта.
 *
 * Порядок исходного массива сохраняется: список приходит отсортированным по дате
 * (свежие сверху), и группа встаёт на место своей самой свежей строки. Сортировать
 * заново здесь нельзя — это переставило бы список относительно того, что вернул
 * сервер, и «свежее сверху» перестало бы совпадать с ожиданием.
 *
 * `expandAll` — режим активного поиска: совпавшие строки нельзя прятать под чипом
 * «+N», иначе поиск находит фрагмент, а показать его не может.
 */
export function groupTranscripts<T extends GroupableTranscript>(
  rows: T[],
  expandedKeys: ReadonlySet<string>,
  options: { expandAll?: boolean } = {},
): GroupedTranscript<T>[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();

  for (const row of rows) {
    const key = transcriptGroupKey(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else {
      groups.set(key, [row]);
      order.push(key);
    }
  }

  const out: GroupedTranscript<T>[] = [];
  for (const key of order) {
    const bucket = groups.get(key)!;
    // Главная — самая свежая. Обычно это и есть первая строка (список приходит
    // отсортированным), но полагаться на это нельзя: батчи `.in` порядок между
    // собой не держат, и после склейки сортировка гарантирована только по всему
    // списку целиком, а не внутри произвольной подгруппы.
    const [head, ...restUnsorted] = [...bucket].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const rest = restUnsorted;
    out.push({ ...head, groupKey: key, childCount: rest.length, isChild: false });

    if (rest.length > 0 && (options.expandAll || expandedKeys.has(key))) {
      for (const child of rest) {
        out.push({ ...child, groupKey: key, childCount: 0, isChild: true });
      }
    }
  }
  return out;
}
