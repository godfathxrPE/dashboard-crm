# D3-Архитектура: модуль «Проекты» (delivery, внедрение маркировки) — v2

Дата: 2026-07-10. Режим: /architect D3. База — `_analysis/delivery-process-DO.md` (канонический
СДР из 1С:ДО), `crm-architect` schema (миграции 001–034), PCT-1 (project boards), паттерн
`convert_lead`. Стек неизменен: Next.js + TypeScript + Tailwind + Supabase.

> **v2:** учтён code-review (`_analysis/review-architecture-delivery-projects.md`). Исправлены
> два блокера, подтверждённые по живой БД: (1) существующий `projects_type_pipeline_chk`
> отвергал `type='delivery'` — без правки spawn не вставил бы ни строки; (2) триггер
> `trg_zz_seed_columns` сидировал generic-колонки на любой проект → у delivery было бы 8 колонок.
> Плюс: `ON DELETE RESTRICT`, свежесть прогресса, команда проекта, UI-контракт борда, оценка.

**Принцип (решён ранее):** CRM **зеркалит** delivery, а не заменяет 1С:ДО. Система-запись для
исполнения — 1С:Документооборот. CRM держит лёгкую карточку проекта: связь со сделкой, состояние
(4), ссылку в ДО, прогресс. Тяжёлый документооборот НЕ тащим. Это снимает ~80% объёма и риска.

---

## 1. CRM-аналогии

| Платформа | Deal → Delivery паттерн |
|---|---|
| **Salesforce** | Opportunity (Closed Won) → Project (PSA/Milestones или custom object). Раздельные объекты, lookup. |
| **HubSpot** | Deal (won) → Projects object (pipeline+type+status), association. Именно этот паттерн из gap-анализа. |
| **1С:ДО (факт)** | Сделка (Шоурум) → Запуск (проект в ДО) с СДР-планом. Delivery = отдельная сущность со своим циклом. |

Все три держат Deal и Delivery раздельно, 1:N. `projects` уже несёт `type` — добавляем третий
тип `delivery`, связанный с родительской сделкой.

---

## 2. Data Model

### 2.1 Сущность — расширяем `projects`, не плодим таблицу

Delivery-проект = строка `projects` с `type='delivery'`. Переиспользуем всё: пайплайны
(`entity_type='project'`), PCT-1 доски, RLS (`user_role()`/memberships), timeline, файлы.
Дискриминатор `type` уже гейтит поведение (client/internal) — добавляем ветку delivery.

```
projects.type: 'client' | 'internal' | 'delivery'
```

| type | Что | Пайплайн | Связь |
|---|---|---|---|
| client | Сделка (пресейл) | deal-воронка (entity_type='deal') | — |
| internal | Внутренний проект | нет | — |
| **delivery** | **Проект внедрения** | **состояние-воронка (entity_type='project', 4 стадии)** | **parent_deal_id → won client** |

### 2.2 Новые поля на `projects` (аддитивно)

```
parent_deal_id   uuid  → projects(id) ON DELETE RESTRICT   -- родительская выигранная сделка
delivery_kind    text  'launch' | 'experiment'
do_url           text                          -- ссылка на проект в 1С:Документооборот
do_external_id   text                          -- ид проекта в ДО (для будущего sync)
do_synced_at     timestamptz                   -- Фаза 4
progress_done    int  default 0                -- кэш; поддерживается триггером (см. 2.7)
progress_total   int  default 0
```

⚠️ `ON DELETE RESTRICT` (не SET NULL): delivery обязан иметь parent (CHECK 2.3); SET NULL создал
бы сироту, нарушающего инвариант. Сделку с delivery-проектом нельзя удалить, пока он есть —
это корректно (или soft-delete сделки отдельным решением).

### 2.3 CHECK-инварианты (⚠️ ПРАВКА БЛОКЕРА)

