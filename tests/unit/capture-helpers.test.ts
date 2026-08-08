import { describe, it, expect } from 'vitest';
import {
  hasValidInnChecksum,
  extractInn,
  phoneKey,
  extractEmail,
  findCaptureDuplicate,
  normalizeCompanyName,
} from '@/lib/utils/capture-helpers';

// ═══════════════════════════════════════════════════════
// S-QUICK-CAPTURE-1 — детерминированный разбор вставленного текста.
//
// Всё чистое: ни времени, ни сети, ни моков. Числа взяты реальные и проверены
// по алгоритму ФНС вручную:
//   7707083893   — 10 цифр, валиден (Сбербанк)
//   500100732259 — 12 цифр, валиден (ИП)
//   9123456784   — 10 цифр, чексумма СХОДИТСЯ, но выглядит как мобильный номер:
//                  на нём проверяется телефонный guard.
// ═══════════════════════════════════════════════════════

const INN10 = '7707083893';
const INN12 = '500100732259';
const PHONE_LIKE_INN = '9123456784';

describe('hasValidInnChecksum', () => {
  it('принимает валидный ИНН юрлица (10 цифр)', () => {
    expect(hasValidInnChecksum(INN10)).toBe(true);
  });

  it('принимает валидный ИНН ИП (12 цифр)', () => {
    expect(hasValidInnChecksum(INN12)).toBe(true);
  });

  it('отвергает 10 цифр с битой чексуммой', () => {
    expect(hasValidInnChecksum('7707083894')).toBe(false);
  });

  it('отвергает 12 цифр с битой чексуммой', () => {
    // Ломаем последнее контрольное число, оставляя первое сошедшимся:
    // проверка обязана считать ОБА, а не только n11.
    expect(hasValidInnChecksum('500100732258')).toBe(false);
  });

  it('отвергает неверную длину, буквы и пустое', () => {
    expect(hasValidInnChecksum('770708389')).toBe(false); // 9 цифр
    expect(hasValidInnChecksum('77070838931')).toBe(false); // 11 цифр
    expect(hasValidInnChecksum('77070838ab')).toBe(false);
    expect(hasValidInnChecksum('')).toBe(false);
    expect(hasValidInnChecksum(null)).toBe(false);
    expect(hasValidInnChecksum(undefined)).toBe(false);
  });

  it('терпит окружающие пробелы', () => {
    expect(hasValidInnChecksum(`  ${INN10} `)).toBe(true);
  });
});

describe('extractInn', () => {
  it('находит ИНН по явной метке', () => {
    expect(extractInn(`ООО «Ромашка», ИНН ${INN10}, Москва`)).toBe(INN10);
    expect(extractInn(`ИП Петров ИНН: ${INN12}`)).toBe(INN12);
    expect(extractInn(`инн №${INN10}`)).toBe(INN10);
  });

  it('находит ИНН без метки, если чексумма сходится', () => {
    expect(extractInn(`ООО «Ромашка» ${INN10} договор`)).toBe(INN10);
  });

  it('не принимает число, похожее на ИНН, но с битой чексуммой', () => {
    expect(extractInn('ООО «Ромашка» 7707083894')).toBeNull();
  });

  it('не путает ИНН с номером телефона', () => {
    // Чексумма у числа сходится — отсекает только телефонный контекст.
    expect(hasValidInnChecksum(PHONE_LIKE_INN)).toBe(true);
    expect(extractInn(`тел ${PHONE_LIKE_INN}`)).toBeNull();
    expect(extractInn(`Телефон: ${PHONE_LIKE_INN}`)).toBeNull();
    expect(extractInn(`8 ${PHONE_LIKE_INN}`)).toBeNull();
    // ...но явная метка сильнее эвристики: человек сказал прямо.
    expect(extractInn(`ИНН ${PHONE_LIKE_INN}`)).toBe(PHONE_LIKE_INN);
  });

  it('игнорирует числа неподходящей длины', () => {
    expect(extractInn('счёт 40702810900000012345 от 12.03.2026')).toBeNull();
    expect(extractInn('заказ 12345')).toBeNull();
  });

  it('возвращает null на тексте без ИНН и на пустом', () => {
    expect(extractInn('Иванов Пётр, коммерческий директор')).toBeNull();
    expect(extractInn('')).toBeNull();
  });
});

