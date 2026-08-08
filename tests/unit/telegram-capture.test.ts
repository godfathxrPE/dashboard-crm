import { describe, it, expect } from 'vitest';
import {
  parseCaptureCallbackData,
  buildCaptureCard,
  buildAppliedText,
  buildAppliedKeyboard,
  entityUrl,
  escapeTelegramHtml,
  captureLabel,
  CAPTURE_APPLY_PREFIX,
  CAPTURE_CANCEL_PREFIX,
  CAPTURE_AS_CONTACT_PREFIX,
  CAPTURE_AS_COMPANY_PREFIX,
} from '../../supabase/functions/_shared/telegram-capture';
import { TASK_DONE_PREFIX } from '@/lib/domain/telegram-message';

// ═══════════════════════════════════════════════════════
// S-TG-3 — карточка подтверждения быстрого ввода и формат её кнопок.
//
// Всё чистое: ни сети, ни времени, ни моков. Тестируется ЕДИНСТВЕННЫЙ источник
// (`supabase/functions/_shared/telegram-capture.ts`), который в рантайме читает
// Deno-функция, — а не его копия. Импорт относительным путём именно поэтому.
//
// Главное, ради чего тест написан: пересечение префиксов. `tgcap` без двоеточия
// жадно матчит `tgcapx`, `tgcapc` и `tgcapo` — «Отмена» выполнилась бы как
// «Создать», причём молча и только в проде.
// ═══════════════════════════════════════════════════════

const ID = '3f8a1c22-9d4e-4b1a-8c77-2e5f0a1b6d34';
const ID2 = '11111111-2222-3333-4444-555555555555';
const APP = 'https://dashboard-crm-ten.vercel.app';

describe('parseCaptureCallbackData — префиксы', () => {
  it('разбирает все четыре действия', () => {
    expect(parseCaptureCallbackData(`${CAPTURE_APPLY_PREFIX}${ID}`)).toEqual({
      action: 'apply',
      draftId: ID,
      kind: null,
    });
    expect(parseCaptureCallbackData(`${CAPTURE_CANCEL_PREFIX}${ID}`)).toEqual({
      action: 'cancel',
      draftId: ID,
      kind: null,
    });
    expect(parseCaptureCallbackData(`${CAPTURE_AS_CONTACT_PREFIX}${ID}`)).toEqual({
      action: 'as_contact',
      draftId: ID,
      kind: 'contact',
    });
    expect(parseCaptureCallbackData(`${CAPTURE_AS_COMPANY_PREFIX}${ID}`)).toEqual({
      action: 'as_company',
      draftId: ID,
      kind: 'company',
    });
  });

  it('НЕ путает tgcap: с tgcapx:/tgcapc:/tgcapo: — двоеточие часть префикса', () => {
    // Если бы префиксом был `tgcap` без двоеточия, все три легли бы в 'apply',
    // и «Отмена» создавала бы запись.
    for (const [data, action] of [
      [`${CAPTURE_CANCEL_PREFIX}${ID}`, 'cancel'],
      [`${CAPTURE_AS_CONTACT_PREFIX}${ID}`, 'as_contact'],
      [`${CAPTURE_AS_COMPANY_PREFIX}${ID}`, 'as_company'],
    ] as const) {
      expect(parseCaptureCallbackData(data)?.action).toBe(action);
    }
  });

  it('не берёт чужой префикс задачи (tgdone:) — это другая доменная область', () => {
    expect(parseCaptureCallbackData(`${TASK_DONE_PREFIX}${ID}`)).toBeNull();
  });

  it('отвергает мусор, чужие формы uuid и пустое', () => {
    expect(parseCaptureCallbackData(null)).toBeNull();
    expect(parseCaptureCallbackData(undefined)).toBeNull();
    expect(parseCaptureCallbackData('')).toBeNull();
    expect(parseCaptureCallbackData('tgcap:')).toBeNull();
    expect(parseCaptureCallbackData('tgcap:not-a-uuid')).toBeNull();
    expect(parseCaptureCallbackData(`tgcap:${ID.toUpperCase()}`)).toBeNull();
    expect(parseCaptureCallbackData(`tgcap:{${ID}}`)).toBeNull();
    expect(parseCaptureCallbackData(`tgcapz:${ID}`)).toBeNull();
    expect(parseCaptureCallbackData(`${ID}`)).toBeNull();
  });

  it('отвергает данные длиннее лимита Telegram (64 байта)', () => {
    expect(parseCaptureCallbackData(`${CAPTURE_APPLY_PREFIX}${ID}${'x'.repeat(40)}`)).toBeNull();
  });

  it('реальные callback_data укладываются в лимит', () => {
    for (const p of [
      CAPTURE_APPLY_PREFIX,
      CAPTURE_CANCEL_PREFIX,
      CAPTURE_AS_CONTACT_PREFIX,
      CAPTURE_AS_COMPANY_PREFIX,
    ]) {
      expect(new TextEncoder().encode(`${p}${ID}`).length).toBeLessThanOrEqual(64);
    }
  });
});