Существующий `projects_type_pipeline_chk` (факт из БД) покрывает только client/internal и
**отвергает delivery**. Пересоздать с третьей веткой:

```sql
ALTER TABLE projects DROP CONSTRAINT projects_type_pipeline_chk;
ALTER TABLE projects ADD CONSTRAINT projects_type_pipeline_chk CHECK (
     (type='client'   AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL)
  OR (type='internal' AND pipeline_id IS NULL     AND stage_id IS NULL)
  OR (type='delivery' AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL
        AND parent_deal_id IS NOT NULL AND delivery_kind IS NOT NULL)
);
-- delivery не бывает won/lost (это статусы сделки):
ALTER TABLE projects ADD CONSTRAINT projects_delivery_status_chk CHECK (
  type <> 'delivery' OR status IN ('open','on_hold','completed','cancelled')
);
```
(отдельный `projects_delivery_chk` из v1 больше не нужен — влит сюда.)
⚠️ `status` сейчас = open/won/lost/on_hold/completed; для delivery добавить `'cancelled'` в
`projects_status_chk`.

### 2.4 Состояние (4) — через project-пайплайн

Состояние = `stage_id` на project-пайплайне (`entity_type='project'`). **Пересоздать** засиженные
project-пайплайны (Kickoff→Обследование…, не совпали с реальностью) на 4-стадийные:

```
Инициирован → Планируется → Исполняется → Завершён   (order_index 1..4, is_won на «Завершён»)
```
Health-ось (не в пайплайне): `status` = active(open)/on_hold/completed/cancelled.

### 2.5 План-дерево = PCT-1 доска по фазам СДР (+ UI-контракт)

Детализация — доска PCT-1 (`project_columns`+`tasks`): **колонки = 4 фазы СДР** (Подготовка к
запуску / Запуск / Регулярные / Передача на поддержку). Прогресс из задач — как «Контроль
выполнения» в 1С. ⚠️ Delivery НЕ линеен → доска, не линейный стрип.

**UI-контракт (ПРАВКА ревью — семантика колонок иная, чем у internal):**
- Для `type='internal'`: колонка = swimlane статуса (backlog/started/paused/done), `lane` производна.
- Для `type='delivery'`: **колонка = фаза СДР** (не статус!), а состояние задачи
  (Не начата / В работе / Просрочена / Готово) — это **badge на карточке**, не колонка.
- Значит delivery-борд — отдельный режим рендера `KanbanBoard` (колонки по `category='phase'` или
  по флагу проекта), где `lane` задачи показывается бейджем. Зафиксировать в P2.

### 2.6 Команда проекта (ПРАВКА ревью — было упущено)

В 1С:ДО обязательны 3 роли: **Менеджер · Внедренец · Монтажник**. Модель:
```
project_members { id, org_id, project_id, profile_id, role ('manager'|'implementer'|'installer'), created_at }
```
P1 может жить на `owner_id` (один ответственный). P2 — `project_members` (3 роли), для назначения
задач и RLS «вижу проекты, где я в команде».

### 2.7 Прогресс — свежесть (ПРАВКА ревью)

`progress_done/total` — кэш. Поддерживать триггером на `tasks` (AFTER INSERT/UPDATE/DELETE) для
`type='delivery'` проектов: пересчитывать `count(done)/count(*)`. Альтернатива — считать в
view/RPC при чтении (без кэша, без drift). Для P1 — view/RPC (проще); кэш+триггер — если станет
дорого на списках.

### 2.8 Шаблоны (delivery_templates) — «супермножество + выключить»

```
delivery_templates      { id, org_id, name, kind ('launch'|'experiment'), direction }
delivery_template_tasks  { id, template_id, wbs_code, title, phase (=колонка СДР), default_enabled, sort_order }
```
Спавн из шаблона: колонки (4 фазы) + задачи с `default_enabled=true`. «НЕ ТРЕБУЕТСЯ!» =
`default_enabled=false`. Два сида: Запуск, Эксперимент.

