# dashboard-crm — контракт работы для Claude Code

Тонкая страховка на случай, если сессия поднялась **без** скилла `crm-architect`.
Полная память проекта — в `~/.claude/skills/crm-architect/` (SKILL.md + references/).
Актуальная программа работ — `improvements/CRM-ROADMAP-2*.md` и `_analysis/`.

## Стек (не менять)

Next.js 15 App Router · TypeScript strict · Tailwind · Supabase (Postgres + RLS + Edge)
· TanStack Query · Zustand (UI-state) · RHF + Zod. Деплой — **Vercel**, авто из `main`; `vercel.json` нет, настройки в дашборде.
Supabase ref: `uoiavcabxgdjugzryrmj`, Postgres 17.6. Применённые миграции — **001–100**,
следующая свободная — **101** (060 зарезервирована и не занята — не возвращаться к ней).
Edge-функции (на 2026-08-03): `ai-run` — **version 7**, `ai-summarize` — **version 5**,
`webhook-dispatch` — **version 2**.

⚠️ **Миграции `069`–`073` записаны в `supabase_migrations.schema_migrations` без числового
префикса** — греп по номеру их не находит. Сверять ledger целиком, а не грепом: на этом
уже дважды делался ложный вывод «миграция не применена» про применённую.

## Жёсткие правила

1. **Миграции не применять.** Писать `supabase/migrations/0NN_name.sql` и коммитить.
   Применяет гейт Cowork (apply_migration → gen-types → advisors → ролевые смоки).
   Прод-БД из CC не трогать: мутаторы Supabase MCP закрыты `deny` в
   `.claude/settings.local.json`; `execute_sql` оставлен **только** под read-only
   разведку (`information_schema`, `pg_policies`, `pg_get_functiondef`) — писать им запрещено
   контрактом, система прав этого не различает.
2. **`src/types/supabase.gen.ts` и `src/types/database.ts` руками не правятся** —
   только регенерация (реген через MCP не отдаёт блок `graphql_public`, который отдаёт
   CLI → в диф придут ~28 ложных удалений; сверять).
3. **`.env` и секреты не читать.**
4. **Разведка перед правкой.** Живая БД — источник истины по схеме, не папка миграций,
   не `docs/schema.md` и не этот файл.
   **Номер следующей миграции берётся запросом к `supabase_migrations.schema_migrations`,
   а не из этого файла и не из папки.** В папке номера теряются (047 и 088a применены без
   файла), в этом файле — устаревают. Шапка выше — справка на момент правки, не контракт.
5. **`docs/schema.md` обновляется тем же PR, что миграция.** Плюс копия в скилле.
6. **Отчёт о сделанном называть отчётом** — не нумерованным планом с распределением
   ответственности.
7. **`window.confirm` / `confirm()` запрещены.** Подтверждение опасного действия — примитив
   `InlineConfirm` (`src/components/ui/InlineConfirm.tsx`). Причина техническая: после
   «Prevent this page from creating additional dialogs» браузер возвращает `false` без
   диалога — кнопки удаления молча перестают работать; плюс `confirm` блокирует поток
   вместе с realtime-подпиской и останавливает браузерные смоки. `alert()` и `prompt()`
   не используются вовсе: ошибка — `toast`, ввод — форма или модалка. Держит eslint
   (`no-restricted-globals` + `no-restricted-properties` в `eslint.config.mjs`).

## Память проекта

- Память проекта — скилл `crm-architect`. **Источник истины — папка `crm-architect/`
  в этом репозитории**, а не копии на диске и в аккаунте.
- Правки памяти идут тем же PR, что код, и проходят гейт как обычный дифф.
- Применение — `scripts/skill-deploy.sh` (репо → `~/.claude/skills/` + пакет
  `crm-architect.skill`), проверка расхождения — `scripts/skill-verify.sh`.
  Направление одно: репо → производные. Обратной синхронизации нет и не заводить.
- `~/.claude/skills/crm-architect/` и аккаунтная копия (Claude.ai → Customize → Skills)
  — **производные**; править их напрямую запрещено: правка не переживёт следующую
  раскатку и не попадёт в ревью. Пакет загружать в аккаунт сразу после раскатки —
  иначе Cowork-сессии и гейт читают старую версию памяти.
- Журнал Claude Code (`~/.claude/projects/…/memory/`) остаётся вне git — это хроника
  спринтов; общие правила из него переносятся в `crm-architect/references/learnings.md`.

