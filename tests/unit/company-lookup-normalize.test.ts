// S-INN-1: разбор ответа DaData findById/party + формат ИНН.
//
// Импорт напрямую из папки Edge Function — файл `normalize.ts` вынесен из `index.ts`
// именно ради этого: он чистый (без `Deno.*`), поэтому проверяется node-раннером.
// Ключ DaData в тестах не участвует вовсе — сеть замокана самим фактом того, что
// тестируется чистая функция разбора.

import { describe, it, expect } from 'vitest';
import { normalizeDadataParty, INN_RE } from '../../supabase/functions/company-lookup/normalize';
import { isValidInn, isLookupableInn, isRiskyInnStatus, innStatusLabel } from '@/lib/utils/inn';

/** Реальная форма ответа DaData по юрлицу (сокращённая до используемых полей). */
const LEGAL_ENTITY = {
  suggestions: [
    {
      value: 'ООО "ОРИЕНТ-ПРО"',
      unrestricted_value: 'ООО "ОРИЕНТ-ПРО"',
      data: {
        inn: '7707083893',
        kpp: '770701001',
        ogrn: '1027700132195',
        name: {
          full_with_opf: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ОРИЕНТ-ПРО"',
          short_with_opf: 'ООО "ОРИЕНТ-ПРО"',
          full: 'ОРИЕНТ-ПРО',
          short: 'ОРИЕНТ-ПРО',
        },
        address: {
          value: 'г Москва, ул Вавилова, д 19',
          unrestricted_value: '117312, г Москва, ул Вавилова, д 19',
        },
        state: { status: 'ACTIVE' },
        management: { name: 'Иванов Иван Иванович', post: 'ГЕНЕРАЛЬНЫЙ ДИРЕКТОР' },
      },
    },
  ],
};

describe('normalizeDadataParty', () => {
  it('раскладывает юрлицо по полям формы', () => {
    const r = normalizeDadataParty(LEGAL_ENTITY);
    expect(r.found).toBe(true);
    expect(r.legal_name).toBe('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ОРИЕНТ-ПРО"');
    expect(r.short_name).toBe('ООО "ОРИЕНТ-ПРО"');
    expect(r.kpp).toBe('770701001');
    expect(r.ogrn).toBe('1027700132195');
    expect(r.status).toBe('ACTIVE');
    expect(r.management_name).toBe('Иванов Иван Иванович');
  });

  it('берёт ПОЛНЫЙ юрадрес (unrestricted_value с индексом), а не короткий', () => {
    // В договор идёт адрес с почтовым индексом — короткий `value` его теряет.
    expect(normalizeDadataParty(LEGAL_ENTITY).legal_address).toBe('117312, г Москва, ул Вавилова, д 19');
  });

  it('пустой suggestions — это found:false, а не ошибка', () => {
    const r = normalizeDadataParty({ suggestions: [] });
    expect(r.found).toBe(false);
    expect(r.legal_name).toBeNull();
  });

  it('у ИП блок name пустой — название берётся из value, а не теряется', () => {
    // Главный регресс: found:true с пустыми полями — худший исход («нашли и ничего»).
    const r = normalizeDadataParty({
      suggestions: [{
        value: 'ИП Петров Пётр Петрович',
        data: {
          inn: '773301001234',
          ogrn: '304770000000123',
          name: null,
          address: { value: 'г Москва' },
          state: { status: 'ACTIVE' },
        },
      }],
    });
    expect(r.found).toBe(true);
    expect(r.legal_name).toBe('ИП Петров Пётр Петрович');
    expect(r.short_name).toBe('ИП Петров Пётр Петрович');
    expect(r.kpp).toBeNull();          // у ИП КПП нет — именно null, не пустая строка
    expect(r.legal_address).toBe('г Москва');
  });

  it('пустые строки и пробелы приходят как null, а не затирают поля формы', () => {
    const r = normalizeDadataParty({
      suggestions: [{
        value: 'ООО "ТЕСТ"',
        data: { kpp: '   ', ogrn: '', name: { short_with_opf: 'ООО "ТЕСТ"' }, state: { status: 'LIQUIDATED' } },
      }],
    });
    expect(r.kpp).toBeNull();
    expect(r.ogrn).toBeNull();
    expect(r.status).toBe('LIQUIDATED');
  });

  it('мусор вместо payload не роняет разбор', () => {
    for (const junk of [null, undefined, 'строка', 42, [], { suggestions: 'нет' }, { suggestions: [null] }]) {
      expect(normalizeDadataParty(junk).found).toBe(false);
    }
  });
});

describe('формат ИНН', () => {
  it('регэксп сервера и клиента совпадают', () => {
    // Копия живёт в двух рантаймах (Deno и next) — расхождение означало бы, что
    // клиент шлёт то, что сервер отвергает 400-ым, и кнопка «молча не работает».
    expect(INN_RE.source).toBe(/^\d{10}$|^\d{12}$/.source);
  });

  it('10 и 12 цифр — валидны, всё прочее — нет', () => {
    expect(isLookupableInn('7707083893')).toBe(true);
    expect(isLookupableInn('773301001234')).toBe(true);
    expect(isLookupableInn('  7707083893  ')).toBe(true);   // пробелы из буфера обмена
    expect(isLookupableInn('77070838')).toBe(false);        // 8 цифр
    expect(isLookupableInn('77070838931')).toBe(false);     // 11 — между форматами
    expect(isLookupableInn('770708389A')).toBe(false);
    expect(isLookupableInn('192944106')).toBe(false);       // белорусский УНП из прода
  });

  it('пустой ИНН валиден для формы, но нечего искать', () => {
    // Развилка, из-за которой две функции, а не одна: ИНН необязателен (форма
    // сохраняется), но по пустому полю запрос в реестр слать не с чем.
    expect(isValidInn('')).toBe(true);
    expect(isValidInn(null)).toBe(true);
    expect(isLookupableInn('')).toBe(false);
    expect(isLookupableInn(null)).toBe(false);
  });
});

describe('статус юрлица', () => {
  it('не-ACTIVE — риск, ACTIVE и неизвестный — нет', () => {
    expect(isRiskyInnStatus('LIQUIDATING')).toBe(true);
    expect(isRiskyInnStatus('BANKRUPT')).toBe(true);
    expect(isRiskyInnStatus('ACTIVE')).toBe(false);
    // NULL риском НЕ считаем: иначе жёлтая плашка висела бы на всех 224 компаниях,
    // заведённых до фичи.
    expect(isRiskyInnStatus(null)).toBe(false);
    expect(isRiskyInnStatus('')).toBe(false);
  });

  it('незнакомый статус показывается как есть, а не проглатывается', () => {
    expect(innStatusLabel('ACTIVE')).toBe('Действующее');
    expect(innStatusLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(innStatusLabel(null)).toBeNull();
  });
});
