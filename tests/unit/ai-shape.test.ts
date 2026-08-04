import { describe, it, expect } from 'vitest';
import {
  checkResultShape,
  hardClaims,
  softClaims,
  stripCiteTags,
  SHAPE_MARKERS,
  type ShapeClaim,
} from '../../supabase/functions/ai-run/shape';

// ═══════════════════════════════════════════════════════
// fix-S-R2-AI-SHAPE — проверка формы ответа модели.
//
// Фикстуры — не синтетика: это формы РЕАЛЬНЫХ прогонов из ai_runs (тексты
// урезаны до структурной сути, персональные данные клиентов в репозиторий не
// тащим — полный прогон по семи живым строкам делался запросом к БД, результат
// в отчёте спринта).
//
//   28.07, прогон 7596c3e0 — tasks/fields пришли СТРОКАМИ с tool-use разметкой;
//   11.07, прогон 3a75cfbb — client_situation строкой, но с `</…>` и `<parameter`;
//   13.07, прогон 3d5e6e70 — весь payload схлопнут в один client_situation.
// ═══════════════════════════════════════════════════════

/** Верхний уровень submit_progression (deal_progression). */
const PROGRESSION_SCHEMA = {
  type: 'object',
  required: ['confidence', 'summary', 'fields', 'tasks', 'risks', 'open_questions'],
  properties: {
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string' },
    fields: { type: 'object' },
    tasks: { type: 'array' },
    risks: { type: 'array' },
    open_questions: { type: 'array' },
  },
};

/** Верхний уровень submit_note (analytic_note). */
const NOTE_SCHEMA = {
  type: 'object',
  required: ['client_situation', 'needs', 'stakeholders', 'deal_risks', 'recommendations', 'kp_arguments'],
  properties: {
    client_situation: { type: 'string' },
    needs: { type: 'array' },
    stakeholders: { type: 'array' },
    deal_risks: { type: 'array' },
    recommendations: { type: 'array' },
    kp_arguments: { type: 'array' },
  },
};

/** Верхний уровень submit_deal_summary — ради `type: ['string','null']`. */
const SUMMARY_SCHEMA = {
  type: 'object',
  required: ['state', 'highlights', 'next_step', 'flags'],
  properties: {
    state: { type: 'string' },
    highlights: { type: 'array' },
    next_step: { type: ['string', 'null'] },
    flags: { type: 'array' },
  },
};

// Мягких претензий два вида, и в тестах их надо различать: «поля нет» и
// «в значении разметка». Иначе счётчик soft превращается в кашу.
const missing = (claims: ShapeClaim[]) =>
  claims.filter((c) => c.message.includes('обязательное поле отсутствует'));
const markers = (claims: ShapeClaim[]) =>
  claims.filter((c) => c.message.includes('разметка'));

describe('корректный ответ проходит чисто', () => {
  it('deal_progression без претензий', () => {
    const claims = checkResultShape(PROGRESSION_SCHEMA, {
      confidence: 'high',
      summary: 'Клиент подтвердил бюджет.',
      fields: { next_step: 'Отправить КП', probability: 70 },
      tasks: [{ text: 'Подготовить КП', due_in_days: 3 }],
      risks: ['Бюджет не утверждён'],
      open_questions: [],
    });
    expect(claims).toEqual([]);
  });

  it('analytic_note без претензий', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation: 'Клиент оценивает решение для маркировки на двух площадках.',
      needs: [{ claim: 'Нужны фото оборудования', quote: 'сделайте несколько фотографий' }],
      stakeholders: [{ name: 'Дарья', role: 'знает станции' }],
      deal_risks: [],
      recommendations: ['Запросить фото'],
      kp_arguments: [],
    });
    expect(claims).toEqual([]);
  });
});

describe('жёсткая претензия: тип верхнего уровня (прогон 7596c3e0, 28.07)', () => {
  // Форма отказа 10:52: содержимое правильное, сломалась упаковка.
  const broken = {
    confidence: 'medium',
    summary: 'Уточняются детали оборудования.',
    fields: '\n<parameter name="next_step">Получить от Дарьи качественные фото',
    tasks: '\n<parameter name="tasks">[{"text":"Проверить, прислала ли Дарья фото"}]',
    risks: [],
    open_questions: [],
  };

  it('ловит оба поля как жёсткие', () => {
    const hard = hardClaims(checkResultShape(PROGRESSION_SCHEMA, broken));
    expect(hard.map((c) => c.message.split(':')[0]).sort()).toEqual(['fields', 'tasks']);
    expect(hard[0].message).toContain('пришёл string');
  });

  it('те же строки дают ещё и мягкие претензии по маркеру', () => {
    const soft = softClaims(checkResultShape(PROGRESSION_SCHEMA, broken));
    expect(soft.length).toBe(2);
    expect(soft.every((c) => c.message.includes('<parameter name='))).toBe(true);
  });
});