## Конвенции

- Хуки `src/lib/hooks/use-*.ts` (plural) · валидаторы `src/lib/validators/*.ts` (singular)
  · типы `src/types/database.ts` · UI `src/components/{domain}/` · чистый домен
  `src/lib/utils/` или `src/lib/domain/` · константы `src/lib/constants/`.
- **RLS org-first**: `org_id = current_org_id()` первым конъюнктом, роль через
  `current_org_role()`, ownership через `owner_id`/`created_by` (не `user_id`).
  Обе функции звать в initplan-обёртке `( select public.current_org_role() )` — иначе
  планировщик вызывает их построчно.
  Новые функции — `SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL
  (`revoke all from public, anon` → `grant execute to authenticated|service_role`).
- **Новая org-таблица.** `org_id not null references organizations(id) on delete cascade`;
  `created_by uuid default auth.uid() references public.profiles(id) on delete set null`
  (именно `profiles`, не `auth.users`); `created_at`/`updated_at`, второй — триггером на
  `public.update_updated_at()` (имя именно такое, не `set_updated_at`);
  `enable row level security`; `revoke all ... from anon` + явные
  `grant select, insert, update, delete ... to authenticated`.
  **Заморозка `org_id` — руками**, автоцикл 054 покрывает только таблицы, бывшие на момент 054:
  `before update of org_id ... when (old.org_id is distinct from new.org_id)` →
  `freeze_org_id()`, имя триггера `trg_aa_freeze_org_id` (порядок триггеров алфавитный).
  `set_org_id()` вешать **не** обязательно: в `segments`/`stage_requirements`/`invitations`
  `org_id` приходит явно из UI, и это осознанный выбор — в DEFINER-контексте
  `current_org_id()` может вернуть NULL.
- **`revoke truncate, references, trigger` в новой миграции писать не нужно** — 082 сузил
  дефолтные привилегии в корне (`alter default privileges ... revoke ... maintain`), новая
  таблица приходит с `authenticated = arwd` сама.
- **Hard delete.** Ни одной таблицы с `deleted_at` в проекте нет. Одинокий soft-delete не
  вводить — физический DELETE + CASCADE.
- **Никаких хардкод-цветов** — только CSS-переменные; правки тем скоупятся в `.t-aura {}` и т.п.
- `any` запрещён; для внешних payload — `unknown` + type guard.
- Единицы rem/em/clamp (px только для границ ≤ 2px). Эмодзи в UI нет — иконки Lucide.
- Тег `vYYYY.MM.N` на каждый закрытый эпик; после тега — `npx git-cliff -o CHANGELOG.md`
  тем же PR.

## Грабли, которые дороже всего (полный список — learnings.md скилла)

**Схема и триггеры**

- **На смене стадии два пересекающихся триггера** — `trg_sync_deal_stage_fields` и
  `trg_sync_project_stage`; порядок алфавитный, второй выигрывает. `status`/`probability`/
  `actual_close_date` из клиента **не писать никогда**. Расхождение не чинилось.
- **`pipelines`/`pipeline_stages` — глобальные словари**, не org-scoped: org-специфичные
  атрибуты стадий только отдельной таблицей `(org_id, stage_id, …)`.
- **`organizations` UPDATE — owner-only** (`org_update_owner`). `settings` — merge-запись
  (`{...current, ...patch}`), не литерал.
- **Таблицы в `public` создаются только миграциями.** Дефолты `supabase_admin` раздают полный
  набор включая `anon` и правке недоступны (`postgres` не член `supabase_admin`) — таблица,
  созданная через UI дашборда, приедет с широкими правами.
- **Workflow**: `wf.ran` — один проход автоматизаций на транзакцию; `set_field` whitelist —
  `next_step`/`pinned_note`/`next_action_date`/`probability`, **никогда** `stage_id`/`status`/`type`/`org_id`.
- **`check_stage_requirements` — DEFINER И с `EXECUTE` у `authenticated`, так и надо**:
  её зовёт модалка перехода стадии, guard внутри (`is_org_member` → 42501). Не «доводить до
  конвенции» — сломает переход из UI. Тем же принципом: 20 WARN
  `authenticated_security_definer_function_executable` в advisors — это RPC проекта, массово
  снимать `EXECUTE` нельзя, разбирать поштучно.
- **`meetings_select` зовёт `is_meeting_attendee(id)`** без обёртки; `(select …)` тут не
  лечит — аргумент-зависимый вызов даёт коррелированный подзапрос. Либо принять, либо
  редизайн видимости.

**SQL-ловушки, каждая стоила часов**

- **`relacl` — массив `aclitem`, `like` по склейке врёт.** `array_to_string(relacl,',') like
  '%authenticated=%m%'` жадно матчит через запятую и находит букву в правах *соседней* роли.
  Разбирать только поэлементно: `lateral unnest(coalesce(relacl,'{}'::aclitem[]))` +
  `split_part(split_part(a::text,'=',2),'/',1)`.
- **`information_schema.role_table_grants` не показывает `MAINTAIN`** — вью стандарта SQL,
  привилегия нестандартная. Фильтр `privilege_type='MAINTAIN'` вернёт 0 всегда.
- **`pg_get_functiondef()` падает на агрегатах** (`ERROR 42809 "array_agg" is an aggregate
  function`), текст ошибки не связан с запросом. Любой фильтр по телу функции — с `p.prokind='f'`.
- **CTE не видит собственный INSERT**: `with ins as (insert …), upd as (update … where id =
  (select id from ins))` даст 0 строк в UPDATE — snapshot транзакции. Смоки на
  INSERT→UPDATE→DELETE гнать отдельными statement'ами.
- **Ключ идемпотентности из `timestamptz` — только `to_char(… at time zone 'UTC',
  'YYYY-MM-DD HH24:MI:SS.US')`**, не `::text`: session `TimeZone`/`DateStyle` разводит ключи
  cron-прогона (UTC) и ручного вызова (MSK), и правило стреляет дважды.
- **Живое тело DEFINER-функции короче файла миграции** — Postgres не хранит комментарии в
  `prosrc`. Сверять по логике, не по длине.
- **`jsonb_agg` без `with ordinality` не сохраняет порядок** элементов массива.

**Фронт и сборка**

- **`npm run build` при живом `next dev` убивает dev-сервер** — билд гонять последним.
- Календарные вычисления из `timestamptz`: ключ дня — MSK (`mskDateKey`), бакеты Ганта — на
  UTC-полдне (`T12:00:00Z`), иначе off-by-one на границах суток/DST.
- Два `window.confirm` в `GanttTimeline.tsx` блокируют браузерные смоки.
- **Disabled-состояние делать настоящим `disabled`**, а не серым на вид: в SDP кнопка
  «Применить выбранное» выглядела неактивной, а клик молча ничего не делал.

## Что уже починено — не «исправлять» повторно

- **Гейт стадии больше не читает pre-update строку.** 078 добавил
  `check_stage_requirements(p_project_id, p_target_stage_id, p_row jsonb default null)`;
  `aa_enforce_stage_gate` передаёт `to_jsonb(NEW)`. `update({stage_id, ...поля})` одним
  запросом работает.
- **История смен стадий пишется** с 078: таблица `stage_transitions` +
  `trg_zy_log_stage_transition` (AFTER UPDATE OF stage_id). `stage_entered_at` по-прежнему
  хранит только текущее значение — история в таблице.
- **Гранты закрыты полностью** (080–082): широких привилегий нет ни у одной таблицы, `anon`
  пуст по всей схеме, гранты нигде не шире политик.
- **`organizations.settings` заведено** (076): `reconnect_days` проведён до UI и консьюмеров,
  `stage_dwell_defaults` описан в типах и Zod, но консьюмеров пока не имеет.
- **Sign-off чеклисты внедрения работают** (083/084): `checklist_templates` (org-словарь,
  2 сидированных шаблона) → `project_checklists` (экземпляр). Отметка — только через
  DEFINER-RPC `toggle_checklist_item` (`select … for update`, серверный штамп
  `checked_by`/`checked_at`); прямой UPDATE рядовому участнику закрыт политикой, и это
  смысл фичи, а не недосмотр. `check_delivery_completion` отдаёт третий ключ
  `open_checklist_items`, `enforce_delivery_completion` кладёт в `DETAIL` **весь** объект —
  `parseDeliveryGateError` умеет оба формата, не «упрощать» до одного.
  **Бэкфилла на существующие внедрения нет намеренно**: обязательные пункты сделали бы
  идущие проекты незавершаемыми.
