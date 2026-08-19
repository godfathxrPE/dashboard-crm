import { describe, it, expect } from 'vitest';
import {
  buildTaskCard,
  buildTaskDeadline,
  formatTaskDeadline,
  buildAppliedText,
  buildAppliedKeyboard,
  entityUrl,
  TASK_DEFAULT_HOUR,
  CAPTURE_APPLY_PREFIX,
  CAPTURE_CANCEL_PREFIX,
} from '../../supabase/functions/_shared/telegram-capture';

// ═══════════════════════════════════════════════════════
// S-TG-TASK-1 — карточка подтверждения задачи и разбор срока.
//
// Всё чистое: «сейчас» приходит ПАРАМЕТРОМ, `new Date()` внутри домена нет —
// иначе тест про «срок в прошлом» жил бы ровно до следующего запуска.
//
// Инвариант, который здесь охраняется: карточка показывает ВСЕ резолвы до
// нажатия «Создать», а не разрешённое пропускает молча. `trg_notify_task_assigned`
// уведомляет назначенного немедленно (AFTER INSERT) — откатить ошибочное
// назначение нечем.
// ═══════════════════════════════════════════════════════

const DRAFT = '11111111-2222-4333-8444-555555555555';
// Среда, 19 августа 2026, 14:30 МСК.
const NOW = new Date('2026-08-19T11:30:00Z');

describe('buildTaskDeadline — срок из даты и времени', () => {
  it('дата и время названы — берутся как есть, в МСК', () => {
    const d = buildTaskDeadline('2026-08-21', '10:30', NOW);
    expect(d.reason).toBe('ok');
    expect(d.iso).toBe('2026-08-21T07:30:00.000Z');
  });

  // ⚠️ НЕ ПОЛНОЧЬ. «До пятницы» с дедлайном 00:00 просрочивается в четверг
  //    вечером — задача рождается просроченной в самом обычном случае.
  it('время не названо → 18:00, а не 00:00', () => {
    const d = buildTaskDeadline('2026-08-21', '', NOW);
    expect(d.reason).toBe('ok');
    expect(d.iso).toBe('2026-08-21T15:00:00.000Z');
    expect(formatTaskDeadline(d.iso as string)).toContain(`${TASK_DEFAULT_HOUR}:00`);
  });

  it('даты нет — срока нет, и это не ошибка', () => {
    expect(buildTaskDeadline('', '', NOW)).toEqual({ iso: null, reason: 'empty' });
  });

  // Модель, ошибившаяся с годом или неделей, не должна молча создавать
  // просроченную задачу: пустой срок с объяснением человек заметит, просрочку
  // на день назад — нет.
  it('дата в прошлом → срок не проставлен', () => {
    const d = buildTaskDeadline('2026-08-18', '', NOW);
    expect(d.reason).toBe('past');
    expect(d.iso).toBeNull();
  });

  it('сегодняшний день с уже прошедшим временем — тоже прошлое', () => {
    expect(buildTaskDeadline('2026-08-19', '09:00', NOW).reason).toBe('past');
  });

  it.each([['22.08.2026'], ['2026-13-01'], ['2026-02-31'], ['завтра']])(
    'непригодная дата «%s» → invalid, а не выдуманный срок',
    (raw) => {
      expect(buildTaskDeadline(raw, '', NOW).reason).toBe('invalid');
    },
  );

  it('мусорное время игнорируется, дата остаётся', () => {
    const d = buildTaskDeadline('2026-08-21', '25:99', NOW);
    expect(d.reason).toBe('ok');
    expect(d.iso).toBe('2026-08-21T15:00:00.000Z');
  });
});

describe('formatTaskDeadline — срок словами', () => {
  // ⚠️ С ДНЁМ НЕДЕЛИ. «21.08» глазами не проверить, «пятница, 21 августа» —
  //    можно, и именно на дне недели ловится ошибка модели в неделе. Сам этот
  //    тест её и поймал: 22 августа 2026 — суббота, а не пятница.
  it('день недели, дата и время по МСК', () => {
    expect(formatTaskDeadline('2026-08-21T15:00:00.000Z')).toBe('пятница, 21 августа, 18:00');
  });

  it('вечер по UTC — уже следующий день по МСК', () => {
    expect(formatTaskDeadline('2026-08-21T21:30:00.000Z')).toBe('суббота, 22 августа, 00:30');
  });
});

describe('buildTaskCard — карточка со всеми полями', () => {
  const card = buildTaskCard({
    draftId: DRAFT,
    text: 'Подготовить КП по маркировке для Тандера',
    deadline: buildTaskDeadline('2026-08-21', '', NOW),
    priority: 'normal',
    assignee: { reason: 'ok', label: 'Андрей Молявин', hint: 'Андрею' },
    project: { reason: 'ok', label: 'Тандер — внедрение ЧЗ', hint: 'по Тандеру' },
    company: { reason: 'empty' },
  });

  it('текст задачи, срок и резолвы — все на месте', () => {
    expect(card.text).toContain('<b>Задача</b>');
    expect(card.text).toContain('Подготовить КП по маркировке для Тандера');
    expect(card.text).toContain('Срок: пятница, 21 августа, 18:00');
    expect(card.text).toContain('Исполнитель: Андрей Молявин');
    expect(card.text).toContain('Сделка: Тандер — внедрение ЧЗ');
  });

  it('пустое упоминание строки не даёт — её неоткуда взять', () => {
    expect(card.text).not.toContain('Компания');
  });

  it('показывается ИМЯ ЗАПИСИ, а не подсказка модели', () => {
    expect(card.text).not.toContain('«Андрею»');
  });

  // Черновик несёт kind='task', и RPC берёт ветку из строки БД — пятый префикс
  // не нужен, а каждый новый префикс это новый шанс на пересечение при разборе.
  it('кнопки — существующие префиксы, новых не заведено', () => {
    const row = card.reply_markup.inline_keyboard[0];
    expect(row[0].callback_data).toBe(CAPTURE_APPLY_PREFIX + DRAFT);
    expect(row[1].callback_data).toBe(CAPTURE_CANCEL_PREFIX + DRAFT);
  });
});