describe('escapeTelegramHtml', () => {
  it('экранирует & < > с амперсандом первым', () => {
    expect(escapeTelegramHtml('ООО «Ромашка & Ко»')).toBe('ООО «Ромашка &amp; Ко»');
    expect(escapeTelegramHtml('<b>x</b>')).toBe('&lt;b&gt;x&lt;/b&gt;');
    // Амперсанд не должен съедать собственные подстановки.
    expect(escapeTelegramHtml('a < b & c')).toBe('a &lt; b &amp; c');
  });
});

describe('buildCaptureCard — компания', () => {
  const company = {
    name: 'ООО «Ромашка»',
    inn: '7707083893',
    kpp: '770701001',
    legal_address: 'Москва, ул. Ленина 10',
    address: 'фактический',
    email: 'info@romashka.ru',
    phone: '+7 999 123-45-67',
    website: 'romashka.ru',
  };

  it('собирает карточку с реквизитами и двумя кнопками', () => {
    const card = buildCaptureCard({ draftId: ID, kind: 'company', company, appUrl: APP });
    expect(card.text).toContain('<b>Компания</b>');
    expect(card.text).toContain('ООО «Ромашка»');
    expect(card.text).toContain('ИНН 7707083893 · КПП 770701001');
    // Юрадрес реестра важнее фактического из текста.
    expect(card.text).toContain('Москва, ул. Ленина 10');
    expect(card.text).not.toContain('фактический');

    expect(card.reply_markup.inline_keyboard).toEqual([
      [
        { text: 'Создать', callback_data: `${CAPTURE_APPLY_PREFIX}${ID}` },
        { text: 'Отмена', callback_data: `${CAPTURE_CANCEL_PREFIX}${ID}` },
      ],
    ]);
  });

  it('без ИНН строку реквизитов не печатает', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      company: { name: 'ООО «Ромашка»' },
    });
    expect(card.text).toBe('<b>Компания</b>\nООО «Ромашка»');
    expect(card.text).not.toContain('ИНН');
    expect(card.text).not.toContain('КПП');
  });

  it('ИНН без КПП печатает только ИНН', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      company: { name: 'ИП Петров', inn: '500100732259' },
    });
    expect(card.text).toContain('ИНН 500100732259');
    expect(card.text).not.toContain('КПП');
  });

  it('экранирует HTML в названии — иначе sendMessage падает целиком', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      company: { name: 'ООО «Ромашка & Ко»' },
    });
    expect(card.text).toContain('ООО «Ромашка &amp; Ко»');
    expect(card.text).not.toMatch(/Ромашка & /);
  });

  it('пустая компания не оставляет карточку без тела', () => {
    const card = buildCaptureCard({ draftId: ID, kind: 'company', company: {} });
    expect(card.text).toContain('Полей не нашлось');
  });
});

describe('buildCaptureCard — контакт', () => {
  it('собирает имя, должность и контакты', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'contact',
      contact: {
        first_name: 'Иван',
        last_name: 'Петров',
        position: 'Коммерческий директор',
        email: 'ivan@romashka.ru',
        phone: '+7 999 123-45-67',
      },
    });
    expect(card.text).toBe(
      '<b>Контакт</b>\nИван Петров\nКоммерческий директор\nivan@romashka.ru · +7 999 123-45-67',
    );
  });

  it('без фамилии не печатает «null»', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'contact',
      contact: { first_name: 'Иван', last_name: null },
    });
    expect(card.text).toBe('<b>Контакт</b>\nИван');
    expect(card.text).not.toContain('null');
  });
});

