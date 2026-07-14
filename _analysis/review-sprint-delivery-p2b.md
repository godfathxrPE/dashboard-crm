# Ревью: architecture-delivery-p2 (§14) + sprint-delivery-p2b

**Дата:** 2026-07-11  
**Ревьюер:** Grok (верификация по коду `feat/aura-theme`, миграции 032/035/036, P2a handoff)  
**Объекты:**
- `_analysis/architecture-delivery-p2.md` — D3-дельта §14 (P2b: команда, прогресс, apply-шаблон, CRUD фаз)
- `_analysis/sprint-delivery-p2b.md` — спринт P2b (миграция 037 + UI)

**Контекст:** P2a закрыт (036+036b на проде по документам; в репо гейт-фикс 036b — хвост `036_delivery_phase_board_templates.sql`). На проде 4 delivery-проекта / 137 задач, `progress_done/total` = 0/0. Предыдущее ревью P2a: `review/review-delivery-p2a-and-architecture.md`.

---

## Вердикт

| Документ | Оценка | Можно в CC? |
|----------|--------|-------------|
| `architecture-delivery-p2.md` §14 | **9/10** | ✅ Да — дизайн P2b зрелый, факты живой БД учтены |
| `sprint-delivery-p2b.md` | **8/10** | 🟡 После 3 правок UI-контракта — см. блокеры |

**Сводный вердикт:** SQL-часть спринта (037) **готова к написанию файла миграции**. Архитектура и спринт **согласованы** с P2a и фактическим кодом. Frontend описан в правильных точках (`ProjectDetail`, `DeliveryPipelineBoard`, `ProjectBoard`), но **недоспецифицированы права редактирования и инвалидация прогресса**. **Не отдавать в Claude Code без правок B2/B3/B4 (права) и уточнения РАЗВЕДКИ.**

---

## С чем согласен полностью

### 1. Архитектура §14.1 — `project_members`

- Три роли (`manager` / `implementer` / `installer`) соответствуют команде запуска из 1С:ДО.
- `UNIQUE (project_id, profile_id)` — один человек = одна роль; несколько людей на роль — ок.
- RLS write по образцу `project_columns` (032) — org + (owner/admin ∨ owner/created_by проекта) — **верный паттерн**, не расширяет видимость проектов (S25 org-wide).
- Осознанно вне скоупа: привязка к `assigned_to`, редактор шаблонов, RLS по членству — честно.

### 2. Архитектура §14.2 — прогресс X/Y кэшом

Диагноз цепочки триггеров на `projects` (`on_stage_change`, `trg_zz_run_automations`) — **критичен и верен**. Guard `IS DISTINCT FROM` перед UPDATE — обязателен, иначе каждая смена `lane` задачи гоняет автоматизации вхолостую.

Спринт правильно ставит:
- `UPDATE OF lane, project_id` — не дёргать триггер при правке `text`/`deadline`;
- имя `trg_zz_delivery_progress` — после всех BEFORE/AFTER на `tasks`;
- `REVOKE` RPC на definer-функциях — по паттерну 034.

`useProjects` уже тянет `progress_done, progress_total` в `PROJECT_COLUMNS` (`use-projects.ts:122`) — B3 не требует расширения select.

### 3. Архитектура §14.3 — `apply_delivery_template`

Разделение internal `copy_delivery_template` (REVOKE) и клиентской обёртки — правильно. Различие graceful spawn (шаблона нет → пустой проект) vs explicit apply (шаблона нет → `P0001`) — **логично и согласовано** с UX empty state P2a.

Гарды в A3 зеркалят `spawn_delivery_project` из 036 (`NULL-safe org`, ownership, `type='delivery'`).

### 4. Архитектура §14.4 — CRUD фаз

Согласовано с P2a: в `ProjectBoard.tsx` phase-режим скрывает rename/add/delete (`:131–136`, `:335`). Возврат phase-aware CRUD без category-select — минимальный дифф.

