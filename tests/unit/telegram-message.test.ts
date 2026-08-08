import { describe, it, expect } from 'vitest';
import {
  buildTelegramNotificationText,
  escapeTelegramHtml,
  notificationPath,
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
