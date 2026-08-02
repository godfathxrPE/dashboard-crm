# S-R2-FIELD-AUDIT — аудит критичных полей сделки в БД, с «было → стало»

**Ветка:** `feat/r2-field-audit` от `main`. **Миграция 087.** Один коммит.
Порядок деплоя: **миграция → фронт** (см. «Окно двойных записей»).

R2-P2 «Team scale», спринт 2 — второй и последний из кластера «дешёвые хвосты». Эпик **G1**
из `improvements/CRM-ROADMAP-2.md` §5. Вход в фазу и порядок — `claude/review-R2-P2-entry-reconciliation.md`.

**Трудоёмкость: ~6–8 ч. Риск средний** — миграция аддитивная (колонок не добавляет), но
клиентское логирование удаляется целиком, а лента активности читается в четырёх местах.

**Ревью Грока нет** (лимиты) — секция «Самопроверка» обязательна.

---

## WHY

Сегодня в системе нет аудита изменений сделки. Есть его имитация.

Факты из разведки (ветка `main`, коммит `a0eae8b`):

| Что | Как сейчас |
|---|---|
| Кто пишет | клиент — `use-projects.ts:522`, `logActivity(id, 'project_updated', { fields_changed })` |
| Что пишет | **только имена колонок**: `fields_changed = Object.keys(vars)` |
| Значения | нет ни одного; единственное «старое значение» в системе — `ctx.fromStageId` из React-Query кеша, и только для стадии |
| Реальность изменения | не проверяется: в патче может лежать то же значение, что уже в БД — запись всё равно появится |
| Обход | любой UPDATE мимо UI (SQL, автоматизация `set_field` из 079, будущие интеграции) не пишет ничего |
| DB-триггеры | логируют только удаления (6 × `log_delete_*`) и `automation_fired`. Изменения полей — ни один из 13 триггеров на `projects` |

То есть на вопрос «кто снизил бюджет с 12 до 8 миллионов и когда» система сегодня отвечает
«28 июля кто-то менял бюджет» — и только если это делали через интерфейс.

**Как это решено в бенчмарках** (три платформы, §5 указывает Salesforce):

- **Salesforce Field History Tracking** — отдельный объект `<Object>History` со строками
  `field / oldValue / newValue / createdBy / createdDate`. Ключевое ограничение платформы:
  **до 20 полей на объект**, включается вручную. То есть Salesforce не пишет всё — он требует
  выбрать критичные поля. Значения хранятся как текст.
- **HubSpot property history** — пишет историю **каждого** property автоматически, показывает в
  timeline «Deal amount changed from X to Y». Цена: таймлайн зашумлён служебными изменениями,
  и HubSpot отдельно фильтрует их в UI.
- **Pipedrive changelog** — середина: пишет всё, но в UI выводит только «важные» поля, остальное
  под «показать все изменения».

Берём модель Salesforce (whitelist критичных полей), потому что она даёт то же, что HubSpot,
без зашумления ленты, которую в этом проекте читают четыре компонента. И храним значения
`from/to`, как все три — без них аудит не отвечает на вопрос «сколько было».

## WHAT

1. Миграция **087**: триггерная функция + триггер `trg_zy_log_field_audit` на `projects`,
   пишущая в существующую `activity_log` (новых таблиц и колонок нет).
2. Формат `payload` — надмножество текущего: остаётся `fields_changed`, добавляется `changes`
   с `from`/`to`. Старый рендер продолжает работать без правок фронта.
3. Клиентское логирование `project_updated` и `stage_changed` **удаляется** — единый источник.
4. `describeEvent` учится показывать «было → стало», сохраняя ветку для старых записей.

---

## HOW — миграция 087

### Whitelist аудитируемых полей

Три класса обработки. Поля вне списка не аудитируются вовсе.