`delete_project_column` + guard backlog/done для `phase` вакуумен — подтверждено в 032 (guard только на backlog/done).

### 5. Спринт — сильная SQL-миграция

- Раздельные INSERT/UPDATE/DELETE политики (урок 036b) — ✅
- `WITH CHECK` на `pm_update` против перекидывания строки в чужой `project_id` — ✅ зрелая деталь безопасности
- Бэкфилл прогресса в `DO $$` — ок для 4 проектов
- 10 SQL-смоков гейта — полный чеклист
- Два коммита (миграция / UI) + «не применять из CC» — по конвенции проекта
- Упоминание `docs/schema.md` + долг 036b — правильно

### 6. Спринт — правильные точки UI

| Задача | Файл | Факт в коде |
|--------|------|-------------|
| Empty state + кнопка шаблона | `ProjectBoard.tsx:298–304` | Текст «Фазы не созданы» уже есть, CTA ждёт P2b |
| Прогресс на канбане | `DeliveryPipelineBoard.tsx` `DeliveryCard` | Карточка без N/M — место под `:92–95` |
| Команда | `ProjectDetail.tsx` info grid `:724–793` | Рядом с Компания/Контакт/Сделка/Дедлайн |
| Выбор людей | `AssigneeSelect` + `useTeamMembers` | Рабочий паттерн, не изобретать |
| Константы ролей | `delivery-phases.ts` | Уже хаб P2a-констант — логичное расширение |

### 7. РАЗВЕДКА и проверки

Grep-команды по `phaseMode`, `spawn_delivery_project`, empty state — релевантны. `tsc` / `build` / unit-тесты на константы — по чеклисту `crm-architect`.

---

## Блокеры (исправить до запуска CC)

### B1. Права UI: `canEdit` в `ProjectBoard` ≠ RLS `project_members` / `apply_delivery_template`

Сейчас в `ProjectBoard.tsx:184`:

```ts
const canEdit = role !== 'viewer';
```

RLS на `project_members` и `apply_delivery_template` требуют **owner/created_by проекта ∨ org owner/admin**. Org `manager` без владения проектом **увидит** кнопки B4/B5 (фазы, шаблон), но получит `42501` от БД.

Спринт B2/B4 пишет «показывать по тем же правилам», но **не даёт контракт хелпера** и не требует прокинуть `project` в `ProjectBoard` (компонент сейчас знает только `projectId`).

**Рекомендация:** добавить в спринт **B0 — `canManageDeliveryProject(project, orgRole)`**:

```ts
// src/lib/utils/project-permissions.ts (или рядом с delivery-phases)
export function canManageDeliveryProject(
  project: { owner_id: string | null; created_by: string | null },
  orgRole: OrgRole | null | undefined,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  if (orgRole === 'owner' || orgRole === 'admin') return true;
  return project.owner_id === userId || project.created_by === userId;
}
```

- `ProjectDetail` — виджет «Команда», кнопка шаблона (если вынесена сюда)
- `ProjectBoard` — новый optional prop `canManageColumns` или `project` + `useAuth`/`useOrgRole`
- Не путать с `canEdit` задач (org-wide lane change может остаться шире — отдельное решение)

### B2. РАЗВЕДКА ссылается на несуществующий `useOrgMembers`

В спринте:

```bash
grep -rn "AssigneeSelect\|useOrgMembers\|memberships" ...
```

В коде **нет** `useOrgMembers`. Источник профилей — `useTeamMembers()` (`use-team-members.ts:25`), UI — `AssigneeSelect` (`AssigneeSelect.tsx:52`).

**Рекомендация:** заменить на `useTeamMembers` и явно указать: «переиспользовать `AssigneeSelect`, не дублировать dropdown».

### B3. Инвалидация прогресса после мутаций задач

