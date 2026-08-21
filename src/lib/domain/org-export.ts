/**
 * S-EXPORT-1 — состав выгрузки организации.
 *
 * Модуль ЧИСТЫЙ: ни Supabase, ни React. Всё, что можно проверить без сети —
 * состав экспорта, имя файла, разбор ответа RPC — живёт здесь и покрыто
 * `tests/unit/org-export.test.ts`.
 *
 * ⚠️ Список таблиц продублирован здесь и в SQL-массиве миграции
 * `supabase/migrations/126_org_export.sql`. Дубль ОСОЗНАННЫЙ: SQL-массив —
 * исполняемый контракт (в жёстко заданном литерале, не из аргумента функции),
 * TS-список — документированный, с причиной по каждому исключению. Расхождение
 * двух списков ловит тест, а не прод.
 */

/**
 * Состав экспорта — контракт, а не «все таблицы с org_id».
 * Слепой дамп всех 50 org-таблиц вынес бы наружу секреты (`webhook_endpoints`
 * ссылается на Vault) и мусор очередей, а при восстановлении в другой системе
 * эти строки бесполезны.
 */
export const EXPORT_TABLES = [
  // Ядро CRM
  'companies', 'contacts', 'contact_company', 'leads', 'deal_stakeholders',
  'projects', 'project_members', 'project_columns', 'project_checklists',
  'project_baselines', 'baseline_tasks',
  'tasks', 'task_dependencies', 'recurring_task_templates',
  'calls', 'scheduled_calls', 'meetings', 'transcripts', 'quotes',
  'stage_transitions', 'stage_requirements', 'segments',
  'conversations', 'conversation_members', 'messages', 'message_reactions',
  'kpi_entries', 'call_tracker_days', 'activity_log',
  'delivery_templates', 'delivery_template_phases', 'delivery_template_tasks',
  'checklist_templates', 'automation_rules',
] as const;

export type ExportTable = (typeof EXPORT_TABLES)[number];

/**
 * НЕ экспортируется. Причина у каждой — иначе следующий спринт вернёт их «до кучи».
 *
 * `telegram_updates` — единственная в списке БЕЗ `org_id` (две колонки:
 * `update_id`, `received_at`), то есть в 50 org-таблиц она не входит вовсе.
 * Оставлена здесь намеренно: без строки её отсутствие читалось бы как недосмотр.
 */
export const EXCLUDED_TABLES = {
  webhook_endpoints:       'secret_id ссылается на Vault — выгрузка секретов наружу',
  webhook_deliveries:      'журнал доставки, не данные организации',
  telegram_accounts:       'привязка к аккаунту Telegram — не переносится в другую систему',
  telegram_outbox:         'очередь транспорта',
  telegram_updates:        'журнал идемпотентности (без org_id, глобальный)',
  telegram_link_tokens:    'одноразовые токены привязки',
  telegram_capture_drafts: 'черновики разбора, живут минуты',
  notifications:           'производное от задач и сделок',
  automation_runs:         'журнал прогонов, не данные',
  ai_runs:                 'журнал прогонов AI; токены и цены — внутренняя телеметрия',
  conversation_reads:      'состояние прочитанности, персональное',
  invitations:             'приглашения с токенами',
  memberships:             'состав организации выгружается отдельно, в meta',
  activities:              'мёртвая таблица, не пополняется с 15.07 (дубль activity_log)',
  project_files:           'метаданные без самих файлов вводят в заблуждение — S-EXPORT-2',
  project_videos:          'то же: ссылки без содержимого — S-EXPORT-2',
  message_attachments:     'то же: ссылки на бакет без файлов — S-EXPORT-2',
} as const;

export type ExcludedTable = keyof typeof EXCLUDED_TABLES;

/** Версия формата. Меняется вместе с составом — читающая сторона обязана сверять. */
export const EXPORT_FORMAT = 'dashboard-crm/org-export@1';

/** Один член организации в выгрузке. */
export interface OrgExportMember {
  profile_id: string;
  role: string;
}

export interface OrgExportMeta {
  org_id: string;
  exported_at: string;
  exported_by: string | null;
  format: string;
  tables: string[];
}

export interface OrgExportPayload {
  meta: OrgExportMeta;
  members: OrgExportMember[];
  data: Record<string, unknown[]>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Сужение ответа RPC. Возврат `supabase.rpc` — `unknown` (`any` запрещён
 * контрактом проекта), а сохранять на диск то, чью форму не проверили, нельзя:
 * пустой или чужой ответ уехал бы в файл под именем выгрузки.
 */
export function isOrgExportPayload(v: unknown): v is OrgExportPayload {
  if (!isRecord(v)) return false;
  if (!isRecord(v.meta) || typeof v.meta.org_id !== 'string') return false;
  if (typeof v.meta.format !== 'string') return false;
  if (!Array.isArray(v.members)) return false;
  if (!isRecord(v.data)) return false;
  return Object.values(v.data).every(Array.isArray);
}

/** Сколько строк реально выгружено — для тоста и для сверки на гейте. */
export function countExportedRows(payload: OrgExportPayload): number {
  return Object.values(payload.data).reduce((sum, rows) => sum + rows.length, 0);
}

/**
 * Имя файла выгрузки.
 *
 * ⚠️ Дата ЛОКАЛЬНАЯ, не `toISOString()`. В UTC+ поясах вечер уже следующий день
 * по UTC: в 23:30 MSK файл назывался бы завтрашним числом. Ровно эта off-by-one
 * ошибка уже правилась в проекте (`localDateKey`, `learnings.md`); здесь она
 * повторена в чистом виде, чтобы модуль не тащил зависимость ради трёх строк.
 */
export function orgExportFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `dashboard-crm-export-${y}-${m}-${d}.json`;
}

/**
 * Короткая строка «что входит / что нет» под кнопкой. Живёт рядом со списками,
 * чтобы правка состава не забыла обновить подпись в UI.
 */
export const EXPORT_SCOPE_HINT =
  `В файл идут ${EXPORT_TABLES.length} таблиц с бизнес-данными: компании, контакты, ` +
  'сделки, проекты, задачи, звонки, встречи, чат, журнал действий, шаблоны. ' +
  'Не входят: секреты и вебхуки, очереди Telegram, журналы прогонов AI и автоматизаций, ' +
  'уведомления, приглашения и сами файлы из хранилища — только их данные.';
