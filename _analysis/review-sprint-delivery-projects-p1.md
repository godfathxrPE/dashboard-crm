# Ревью: sprint-delivery-projects-p1.md

**Дата:** 2026-07-10  
**Ревьюер:** Grok (верификация по коду `feat/aura-theme` + миграция 032 + architecture D3 §8–§9)  
**Объект:** `_analysis/sprint-delivery-projects-p1.md` — P1 «Лёгкая карточка» delivery-проектов  
**Контекст:** `architecture-delivery-projects.md`, `review-architecture-delivery-projects.md`, `sprint-rename-deals.md`, skill `crm-architect`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| SQL-миграция (тип, CHECK, RPC, reseed) | ✅ Сильная, сверена с 032 |
| РАЗВЕДКА + гейт «не применять миграцию» | ✅ |
| Модель `phase_group` (§9 ФИНАЛ) | ✅ Согласована с архитектурой |
| Frontend scope | 🟡 Недооценён и неполно описан |
| Навигация / роутинг | ❌ Блокер |
| Переиспользование канбана | 🟡 Оптимистично |

**Оценка: 7.5/10.** Миграцию можно брать в работу после правок. **В текущем виде спринт нельзя отдавать в Claude Code без доработки навигации и UI-контракта.**

---

## С чем согласен полностью

### 1. Миграция — зрелая и безопасная

- Аддитивно: `type='delivery'`, новые поля, третья ветка `projects_type_pipeline_chk`, `ON DELETE RESTRICT` на `parent_deal_id` (исправление из архитектурного ревью — не SET NULL).
- Критичный урок закрыт: все delivery-стадии `is_won=false, is_lost=false` — иначе `sync_project_stage` выставит `status='won'` и нарушит `projects_delivery_status_chk`.
- `null_internal_stage` расширяется на `delivery` — без этого при DEFAULT `stage='new_lead'` появится мусорное legacy-зеркало.
- RPC по образцу `convert_lead`: `SECURITY DEFINER`, `search_path = public, pg_temp`, NULL-safe org-гард, `REVOKE`/`GRANT`.
- Reseed project-пайплайнов с фазами из §9 ФИНАЛ — логично при условии 0 ссылок на проде (как заявлено в спринте).

### 2. Честный scope P1 vs P2

Доска PCT-1 (колонки = фазы СДР), шаблоны, `project_members`, прогресс X/Y — корректно отложены в P2. Для P1 дефолтные колонки от `trg_zz_seed_columns` — осознанный компромисс с явной пометкой «P2 заменит».

### 3. РАЗВЕДКА и проверки

Есть grep-команды, 7 ручных сценариев, `tsc`/`build`, блок VERIFICATION. Формат близок к `crm-architect` / `sprint-example.md`.

### 4. Согласованность с rename-спринтом

Понимание, что `/projects` сейчас = сделки (`type='client'`), а delivery — отдельный модуль. Но **не зафиксировано, как это реализовать в роутинге** — см. блокеры.

---

## Блокеры (исправить до запуска)

### 1. Навигация: нет решения по роуту

Спринт пишет:

> Раздел «Проекты» = `delivery` + `internal`; сделки — в «Сделках»

Но в коде уже:

- `/projects` → Sidebar **«Сделки»** (после `sprint-rename-deals.md`)
- `PipelineBoard` / `StageBoard` работают с `type === 'client'`
- `sprint-rename-deals.md` явно запрещает менять роут `/projects`

**В спринте отсутствует:**

- новый URL для delivery (например `/implementations`, `/delivery`)
- или перенос сделок на `/deals` с возвратом `/projects` под delivery+internal
- перечень правок: `Sidebar`, `ScandiSidebar`, `ScandiContentHeader`, `CommandPalette`, `Hotkeys`, `use-saved-views`, `dashboard-content.tsx`

Без этого исполнитель не знает, **где** рендерить канбан delivery и **как** отделить от воронки сделок.

**Рекомендация:** добавить **Задачу B0 — Routing contract**, например:

