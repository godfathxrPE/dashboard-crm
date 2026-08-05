import { describe, it, expect } from 'vitest';
import {
  hasValidInnChecksum,
  extractInn,
  phoneKey,
  extractEmail,
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