| Класс | Поля | Что в payload |
|---|---|---|
| **Значения** | `budget`, `probability`, `deadline`, `actual_close_date`, `next_action_date`, `status`, `direction`, `name`, `delivery_kind` | `{from, to}` как текст |
| **Ссылки с резолвом** | `owner_id` (→ `profiles.full_name`), `stage_id` (→ `pipeline_stages.name`), `company_id` (→ `companies.name`), `contact_id` (→ `contacts`), `pipeline_id` (→ `pipelines.name`) | `{from, to, from_name, to_name}` — UUID в ленте не читается |
| **Факт без значения** | `next_step`, `pinned_note`, `loss_detail`, `won_detail`, `do_url`, `loss_reason`, `won_reason`, `lost_reason` | ключ в `fields_changed`, в `changes` — `{changed: true}` |

**Не аудитируются, с обоснованием:**

- `progress_done` / `progress_total` — пересчитываются триггером задач, каждая закрытая
  подзадача давала бы запись «прогресс 4 → 5». Это уже видно как `task_completed`.
- `stage_entered_at`, `updated_at`, `do_synced_at` — служебные метки времени.
- `org_id` — заморожен `trg_aa_freeze_org_id`, измениться не может.
- `type`, `parent_deal_id` — задаются при создании и спавне, UPDATE-путей в UI нет.
- `created_by`, `created_at`, `id` — неизменяемые по смыслу.

### Ключевое правило: смена стадии — одно событие, не пять

`sync_deal_stage_fields` и `sync_project_stage` (оба BEFORE) при смене `stage_id`
**сами перезаписывают** `probability`, `status`, `actual_close_date`, `stage_entered_at` —
проверено в живой БД, тела функций читаны. Наивный diff по whitelist на переходе
«Лид → Эксперимент» выдал бы четыре записи вместо одной.

Поэтому:

```
если NEW.stage_id IS DISTINCT FROM OLD.stage_id:
    event_type = 'stage_changed'
    payload = {
      from_stage_id, to_stage_id,
      from_name, to_name,                     -- из pipeline_stages
      fields_changed: [прочие изменённые непроизводные поля],   -- если есть
      changes: { <те же поля>: {from, to} }                     -- если есть
    }
    -- probability / status / actual_close_date / stage_entered_at НЕ включаем:
    -- они производные от перехода
иначе если есть изменения в whitelist:
    event_type = 'project_updated'
    payload = { fields_changed: [...], changes: {...} }
иначе:
    ничего не пишем
```

Это ровно та логика, что сейчас на клиенте (`STAGE_DERIVED_FIELDS`, `use-projects.ts:451-466`),
включая исправление из S-R2-TRANSITION-1b — но с двумя отличиями: она видит `OLD`, поэтому
пишет **реально изменившиеся** поля, а не ключи патча; и её нельзя обойти.

### Скелет функции

Стиль обязателен как в `078_stage_transition_core.sql:273-301` и `083`:

```sql
create or replace function public.log_project_field_audit()
returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_changes jsonb := '{}'::jsonb;
  v_fields  text[] := '{}';
  ...
begin
  -- 1. собрать diff по whitelist (сравнение через IS DISTINCT FROM — NULL-safe)
  -- 2. если stage_id менялся — вычесть производные поля
  -- 3. резолв имён для ссылочных полей
  -- 4. если ни fields, ни stage-перехода — return new без записи
  insert into public.activity_log (project_id, user_id, org_id, event_type, payload)
  values (new.id, auth.uid(), new.org_id, v_event, v_payload);
  return new;
exception when others then
  -- Аудит НЕ блокирует бизнес-операцию (тот же контракт, что log_stage_transition 078:262)
  return new;
end;
$$;

alter function public.log_project_field_audit() owner to postgres;
revoke all on function public.log_project_field_audit() from public, anon, authenticated;
grant execute on function public.log_project_field_audit() to service_role;

drop trigger if exists trg_zy_log_field_audit on public.projects;
create trigger trg_zy_log_field_audit
  after update on public.projects
  for each row
  execute function public.log_project_field_audit();
```