```
/deals            → client (воронка сделок) — бывший /projects
/implementations  → delivery + internal (новый раздел «Проекты»)
```

или явно выбрать другой вариант и перечислить все точки навигации.

### 2. Канбан нельзя «просто переиспользовать»

`PipelineBoard`, `StageBoard`, `ProjectModal` жёстко берут пайплайн **сделок**:

```ts
// PipelineBoard.tsx:425, StageBoard.tsx:319, ProjectModal.tsx:96
pipelines?.find((p) => p.direction === dir && p.entity_type === 'deal' && p.is_default)
```

Delivery нужен `entity_type === 'project'` и другие `phase_group`: `initiated/planning/execution/completed`, не `attraction/working/approval/closing`.

Спринт B3 говорит «переиспользовать PipelineBoard», но не требует:

- отдельного компонента (`DeliveryPipelineBoard`) **или** ветки `project.type === 'delivery'` с выбором пайплайна по `entity_type`
- отдельного `PHASE_ORDER` для delivery
- обновления **всех** копий маппинга (минимум 5 файлов):

| Файл | Константы |
|------|-----------|
| `PipelineBoard.tsx` | `PHASE_ORDER`, `PHASE_LABELS`, цвета, watermark |
| `StageBoard.tsx` | `PHASE_DOT_COLOR`, `PHASE_BG_CLASS` |
| `ProjectCard.tsx` | `PHASE_COLOR` |
| `StackedPipeline.tsx` | `PHASE_LABELS`, `PHASE_COLOR` |
| `Charts.tsx` | `PHASE_GROUP_ORDER`, `PHASE_GROUP_LABEL` |

B2 («найти мапу в РАЗВЕДКЕ») — слишком размыто для такого объёма. Лучше: вынести delivery-мапу в `src/lib/constants/delivery-phases.ts` и импортировать оттуда.

### 3. Internal-проекты в канбане по `phase_group`

`internal` не имеет `pipeline_id` / `stage_id` (CHECK из 032). В канбане по 4 состояниям они **не попадут ни в одну колонку**.

Спринт обещает «delivery + internal в одном разделе», но не описывает UX для internal:

- только таблица / список?
- отдельная вкладка «Внутренние»?
- internal остаётся в «Сделках» до P2?

Сейчас internal живёт в `/projects` (Сделки) с бейджем «Внутренний» — **миграция в новый раздел сломает текущий компромисс** без явного решения.

### 4. `mapToLegacyStage` при drag delivery (IIoT)

При переносе карточки `PipelineBoard` вызывает:

```ts
// PipelineBoard.tsx:572–573
const legacyStage = mapToLegacyStage(targetStage, project.direction);
moveToStageId(project.id, targetStage.id, legacyStage, ...);
```

Для `direction='iiot'` `order_index` project-пайплайна (3–7) мапится на **стадии сделки** (`waiting_materials`, `preparing_kp`…). У delivery `stage` должен оставаться `NULL` (как у internal).

**Нужно явное правило:** для `type='delivery'` в `moveToStageId` передавать `stage: null`, не вызывать `mapToLegacyStage`.

---

## Предупреждения (желательно закрыть)

### 5. РАЗВЕДКА №2 — неточная

Ищет drag в `PipelineBoard` (верно), но в тексте фигурирует `StackedPipeline` — это **детальная страница** (`ProjectDetail`), не канбан списка. Уточнить: drag = `PipelineBoard.handleDragEnd`, грид фаз на карточке = `StackedPipeline`.

### 6. `useProjects()` — один кэш на всё

Хук грузит **все** строки `projects` без фильтра по `type` (`use-projects.ts:104–111`). После split разделов понадобится:

- фильтрация в компонентах (`client` vs `delivery|internal`), или
- `useDeals()` / `useDeliveryProjects()`, или
- query key с параметром `type`

Иначе счётчики, Cmd+K и дашборд подтянут лишние записи.

