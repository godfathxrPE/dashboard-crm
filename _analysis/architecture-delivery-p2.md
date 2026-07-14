# D3-Архитектура: delivery P2 — фазовая доска, шаблоны, команда, прогресс (дельта к v2/§8–9)

Дата: 2026-07-11. Режим: /architect D3 (дельта). База: `_analysis/architecture-delivery-projects.md`
(v2 + §8 + §9 ФИНАЛ), P1 закрыт (миграция 035 на проде, коммиты 4c1f2ad → 8706399 → 005bf20).
Все факты ниже сверены по живой БД `uoiavcabxgdjugzryrmj` 2026-07-11.

**Разбивка (решение Олега):** P2a = фазовая доска + шаблоны + spawn v2 (этот документ, §10–13).
P2b = project_members (3 роли) + прогресс X/Y + polish (§14, кратко — детализация после P2a).

---

## 10. Контракт фазовой доски (закрывает UI-контракт §2.5)

### CRM-аналогии
- **Monday CRM**: Board = проект, Groups = фазы, Items = задачи, Status column = state задачи.
  Ровно наша модель: колонка ≠ статус, статус — атрибут карточки.
- **Salesforce PSA / Mission Control**: Project → Milestones (фазы) → Tasks со своим Status.
- **1С:ДО (факт)**: «Контроль выполнения задач проекта»: секции СДР (фазы) → задачи → состояние
  задачи (Не начата / Выполняется / Просрочена / Завершена).

Во всех трёх фаза — контейнер, статус — свойство задачи. Поэтому:

### Модель (решение)
- **Колонка фазовой доски** = `project_columns` с новым `category='phase'` (расширяем CHECK).
  Переиспользуем всю механику PCT-1: позиции, DnD, `delete_project_column`, RLS.
- **Статус задачи** = `tasks.lane` — для задач в phase-колонках lane становится **истиной**
  (как на личном борде), а не производной от category:
  `next` = Не начата · `now` = В работе · `done` = Готово · (`wait` = Ожидание, допустим, но UI не выпячивает).
- **Просрочена** — НЕ хранится: вычисляется на клиенте (`deadline < now() && lane !== 'done'`) → красный badge.
- **DnD между колонками** = смена фазы (`column_id`), статус при этом не трогаем.
- **Смена статуса** (badge/dropdown на карточке) = update `lane`, колонка не меняется.

### ⚠️ Резолвер — обязательная правка (блокер-класс)
`resolve_task_board()` сейчас: (а) при смене `lane` ремапит задачу в колонку
`lane_to_category(lane)`; (б) в конце ВСЕГДА деривит `lane := category_to_lane(category)`.
А `category_to_lane()` имеет **`ELSE 'done'`** → для `category='phase'` вернёт `'done'`.
Без правки: задачи на фазовой доске рождались бы «Готово», а смена статуса телепортировала бы
задачу в первую колонку (ремап не нашёл бы категорию → fallback «первая по position»).

Патч (2 точки, хирургический):
1. Ветка `ELSIF NEW.lane IS DISTINCT FROM OLD.lane`: если категория текущей колонки `'phase'`
   → колонку НЕ ремапить (смена lane = смена статуса).
2. Финальная деривация: `IF v_cat IS NOT NULL AND v_cat <> 'phase' THEN NEW.lane := ...`.

Личный борд (`project_id IS NULL`) и internal-доски (категории backlog/started/paused/done)
патч не затрагивает — их ветки не меняются.

---

## 11. Шаблоны (закрывает §2.8, нормализовано)

```
delivery_templates        { id, org_id, direction (direction_t), kind ('launch'|'experiment'),
                            name, is_active bool, created_at, updated_at }
                            UNIQUE (org_id, direction, kind) — ключ резолюции при spawn
delivery_template_phases  { id, org_id, template_id →CASCADE, name, position }
delivery_template_tasks   { id, org_id, template_id →CASCADE, phase_id →CASCADE, wbs_code,
                            title, default_enabled bool DEFAULT true, is_milestone bool DEFAULT false,
                            sort_order }
```

Отличие от эскиза §2.8: фазы вынесены в отдельную таблицу (порядок/копирование чище, чем
distinct по text-полю). `org_id` на всех трёх (tenant-правило + простые RLS).