describe('мягкая претензия: разметка внутри строки', () => {
  it('прогон 3a75cfbb (11.07) — типы верны, маркер + один пропущенный required', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation:
        'Клиент уточняет состав оборудования, до 10 000 наименований, работает на 1С ERP.' +
        '</client_situation">\n<parameter name="needs">[{"claim": "Нужен состав оборудования"}]',
      // needs модель отдельным ключом не вернула — вклеила его в client_situation
      stakeholders: [{ name: 'Дарья', role: 'знает станции' }],
      deal_risks: [{ claim: 'Контакт недоступен', quote: 'сегодня он недоступен' }],
      recommendations: ['Запросить фото'],
      kp_arguments: ['Решение работает с существующей инфраструктурой'],
    });
    expect(hardClaims(claims)).toEqual([]);
    expect(markers(claims)).toHaveLength(1);
    expect(markers(claims)[0].message).toContain('client_situation');
    expect(missing(claims).map((c) => c.message.split(':')[0])).toEqual(['needs']);
  });

  it('прогон 3d5e6e70 (13.07) — весь payload в одной строке: маркер + 5 пропусков', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation:
        'Клиент оценивает решение для маркировки на двух площадках.</client_situation>\\n' +
        '<needs>[{"claim":"Нужны фото линии"}]</needs>',
    });
    expect(hardClaims(claims)).toEqual([]);
    expect(markers(claims)).toHaveLength(1);
    expect(missing(claims).map((c) => c.message.split(':')[0])).toEqual([
      'needs', 'stakeholders', 'deal_risks', 'recommendations', 'kp_arguments',
    ]);
  });

  it('маркер во ВЛОЖЕННОЙ строке тоже ловится (обход рекурсивный)', () => {
    const claims = checkResultShape(PROGRESSION_SCHEMA, {
      summary: 'ок',
      tasks: [{ text: 'Нормально' }, { text: 'Плохо</tasks>' }],
    });
    expect(markers(claims)).toHaveLength(1);
    expect(markers(claims)[0].message).toContain('tasks[1].text');
  });

  it('одна строка с десятком маркеров даёт одну претензию, а не десять', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation: '</a></b></c></d></e>',
    });
    expect(markers(claims)).toHaveLength(1);
  });
});

// Гейт вскрыл дыру в самом фикс-файле: правило «required держит модель» опровергнуто
// прогоном 3d5e6e70. Класс МЯГКИЙ намеренно — претензия обязана вызвать ретрай,
// но не отказ: частичный ответ полезнее пустого экрана.
describe('пропущенные обязательные поля (мягкая претензия)', () => {
  it('форма 3a75cfbb: один пропуск → одна мягкая, ноль жёстких', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation: 'Клиент уточняет состав оборудования.',
      stakeholders: [{ name: 'Дарья', role: 'знает станции' }],
      deal_risks: [],
      recommendations: ['Запросить фото'],
      kp_arguments: [],
    });
    expect(hardClaims(claims)).toEqual([]);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toEqual({ kind: 'soft', message: 'needs: обязательное поле отсутствует' });
  });

  it('форма 3d5e6e70: схлопнутый ответ → пять мягких, ноль жёстких', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation: 'Клиент оценивает решение для маркировки на двух площадках.',
    });
    expect(hardClaims(claims)).toEqual([]);
    expect(softClaims(claims)).toHaveLength(5);
    // Претензия обязана вызвать ретрай — а его запускает непустой список любого класса.
    expect(claims.length).toBeGreaterThan(0);
  });

  it('схема без required не роняет проверку', () => {
    const schema = { type: 'object', properties: { a: { type: 'string' } } };
    expect(checkResultShape(schema, { a: 'ок' })).toEqual([]);
  });

  it('required не массив (кривая схема) — пропускаем, а не падаем', () => {
    const schema = { type: 'object', required: 'summary', properties: {} };
    expect(checkResultShape(schema, {})).toEqual([]);
  });

  it('ключ со значением null считается присутствующим (`in`, не truthy)', () => {
    // null в required-поле — это уже забота типовой проверки, не «поля нет».
    const claims = checkResultShape(SUMMARY_SCHEMA, {
      state: 'ок', highlights: [], next_step: null, flags: [],
    });
    expect(claims).toEqual([]);
  });
});