### 7. RPC spawn — только org-гард, без ownership

`convert_lead` (024) проверяет `user_id = auth.uid()`. `spawn_delivery_project` — только `org_id = current_org_id()`. Любой member org может спавнить из любой won-сделки. Если это не задумано — добавить `owner_id = auth.uid()` или роль admin/owner.

### 8. Нет обновления `docs/schema.md`

Чеклист `crm-architect` требует обновление schema после миграции. В спринте — только `database.ts` regen.

### 9. Spawn UI на won-сделке

РАЗВЕДКА №7 ищет в `ProjectDetail`, но кнопку логичнее вешать рядом с бейджем won (~`ProjectDetail.tsx:394`). Стоит указать точный якорь и диалог выбора `launch` / `experiment`.

### 10. `ProjectDetail` + `StackedPipeline`

Для delivery детальная страница должна показывать **project-пайплайн** (8/7 фаз), не deal-воронку. B5 подразумевает, но не перечисляет: `StackedPipeline` с `pipelineId={project.pipeline_id}` и расширенными `PHASE_LABELS` для delivery-слагов.

### 11. Optimistic updates / invalidate после spawn

Для drag — `useMoveProject` уже с optimistic update. Для `spawn_delivery_project` стоит явно указать `queryClient.invalidateQueries({ queryKey: ['projects'] })` и навигацию на созданный проект.

---

## Чеклист crm-architect

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА в начале | ✅ |
| Реальные имена таблиц/колонок | ✅ |
| Реальные пути файлов | 🟡 неполно (навигация, 5 файлов phase map) |
| learnings.md (mapToLegacyStage, ownership RPC) | 🟡 частично |
| Миграция отдельно, не применять | ✅ |
| `database.ts` + validators | ✅ |
| Optimistic updates | 🟡 не для spawn |
| `schema.md` update | ❌ |
| org_id / RLS | ✅ |
| SECURITY DEFINER + search_path | ✅ |
| Коммит | ✅ |

---

## Миграция SQL — мелочи

1. **`probability` на reseed-стадиях** — не задаётся. Триггеры, вероятно, переживут NULL; при желании — `0` для единообразия.
2. **Имя проекта** — `name || ' — внедрение'` при 1:N даст дубликаты; для P1 ок, в P2 — суффикс kind/дата.
3. **`activity_log`** — `convert_lead` пишет событие; для spawn не описано (nice-to-have).

---

## Рекомендуемые правки в sprint-delivery-projects-p1.md

| # | Что добавить | Приоритет |
|---|--------------|-----------|
| 1 | **B0: Routing contract** — URL, Sidebar, redirects, saved views | Блокер |
| 2 | Список файлов с `PHASE_*` + `delivery-phases.ts` | Блокер |
| 3 | UX internal в новом разделе (таблица / вкладка / оставить в Сделках) | Блокер |
| 4 | `mapToLegacyStage` → `null` для `type='delivery'` | Блокер |
| 5 | `entity_type='project'` в компоненте канбана delivery | Блокер |
| 6 | Строка про `docs/schema.md` | Warning |
| 7 | Ownership-гард в RPC (если нужен) | Warning |
| 8 | Якорь кнопки spawn + invalidate кэша | Warning |

---

## Итог

Спринт **сильный на уровне БД** и хорошо интегрирует решения из architecture §8–§9 (phase_group, финальный мэппинг ERP/IIoT, статус `open/completed`). Главные дыры — **навигация после rename-deals** и **недооценка UI-ветвления** (отдельный роут, `entity_type='project'`, 5 копий phase map, internal без воронки, `stage: null` при drag).

**Минимум перед запуском Claude Code:**

1. Задача **B0: routing contract**
2. Явный **UI-контракт канбана** + список файлов
3. Поведение **internal** в новом разделе
4. Правило **`mapToLegacyStage` → null для delivery**
5. Строка про **`docs/schema.md`**

После этого — **готов к исполнению**. Оценка **1–1.5 спринта** реалистична.