`useUpdateTask` / `useMoveTask` / `useDeleteTask` инвалидируют только `['tasks']` (`use-tasks.ts:143, 256, 289`). Прогресс живёт в `projects.progress_done/total` и обновляется триггером в БД.

`useRealtimeSync('projects')` инвалидирует по `queryKey: ['projects']` — сработает **если** Realtime включён на `projects` и клиент подписан. Но `useProject(id)` использует ключ `['projects', id]` (`use-projects.ts:259`) — realtime инвалидирует по префиксу `[table]` = `['projects']`, что **покрывает** вложенные ключи.

**Риск:** при отключённом Realtime или задержке подписки UI покажет устаревший N/M до staleTime (1 мин).

**Рекомендация:** в B3 явно требовать в `useUpdateTask`/`useDeleteTask`/`useMoveTask` (или обёртке board-мутаций):

```ts
if (vars.lane !== undefined || vars.project_id) {
  queryClient.invalidateQueries({ queryKey: ['projects'] });
}
```

либо документировать зависимость только от Realtime — но тогда смоук «смена lane → +1 done» на UI обязателен в ручном прогоне.

---

## Предупреждения (желательно до CC)

### W1. РАЗВЕДКА grep по `progress` в `ProjectDetail` / `DeliveryPipelineBoard` — пустая

Проверено: совпадений нет (прогресс UI ещё не реализован). Команды в спринте не вредны, но исполнитель может решить, что «не нашёл точку вставки».

**Рекомендация:** в РАЗВЕДКЕ добавить ожидаемый результат:

```
# Ожидание: 0 совпадений — вставка новая
# DeliveryPipelineBoard: DeliveryCard, блок meta ~строка 92
# ProjectDetail: шапка delivery, под бейджем состояния ~строка 395–421
```

### W2. RLS `pm_select` без initplan-обёртки

Политики `project_columns` (032) используют `( SELECT public.current_org_id() )`. В A1 спринта:

```sql
USING (org_id = public.current_org_id());
```

Работает, но **несогласованно** с initplan-паттерном из learnings. Advisors performance могут дать WARN.

**Рекомендация:** унифицировать: `org_id = ( SELECT public.current_org_id() )` во всех четырёх политиках `project_members`.

### W3. `use-project-members` — нет `useRealtimeSync`

`use-project-columns.ts` подписан на `useRealtimeSync('project_columns')`. Для команды из двух вкладок/устройств без realtime изменения не подтянутся.

**Рекомендация:** в B1 хука добавить `useRealtimeSync('project_members')` по образцу columns.

### W4. UX команды: дубли и UNIQUE violation

`UNIQUE (project_id, profile_id)` — при повторном добавлении Postgres вернёт unique violation. Спринт не требует:
- фильтровать уже добавленных в `AssigneeSelect`;
- обработать ошибку дружелюбным текстом.

**Рекомендация:** одна строка в B2: «исключить `profile_id` уже в списке из options».

### W5. Семантика `progress_total`

Триггер считает **все** `tasks` с `project_id` (включая ad-hoc из `TaskQuickAdd` в phase-колонке). Это согласовано с §14.2, но **не с формулировкой «задачи шаблона»** в карточке канбана.

Если продуктово нужен «прогресс по СДР-шаблону» без ручных задач — понадобится фильтр (например, только задачи с `column_id IN phase columns`). Сейчас — осознанный компромисс; зафиксировать в UI-подписи «N/M задач» без слова «шаблон».

### W6. Размещение виджета «Команда»

«По месту — РАЗВЕДКА» размыто. Info grid — 4 колонки (`sm:grid-cols-4`). Команда из 3 ролей × N людей **не влезет** в карточку grid.

**Рекомендация:** отдельная секция **под** info grid (`:793`), перед блоком 1С:ДО (`:796`), full-width — как в architecture «виджет на delivery».

### B6. Тесты — нет пути для компонента команды