describe('buildCaptureCard — дубль', () => {
  const dup = { kind: 'company' as const, id: ID2, label: 'ООО «Ромашка»', matchedBy: 'name' as const };

  it('показывает существующее и даёт три кнопки', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      company: { name: 'ООО «Ромашка»' },
      duplicate: dup,
      appUrl: APP,
    });
    expect(card.text).toContain('Похоже, это уже есть');
    expect(card.text).toContain('ООО «Ромашка»');
    expect(card.reply_markup.inline_keyboard).toEqual([
      [
        { text: 'Открыть в CRM', url: `${APP}/companies/${ID2}` },
        { text: 'Всё равно создать', callback_data: `${CAPTURE_APPLY_PREFIX}${ID}` },
      ],
      [{ text: 'Отмена', callback_data: `${CAPTURE_CANCEL_PREFIX}${ID}` }],
    ]);
  });

  it('без валидного app_url url-кнопки нет — Telegram отверг бы сообщение целиком', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      duplicate: dup,
      appUrl: 'не ссылка',
    });
    const flat = card.reply_markup.inline_keyboard.flat();
    expect(flat.some((b) => 'url' in b)).toBe(false);
    expect(flat.some((b) => b.text === 'Всё равно создать')).toBe(true);
    expect(card.text).toContain('Ссылку на запись собрать не удалось');
  });

  it('экранирует подпись дубля', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      duplicate: { ...dup, label: 'ООО «Ромашка & Ко»' },
      appUrl: APP,
    });
    expect(card.text).toContain('ООО «Ромашка &amp; Ко»');
  });

  it('совпадение по ИНН — «Всё равно создать» НЕТ (кнопка не может сработать)', () => {
    // Вставка упрётся в uq_companies_org_inn: кнопка, которая гарантированно не
    // выполнится, — дефект интерфейса, и честный ответ RPC (111) её не оправдывает.
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      company: { name: 'ООО «Ромашка»', inn: '7707083893' },
      duplicate: { ...dup, matchedBy: 'inn' },
      appUrl: APP,
    });
    expect(card.reply_markup.inline_keyboard).toEqual([
      [{ text: 'Открыть в CRM', url: `${APP}/companies/${ID2}` }],
      [{ text: 'Отмена', callback_data: `${CAPTURE_CANCEL_PREFIX}${ID}` }],
    ]);
    // Пропавшая кнопка без объяснения читается как сбой бота.
    expect(card.text).toContain('Совпадает ИНН');
  });

  it('совпадение по ИНН без валидного app_url не оставляет пустой ряд кнопок', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      duplicate: { ...dup, matchedBy: 'inn' },
      appUrl: null,
    });
    expect(card.reply_markup.inline_keyboard).toEqual([
      [{ text: 'Отмена', callback_data: `${CAPTURE_CANCEL_PREFIX}${ID}` }],
    ]);
  });

  it('совпадение по названию — все три кнопки на месте', () => {
    // Два юрлица с похожими названиями и разными ИНН — обычное дело.
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'company',
      duplicate: { ...dup, matchedBy: 'name' },
      appUrl: APP,
    });
    expect(card.reply_markup.inline_keyboard.flat().map((b) => b.text)).toEqual([
      'Открыть в CRM',
      'Всё равно создать',
      'Отмена',
    ]);
    expect(card.text).not.toContain('Совпадает ИНН');
  });

  it('на unclear дубль всё равно требует выбрать ветку', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'unclear',
      duplicate: dup,
      appUrl: APP,
    });
    const flat = card.reply_markup.inline_keyboard.flat();
    expect(flat.map((b) => b.text)).toEqual(['Открыть в CRM', 'Контакт', 'Компания', 'Отмена']);
    // «Всё равно создать» на невыбранной ветке применило бы неизвестно что.
    expect(flat.some((b) => b.text === 'Всё равно создать')).toBe(false);
  });
});

describe('buildCaptureCard — unclear', () => {
  it('показывает обе ветки и спрашивает, а не угадывает', () => {
    const card = buildCaptureCard({
      draftId: ID,
      kind: 'unclear',
      contact: { first_name: 'Иван', last_name: 'Петров' },
      company: { name: 'ООО «Ромашка»' },
    });
    expect(card.text).toContain('<b>Как контакт</b>');
    expect(card.text).toContain('Иван Петров');
    expect(card.text).toContain('<b>Как компанию</b>');
    expect(card.text).toContain('ООО «Ромашка»');
    expect(card.text).toContain('Что создать из этого текста?');

    expect(card.reply_markup.inline_keyboard).toEqual([
      [
        { text: 'Контакт', callback_data: `${CAPTURE_AS_CONTACT_PREFIX}${ID}` },
        { text: 'Компания', callback_data: `${CAPTURE_AS_COMPANY_PREFIX}${ID}` },
      ],
      [{ text: 'Отмена', callback_data: `${CAPTURE_CANCEL_PREFIX}${ID}` }],
    ]);
  });

  it('обе ветки пустые — говорит об этом, а не показывает пустую карточку', () => {
    const card = buildCaptureCard({ draftId: ID, kind: 'unclear' });
    expect(card.text).toContain('Разобрать не удалось');
  });
});