describe('phoneKey', () => {
  it('сводит записи одного номера к одному ключу', () => {
    const key = '9123456789';
    expect(phoneKey('89123456789')).toBe(key);
    expect(phoneKey('+7 (912) 345-67-89')).toBe(key);
    expect(phoneKey('8-912-345-67-89')).toBe(key);
    expect(phoneKey('79123456789')).toBe(key);
    expect(phoneKey('9123456789')).toBe(key);
  });

  it('отбрасывает обрубки короче 10 цифр', () => {
    expect(phoneKey('7110')).toBeNull();
    expect(phoneKey('123-45-67')).toBeNull();
    expect(phoneKey('')).toBeNull();
    expect(phoneKey(null)).toBeNull();
    expect(phoneKey(undefined)).toBeNull();
  });

  it('берёт последние 10 цифр, если в строке есть добавочный', () => {
    // «+7 912 345 67 89 доб. 101» → 79123456789101 → хвост 3456789101.
    // Ключ уезжает — и это осознанный предел v1: добавочный номер живёт
    // отдельным полем, а не внутри основного.
    expect(phoneKey('+7 912 345 67 89 доб. 101')).toBe('3456789101');
  });
});

describe('extractEmail', () => {
  it('находит адрес в середине строки', () => {
    expect(extractEmail('пиши на p.ivanov@romashka.ru, отвечу днём')).toBe('p.ivanov@romashka.ru');
  });

  it('находит адрес с плюсом и дефисами в домене', () => {
    expect(extractEmail('a.b+tag@sub-domain.example.com')).toBe('a.b+tag@sub-domain.example.com');
  });

  it('возвращает первый адрес, если их несколько', () => {
    expect(extractEmail('one@a.ru и two@b.ru')).toBe('one@a.ru');
  });

  it('возвращает null, если адреса нет', () => {
    expect(extractEmail('Иванов Пётр, тел 8-912-345-67-89')).toBeNull();
    expect(extractEmail('собака@ — не адрес')).toBeNull();
    expect(extractEmail('')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// S-TG-3 — дедуп переехал сюда из `use-quick-capture.ts`: у правила стало два
// клиента (веб-виджет и бот). Тесты — на само правило, а не на источник строк:
// разойдясь, эти два дедупа завели бы из мессенджера дубль на тексте, где веб
// дубль показывает.
// ═══════════════════════════════════════════════════════

const CONTACTS = [
  { id: 'c1', first_name: 'Пётр', last_name: 'Иванов', email: 'P.Ivanov@Romashka.RU', phone: null },
  {
    id: 'c2',
    first_name: 'Анна',
    last_name: null,
    email: null,
    phone: '8 (912) 345-67-89',
    phones: [{ value: '+7 495 000-11-22' }],
  },
];

const COMPANIES = [
  { id: 'k1', name: 'ООО «Ромашка»', inn: INN10 },
  { id: 'k2', name: 'АО "Василёк"', inn: null },
];

describe('findCaptureDuplicate', () => {
  it('находит контакт по email без учёта регистра', () => {
    expect(
      findCaptureDuplicate({ contact: { email: 'p.ivanov@romashka.ru' } }, null, CONTACTS, COMPANIES),
    ).toEqual({ kind: 'contact', id: 'c1', label: 'Пётр Иванов', matchedBy: 'email' });
  });

  it('находит контакт по email, спрятанному в notes', () => {
    expect(
      findCaptureDuplicate(
        { contact: { email: '', notes: 'писать на p.ivanov@romashka.ru' } },
        null,
        CONTACTS,
        COMPANIES,
      )?.id,
    ).toBe('c1');
  });

  it('находит контакт по телефону в любом формате — ключ 10 цифр', () => {
    expect(findCaptureDuplicate({ contact: { phone: '+79123456789' } }, null, CONTACTS, COMPANIES)?.id).toBe('c2');
  });

  it('находит контакт по НЕОСНОВНОМУ телефону из phones', () => {
    // Мультителефон — единственная причина, по которой дедуп нельзя переложить
    // на PostgREST-фильтр: `phones` jsonb, подстроку в нём `cs` не найдёт.
    expect(findCaptureDuplicate({ contact: { phone: '8 495 0001122' } }, null, CONTACTS, COMPANIES)?.id).toBe('c2');
  });

  it('не печатает «null» в подписи контакта без фамилии', () => {
    const hit = findCaptureDuplicate({ contact: { phone: '+79123456789' } }, null, CONTACTS, COMPANIES);
    expect(hit?.label).toBe('Анна');
  });

  it('находит компанию по ИНН точно', () => {
    expect(findCaptureDuplicate({ company: { name: 'что угодно' } }, INN10, [], COMPANIES)).toEqual({
      kind: 'company',
      id: 'k1',
      label: 'ООО «Ромашка»',
      matchedBy: 'inn',
    });
  });

  it('находит компанию по названию без ОПФ, кавычек и регистра', () => {
    expect(findCaptureDuplicate({ company: { name: 'ЗАО Василёк' } }, null, [], COMPANIES)?.id).toBe('k2');
  });

  it('различает совпадение по ИНН и по названию — от этого зависит набор кнопок бота', () => {
    // S-TG-3-INN-DUP: «Всё равно создать» на совпадении по ИНН не может
    // сработать (уникальный индекс), на совпадении по названию — может.
    expect(
      findCaptureDuplicate({ company: { name: 'ООО Ромашка' } }, INN10, [], COMPANIES)?.matchedBy,
    ).toBe('inn');
    expect(
      findCaptureDuplicate({ company: { name: 'ООО Ромашка' } }, null, [], COMPANIES)?.matchedBy,
    ).toBe('name');
    expect(
      findCaptureDuplicate({ contact: { phone: '+79123456789' } }, null, CONTACTS, COMPANIES)
        ?.matchedBy,
    ).toBe('phone');
  });

  it('не ищет компанию по слишком короткому названию', () => {
    expect(findCaptureDuplicate({ company: { name: 'АО' } }, null, [], COMPANIES)).toBeNull();
  });

  it('контакт имеет приоритет над компанией при заполненных обеих ветках', () => {
    // Подпись в письме почти всегда несёт и человека, и его работодателя;
    // «уже есть» про человека точнее, чем про компанию.
    const hit = findCaptureDuplicate(
      { contact: { email: 'p.ivanov@romashka.ru' }, company: { name: 'ООО Ромашка' } },
      INN10,
      CONTACTS,
      COMPANIES,
    );
    expect(hit).toEqual({ kind: 'contact', id: 'c1', matchedBy: 'email', label: 'Пётр Иванов' });
  });

  it('возвращает null, когда сверять нечем', () => {
    expect(findCaptureDuplicate({ contact: { email: '', phone: '' } }, null, CONTACTS, COMPANIES)).toBeNull();
    expect(findCaptureDuplicate({}, null, CONTACTS, COMPANIES)).toBeNull();
  });
});

describe('normalizeCompanyName', () => {
  // ⚠️ Регрессия S-TG-3: до этого спринта ОПФ не срезалась НИКОГДА — `\b` в JS
  // определён через [A-Za-z0-9_], и рядом с кириллицей границы слова нет.
  it('срезает ОПФ — кириллическую, вопреки \\b', () => {
    expect(normalizeCompanyName('ООО «Ромашка»')).toBe('ромашка');
    expect(normalizeCompanyName('ЗАО Василёк')).toBe('василёк');
    expect(normalizeCompanyName('ИП Петров')).toBe('петров');
  });

  it('приводит разные написания одной компании к одному ключу', () => {
    const forms = ['ООО «Ромашка»', 'ООО "Ромашка"', 'ооо ромашка', 'Ромашка', 'ООО"Ромашка"'];
    expect(new Set(forms.map(normalizeCompanyName)).size).toBe(1);
  });

  it('не съедает ОПФ внутри слова', () => {
    // «АО» как часть названия — не форма собственности.
    expect(normalizeCompanyName('Аокомпания')).toBe('аокомпания');
    expect(normalizeCompanyName('Заозёрье')).toBe('заозёрье');
  });

  it('схлопывает лишние пробелы и пустое', () => {
    expect(normalizeCompanyName('  ООО   «Ромашка»  ')).toBe('ромашка');
    expect(normalizeCompanyName('ООО')).toBe('');
    expect(normalizeCompanyName('')).toBe('');
  });
});