### 2.9 Связи

```
        projects(type='client')  ← СДЕЛКА (deal-воронка)
                 │ won → spawn
                 ▼
        projects(type='delivery') ← ПРОЕКТ ВНЕДРЕНИЯ
          ├─ parent_deal_id → сделка (RESTRICT)
          ├─ stage_id → project-пайплайн (4 состояния)
          ├─ do_url / do_external_id → 1С:Документооборот
          ├─ project_columns (4 фазы СДР) + tasks (план) [PCT-1]
          ├─ project_members (Менеджер/Внедренец/Монтажник)
          └─ delivery_kind (launch|experiment)
```

---

## 3. Lifecycle / spawn (won-сделка → проект)

Паттерн `convert_lead()` переносим на won→delivery:

```
RPC spawn_delivery_project(p_deal_id uuid, p_kind text, p_template_id uuid) RETURNS uuid
  SECURITY DEFINER, search_path=public, pg_temp    -- NULL-safe гарды (урок 033)
  1. проверить: p_deal.type='client' AND status='won'; иначе RAISE
  2. INSERT projects(type='delivery', parent_deal_id, company_id/contact_id/direction наследуются,
     pipeline_id/stage_id = «Инициирован» project-пайплайна той же direction, delivery_kind)
  3. скопировать из шаблона: project_columns (4 фазы) + tasks(default_enabled)
  4. вернуть id
```

⚠️ **ПРАВКА БЛОКЕРА — `seed_project_columns` type-aware.** Триггер `trg_zz_seed_columns`
(AFTER INSERT ON projects) сейчас сидирует Бэклог/В работе/Ожидание/Готово на ЛЮБОЙ проект. Для
delivery это даст дубль (4 дефолтных + 4 из шаблона). Фикс — в функции:
```sql
-- в seed_project_columns():  IF NEW.type = 'delivery' THEN RETURN NEW; END IF;
```
Колонки delivery создаёт только `spawn_delivery_project` из шаблона.

Триггер запуска — кнопка «Создать проект внедрения» на выигранной сделке (не авто: РП выбирает
эксперимент/полный запуск и шаблон). Одна сделка → 1..N проектов (эксперимент, затем полный).
Переходы состояния — вручную (P1) или из 1С-синка (P4). «Завершён» может требовать закрытой
«Передачи на поддержку» (гейт по образцу S27, P3).

---

## 4. RBAC / RLS

| Роль | Создать | Read | Сменить состояние | Править план | Delete |
|---|---|---|---|---|---|
| Admin/PM (owner/admin) | ✓ | org-wide | ✓ | ✓ | ✓ |
| Manager (member) | ✓ (owner сделки) | свои + где в команде | свои | свои | ✗ |
| Viewer | ✗ | org read | ✗ | ✗ | ✗ |

Delivery-проекты наследуют RLS `projects` (`user_role()`+org_id+created_by/owner_id) — новых
политик на projects не надо. Новые таблицы: `delivery_templates`/`_tasks`, `project_members` —
RLS по образцу 027 (read org-wide, write owner/admin). NULL-safe гарды в SECURITY DEFINER (033).

---

## 5. Схема (аддитивно, миграция — гейтом)

