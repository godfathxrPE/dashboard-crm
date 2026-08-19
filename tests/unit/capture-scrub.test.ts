import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  scrubRequisites,
  scrubRequisitesDeep,
  hasValidOgrnChecksum,
} from '@/lib/utils/capture-helpers';

// ═══════════════════════════════════════════════════════
// S-DEBT-1, Задача 2 — запрет на реквизиты стал кодом.
//
// Промпт `ai-capture` запрещает извлекать ИНН/КПП/ОГРН. Проба 19.08 (кейс 1.3):
// DeepSeek запрет нарушил и положил ИНН 7707083893 в поле карточки. Sonnet его
// соблюдает — по послушанию, а не по гарантии, а минимизация данных на послушании
// модели держаться не может.
//
// Числа настоящие и проверены алгоритмами ФНС:
//   7707083893       — ИНН юрлица (Сбербанк)
//   500100732259     — ИНН ИП
//   770701001        — КПП (контрольной суммы у КПП НЕТ, отсюда правило про метку)
//   1027700132195    — ОГРН юрлица
//   304500116000157  — ОГРНИП
//   9161234567       — НЕ реквизит, а мобильный без кода; чексумму ИНН проходит,
//                      и именно поэтому поле телефона чистится только по метке.
// ═══════════════════════════════════════════════════════

const INN10 = '7707083893';
const INN12 = '500100732259';
const KPP = '770701001';
const OGRN = '1027700132195';
const OGRNIP = '304500116000157';
const PHONE_LIKE_INN = '9161234567';

describe('hasValidOgrnChecksum', () => {
  it('принимает ОГРН (13) и ОГРНИП (15)', () => {
    expect(hasValidOgrnChecksum(OGRN)).toBe(true);
    expect(hasValidOgrnChecksum(OGRNIP)).toBe(true);
  });

  it('отвергает битую контрольную цифру и неверную длину', () => {
    expect(hasValidOgrnChecksum('1027700132194')).toBe(false);
    expect(hasValidOgrnChecksum('304500116000158')).toBe(false);
    expect(hasValidOgrnChecksum('102770013219')).toBe(false); // 12
    expect(hasValidOgrnChecksum('')).toBe(false);
    expect(hasValidOgrnChecksum(null)).toBe(false);
  });
});

describe('scrubRequisites — вырезается реквизит, а не поле', () => {
  it('ИНН с меткой уезжает вместе с меткой, название остаётся', () => {
    const r = scrubRequisites(`ООО Ромашка, ИНН ${INN10}`);
    expect(r.value).toBe('ООО Ромашка');
    expect(r.removed).toBe(1);
  });

  it('ИНН ИП (12 цифр) — тоже реквизит', () => {
    expect(scrubRequisites(`ИП Петров, ИНН ${INN12}`).value).toBe('ИП Петров');
    // И без метки: чексумма сходится, телефонного контекста нет.
    expect(scrubRequisites(`ИП Петров ${INN12} склад`).value).toBe('ИП Петров склад');
  });

  it('КПП вырезается по метке', () => {
    const r = scrubRequisites(`ООО Ромашка ИНН ${INN10} КПП ${KPP}`);
    expect(r.value).toBe('ООО Ромашка');
    expect(r.removed).toBe(2);
  });

  it('ОГРН (13) и ОГРНИП (15) вырезаются и с меткой, и без неё', () => {
    expect(scrubRequisites(`ООО Ромашка, ОГРН ${OGRN}`).value).toBe('ООО Ромашка');
    expect(scrubRequisites(`ООО Ромашка ${OGRN}`).value).toBe('ООО Ромашка');
    expect(scrubRequisites(`ИП Петров, ОГРНИП ${OGRNIP}`).value).toBe('ИП Петров');
    expect(scrubRequisites(`ИП Петров ${OGRNIP}`).value).toBe('ИП Петров');
  });

  it('вырез из середины оставляет обе стороны', () => {
    const r = scrubRequisites(`Поставщик ИНН ${INN10} по договору поставки`);
    expect(r.value).toBe('Поставщик по договору поставки');
    expect(r.removed).toBe(1);
  });

  it('без реквизитов строка возвращается БАЙТ В БАЙТ', () => {
    // Подчистка разделителей включается только при вырезе: иначе она правила бы
    // пунктуацию в полях, которых зачистка не касалась.
    const src = 'ООО  Ромашка ,  склад №5 ( основной )';
    const r = scrubRequisites(src);
    expect(r.value).toBe(src);
    expect(r.removed).toBe(0);
  });
});