**Имя триггера — `trg_zy_log_field_audit`, не иначе.** Порядок срабатывания в PG алфавитный
(конвенция выписана в `078:265-272`): `trg_aa_*` гейты → нотификации → `trg_zy_*` аудит →
`trg_zz_run_automations`. Алфавитно `trg_zy_log_field_audit` встаёт перед
`trg_zy_log_stage_transition` — обе только пишут, порядок между ними безразличен.

**`user_id` может быть NULL** — при вызове из cron (`run_dwell_automations` из 079) `auth.uid()`
пуст. Так же ведёт себя `051_task_overdue.sql:107-112`. Не «чинить» подстановкой `owner_id`:
подпись «изменил владелец» там, где изменил планировщик, — ложь в аудите.

### Попутно: индекс под ленту

`useRecentActivity` (`use-activity-log.ts:38-56`) делает
`select … neq(event_type, …) order by created_at desc limit N` без `project_id`. Существующие
индексы — `(org_id)` и `(project_id, created_at desc)`; сортировку по org это не покрывает.

```sql
create index if not exists idx_activity_log_org_created
  on public.activity_log (org_id, created_at desc);
```

Индекса по `event_type` не заводить: три хука фильтруют его через `neq`, такой предикат
неселективен и индекс не использует.

### Что миграция НЕ делает

- Не добавляет колонок в `activity_log` ⇒ **`supabase.gen.ts` и `database.ts` не меняются**,
  реген типов не нужен.
- Не трогает RLS. Действующая SELECT-политика — «owner/admin видят все записи org, остальные
  только свои `user_id = auth.uid()`». Следствие, которое надо принять сознательно: менеджер
  не увидит в ленте изменения, сделанные другим менеджером, и не увидит записи от cron
  (`user_id is null`). Это текущая семантика `activity_log`, а не регресс этого спринта —
  менять её здесь не будем, вопрос сам собой закроется в задаче про роль РОП
  (`claude/backlog-role-sales-lead.md`, предикат `can_see_all_deals()`).
- Не бэкфиллит. Старые 658 записей за 30 дней остаются в формате `fields_changed` без значений
  — восстановить `from/to` не из чего.

---

## HOW — фронт

### 1. Удалить клиентское логирование

`src/lib/hooks/use-projects.ts`, `useUpdateProject`:

- убрать оба вызова `logActivity` (стр. 512 `stage_changed`, стр. 522 `project_updated`);
- убрать `STAGE_DERIVED_FIELDS` (451-466) — правило переехало в SQL;
- убрать `fromStageId` из `onMutate`/контекста, если после этого он больше нигде не нужен;
- убрать `usePipelineStagesMap()` из хука, если он использовался только для резолва имён в лог
  (проверить: он может использоваться и для другого).

Оптимистичный UI, `onError`-восстановление и инвалидацию **не трогать** — это не про лог.

### 2. `describeEvent` — показать «было → стало»

`src/lib/utils/activity-events.ts`. Обе ветки (`project_updated`, `stage_changed`) должны
работать **с `changes` и без него**:

```
если payload.changes есть → «Бюджет: 10.0M → 12.0M ₽», «Ответственный: Олег → Иван»
если нет                  → текущий рендер по fields_changed («Обновлено: бюджет»)
```

Формат значений по типу поля:

| Поле | Как показывать |
|---|---|
| `budget` | `formatBudget` — те же «10.0M ₽», что в таблицах |
| `probability` | `30% → 60%` |
| `deadline`, `actual_close_date`, `next_action_date` | `d MMM` локалью `ru-RU`, `null` → «не задан» |
| `owner_id`, `company_id`, `contact_id`, `stage_id` | `from_name → to_name`, при отсутствии имени — «—» (UUID не показывать НИКОГДА) |
| `status` | человеческие метки, уже есть в проекте |
| поля класса «факт» | как сейчас, лейблом из `FIELD_LABELS` |