```sql
-- 1) тип delivery + поля + инварианты (см. 2.2–2.3, БЛОКЕР-правки)
ALTER TABLE projects DROP CONSTRAINT projects_type_chk;
ALTER TABLE projects ADD CONSTRAINT projects_type_chk CHECK (type IN ('client','internal','delivery'));
ALTER TABLE projects ADD COLUMN parent_deal_id uuid REFERENCES projects(id) ON DELETE RESTRICT;
ALTER TABLE projects ADD COLUMN delivery_kind text CHECK (delivery_kind IN ('launch','experiment'));
ALTER TABLE projects ADD COLUMN do_url text, ADD COLUMN do_external_id text, ADD COLUMN do_synced_at timestamptz;
ALTER TABLE projects ADD COLUMN progress_done int NOT NULL DEFAULT 0, ADD COLUMN progress_total int NOT NULL DEFAULT 0;
ALTER TABLE projects DROP CONSTRAINT projects_status_chk;
ALTER TABLE projects ADD CONSTRAINT projects_status_chk CHECK (status IN ('open','won','lost','on_hold','completed','cancelled'));
ALTER TABLE projects DROP CONSTRAINT projects_type_pipeline_chk;   -- ← БЛОКЕР: пересоздать с delivery-веткой (2.3)
ALTER TABLE projects ADD CONSTRAINT projects_type_pipeline_chk CHECK ( ... );  -- см. 2.3
ALTER TABLE projects ADD CONSTRAINT projects_delivery_status_chk CHECK ( ... );

-- 2) seed_project_columns type-aware (БЛОКЕР): early-return для delivery
CREATE OR REPLACE FUNCTION seed_project_columns() ... IF NEW.type='delivery' THEN RETURN NEW; END IF; ...

-- 3) 4-стадийный project-пайплайн (пересоздать засиженные), delivery_templates(+tasks), project_members
-- 4) RPC spawn_delivery_project; сиды шаблонов Запуск/Эксперимент из СДР
-- 5) прогресс: view/RPC (P1) либо триггер на tasks (позже); RLS на новые таблицы
```

Migration-safety: строго аддитивно. `client`/`internal` не тронуты. Засиженные 8-стадийные
project-пайплайны — деприкейтить (кодом не читаются: ProjectModal фильтрует `entity_type='deal'`;
подтверждено), заменить на 4-стадийные.

---

## 6. Roadmap (по ROI)

| Фаза | Скоуп | ROI | Оценка | Риск |
|---|---|---|---|---|
| **P1 — Лёгкая карточка** | type=delivery + поля + инварианты, seed type-aware, spawn из won, 4-состояние пайплайн, ссылка в ДО, ручной статус, канбан 4 состояний, раздел «Проекты» (delivery+internal), кнопка spawn на won-сделке | Видимость после выигрыша (сейчас — ноль) | **~1–1.5 спринта** | Средний |
| **P2 — План + шаблоны + команда** | delivery-борд (колонки=фазы СДР, статус задачи=badge), шаблоны Запуск/Эксперимент, прогресс X/Y, project_members (3 роли) | Экономия часов: план в клик, видно прогресс | ~1–1.5 спринта | Средний |
| **P3 — Гейт передачи + health** | «Завершён» требует закрытой «Передачи на поддержку» (S27), health-ось, Приостановлен/Отменён | Контроль сдачи | ~0.5 спринта | Низкий |
| **P4 — Синк с 1С:ДО** | OData/API из 1С: состояние + прогресс авто (`do_synced_at`) | Убирает ручной ввод | ~1.5–2 спринта | Высокий (интеграция 1С) |

**P1 — фундамент.** До P4 статус ведётся вручную — ОК на текущем масштабе.

---

## 7. Открытые вопросы (до старта P1)

1. **Приостановлен/Отменён** — есть в 1С:ДО? → `on_hold`/`cancelled` в `status`, НЕ в пайплайне.
2. **ERP-внедрение** — тот же процесс ДО или свой СДР? Если свой → второй шаблон + вторая
   project-воронка `direction=erp`. (Файлы — только маркировка/IIoT.)
3. **Навигация:** «Проекты» = delivery + internal с фильтром по типу (рекоменд.). Сделки — в «Сделках».
4. **1 сделка → N проектов** (эксперимент + запуск) — модель держит через `parent_deal_id`.

---

## VERIFICATION