describe('scrubRequisites — ложные срабатывания', () => {
  it('телефон в любом написании не трогается', () => {
    for (const phone of [
      '+7 999 111-22-33',
      '8 (999) 111-22-33',
      '+79991112233',
      '89991112233',
      'тел. +7 916 123-45-67',
    ]) {
      expect(scrubRequisites(phone), phone).toEqual({ value: phone, removed: 0 });
    }
  });

  it('десятизначный хвост в телефонном контексте не считается ИНН', () => {
    const src = `тел. ${PHONE_LIKE_INN}`;
    expect(scrubRequisites(src)).toEqual({ value: src, removed: 0 });
  });

  it('индекс, номер договора и банковский счёт остаются на месте', () => {
    for (const src of [
      '101000 Москва, ул. Мясницкая 1',
      'Договор №12345678 от 12.05.2026',
      'Договор № 123456789 (девять цифр — не КПП без метки)',
      'р/с 40702810900000012345 в банке',
      'к/с 30101810400000000225, БИК 044525225',
    ]) {
      expect(scrubRequisites(src), src).toEqual({ value: src, removed: 0 });
    }
  });

  it('голые девять цифр не вырезаются: у КПП нет чексуммы, отличить нечем', () => {
    const src = `Пропуск ${KPP} на проходной`;
    expect(scrubRequisites(src)).toEqual({ value: src, removed: 0 });
  });
});

describe('scrubRequisitesDeep — весь разбор целиком', () => {
  const parsed = () => ({
    intent: 'unclear',
    contact: {
      first_name: 'Иван',
      last_name: 'Петров',
      position: 'коммерческий директор',
      email: 'ivan@romashka.ru',
      phone: '+7 999 111-22-33',
      notes: `Работает с 2019 года, ИНН ${INN10}, звонить после 15:00`,
    },
    company: {
      name: `ООО «Ромашка», ИНН ${INN10}, КПП ${KPP}`,
      email: '',
      phone: PHONE_LIKE_INN,
      website: 'romashka.ru',
      address: `Москва, ул. Ленина 5, ОГРН ${OGRN}`,
      notes: '',
    },
  });

  it('чистит все ветки и считает фрагменты', () => {
    const { value, removed } = scrubRequisitesDeep(parsed());
    expect(value.company.name).toBe('ООО «Ромашка»');
    expect(value.company.address).toBe('Москва, ул. Ленина 5');
    // Осиротевшая запятая от выреза схлопывается с соседней — текст остаётся читаемым.
    expect(value.contact.notes).toBe('Работает с 2019 года, звонить после 15:00');
    expect(removed).toBe(4);
  });

  it('поле телефона чистится ТОЛЬКО по метке — мобильный с чексуммой ИНН выживает', () => {
    const { value } = scrubRequisitesDeep(parsed());
    expect(value.company.phone).toBe(PHONE_LIKE_INN);
    expect(value.contact.phone).toBe('+7 999 111-22-33');

    const labelled = scrubRequisitesDeep({ contact: { phone: `ИНН ${INN10}` } });
    expect(labelled.value.contact.phone).toBe('');
    expect(labelled.removed).toBe(1);
  });

  it('чистый разбор проходит без изменений и без счётчика', () => {
    const clean = {
      intent: 'contact',
      contact: { first_name: 'Иван', last_name: 'Петров', phone: '+7 999 111-22-33', notes: '' },
      company: null,
    };
    expect(scrubRequisitesDeep(clean)).toEqual({ value: clean, removed: 0 });
  });

  it('не спотыкается о null, числа и вложенные массивы', () => {
    const src = { a: null, b: 7, c: [`ИНН ${INN10}`, 'ок'], d: { e: undefined } };
    const { value, removed } = scrubRequisitesDeep(src);
    expect(value).toEqual({ a: null, b: 7, c: ['', 'ок'], d: { e: undefined } });
    expect(removed).toBe(1);
  });
});

describe('лог зачистки — число, без значений', () => {
  it('console.warn в ai-capture печатает счётчик и слаг модели, но не поля', () => {
    // Молчаливая зачистка неотличима от «модель ничего не извлекла», поэтому лог
    // обязателен; но сами значения — ровно те данные, которые мы отказались
    // хранить, и в логи им нельзя. Проверяется по исходнику: Deno-функцию целиком
    // в vitest не поднять.
    const src = readFileSync(
      path.join(__dirname, '../../supabase/functions/ai-capture/index.ts'),
      'utf8',
    );
    const warn = /console\.warn\(([\s\S]*?)\n\s*\);/.exec(src);
    expect(warn, 'console.warn зачистки не найден').not.toBeNull();
    const body = warn![1];
    expect(body).toContain('${scrubbed.removed}');
    expect(body).not.toContain('scrubbed.value');
    expect(body).not.toContain('JSON.stringify');
    expect(body).not.toMatch(/\bresult\b/);
  });
});