describe('необъявленные типы (самопроверка 3a)', () => {
  it('отсутствующий ключ ВНЕ required типовой претензии не даёт', () => {
    // Само отсутствие теперь ловится отдельной мягкой проверкой; здесь важно,
    // что типовая на пропуске молчит и жёстких претензий не появляется.
    const claims = checkResultShape(PROGRESSION_SCHEMA, { summary: 'только резюме' });
    expect(hardClaims(claims)).toEqual([]);
    expect(markers(claims)).toEqual([]);
  });

  it('type-массив: подходит любой член списка', () => {
    expect(hardClaims(checkResultShape(SUMMARY_SCHEMA, { next_step: 'Позвонить' }))).toEqual([]);
    expect(hardClaims(checkResultShape(SUMMARY_SCHEMA, { next_step: null }))).toEqual([]);
  });

  it('type-массив: значение вне списка — жёсткая претензия', () => {
    const hard = hardClaims(checkResultShape(SUMMARY_SCHEMA, { next_step: ['a'] }));
    expect(hard).toHaveLength(1);
    expect(hard[0].message).toContain('пришёл array');
  });

  it('поле без объявленного type пропускается', () => {
    const schema = { type: 'object', properties: { anything: {} } };
    expect(checkResultShape(schema, { anything: 42 })).toEqual([]);
  });

  it('схема без properties не роняет проверку', () => {
    expect(checkResultShape({ type: 'object' }, { a: 1 })).toEqual([]);
  });

  it('integer в схеме принимает number (целочисленность — забота клиентского Zod)', () => {
    const schema = { type: 'object', properties: { probability: { type: 'integer' } } };
    expect(checkResultShape(schema, { probability: 70 })).toEqual([]);
    expect(hardClaims(checkResultShape(schema, { probability: '70' }))).toHaveLength(1);
  });

  it('null в поле, объявленном строкой, — жёсткая претензия (null ≠ string)', () => {
    const hard = hardClaims(checkResultShape(NOTE_SCHEMA, { client_situation: null }));
    expect(hard).toHaveLength(1);
    expect(hard[0].message).toContain('пришёл null');
  });
});

// Проверка общая для всех шести пресетов, значит регресс возможен у любого
// (самопроверка 7). Здесь — по одному представителю из тех, что не участвовали выше.
describe('остальные пресеты не сломаны', () => {
  const SPIN_SCHEMA = {
    type: 'object',
    properties: {
      counts: { type: 'object' },
      examples: { type: 'array' },
      missed: { type: 'array' },
      next_questions: { type: 'array' },
      score: { type: 'object' },
    },
  };
  const PREP_SCHEMA = {
    type: 'object',
    properties: {
      context: { type: 'string' },
      participants: { type: 'array' },
      open_items: { type: 'array' },
      questions: { type: 'array' },
      watch_outs: { type: 'array' },
    },
  };

  it('spin_review: корректный ответ чист, счёт объектом не путается с массивом', () => {
    expect(checkResultShape(SPIN_SCHEMA, {
      counts: { situation: 4, problem: 2, implication: 0, need_payoff: 1 },
      examples: [{ type: 'S', quote: 'Сколько линий у вас сейчас?' }],
      missed: ['Не задан ни один implication-вопрос'],
      next_questions: ['Что будет, если сроки сдвинутся?'],
      score: { value: 6, rationale: 'Ситуационных много, извлекающих нет' },
    })).toEqual([]);

    const hard = hardClaims(checkResultShape(SPIN_SCHEMA, { counts: [4, 2, 0, 1] }));
    expect(hard).toHaveLength(1);
    expect(hard[0].message).toContain('пришёл array');
  });

  it('meeting_prep: корректный бриф чист', () => {
    expect(checkResultShape(PREP_SCHEMA, {
      context: 'Сделка на стадии «Защита КП», бюджет подтверждён.',
      participants: [{ name: 'Глеб Баграмов', note: 'ЛПР со стороны клиента' }],
      open_items: ['Не загружен файл договора'],
      questions: ['Кто подписывает со стороны заказчика?'],
      watch_outs: [],
    })).toEqual([]);
  });
});