```
Type Safety:            NOT_VERIFIED (архитектура; типы — на реализации P1, нужно сквозное
                        обновление 'client'|'internal' → +'delivery' в database.ts/validators/hooks)
RLS Coverage:           WARNING (паттерн projects переиспользуется; новые таблицы — по образцу 027)
Backward Compatibility: PASS (аддитивно; client/internal не тронуты; CHECK/seed правятся с сохранением
                        старого поведения; засиженные project-пайплайны кодом не читаются — подтверждено)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE (1С:ДО — внутренняя; интеграция P4)
```

**Итог.** Стратегия (зеркалить 1С, переиспользовать type/PCT-1/convert_lead, фазировать) —
подтверждена ревью. Два блокера schema-слоя (CHECK отвергал delivery; seed-триггер дублировал
колонки) закрыты и сверены по живой БД. Добавлены: ON DELETE RESTRICT, свежесть прогресса,
команда 3 ролей, UI-контракт delivery-борда, реалистичная оценка. Документ готов как спецификация
под P1 sprint-промпт — **после закрытия 4 открытых вопросов у коллег** (критичны №1 и №2).

---

## 8. Уточнённая модель статуса (v3 — по ответам Олега 2026-07-10)

**Ответы, закрывшие открытые вопросы 1 и 2:**
1. Состояний «Отменён/Приостановлен» НЕТ → состояние ровно 4. Убрать `on_hold`/`cancelled` из
   схемы v2 (в §2.3 `projects_delivery_status_chk` → `status IN ('open','completed')`).
2. ERP-проект использует те же 4 состояния, детализация — свои фазы. IIoT — свои (из СДР).

**Ключевая правка модели (упрощение v2):** состояние = **`phase_group`** на стадиях
project-пайплайна (не отдельный 4-стадийный пайплайн). Это ровно механизм сделок
(`pipeline_stages.phase_group`), переиспользуем 1:1 — включая компонент грида (StackedPipeline)
и канбан по `phase_group`.

- **Фаза = `stage_id`** (стадия project-пайплайна, своя по направлению).
- **Состояние = `phase_group`** ∈ {Инициирован, Планируется, Исполняется, Завершён} (4, универсально).
- **Канбан `/projects`** = колонки по `phase_group` (как канбан сделок).
- **Грид внутри проекта** = стадии, сгруппированные по `phase_group` (компонент сделки).
- **План/задачи** = PCT-1 (параллельный слой; нелинейность — здесь, не в фаза-гриде).

### Delivery-пайплайны по направлениям (заменяют засиженные project-пайплайны)

**ERP** (`entity_type='project'`, direction='erp') — 7 фаз-стадий + phase_group:
| order | Фаза (stage) | phase_group (состояние) |
|---|---|---|
| 1 | (старт) | Инициирован |
| 2 | Обследование | Планируется ⚠️ (подтвердить — может быть Исполняется) |
| 3 | Моделирование | Планируется |
| 4 | Проектирование | Планируется |
| 5 | Разработка | Исполняется |
| 6 | Внедрение | Исполняется |
| 7 | ОПЭ | Исполняется |
| 8 | Сопровождение | Завершён |

**IIoT/маркировка** (direction='iiot') — фазы из СДР + phase_group:
| Фаза (stage) | phase_group |
|---|---|
| Подготовка к запуску | Планируется→Исполняется (нужен маппинг под-фаз или одна стадия=Исполняется) |
| Запуск | Исполняется |
| Регулярные мероприятия | Исполняется (параллельно — живёт в плане, не в стадии) |
| Передача на поддержку | Завершён |

⚠️ Мэппинг фаза→состояние (`phase_group`) — доменное решение Олега, не финализирован. ERP-таблица
выше — предложенный вариант (даёт сбалансированный канбан). Подтвердить перед P1.

### Что упрощается в схеме (относительно §2–§5)

- НЕ создаём «4-стадийный project-пайплайн». Создаём ДВА project-пайплайна (ERP/IIoT) со
  стадиями-фазами + `phase_group`.