describe('buildTaskCard — не разрешённое показывается с причиной', () => {
  // ⚠️ МОЛЧАЛИВЫЙ ПРОПУСК — ЭТО ТИХАЯ ДЕГРАДАЦИЯ, А НЕ ПОЛОМКА: человек жмёт
  //    «Создать», считая, что исполнитель проставлен, и узнаёт обратное потом.
  it('исполнитель не найден — строка с подсказкой и что делать', () => {
    const card = buildTaskCard({
      draftId: DRAFT,
      text: 'Позвонить в Ромашку',
      deadline: { iso: null, reason: 'empty' },
      assignee: { reason: 'not_found', hint: 'Андрею' },
    });
    expect(card.text).toContain('Исполнитель: «Андрею» — не нашёл, назначьте в CRM');
  });

  it('несколько совпадений по сделке — выбор остаётся за человеком', () => {
    const card = buildTaskCard({
      draftId: DRAFT,
      text: 'Собрать статус',
      deadline: { iso: null, reason: 'empty' },
      project: { reason: 'ambiguous', hint: 'по тандеру' },
    });
    expect(card.text).toContain('Сделка: «по тандеру» — несколько совпадений, привяжите в CRM');
  });

  it('без срока строки о сроке нет вовсе', () => {
    const card = buildTaskCard({
      draftId: DRAFT,
      text: 'Позвонить Иванову',
      deadline: { iso: null, reason: 'empty' },
    });
    expect(card.text).not.toContain('Срок');
  });

  it('срок в прошлом — сказано прямо, с исходной подсказкой', () => {
    const card = buildTaskCard({
      draftId: DRAFT,
      text: 'Отправить акт',
      deadline: buildTaskDeadline('2026-08-18', '', NOW),
      deadlineHint: '2026-08-18',
    });
    expect(card.text).toContain('«2026-08-18» — срок в прошлом, не проставлен');
  });

  it('приоритет показывается, только если он не обычный', () => {
    const base = { draftId: DRAFT, text: 'Позвонить', deadline: { iso: null, reason: 'empty' as const } };
    expect(buildTaskCard({ ...base, priority: 'normal' }).text).not.toContain('Приоритет');
    expect(buildTaskCard({ ...base, priority: 'critical' }).text).toContain('Приоритет: срочно');
    expect(buildTaskCard({ ...base, priority: 'important' }).text).toContain('Приоритет: важно');
  });
});

describe('экранирование', () => {
  // Название с амперсандом без экранирования роняет sendMessage ЦЕЛИКОМ —
  // карточка не приходит вообще.
  it('HTML в тексте задачи и в именах записей экранируется', () => {
    const card = buildTaskCard({
      draftId: DRAFT,
      text: 'Выставить счёт ООО «Ромашка & Ко»',
      deadline: { iso: null, reason: 'empty' },
      company: { reason: 'ok', label: 'ООО «Ромашка & Ко»' },
      project: { reason: 'not_found', hint: '<b>сделка</b>' },
    });
    expect(card.text).toContain('Ромашка &amp; Ко');
    expect(card.text).not.toMatch(/Ромашка & Ко/);
    expect(card.text).toContain('&lt;b&gt;сделка&lt;/b&gt;');
  });
});

describe('сообщение об успехе', () => {
  it('задача названа задачей', () => {
    expect(buildAppliedText('task', 'Подготовить КП')).toBe('✓ Задача создана: Подготовить КП');
  });

  // ⚠️ У ЗАДАЧИ НЕТ СВОЕЙ СТРАНИЦЫ: маршрута `/tasks/<id>` в приложении не
  //    существует, и собранная «по аналогии» ссылка вела бы на 404.
  it('кнопка ведёт на /tasks, id в путь не подставляется', () => {
    const kb = buildAppliedKeyboard('https://crm.example.com', 'task', DRAFT);
    expect(kb.inline_keyboard[0][0].url).toBe('https://crm.example.com/tasks');
    expect(entityUrl('https://crm.example.com', 'task', DRAFT)).toBe('https://crm.example.com/tasks');
  });

  it('ссылки на контакт и компанию не изменились', () => {
    expect(entityUrl('https://crm.example.com', 'contact', DRAFT)).toBe(
      `https://crm.example.com/contacts/${DRAFT}`,
    );
    expect(entityUrl('https://crm.example.com', 'company', DRAFT)).toBe(
      `https://crm.example.com/companies/${DRAFT}`,
    );
  });
});