**Сиды (org сейчас одна):**
- **IIoT Запуск** — 4 фазы СДР + 18 задач верхнего уровня (X.Y) из §7 `delivery-process-DO.md`.
  Глубже (1.3.10…) НЕ сидим: CRM зеркалит 1С:ДО, детальный СДР живёт там.
- **IIoT Эксперимент** — тот же список; какие задачи «НЕ ТРЕБУЕТСЯ ЭКСПЕРИМЕНТ» — в доках нет,
  сидим всё enabled, Олег отключит по отчёту 1С:ДО (или уточнит до гейта).
- **ERP Запуск** — 6 методологических этапов + 40 задач из pptx «Технология реализации проекта
  1С v2.2» (слайды 9–20: задачи этапов + ключевые действия менеджера — ДС/аванс, демонстрации,
  приёмки; извлечено 2026-07-11, файл: `_analysis/Технология_реализации_проекта_обучение_v2_2.pptx`).
  Приёмо-сдаточные задачи этапов помечены `is_milestone`.
- ERP Эксперимент не сидим (нет такой практики); spawn ERP+experiment → graceful (см. §12).

### RBAC (новые таблицы, по образцу 027/032)

|             | SELECT | INSERT | UPDATE | DELETE |
|-------------|--------|--------|--------|--------|
| owner/admin | org    | ✓      | ✓      | ✓      |
| member      | org    | ✗      | ✗      | ✗      |

Шаблоны — конфигурация org (как pipelines/stage_requirements), поэтому write только owner/admin,
без project-owner ветки. RLS: `org_id = current_org_id()` + `current_org_role() IN ('owner','admin')`.

---

## 12. Spawn v2 + seed-guard (закрывает блокер §3)

- **`seed_project_columns()`**: early return `IF NEW.type='delivery' THEN RETURN NEW;` —
  delivery больше не получает Бэклог/В работе/Ожидание/Готово.
- **`copy_delivery_template(p_project_id, p_template_id)`** — новый internal-хелпер
  (SECURITY DEFINER, REVOKE отовсюду): копирует фазы → `project_columns(category='phase')`
  и задачи `default_enabled=true` → `tasks` (`lane='next'`, `column_id` = колонка фазы,
  `text = wbs_code || '. ' || title`, `org_id`/`created_by` — явно из проекта, НЕ из
  `current_org_id()`: хелпер зовётся и из миграционного бэкфилла, где auth-контекста нет).
- **`spawn_delivery_project` v2**: старую 2-арг функцию **DROP** (иначе overload-неоднозначность
  PostgREST), создать `(p_deal_id uuid, p_kind text, p_template_id uuid DEFAULT NULL)` —
  UI P1 продолжает звать с 2 аргументами. Все гарды P1 сохраняются дословно (NULL-safe org,
  ownership, won/client, whitelist kind). После INSERT: резолюция шаблона по
  `(org, direction сделки, kind)` (или явный `p_template_id`), затем `copy_delivery_template`.
  **Шаблона нет → проект создаётся без колонок** (graceful): пустое состояние доски с хинтом,
  не ошибка — иначе заблокировали бы ERP-эксперименты и направления без шаблона.
- **Бэкфилл** (факт из БД: ровно 1 delivery-проект, 4 дефолтные колонки, 0 задач):
  удалить его колонки, скопировать из шаблона по его `direction`/`delivery_kind`.

Гейты как в P1: миграцию применяет Cowork (смоуки + advisors), CC только пишет файл.

---

## 13. UI P2a

- **Фазовая доска** в ProjectDetail delivery-проекта (таб «План»/«Задачи» — где сейчас PCT-1
  доска; точный компонент — РАЗВЕДКА в спринте). Режим рендера по `category==='phase'`:
  колонки = фазы, на карточке — badge статуса (из lane) + computed «Просрочена» + wbs-префикс.
- Смена статуса — интерактив на карточке (dropdown/цикл: Не начата → В работе → Готово).
- Empty state (нет колонок): «Фазы не созданы — для направления нет шаблона» + (P2b: кнопка
  «Создать из шаблона»).
- Личный борд/`/tasks`: delivery-задачи корректно лягут в lanes (lane — истина) — регресс-чек.

---

## 14. P2b — команда, прогресс, apply-шаблон, CRUD фаз (детальный дизайн 2026-07-11)