- Состояние не хранится отдельным полем — выводится из `stage.phase_group` (как у сделок).
- `status` для delivery: `open` (активен) → `completed` (в phase_group='Завершён'). Без won/lost/
  on_hold/cancelled. `projects_delivery_status_chk` → `type<>'delivery' OR status IN ('open','completed')`.
- Канбан и грид — переиспользование компонентов сделок (группировка по `phase_group`), а не новый UI.

**Открытый (последний) вопрос перед P1:** финальный мэппинг ERP- и IIoT-фаз на 4 `phase_group`.

---

## 9. ФИНАЛ мэппинга фаз (2026-07-10, источник: презентация «Технология реализации проекта 1С v2.2» + СДР)

Открытые вопросы закрыты. Канонический ERP-процесс — **6 методологических этапов** (слайд 7 презентации:
Обследование → Моделирование → Проектирование → Разработка → Внедрение → Эксплуатация). Ранее названные
«7» = те же 6 (ОПЭ ⊂ Внедрение, Сопровождение = Эксплуатация).

### Правило мэппинга состояний (ФИНАЛ, подтверждено Олегом)

```
Инициирован  = договор/аванс/оргстарт, работа по клиенту не началась
Планируется  = внутренняя верстка плана проекта (сроки, длительности) — ещё нет billable-работы
Исполняется  = ВСЕ оплаченные фазы исполнения: Обследование → Моделирование → Проектирование
               → Разработка → Внедрение (ОПЭ). Обследование = billable (ДС + аванс 50%) ⇒ Исполняется.
Завершён     = Эксплуатация / Поддержка (delivery сдан, проект в поддержке)
```

Принцип: `phase_group` группирует детальные stage'и в 4 крупных состояния канбана. Детальная фаза
всегда видна на карточке (stage), крупное состояние — колонка канбана (phase_group).

### ERP project-пайплайн (direction='erp') — ФИНАЛ

| order | Фаза (stage) | phase_group (состояние) |
|---|---|---|
| 1 | Инициация (договор, аванс, оргстарт) | Инициирован |
| 2 | Планирование (верстка плана проекта) | Планируется |
| 3 | Обследование (AS IS) | Исполняется |
| 4 | Моделирование (TO BE) | Исполняется |
| 5 | Проектирование (ТЗ) | Исполняется |
| 6 | Разработка (код) | Исполняется |
| 7 | Внедрение (запуск в ОПЭ) | Исполняется |
| 8 | Эксплуатация (поддержка) | Завершён |

Веха **«Передача на поддержку»** (sign-off из §4 `delivery-process-DO.md`) — не отдельный stage,
а milestone-задача в шаблоне между Внедрением и Эксплуатацией (гейт с чек-листом из 11 пунктов).

### IIoT project-пайплайн (direction='iiot') — из СДР 1С:ДО

| order | Фаза (stage) | phase_group |
|---|---|---|
| 1 | Инициация (создание, оргстарт) | Инициирован |
| 2 | Подготовительный этап | Планируется |
| 3 | Установка БИТ.MDT | Исполняется |
| 4 | Подготовка оборудования | Исполняется |
| 5 | Запуск | Исполняется |
| 6 | Регулярные мероприятия | Исполняется |
| 7 | Передача на поддержку | Завершён |

Обе воронки → одинаковые 4 состояния канбана (Инициирован/Планируется/Исполняется/Завершён),
детализация внутри различается по direction. Состояний «Отменён»/«Приостановлен» НЕТ (решение Олега).

### Источники шаблонов (для P2)

- **ERP-шаблон** (фазы + задачи per этап) = презентация «Технология реализации проекта 1С v2.2»
  (25 слайдов: цели/задачи/результаты/роль менеджера по каждому из 6 этапов). Полный список задач
  извлечь при P2.
- **IIoT-шаблон** = СДР «Запуск» + «Эксперимент» из 1С:ДО (раздел 7 `delivery-process-DO.md`).

**Статус: все открытые вопросы закрыты. Архитектура готова под P1 sprint-промпт.**