Больше двух изменённых полей в одной строке — «Бюджет: 10.0M → 12.0M ₽ и ещё 2». Лента узкая
(в `ActivityDrawer` строка одна, `nowrap` + ellipsis — см. п.6 бэклога).

`FIELD_LABELS` уже покрывает 20 колонок — переиспользовать, не переписывать.

### 3. Ничего больше не править

`useActivityLog`, `useRecentActivity`, `use-entity-timeline`, `EntityTimeline`,
`ActivityDrawer`, `ProjectPeekContent`, `DashboardHome` берут текст из `describeEvent` —
получат новый формат автоматически.

---

## Окно двойных записей — осознанный компромисс

Между применением 087 и деплоем фронта пишут **оба**: триггер и старый клиент. В ленте будут
пары записей на одно изменение.

Обратный порядок (фронт первым) даёт окно, в котором изменения не пишет **никто** — дыра в
аудите вместо дубля в ленте. Дубль честнее.

Окно закрывается мержем фронта в тот же день. Записи-дубли из окна не чистить: удаление строк
аудита ради косметики — плохая привычка, а сами дубли отличимы (у клиентской нет `changes`).

**Порядок из handoff соблюдён:** миграция → edge (нет) → фронт. Фронт мержится последним.

---

## Edge cases

| Случай | Ожидаемое поведение |
|---|---|
| UPDATE через SQL мимо UI | запись есть, `user_id = null` (`auth.uid()` пуст в service-контексте). **Это главный тест смысла эпика** |
| Автоматизация `set_field` (079) | запись есть, `user_id = null`, рядом свой `automation_fired`. Ожидаемо: два разных факта — правило сработало и поле изменилось |
| Патч с тем же значением (`budget: 12M → 12M`) | записи **нет** (`IS DISTINCT FROM`). Отличие от текущего поведения: сейчас запись появляется |
| Смена стадии с During-полями (`{stage_id, contact_id}`) | одна запись `stage_changed`, в `changes` — `contact_id` с именами, `probability`/`status`/`actual_close_date` исключены |
| Возврат со won-стадии назад | `status: won → open`, `actual_close_date: дата → null` — производные, в записи о переходе их нет |
| `apply-progression` (принятие AI-предложения) | две записи: свой `ai_progression_applied` + `project_updated` от триггера. Смысл разный (что применили / что стало), но в ленте рядом. Известный дубль — если раздражает, подавлять НЕ в этом спринте |
| Спавн внедрения | `spawn_delivery_project` создаёт проект (INSERT) — триггер AFTER UPDATE не срабатывает. Верно: создание уже видно иначе |
| Массовый UPDATE (N строк) | N записей, по одной на строку — `for each row`. Bulk-операций по сделкам в UI сейчас нет |
| Ошибка внутри аудита | `exception when others then return new` — UPDATE проходит, запись теряется молча. Так же ведут себя все аудит-триггеры проекта |
| Удалённый профиль в `owner_id` | резолв даёт NULL → «—», не падать |

---

## Тесты

**Юнит (обязательно):** `tests/unit/activity-events-changes.test.ts` — на `describeEvent`,
чистая функция, мокать нечего:

1. `project_updated` с `changes.budget` → строка содержит и старое, и новое значение в формате
   `formatBudget`.
2. `project_updated` **без** `changes` (старая запись) → текущий рендер «Обновлено: бюджет».
   Регресс-тест обратной совместимости, ключевой.
3. `owner_id` с `from_name`/`to_name` → имена; **UUID в строке отсутствует** (проверять
   `not.toContain(uuid)`).
