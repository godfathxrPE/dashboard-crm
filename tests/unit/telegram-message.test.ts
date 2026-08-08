import { describe, it, expect } from 'vitest';
import {
  buildTaskKeyboard,
  buildTelegramNotificationText,
  escapeTelegramHtml,
  notificationPath,
  parseTaskCallbackData,
  shouldAttachTaskKeyboard,
  TELEGRAM_APP_ORIGIN_FALLBACK,
} from '@/lib/domain/telegram-message';

// ⚠️ Тесты покрывают ЗЕРКАЛО, а не рантайм: боевой текст собирает SQL-функция
//    public.telegram_notification_text() (107). Смысл покрытия — правила формата
//    (заголовки типов, поведение при пустом payload, экранирование, маршруты):
//    SQL-функции в проекте тестового окружения не имеют, а ошибка в экранировании
//    ломает отправку молча. Расхождение зеркала с 107 — баг, а не «два варианта».

const ORIGIN = TELEGRAM_APP_ORIGIN_FALLBACK;
const DEAL_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';

describe('escapeTelegramHtml', () => {
  it('экранирует три символа parse_mode HTML', () => {
    expect(escapeTelegramHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });

  it('амперсанд обрабатывается ПЕРВЫМ — иначе «&lt;» стало бы «&amp;lt;»', () => {
    expect(escapeTelegramHtml('<')).toBe('&lt;');
    expect(escapeTelegramHtml('&lt;')).toBe('&amp;lt;');
  });

  it('кавычки не трогает: текст, а не значение атрибута', () => {
    expect(escapeTelegramHtml('ООО «Ромашка» "тест"')).toBe('ООО «Ромашка» "тест"');
  });
});

describe('buildTelegramNotificationText — шесть боевых типов', () => {
  it('task_assigned: заголовок, текст задачи, ссылка на доску', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_assigned',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { title: 'Позвонить клиенту' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Назначена задача</b>\nПозвонить клиенту\n${ORIGIN}/tasks`);
  });

  it('project_assigned: ссылка на сделку', () => {
    expect(
      buildTelegramNotificationText({
        type: 'project_assigned',
        entity_type: 'projects',
        entity_id: DEAL_ID,
        payload: { title: 'Внедрение ERP' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Назначена сделка</b>\nВнедрение ERP\n${ORIGIN}/deals/${DEAL_ID}`);
  });

  it('deal_won: тело — CTA, а не просто имя сделки', () => {
    expect(
      buildTelegramNotificationText({
        type: 'deal_won',
        entity_type: 'projects',
        entity_id: DEAL_ID,
        payload: { title: 'Ромашка' },
        appUrl: ORIGIN,
      }),
    ).toBe(
      `<b>Сделка выиграна</b>\nСделка «Ромашка» выиграна — создайте внедрение\n${ORIGIN}/deals/${DEAL_ID}`,
    );
  });

  it('deal_won без title: CTA сохраняется, имя просто выпадает', () => {
    expect(
      buildTelegramNotificationText({
        type: 'deal_won',
        entity_type: 'projects',
        entity_id: DEAL_ID,
        payload: {},
        appUrl: ORIGIN,
      }),
    ).toBe(
      `<b>Сделка выиграна</b>\nСделка выиграна — создайте внедрение\n${ORIGIN}/deals/${DEAL_ID}`,
    );
  });

  it('automation: приоритет у payload.text (текст правила), не у title', () => {
    expect(
      buildTelegramNotificationText({
        type: 'automation',
        entity_type: 'projects',
        entity_id: DEAL_ID,
        payload: { title: 'Ромашка', text: 'Сделка застряла на стадии' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Автоматизация</b>\nСделка застряла на стадии\n${ORIGIN}/deals/${DEAL_ID}`);
  });

  it('automation по ЗАДАЧЕ (task_overdue) ведёт на /tasks, а не в /deals/{task_id}', () => {
    expect(
      buildTelegramNotificationText({
        type: 'automation',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { title: 'Отчёт', text: 'Задача просрочена: Отчёт' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Автоматизация</b>\nЗадача просрочена: Отчёт\n${ORIGIN}/tasks`);
  });

  it('spawn_suggest: deep-link с ?spawn=1', () => {
    expect(
      buildTelegramNotificationText({
        type: 'spawn_suggest',
        entity_type: 'projects',
        entity_id: DEAL_ID,
        payload: { title: 'Ромашка' },
        appUrl: ORIGIN,
      }),
    ).toBe(
      `<b>Пора создать внедрение</b>\nСделка «Ромашка» — пора создать внедрение\n${ORIGIN}/deals/${DEAL_ID}?spawn=1`,
    );
  });

  it('webhook_disabled: своего роута нет — ведём в настройки', () => {
    expect(
      buildTelegramNotificationText({
        type: 'webhook_disabled',
        entity_type: 'webhook_endpoint',
        entity_id: DEAL_ID,
        payload: { title: null },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Вебхук отключён</b>\nВебхук отключён\n${ORIGIN}/settings`);
  });
});

describe('buildTelegramNotificationText — экранирование', () => {
  it('амперсанд в имени компании не роняет parse_mode HTML', () => {
    expect(
      buildTelegramNotificationText({
        type: 'deal_won',
        entity_type: 'projects',
        entity_id: DEAL_ID,
        payload: { title: 'ООО «Ромашка & Ко»' },
        appUrl: ORIGIN,
      }),
    ).toBe(
      `<b>Сделка выиграна</b>\nСделка «ООО «Ромашка &amp; Ко»» выиграна — создайте внедрение\n${ORIGIN}/deals/${DEAL_ID}`,
    );
  });

  it('угловые скобки из payload не становятся разметкой', () => {
    const out = buildTelegramNotificationText({
      type: 'task_assigned',
      entity_type: 'tasks',
      entity_id: TASK_ID,
      payload: { title: '<b>жирный</b> заголовок' },
      appUrl: ORIGIN,
    });
    expect(out).toContain('&lt;b&gt;жирный&lt;/b&gt; заголовок');
    // Единственная настоящая разметка — обёртка заголовка, добавленная нами.
    expect(out.match(/<b>/g)).toHaveLength(1);
  });
});

describe('buildTelegramNotificationText — базовый URL', () => {
  const base = {
    type: 'task_assigned',
    entity_type: 'tasks',
    entity_id: TASK_ID,
    payload: { title: 'Задача' },
  } as const;

  it('нет app_url — сообщение уходит БЕЗ ссылки (лучше, чем ссылка в никуда)', () => {
    expect(buildTelegramNotificationText({ ...base, appUrl: null })).toBe(
      '<b>Назначена задача</b>\nЗадача',
    );
  });

  it('пустая строка — тоже без ссылки', () => {
    expect(buildTelegramNotificationText({ ...base, appUrl: '' })).toBe(
      '<b>Назначена задача</b>\nЗадача',
    );
  });

  it('http (не https) отвергается', () => {
    expect(buildTelegramNotificationText({ ...base, appUrl: 'http://crm.local' })).toBe(
      '<b>Назначена задача</b>\nЗадача',
    );
  });

  it('URL с символами разметки отвергается целиком — экранировать ссылку не нужно', () => {
    expect(buildTelegramNotificationText({ ...base, appUrl: 'https://x.dev/?a=1&b=2' })).toBe(
      '<b>Назначена задача</b>\nЗадача',
    );
  });

  it('хвостовой слэш не даёт двойного «//»', () => {
    expect(buildTelegramNotificationText({ ...base, appUrl: 'https://crm.example.com/' })).toBe(
      '<b>Назначена задача</b>\nЗадача\nhttps://crm.example.com/tasks',
    );
  });

  it('порт и подпуть допустимы', () => {
    expect(buildTelegramNotificationText({ ...base, appUrl: 'https://crm.local:8443/app' })).toBe(
      '<b>Назначена задача</b>\nЗадача\nhttps://crm.local:8443/app/tasks',
    );
  });
});

describe('buildTelegramNotificationText — деградация', () => {
  it('пустой payload: тело = заголовок типа', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_assigned',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: null,
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Назначена задача</b>\nНазначена задача\n${ORIGIN}/tasks`);
  });

  it('title из пробелов равен отсутствию title', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_assigned',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { title: '   ' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Назначена задача</b>\nНазначена задача\n${ORIGIN}/tasks`);
  });

  it('неизвестный тип (будущая миграция) не роняет сборку', () => {
    expect(
      buildTelegramNotificationText({
        type: 'mention_in_chat',
        entity_type: 'messages',
        entity_id: TASK_ID,
        payload: { title: 'Вас упомянули' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Уведомление</b>\nВас упомянули\n${ORIGIN}/tasks`);
  });
});

describe('notificationPath — зеркало entityRoute из NotificationBell', () => {
  it('порядок веток: tasks-автоматизация проверяется ДО общей automation', () => {
    expect(notificationPath('automation', 'tasks', TASK_ID)).toBe('/tasks');
    expect(notificationPath('automation', 'projects', DEAL_ID)).toBe(`/deals/${DEAL_ID}`);
  });

  it('неизвестный тип уходит на доску задач', () => {
    expect(notificationPath('whatever', 'whatever', TASK_ID)).toBe('/tasks');
  });
});

// ═══════════════════════════════════════════════════════
// S-TG-2 (108): седьмой тип и кнопка «Выполнено»
// ═══════════════════════════════════════════════════════

describe('buildTelegramNotificationText — task_reminder (108)', () => {
  it('готовую строку планировщика берёт из payload.text', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_reminder',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { title: 'Отправить КП', text: '«Отправить КП» — срок 09.08 14:00 МСК · ERP' },
        appUrl: ORIGIN,
      }),
    ).toBe(
      `<b>Скоро дедлайн</b>\n«Отправить КП» — срок 09.08 14:00 МСК · ERP\n${ORIGIN}/tasks`,
    );
  });

  it('без проекта — та же форма, просто без хвоста', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_reminder',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { title: 'Позвонить', text: '«Позвонить» — срок 09.08 14:00 МСК' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Скоро дедлайн</b>\n«Позвонить» — срок 09.08 14:00 МСК\n${ORIGIN}/tasks`);
  });

  it('planner не собрал text — падаем на title, а не на пустоту', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_reminder',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { title: 'Позвонить' },
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Скоро дедлайн</b>\nПозвонить\n${ORIGIN}/tasks`);
  });

  it('пустой payload — тело равно заголовку типа', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_reminder',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: null,
        appUrl: ORIGIN,
      }),
    ).toBe(`<b>Скоро дедлайн</b>\nСкоро дедлайн\n${ORIGIN}/tasks`);
  });

  it('амперсанд в названии компании не роняет parse_mode HTML', () => {
    const out = buildTelegramNotificationText({
      type: 'task_reminder',
      entity_type: 'tasks',
      entity_id: TASK_ID,
      payload: { title: 'КП', text: '«КП для ООО «Ромашка & Ко»» — срок 09.08 14:00 МСК' },
      appUrl: ORIGIN,
    });
    expect(out).toContain('Ромашка &amp; Ко');
    expect(out).not.toContain('Ромашка & Ко');
  });

  it('без app_url — уходит без ссылки', () => {
    expect(
      buildTelegramNotificationText({
        type: 'task_reminder',
        entity_type: 'tasks',
        entity_id: TASK_ID,
        payload: { text: 'Срок сегодня' },
        appUrl: null,
      }),
    ).toBe('<b>Скоро дедлайн</b>\nСрок сегодня');
  });

  it('маршрут — доска задач', () => {
    expect(notificationPath('task_reminder', 'tasks', TASK_ID)).toBe('/tasks');
  });
});

describe('task_reminder — приоритет в заголовке (109, S-TG-PRIORITY)', () => {
  // Тело одно и то же во всех кейсах: проверяем ровно заголовок.
  const withPriority = (priority?: string | null) =>
    buildTelegramNotificationText({
      type: 'task_reminder',
      entity_type: 'tasks',
      entity_id: TASK_ID,
      payload: { title: 'Отправить КП', text: 'Срок сегодня', ...(priority !== undefined ? { priority } : {}) },
      appUrl: ORIGIN,
    });

  const head = (out: string) => out.slice(0, out.indexOf('\n'));

  it('important → « · важно»', () => {
    expect(head(withPriority('important'))).toBe('<b>Скоро дедлайн · важно</b>');
  });

  it('critical → « · критично»', () => {
    expect(head(withPriority('critical'))).toBe('<b>Скоро дедлайн · критично</b>');
  });

  it('normal → без приписки: маркер у всех — это отсутствие маркера', () => {
    expect(head(withPriority('normal'))).toBe('<b>Скоро дедлайн</b>');
  });

  // ⚠️ ГЛАВНЫЙ КЕЙС 1: уведомления, созданные ДО 109, лежат в базе без этого ключа.
  it('ключа priority нет вовсе — обратная совместимость', () => {
    expect(head(withPriority(undefined))).toBe('<b>Скоро дедлайн</b>');
    // Полное сообщение обязано остаться ровно тем, что было до 109.
    expect(withPriority(undefined)).toBe(`<b>Скоро дедлайн</b>\nСрок сегодня\n${ORIGIN}/tasks`);
  });

  // ⚠️ ГЛАВНЫЙ КЕЙС 2: мусор в payload не роняет сборку и не съедает заголовок.
  it('неизвестное значение — деградация до пустой приписки, не до NULL', () => {
    expect(head(withPriority('мусор'))).toBe('<b>Скоро дедлайн</b>');
    expect(head(withPriority(null))).toBe('<b>Скоро дедлайн</b>');
    expect(head(withPriority(''))).toBe('<b>Скоро дедлайн</b>');
    // Приписка не должна протечь в текст ни в каком виде.
    expect(withPriority('мусор')).not.toContain('undefined');
    expect(withPriority('мусор')).not.toContain('мусор');
  });

  it('приоритет НЕ добавляется к чужим типам — граница фикса', () => {
    const out = buildTelegramNotificationText({
      type: 'task_assigned',
      entity_type: 'tasks',
      entity_id: TASK_ID,
      payload: { title: 'Позвонить', priority: 'critical' },
      appUrl: ORIGIN,
    });
    expect(head(out)).toBe('<b>Назначена задача</b>');
  });
});

describe('buildTaskKeyboard / shouldAttachTaskKeyboard', () => {
  it('callback_data строго tgdone:<uuid>', () => {
    expect(buildTaskKeyboard(TASK_ID)).toEqual({
      inline_keyboard: [[{ text: '✓ Выполнено', callback_data: `tgdone:${TASK_ID}` }]],
    });
  });

  it('укладывается в лимит Telegram 64 байта', () => {
    const data = buildTaskKeyboard(TASK_ID).inline_keyboard[0][0].callback_data;
    expect(new TextEncoder().encode(data).length).toBeLessThanOrEqual(64);
  });

  it('кнопку получают только задачные типы', () => {
    expect(shouldAttachTaskKeyboard('task_assigned', 'tasks')).toBe(true);
    expect(shouldAttachTaskKeyboard('task_reminder', 'tasks')).toBe(true);
  });

  it('automation про задачу кнопки НЕ получает — это просрочка, а не «отметь»', () => {
    expect(shouldAttachTaskKeyboard('automation', 'tasks')).toBe(false);
  });

  it('сделка кнопки не получает даже с задачным типом', () => {
    expect(shouldAttachTaskKeyboard('task_assigned', 'projects')).toBe(false);
    expect(shouldAttachTaskKeyboard('deal_won', 'projects')).toBe(false);
  });
});

describe('parseTaskCallbackData — разбор чужого ввода', () => {
  it('валидная кнопка отдаёт id задачи', () => {
    expect(parseTaskCallbackData(`tgdone:${TASK_ID}`)).toBe(TASK_ID);
  });

  it('чужой префикс отвергается', () => {
    expect(parseTaskCallbackData(`tgstage:${TASK_ID}`)).toBeNull();
    expect(parseTaskCallbackData(`done:${TASK_ID}`)).toBeNull();
    // Префикс обязан быть в НАЧАЛЕ, а не где-нибудь внутри.
    expect(parseTaskCallbackData(`x:tgdone:${TASK_ID}`)).toBeNull();
  });

  it('мусор вместо uuid отвергается', () => {
    expect(parseTaskCallbackData('tgdone:')).toBeNull();
    expect(parseTaskCallbackData('tgdone:not-a-uuid')).toBeNull();
    expect(parseTaskCallbackData("tgdone:' or 1=1--")).toBeNull();
  });

  it('верхний регистр и обёртки — не наш формат', () => {
    // ⚠️ uuid С БУКВАМИ: у TASK_ID из одних цифр toUpperCase() — no-op, и тест
    //    прошёл бы, даже будь регэксп регистронезависимым.
    const hex = 'abcdef01-2345-4abc-8def-0123456789ab';
    expect(parseTaskCallbackData(`tgdone:${hex}`)).toBe(hex);
    expect(parseTaskCallbackData(`tgdone:${hex.toUpperCase()}`)).toBeNull();
    expect(parseTaskCallbackData(`tgdone:{${hex}}`)).toBeNull();
  });

  it('хвост после uuid отвергается — форма проверяется целиком', () => {
    expect(parseTaskCallbackData(`tgdone:${TASK_ID}extra`)).toBeNull();
    expect(parseTaskCallbackData(`tgdone:${TASK_ID} `)).toBeNull();
  });

  it('слишком длинная строка отвергается ДО разбора: лимит транспорта 64 байта', () => {
    expect(parseTaskCallbackData(`tgdone:${TASK_ID}${'x'.repeat(40)}`)).toBeNull();
  });

  it('null / undefined / не строка', () => {
    expect(parseTaskCallbackData(null)).toBeNull();
    expect(parseTaskCallbackData(undefined)).toBeNull();
    expect(parseTaskCallbackData('')).toBeNull();
  });
});