describe('маркеры', () => {
  it('список ровно тот, что описан в фиксе', () => {
    expect(SHAPE_MARKERS).toEqual(['<parameter name=', '</']);
  });

  it('обычный деловой текст маркеров не содержит', () => {
    const claims = checkResultShape(NOTE_SCHEMA, {
      client_situation: 'Скидка 5 % при объёме > 500 кг; срок < 2 недель.',
      recommendations: ['Согласовать цену 100 000 ₽/мес.'],
    });
    // Проверяем именно маркерную часть: угловые скобки в деловом тексте (> 500 кг,
    // < 2 недель) не должны считаться разметкой. Пропуски required здесь ожидаемы —
    // фикстура намеренно неполная.
    expect(markers(claims)).toEqual([]);
    expect(hardClaims(claims)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════
// S-COMPANY-AI-1c — снятие тегов цитирования web search.
//
// `<cite index="7-5">…</cite>` — служебный формат МОДЕЛИ, а не грязь со страниц:
// промпт снижал частоту (4/5 → 1/3), но у прогона «КМ» разметка пережила ретрай и
// доехала до карточки. Гарантию даёт код, и он обязан снимать ТОЛЬКО cite.
// ═══════════════════════════════════════════════════════

describe('stripCiteTags', () => {
  it('снимает пару тегов, сохраняя текст внутри', () => {
    expect(stripCiteTags('<cite index="7-5">Выручка 1,05 млрд ₽</cite>'))
      .toBe('Выручка 1,05 млрд ₽');
  });

  it('снимает теги внутри массива и вложенного объекта', () => {
    expect(stripCiteTags({
      summary: 'Компания <cite index="1-2">производит колбасы</cite> в Вологде.',
      chz_signals: [{ claim: '<cite index="3-1">Вакансия «оператор ГИС МТ»</cite>', source_url: 'https://x.ru' }],
      talk_hooks: ['Спросить про <cite index="2-0">новую линию</cite>'],
    })).toEqual({
      summary: 'Компания производит колбасы в Вологде.',
      chz_signals: [{ claim: 'Вакансия «оператор ГИС МТ»', source_url: 'https://x.ru' }],
      talk_hooks: ['Спросить про новую линию'],
    });
  });

  it('снимает осиротевший закрывающий тег и обрыв на границе max_tokens', () => {
    // Половина тега вероятнее целого: ответ режется по max_tokens.
    expect(stripCiteTags('Запущен цех</cite>')).toBe('Запущен цех');
    expect(stripCiteTags('Запущен цех <cite index="4-')).toBe('Запущен цех');
  });

  it('деловой текст с угловыми скобками не повреждается', () => {
    // Ровно то, ради чего регулярка узкая, а не «универсальный HTML-стриппер».
    const a = 'Прибыль > 100 млн ₽ за 2024';
    const b = 'Срок 2024 < 2025, объём < 500 кг';
    expect(stripCiteTags(a)).toBe(a);
    expect(stripCiteTags(b)).toBe(b);
  });

  it('строка без тегов возвращается той же ссылкой — чистка не трогает чистое', () => {
    const s = 'Двойные  пробелы  и\nперевод строки сохраняются';
    expect(stripCiteTags(s)).toBe(s);
  });

  it('пробелы на месте снятого тега схлопываются, переводы строк — нет', () => {
    expect(stripCiteTags('Факт <cite index="1-1"> </cite> и вывод'))
      .toBe('Факт и вывод');
    expect(stripCiteTags('Первый абзац<cite index="1-1"></cite>\nВторой абзац'))
      .toBe('Первый абзац\nВторой абзац');
  });

  it('не-строки проходят насквозь, вход не мутируется', () => {
    expect(stripCiteTags(null)).toBe(null);
    expect(stripCiteTags(42)).toBe(42);
    expect(stripCiteTags(true)).toBe(true);
    expect(stripCiteTags(undefined)).toBe(undefined);

    const src = { scale: null, sources: ['https://x.ru'], summary: '<cite index="1">Текст</cite>' };
    const out = stripCiteTags(src);
    expect(src.summary).toBe('<cite index="1">Текст</cite>'); // оригинал цел
    expect(out.summary).toBe('Текст');
  });

  it('после чистки маркерных претензий к форме не остаётся', () => {
    // Смысл всей задачи: претензия `</` больше не выставляется, ретрая нет.
    const dirty = {
      client_situation: 'Компания <cite index="7-5">строит новый цех</cite> в Вологде.',
      recommendations: ['Уточнить сроки<cite index="2-1"></cite>'],
    };
    expect(markers(checkResultShape(NOTE_SCHEMA, dirty)).length).toBeGreaterThan(0);
    expect(markers(checkResultShape(NOTE_SCHEMA, stripCiteTags(dirty)))).toEqual([]);
  });
});