4. `owner_id` без имён (профиль удалён) → «—», без падения.
5. `stage_changed` с `changes` → «Стадия: A → B» плюс перечисление прочих полей.
6. Три и более изменённых полей → «и ещё N».
7. `deadline: null → дата` и `дата → null` → «не задан» на нужной стороне.

**SQL-смоки (Cowork прогонит на гейте, в спринт-файл вписать ожидаемый результат):**

8. UPDATE бюджета от owner → одна запись `project_updated`, `changes.budget.from/to` верны.
9. UPDATE тем же значением → новых записей нет.
10. Смена стадии на won → **одна** запись `stage_changed`; в `changes` нет `probability`,
    `status`, `actual_close_date`.
11. UPDATE под ролью manager по своей сделке → запись с его `user_id`; проверить, что он её
    видит (SELECT под его JWT), а по чужой сделке — не видит.
12. UPDATE `progress_done` → записи нет (поле вне whitelist).

Полный набор тестов на все 20 поля не писать — покрыть по одному представителю каждого класса.

---

## Самопроверка (обязательна, ревью Грока нет)

1. **Двойная запись после деплоя фронта.** Оба `logActivity` из `use-projects.ts` удалены?
   `grep -n "logActivity" src/lib/hooks/use-projects.ts` пуст?
2. **Обратная совместимость ленты.** Запись без `changes` рендерится по-старому — есть тест?
   На проде 658 таких записей за 30 дней.
3. **UUID в UI.** Ни одна ветка `describeEvent` не может вывести сырой UUID — проверено тестом
   с отсутствующими именами.
4. **Производные поля.** На переходе стадии в `payload.changes` нет `probability`, `status`,
   `actual_close_date`, `stage_entered_at`?
5. **Имя и порядок триггера.** `trg_zy_log_field_audit`, `after update`, без `of <колонка>`
   (иначе пропустим часть полей). `trg_zz_run_automations` по-прежнему срабатывает после.
6. **Гранты и search_path.** `security definer` + `set search_path = public, pg_temp` +
   `owner to postgres` + `revoke … from public, anon, authenticated` + `grant execute … to
   service_role` — как в 078/083.
7. **Аудит не блокирует UPDATE.** `exception when others then return new` на месте; проверить
   искусственной ошибкой (например, временно сломать резолв имени) — UPDATE должен пройти.
8. **Типы.** Миграция не меняет колонок ⇒ `supabase.gen.ts` не трогался. `git diff` по нему пуст.
9. **`any` не введён.** `payload` читается как `unknown` + нарроуинг, не `any`.
10. **Не «доводить до конвенции».** `FIELD_LABELS`, `formatBudget`, `relativeTime`,
    `ENTITY_TYPE_LABEL` переиспользуются как есть.

---

## VERIFY / коммит

```bash
npx tsc --noEmit
npm test
npm run lint
npm run build      # последним, при остановленном next dev
```

Миграцию **не применять** — apply делает Cowork на гейте (`mcp__Supabase__apply_migration`),
затем advisors + ролевые смоки + независимая сверка SQL.

Коммит: `feat(audit): аудит критичных полей сделки в БД с «было → стало» (087)`

Ветка `feat/r2-field-audit`. Мерж и пуш — Олег, **после** apply миграции.

```
Type Safety:            [заполнить]
RLS Coverage:           [заполнить — политики не менялись; описать следствие для manager]
Backward Compatibility: [заполнить — старые записи без `changes` рендерятся; лента в 4 местах]
Runtime Tested:         [заполнить — юниты 1–7; SQL-смоки 8–12 за гейтом]
Regional Availability:  NOT_APPLICABLE
```

## Что НЕ делает Claude Code

- Не применяет миграцию и не трогает прод-БД.
- Не правит `supabase.gen.ts` / `database.ts` руками.
- Не читает `.env`.
- Не бэкфиллит старые записи и не удаляет дубли из окна деплоя.
- Не меняет RLS-политики `activity_log`.
- Отчёт — отчётом о сделанном.