Unit-тесты на константы и предикат прогресса — ок. Нет smoke на `canManageDeliveryProject` и группировку members — стоит добавить в B6.

---

## Сверка спринта с живым кодом P2a

| Утверждение спринта | Статус |
|---------------------|--------|
| `copy_delivery_template` REVOKE authenticated | ✅ `036:230–232` |
| Empty state «Фазы не созданы» | ✅ `ProjectBoard.tsx:301` |
| `phaseMode` скрывает CRUD колонок | ✅ `ProjectBoard.tsx:131–136, 335` |
| `progress_done/total` в select projects | ✅ `use-projects.ts:122` |
| `spawn` 2-arg вызов из UI | ✅ `ProjectDetail.tsx:243–246` |
| Обработка `42501` при spawn | ✅ `ProjectDetail.tsx:249–254` — образец для apply |
| `delivery-phases.ts` — хаб констант | ✅ файл существует, P2a-константы на месте |
| Миграция 036b отдельным файлом | 🟡 В репо только комментарий в хвосте 036; на проде мог быть отдельный apply — долг документации (спринт честно просит обновить `docs/schema.md`) |

---

## SQL: мелкие замечания (не блокеры)

1. **`apply_delivery_template` строка ошибки** при NULL-резолюции: `'no template for direction %'` — лучше включить `delivery_kind` в текст (запрос уже фильтрует по `kind`).
2. **`recalc_delivery_progress`**: `count(*)` при `project_id` NULL в tasks не попадёт — ок; задачи без `project_id` не влияют.
3. **`pm_update` USING без `WITH CHECK` на `org_id` alone** — WITH CHECK дублирует ownership; `org_id` нельзя сменить через UPDATE без нарушения USING — достаточно.

---

## Чеклист `crm-architect` (sprint-delivery-p2b)

| Критерий | Статус |
|----------|--------|
| РАЗВЕДКА в начале | ✅ |
| Реальные table/column из schema | ✅ |
| Миграция не из CC | ✅ |
| RLS org + роль/ownership | ✅ (мелкий initplan — W2) |
| SECURITY DEFINER + search_path | ✅ |
| Типы `database.ts` вручную | ✅ |
| Optimistic updates в хуке | ✅ (заявлено B1) |
| DELETE / CASCADE | ✅ (CASCADE на FK) |
| schema.md после миграции | ✅ (заявлено) |
| Коммит-сообщения | ✅ |
| Права UI = RLS | ❌ B1 |

---

## Рекомендуемые правки в `sprint-delivery-p2b.md` (копипаст для Claude)

1. **После «СВЕРЕННЫЕ ФАКТЫ»** — блок B0 `canManageDeliveryProject` + прокидывание в `ProjectBoard` / `ProjectDetail`.
2. **РАЗВЕДКА** — `useOrgMembers` → `useTeamMembers`; ожидаемые 0 matches для progress grep; якоря строк вставки.
3. **B1 хук** — `useRealtimeSync('project_members')`.
4. **B2** — секция full-width под info grid; фильтр уже добавленных в селекте.
5. **B3** — явная `invalidateQueries(['projects'])` на lane/delete/move (или пометка «обязательный ручной смоук Realtime»).
6. **B6** — unit-тест `canManageDeliveryProject`.

---

## Итог

| | |
|--|--|
| **Оценка** | Архитектура §14: **9/10** · Спринт P2b: **8/10** |
| **Миграция 037** | Можно писать файл — SQL зрелый |
| **UI** | После B1–B3 — можно отдавать в CC |
| **Риск** | Средний-низкий (как в спринте); главный — рассинхрон UI-прав и RLS + stale прогресс без invalidate |

P2b логично продолжает P2a: не трогает резолвер/шаблоны/spawn, аддитивен. Документы **существенно лучше** типичного спринта P1 по зрелости SQL и учёту гейтов; три правки по frontend-контракту закрывают разрыв до production-ready промпта.