P2a закрыт (036+036b на проде, смоуки 8/8). Факты живой БД для P2b: 4 delivery-проекта / 137 задач
(бэкфилл прогресса будет ненулевой); `profiles`: id, full_name, avatar_url; на `projects` висят
безусловные AFTER UPDATE `on_stage_change` и `trg_zz_run_automations` (no-op при неизменной стадии,
но прогресс-триггер обязан писать ТОЛЬКО при реальном изменении значений — иначе лишний прогон
цепочки триггеров на каждый чих задач).

### 14.1 project_members — команда 3 ролей

CRM-аналогии: Salesforce Opportunity/Account Team (TeamMemberRole на junction), HubSpot deal
collaborators, 1С:ДО — команда запуска (Менеджер · Внедренец · Монтажник, известны заранее).

```
project_members { id, org_id (trg_set_org_id), project_id →projects CASCADE,
                  profile_id →profiles CASCADE, role CHECK ('manager'|'implementer'|'installer'),
                  created_at, UNIQUE (project_id, profile_id) }
```
Один человек — одна роль на проекте; несколько людей на роль — допустимо. Индексы: project_id,
profile_id, org_id. **RLS**: SELECT org-wide; write — org + (owner/admin ∨ owner/created_by
проекта) — ровно образец write-политик `project_columns` (032/034, initplan-обёртки).
Виджет — только на delivery (домен 1С:ДО); internal живёт на owner_id. RLS-видимость проектов
НЕ меняем (S25 team visibility уже org-wide) — members в P2b информационные + база для P3-гейтов.

### 14.2 Прогресс X/Y — кэш-триггер (закрывает §2.7, вариант «кэш»)

`progress_done/total` (035, сейчас 0/0) наполняются триггером на `tasks`:
- `update_delivery_progress()` — пересчёт для проекта: total = count(tasks), done = count(lane='done');
  UPDATE `projects` **только при `IS DISTINCT FROM`** и только `type='delivery'`.
- Триггер `trg_zz_delivery_progress` AFTER INSERT OR DELETE OR UPDATE OF lane, project_id ON tasks —
  пересчёт NEW.project_id и OLD.project_id (когда различаются). SECURITY DEFINER, REVOKE из RPC.
- Бэкфилл в миграции по всем delivery.
Отображение: карточка DeliveryPipelineBoard («N/M задач» + мини-бар), шапка ProjectDetail
(рядом со стадийным % — не путать: тот считается по позиции стадии).

### 14.3 apply_delivery_template — клиентский RPC для пустых досок

`copy_delivery_template` закрыт от RPC (internal). Клиенту — обёртка:
```
apply_delivery_template(p_project_id uuid, p_template_id uuid DEFAULT NULL) RETURNS void
  SECURITY DEFINER: NULL-safe org-гард → 42501; type='delivery' → P0001;
  ownership (owner/created_by ∨ membership owner/admin) → 42501;
  резолюция шаблона по (org, direction, delivery_kind) при NULL; явный не найден → 22023;
  дефолтный не найден → P0001 (здесь НЕ graceful — юзер явно просит фазы);
  PERFORM copy_delivery_template (его гарды: org-match, «already has columns»).
  GRANT authenticated; REVOKE PUBLIC/anon.
```
UI: кнопка в empty state фазовой доски («Фазы не созданы…» → «Создать из шаблона»).

### 14.4 CRUD фаз (light)

P2a спрятал управление колонками в phase-режиме целиком; P2b возвращает phase-aware:
rename — только имя (category-select не показывать); «+ Фаза» — createColumn с
`category='phase'` фиксированно; удаление — существующий `delete_project_column`
(диалог приёмника уже есть; guard «последняя backlog/done» для phase вакуумен — удаление
всех фаз даёт пустую доску, из которой выручает 14.3).

### Вне скоупа P2b
- default_enabled Эксперимента — одиночный UPDATE на проде по отчёту 1С:ДО (ждёт Олега, не миграция).
- Редактор шаблонов (админ-UI delivery_templates) — по потребности, после P3.
- Прогресс-вес задач/milestone-логика — P3 (гейт «Передача на поддержку»).

---

## VERIFICATION

```
Type Safety:            NOT_VERIFIED (типы — на реализации; regen после гейта)
RLS Coverage:           WARNING (политики определены по образцу 027/032; проверка — advisors на гейте)
Backward Compatibility: PASS-план (аддитивно; резолвер патчится ветками, не переписывается;
                        internal/личный борд не затронуты; spawn сохраняет 2-арг вызов)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```
