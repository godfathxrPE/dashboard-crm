import { describe, it, expect } from 'vitest';
import { parseTaskIntent } from '@/lib/utils/task-intent';

// ═══════════════════════════════════════════════════════
// S-CHAT-TASK-1: разбор «задача из сообщения».
//
// `now` фиксирован во всех тестах — «ближайшая будущая дата» без этого не проверяется
// никак. Опорная точка: воскресенье 2 августа 2026, 12:00 МСК (09:00 UTC).
// ═══════════════════════════════════════════════════════

/** Воскресенье, 2 августа 2026, 12:00 МСК. */
const NOW = new Date('2026-08-02T09:00:00.000Z');

/** Конец дня YYYY-MM-DD по МСК в UTC — 20:59:59.999 предыдущих суток. */
function endOfMskDay(dateKey: string): string {
  return new Date(`${dateKey}T23:59:59.999+03:00`).toISOString();
}

/** Момент YYYY-MM-DD HH:MM по МСК в UTC. */
function mskMoment(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00.000+03:00`).toISOString();
}

describe('parseTaskIntent — даты', () => {
  it('«3 августа» — конец дня по МСК, дата вырезана из текста', () => {
    const r = parseTaskIntent('звонок 3 августа', NOW);
    expect(r.text).toBe('звонок');
    expect(r.deadline).toBe(endOfMskDay('2026-08-03'));
    expect(r.matchedDatePhrase).toBe('3 августа');
  });

  it('«3 августа в 15:00» — момент по МСК', () => {
    const r = parseTaskIntent('звонок 3 августа в 15:00', NOW);
    expect(r.text).toBe('звонок');
    expect(r.deadline).toBe(mskMoment('2026-08-03', '15:00'));
    expect(r.matchedDatePhrase).toBe('3 августа в 15:00');
  });

  it('«03.08» — числовая форма', () => {
    const r = parseTaskIntent('счёт 03.08', NOW);
    expect(r.text).toBe('счёт');
    expect(r.deadline).toBe(endOfMskDay('2026-08-03'));
  });

  it('«03.08 15:00» — час берётся из времени, а не из месяца', () => {
    const r = parseTaskIntent('счёт 03.08 15:00', NOW);
    expect(r.deadline).toBe(mskMoment('2026-08-03', '15:00'));
    expect(r.text).toBe('счёт');
  });

  it('«сегодня» — конец сегодняшнего дня по МСК, а не момент клика', () => {
    const r = parseTaskIntent('отчёт сегодня', NOW);
    expect(r.deadline).toBe(endOfMskDay('2026-08-02'));
  });

  it('«завтра» и «послезавтра»', () => {
    expect(parseTaskIntent('отчёт завтра', NOW).deadline).toBe(endOfMskDay('2026-08-03'));
    expect(parseTaskIntent('отчёт послезавтра', NOW).deadline).toBe(endOfMskDay('2026-08-04'));
  });

  it('«через 2 дня» / «через неделю»', () => {
    expect(parseTaskIntent('напомнить через 2 дня', NOW).deadline).toBe(endOfMskDay('2026-08-04'));
    expect(parseTaskIntent('напомнить через неделю', NOW).deadline).toBe(endOfMskDay('2026-08-09'));
  });

  it('«в понедельник» — ближайший СТРОГО будущий, воскресенье → следующий день', () => {
    const r = parseTaskIntent('созвон в понедельник', NOW);
    expect(r.text).toBe('созвон');
    expect(r.deadline).toBe(endOfMskDay('2026-08-03'));
    expect(r.matchedDatePhrase).toBe('в понедельник');
  });

  it('день недели, совпавший с сегодняшним, уезжает на неделю вперёд', () => {
    // NOW — воскресенье; «в воскресенье» значит следующее, а не сегодня.
    expect(parseTaskIntent('встреча в воскресенье', NOW).deadline).toBe(endOfMskDay('2026-08-09'));
  });

  it('дата в прошлом без года → следующий год', () => {
    const r = parseTaskIntent('оплата 15 января', NOW);
    expect(r.deadline).toBe(endOfMskDay('2027-01-15'));
  });

  it('явный год уважается', () => {
    expect(parseTaskIntent('аудит 3 августа 2028', NOW).deadline).toBe(endOfMskDay('2028-08-03'));
    expect(parseTaskIntent('аудит 03.08.2028', NOW).deadline).toBe(endOfMskDay('2028-08-03'));
  });
});

describe('parseTaskIntent — время без даты', () => {
  it('«в 15:00» позже текущего часа — сегодня', () => {
    const r = parseTaskIntent('перезвонить в 15:00', NOW);
    expect(r.text).toBe('перезвонить');
    expect(r.deadline).toBe(mskMoment('2026-08-02', '15:00'));
  });

  it('«в 9:00», когда уже полдень, — завтра', () => {
    expect(parseTaskIntent('перезвонить в 9:00', NOW).deadline).toBe(
      mskMoment('2026-08-03', '09:00'),
    );
  });

  it('«15 часов» — та же форма', () => {
    const r = parseTaskIntent('созвон 15 часов', NOW);
    expect(r.deadline).toBe(mskMoment('2026-08-02', '15:00'));
    expect(r.text).toBe('созвон');
  });

  it('«в 15» в конце строки — время', () => {
    expect(parseTaskIntent('позвонить в 15', NOW).deadline).toBe(mskMoment('2026-08-02', '15:00'));
  });

  it('«в 15 экземплярах» — НЕ время', () => {
    const r = parseTaskIntent('распечатать в 15 экземплярах', NOW);
    expect(r.deadline).toBeNull();
    expect(r.text).toBe('распечатать в 15 экземплярах');
  });
});

describe('parseTaskIntent — что срока НЕ даёт', () => {
  it('«31 февраля» — невалидная дата: срока нет, текст цел', () => {
    const r = parseTaskIntent('сдать 31 февраля', NOW);
    expect(r.deadline).toBeNull();
    expect(r.matchedDatePhrase).toBeNull();
    expect(r.text).toBe('сдать 31 февраля');
  });

  it('«25:00» — не время', () => {
    const r = parseTaskIntent('дедлайн 25:00', NOW);
    expect(r.deadline).toBeNull();
    expect(r.text).toBe('дедлайн 25:00');
  });

  it('текст вообще без даты', () => {
    const r = parseTaskIntent('позвонить в Ориент по поводу отгрузки', NOW);
    expect(r.deadline).toBeNull();
    expect(r.matchedDatePhrase).toBeNull();
    expect(r.text).toBe('позвонить в Ориент по поводу отгрузки');
  });

  it('пустая строка', () => {
    const empty = { text: '', deadline: null, matchedDatePhrase: null, nameHint: null };
    expect(parseTaskIntent('', NOW)).toEqual(empty);
    expect(parseTaskIntent('   ', NOW)).toEqual(empty);
  });
});

describe('parseTaskIntent — триггер-фразы', () => {
  it('пример из ТЗ: «поставить задачу:» вырезано, «Ориент» остался', () => {
    const r = parseTaskIntent('Ориент — поставить задачу: звонок 3 августа в 15:00', NOW);
    expect(r.text).toBe('Ориент — звонок');
    expect(r.deadline).toBe(mskMoment('2026-08-03', '15:00'));
  });

  it('«задача:» в начале', () => {
    expect(parseTaskIntent('задача: выставить счёт завтра', NOW).text).toBe('выставить счёт');
  });

  it('«todo:» в начале', () => {
    expect(parseTaskIntent('todo: собрать логи', NOW).text).toBe('собрать логи');
  });

  it('слэш-команда целиком тоже переживается', () => {
    const r = parseTaskIntent('/задача позвонить завтра', NOW);
    expect(r.text).toBe('позвонить');
    expect(r.deadline).toBe(endOfMskDay('2026-08-03'));
  });

  it('«создать задачу» без двоеточия', () => {
    expect(parseTaskIntent('нужно создать задачу проверить акты', NOW).text).toBe(
      'проверить акты',
    );
  });

  it('слово «задача» без разделителя НЕ вырезается — это обычный текст', () => {
    const r = parseTaskIntent('эта задача уже в работе', NOW);
    expect(r.text).toBe('эта задача уже в работе');
  });
});

describe('parseTaskIntent — текст не теряется', () => {
  it('после вырезания пусто → возвращаем исходное', () => {
    const r = parseTaskIntent('завтра', NOW);
    expect(r.text).toBe('завтра');
    expect(r.deadline).toBe(endOfMskDay('2026-08-03'));
  });

  it('только триггер-фраза → возвращаем исходное', () => {
    expect(parseTaskIntent('поставить задачу', NOW).text).toBe('поставить задачу');
  });

  it('перенос строки и лишние пробелы схлопываются', () => {
    expect(parseTaskIntent('  собрать   пакет\n документов  ', NOW).text).toBe(
      'собрать пакет документов',
    );
  });

  it('ссылка-чип в теле остаётся в тексте как есть (сущность берётся не отсюда)', () => {
    const body = 'посмотреть /deals/3f1c0f4e-1a2b-4c3d-8e9f-000000000001 завтра';
    const r = parseTaskIntent(body, NOW);
    expect(r.text).toBe('посмотреть /deals/3f1c0f4e-1a2b-4c3d-8e9f-000000000001');
    expect(r.deadline).toBe(endOfMskDay('2026-08-03'));
  });
});

describe('parseTaskIntent — nameHint (подсказка поиску, не привязка)', () => {
  it('слово с прописной не первым — имя', () => {
    expect(parseTaskIntent('звонок Ориент', NOW).nameHint).toBe('Ориент');
  });

  it('несколько прописных подряд — берём всю последовательность', () => {
    expect(parseTaskIntent('счёт Аграрная Группа завтра', NOW).nameHint).toBe('Аграрная Группа');
  });

  it('первое слово предложения не считается', () => {
    expect(parseTaskIntent('Позвонить в офис', NOW).nameHint).toBeNull();
  });

  it('первое слово с тире — это подпись «про что речь», а не начало предложения', () => {
    // Пример из ТЗ: «Ориент — поставить задачу: звонок 3 августа в 15:00».
    const r = parseTaskIntent('Ориент — поставить задачу: звонок 3 августа в 15:00', NOW);
    expect(r.text).toBe('Ориент — звонок');
    expect(r.nameHint).toBe('Ориент');
  });

  it('кавычки выигрывают у прописных', () => {
    expect(parseTaskIntent('позвонить в ООО "Мукомол"', NOW).nameHint).toBe('Мукомол');
    expect(parseTaskIntent('счёт для «Аграрной Группы»', NOW).nameHint).toBe('Аграрной Группы');
  });

  it('имени нет — null', () => {
    expect(parseTaskIntent('позвонить в офис завтра', NOW).nameHint).toBeNull();
    expect(parseTaskIntent('', NOW).nameHint).toBeNull();
  });

  it('дата и триггер-фраза в подсказку не попадают', () => {
    // Ищем в очищенном тексте: иначе «3 Августа» и «Создать» стали бы «именами».
    expect(parseTaskIntent('Создать задачу: подготовить акты 3 августа', NOW).nameHint).toBeNull();
  });

  it('знаки препинания вокруг имени не мешают', () => {
    expect(parseTaskIntent('уточнить у Ориент, что по отгрузке', NOW).nameHint).toBe('Ориент');
  });
});

describe('parseTaskIntent — МСК, а не таймзона браузера', () => {
  it('«сегодня» на границе суток МСК: 23:30 МСК = следующий день UTC', () => {
    // 2026-08-02T20:30Z = 23:30 МСК того же дня → «сегодня» это 2 августа.
    const late = new Date('2026-08-02T20:30:00.000Z');
    expect(parseTaskIntent('отчёт сегодня', late).deadline).toBe(endOfMskDay('2026-08-02'));
  });

  it('«сегодня» в 00:30 МСК = уже новые сутки, хотя в UTC ещё вчера', () => {
    // 2026-08-02T21:30Z = 00:30 МСК 3 августа.
    const early = new Date('2026-08-02T21:30:00.000Z');
    expect(parseTaskIntent('отчёт сегодня', early).deadline).toBe(endOfMskDay('2026-08-03'));
  });
});
