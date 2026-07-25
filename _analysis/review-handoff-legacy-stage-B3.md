# Ревью: handoff-legacy-stage-B3 (S-LEGACY-STAGE-1 · B3)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, grep, `npx tsc --noEmit`)  
**Объект:** `_analysis/handoff-legacy-stage-B3.md` — regen типов + снос легаси-символов `deal_stage` (пост-DROP 047)  
**Контекст:** B1/B1.5 задеплоены (`044253a`, `f3ec081`); B2 (миграция `047_drop_legacy_projects_stage`) по handoff исполнен Cowork'ом на проде через Supabase MCP; **B3 в коде ещё не начат**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Pushback `STAGE_CONFIG` → `LEGACY_STAGE_LABELS` | ✅ Критично верно |
| РАЗВЕДКА: мёртвые символы vs живые потребители | ✅ Подтверждена grep'ом |
| Сохранение `phases`/`PHASE_CONFIG` (FunnelWidget) | ✅ |
| Порядок задач regen → типы → validators → потребители | ✅ |
| Гейт `npx tsc --noEmit` | ✅ |
| Scope: только клиент, БД не трогаем | ✅ |
| Задача 2: optimistic insert `stage` в `useCreateProject` | 🟡 Не упомянут |
| Grep-гейт `.stage\b` — ложные срабатывания | 🟡 Нужна поправка |
| `onSuccess` после снятия `stage_change`-ветки | 🟡 Уточнить в промпте |
| Миграция 047 отсутствует в репо | 🟡 Governance, не блокер B3 |

**Оценка: 9/10.** Handoff зрелый, главное архитектурное решение (не сносить лейблы истории) обосновано и проверено по коду. **Можно отдавать в Claude Code** после 2–3 строк уточнений в Задаче 2 и в блоке ПРОВЕРКА.

---

## Статус цепочки S-LEGACY-STAGE-1

| Фаза | Статус в репо | Факт по коду |
|------|---------------|--------------|
| A — читатели → `stage_id` | ✅ | ProjectCard, ProjectDetail, ProjectsTable, ProjectPeek и др. |
| B1 — убрать клиентские записи `stage` | ✅ | `moveToStageId` без legacy; формы не шлют `stage` |
| B1.5 — миграция читателей + select | ✅ | `PROJECT_COLUMNS` **без** `stage` (`use-projects.ts:140–148`) |
| B2 — DROP `projects.stage` на проде | ⚠️ вне репо | `supabase/migrations/` — файла `047_*` нет; handoff: DROP верифицирован на `uoiavcabxgdjugzryrmj` |
| **B3 — regen + cleanup символов** | ❌ не начат | Легаси-символы на месте (см. таблицу ниже) |

---

## С чем согласен полностью

### 1. Pushback против слепого сноса `STAGE_CONFIG`

Handoff прав: `STAGE_CONFIG` **не мёртв** — живые потребители только как `shortLabel` для исторических `activity_log.stage_change`:

| Файл | Строки | Использование |
|------|--------|---------------|
| `lib/utils/activity-events.ts` | 1, 6 | `stageName()` → `describeEvent('stage_change')` |
| `components/dashboard/DashboardHome.tsx` | 37, 689–691 | Дубль `stageName()` + inline `describeEvent` |
| `components/projects/ProjectPeekContent.tsx` | 9, 82 | импорт `describeEvent` из activity-events |
| `lib/hooks/use-entity-timeline.ts` | 17, 130 | импорт `describeEvent` |

`LostDeals.tsx:5` — **только импорт**, использований `STAGE_CONFIG` в теле файла нет (подтверждено).

Замена на `LEGACY_STAGE_LABELS` (вариант A) — правильный дефолт: на проде в ленте «Последние действия» должны остаться «Лид → Выигр.», не `contract_review`.

### 2. Мёртвый код — grep подтверждает 0 внешних вызовов

| Символ | Определение | Внешние импорты/вызовы |
|--------|-------------|------------------------|
| `dealStages` | `validators/project.ts:8` | 0 |
| `type DealStage` (validators) | `project.ts:15` | только `use-projects.ts:6` |
| `type DealStage` (orphan) | `types/database.ts:138` | 0 |
| `getPhaseForStage` | `project.ts:96` | 0 (FunnelWidget уже на `phaseFromPhaseGroup`) |
| `getActiveStages` | `project.ts:101` | 0 |
| `PHASE_CONFIG[].stages` | `project.ts:61,70–91` | 0 чтений (FunnelWidget берёт только label/color/bg/dot) |

### 3. Живое — handoff не трогает верно

- `phases`, `Phase`, `PHASE_CONFIG` — `FunnelWidget.tsx:6,47`
- `stage_id`-инфраструктура — `usePipelineStages`, `useStagesMap`, `moveToStageId`, `stage-track.ts`
- `sortOptions` value `'stage'` — сортировка канбана по `order_index` через `stage_id` (`PipelineBoard.tsx:434–437`), **не** legacy enum
- `chartData[idx]?.stage` в `DashboardHome.tsx:454,408` — это **UUID `stage_id`**, не `projects.stage`

### 4. Задача 1 (regen) — необходима

`src/types/supabase.gen.ts` всё ещё содержит:

- `projects.Row/Insert/Update.stage: deal_stage`
- enum `deal_stage` в `Enums` и `Constants`

После regen с прода (post-047) ожидаемо исчезнут — handoff корректно ставит regen **первым** шагом.

### 5. Degraded-логгер `stage_change` — правильно убрать, не чинить

`use-projects.ts:444–445`:

```ts
if (vars.stage && oldProject && vars.stage !== oldProject.stage) {
  logActivity(vars.id, 'stage_change', { from: oldProject.stage, to: vars.stage });
}
```