describe('entityUrl', () => {
  it('собирает пути карточек — зеркало openExisting в QuickCapture', () => {
    expect(entityUrl(APP, 'company', ID)).toBe(`${APP}/companies/${ID}`);
    expect(entityUrl(APP, 'contact', ID)).toBe(`${APP}/contacts/${ID}`);
  });

  it('срезает хвостовые слэши', () => {
    expect(entityUrl(`${APP}//`, 'contact', ID)).toBe(`${APP}/contacts/${ID}`);
  });

  it('отвергает всё, что не похоже на базовый URL', () => {
    // Регэксп намеренно уже «валидного URL»: `&`, пробел и http:// сюда не проходят,
    // иначе Telegram отверг бы сообщение целиком (BUTTON_URL_INVALID).
    expect(entityUrl('http://insecure.example', 'contact', ID)).toBeNull();
    expect(entityUrl('https://x.example/?a=1&b=2', 'contact', ID)).toBeNull();
    expect(entityUrl('https://x.example /p', 'contact', ID)).toBeNull();
    expect(entityUrl('', 'contact', ID)).toBeNull();
    expect(entityUrl(null, 'contact', ID)).toBeNull();
    expect(entityUrl(undefined, 'contact', ID)).toBeNull();
  });
});

describe('captureLabel', () => {
  it('контакт — имя и фамилия, без «null» на пустой фамилии', () => {
    expect(captureLabel('contact', { first_name: 'Иван', last_name: 'Петров' }, null)).toBe(
      'Иван Петров',
    );
    expect(captureLabel('contact', { first_name: 'Иван', last_name: null }, null)).toBe('Иван');
    expect(captureLabel('contact', {}, null)).toBe('');
  });

  it('компания — название', () => {
    expect(captureLabel('company', null, { name: 'ООО «Ромашка»' })).toBe('ООО «Ромашка»');
    expect(captureLabel('company', null, {})).toBe('');
  });
});

describe('buildAppliedText / buildAppliedKeyboard', () => {
  it('текст без разметки и без экранирования — правка идёт без parse_mode', () => {
    // Амперсанд обязан доехать как есть: с parse_mode HTML эта правка упала бы,
    // и человек не узнал бы, что запись создана.
    expect(buildAppliedText('company', 'ООО «Ромашка & Ко»')).toBe(
      '✓ Компания создана: ООО «Ромашка & Ко»',
    );
    expect(buildAppliedText('contact', 'Иван Петров')).toBe('✓ Контакт создан: Иван Петров');
    expect(buildAppliedText('contact', '')).toBe('✓ Контакт создан');
  });

  it('клавиатура — одна ссылка либо пустая (снимает кнопки)', () => {
    expect(buildAppliedKeyboard(APP, 'contact', ID)).toEqual({
      inline_keyboard: [[{ text: 'Открыть в CRM', url: `${APP}/contacts/${ID}` }]],
    });
    expect(buildAppliedKeyboard(null, 'contact', ID)).toEqual({ inline_keyboard: [] });
  });

  it('исход duplicate_inn — «уже заведена», а не «создана» (S-TG-3-INN-DUP)', () => {
    expect(buildAppliedText('company', 'ООО «Ромашка»', 'duplicate_inn')).toBe(
      '• Компания с этим ИНН уже заведена: ООО «Ромашка»',
    );
    // Название могло не найтись (запись удалили между падением вставки и поиском):
    // сообщение обязано остаться читаемым и без «undefined»/«null» в нём.
    expect(buildAppliedText('company', '', 'duplicate_inn')).toBe(
      '• Компания с этим ИНН уже заведена',
    );
    for (const t of [
      buildAppliedText('company', '', 'duplicate_inn'),
      buildAppliedText('company', 'ООО «Ромашка»', 'duplicate_inn'),
    ]) {
      expect(t).not.toContain('undefined');
      expect(t).not.toContain('null');
    }
  });

  it('на duplicate_inn с id ссылка есть, без id — клавиатура пустая', () => {
    // Ссылка в никуда хуже её отсутствия: то же правило, что у `v_link` в
    // `telegram_notification_text`. Ветку «нет id» собирает capture.ts — здесь
    // фиксируется, что сборщик клавиатуры на валидном id даёт ровно одну ссылку.
    expect(buildAppliedKeyboard(APP, 'company', ID2)).toEqual({
      inline_keyboard: [[{ text: 'Открыть в CRM', url: `${APP}/companies/${ID2}` }]],
    });
    expect(buildAppliedKeyboard(APP, 'company', ID2).inline_keyboard[0][0].url).not.toContain(
      'undefined',
    );
  });
});