- `PROJECT_COLUMNS` уже не тянет `stage` → `oldProject.stage` всегда `undefined` в рантайме (degraded).
- Триггер `on_stage_change` дропнут в B2 → новые `stage_change` в БД не пишутся.
- Удаление вызова + снятие поля из типов — верно; backlog на stage_id-логгер — отдельный спринт.

### 6. Проверки и коммит

- `npx tsc --noEmit` сейчас **зелёный** (базовая линия до B3).
- Коммит-message и гейт «только `src/`» — согласованы с B1/B1.5.
- Смок прода (лента, канбан, воронка) — уместен как пост-деплой гейт.

---

## Рекомендации (не блокеры)

### 1. Задача 2 — явно добавить optimistic insert

Handoff перечисляет `interface Project` / `ProjectInsert`, но **не называет** `useCreateProject` → `onMutate` (`use-projects.ts:361`):

```ts
stage: newProject.stage ?? null,
```

После снятия `stage` из `ProjectInsert` tsc упадёт здесь. **Добавить в промпт:** убрать строку из optimistic-объекта (поле `stage_id` уже есть на строке 378).

### 2. Задача 2 — упростить `onSuccess` целиком

После удаления ветки `vars.stage` логичная форма:

```ts
onSuccess: (_result, vars) => {
  const changed = Object.keys(vars).filter((k) => k !== 'id');
  if (changed.length > 0) {
    logActivity(vars.id, 'project_updated', { fields_changed: changed });
  }
},
```

Иначе CC может оставить пустой `if/else` с мёртвой веткой.

### 3. Grep-гейт `.stage\b` — исключить ложные срабатывания

Текущая команда из handoff после B3 всё равно покажет:

- `DashboardHome.tsx:454` — `chartData[idx]?.stage` (ключ = `stage_id` UUID)
- `ProjectsTable.tsx:110,315` — `key: 'stage'` (имя колонки таблицы)
- `validators/project.ts:168` — `value: 'stage'` (sort option)
- `delivery-health.ts:116` — параметр `stage:` (объект pipeline stage)

**Предложение для промпта:**

```bash
grep -rn "\.stage\b" src/ \
  | grep -v "stage_id\|stage_entered\|pipeline_stage\|stage-track\|\.stages\b\|chartData\|key: 'stage'\|value: 'stage'\|// " \
  || echo "поле p.stage нигде не читается"
```

Либо сузить гейт до `p\.stage\b|project\.stage\b|oldProject\.stage|vars\.stage|newProject\.stage`.

### 4. DRY: дубль `describeEvent` в DashboardHome

`DashboardHome.tsx:689–710` дублирует `lib/utils/activity-events.ts` (~40 строк). B3 меняет оба на `LEGACY_STAGE_LABELS`. **Опционально в том же спринте:** импортировать `describeEvent` из activity-events, удалить локальную копию — меньше расхождений в будущем. Не обязательно, если scope «только замена импорта».

### 5. Миграция 047 в репозиторий

B2 выполнен через MCP, файла в `supabase/migrations/` нет. B3 не блокируется (regen с `--project-id` тянет живую схему), но для трассируемости стоит **отдельным коммитом** добавить `047_drop_legacy_projects_stage.sql` в репо — вне scope B3, на усмотрение Cowork.

### 6. Backlog явно зафиксировать в итоге спринта

После B3:

- Новые события `stage_change` **не пишутся** (ни триггер, ни клиент).
- Исторические записи форматируются через `LEGACY_STAGE_LABELS`.
- **Следующий спринт:** stage_id-логгер (from/to = имена из `pipeline_stages`, actor, timestamp).

---

## Чеклист crm-architect

- [x] РАЗВЕДКА с реальными путями и строками
- [x] Без миграций / без apply из CC (B3 = клиент)
- [x] Regen `supabase.gen.ts` — единственный источник для `entities.ts` через `database.ts`
- [x] `PHASE_CONFIG` / FunnelWidget не затронуты функционально
- [x] Optimistic mutations — только снятие мёртвого поля `stage` из optimistic insert
- [x] `npx tsc --noEmit` — главный гейт
- [ ] Задача 2: optimistic insert — **добавить в handoff**
- [ ] Grep `.stage\b` — **уточнить исключения**

---

## Сводка для гейта Cowork (после B3)

1. `npx tsc --noEmit` — 0 ошибок
2. Grep легаси-символов: нет `DealStage`/`dealStages`/`STAGE_CONFIG`/`getPhaseForStage`/`getActiveStages` (кроме `LEGACY_STAGE_LABELS`)
3. `git diff --stat src/types/supabase.gen.ts` — `projects` без `stage`, `deal_stage` enum исчез
4. **Смок прода:** лента «Последние действия» — исторические «Стадия: X → Y» с короткими лейблами; канбан/воронка/CommandPalette/создание/редактирование/win/lost/drag — без ошибок БД и консоли
5. **Ожидаемый регресс (документировать):** новые `stage_change` в activity_log не появляются до backlog-спринта логгера

---

## Итог

Handoff B3 — **качественный финальный cleanup** цепочки S-LEGACY-STAGE-1: правильно отделяет исторические лейблы (`LEGACY_STAGE_LABELS`) от мёртвого enum-конфига, не ломает FunnelWidget и не трогает stage_id-инфраструктуру. РАЗВЕДКА Cowork по «мёртвым» символам подтверждена; единственный живой хвост `STAGE_CONFIG` корректно сохранён в урезанном виде.

**Статус исполнения на 2026-07-16:** спринт **не выполнен** — в `main` легаси-символы на месте, `supabase.gen.ts` не перегенерирован. После 2–3 уточнений в промпте — **готов к запуску в Claude Code.**