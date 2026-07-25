# Ревью: internal-metrics-leak (sprint v1)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `71c613f`; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-internal-metrics-leak.md` — internal-проекты вне deal-метрик (status/type вместо legacy stage) + скрытие deal-health на internal  
**Контекст:** PCT-1 (`projects.type` / nullable `stage_id`); **уже влито** `ca76c6e` (2026-07-10); добор — `7a3a72b` + sprint-2; позже DROP `projects.stage` (047 / B1–B3). Есть смежный `_analysis/sprint-internal-metrics-leak-2.md` (тоже DONE).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА есть | ✅ |
| РАЗВЕДКА актуальна vs live | ❌ 0 legacy-фильтров `.stage`; пути/строки устарели |
| Design: sales vs internal | ✅ корректно (`type === 'client'`) |
| Schema: `status` / `type` | ✅ реальные поля; **`stage` снесён (047)** |
| ЗАДАЧА 1 DashboardHome | ✅ уже в live (`type`+`status`) |
| ЗАДАЧА 2 SmartAlerts | ❌ файл **удалён**; живой контур был `use-alerts.ts` (закрыт в v2) |
| ЗАДАЧА 3 ContactDetailHub | ✅ уже `status !== 'lost'` |
| ЗАДАЧА 4 PipelineBoard KPI | ✅ уже `type === 'client'` |
| ЗАДАЧА 5 ProjectDetail HealthDot | ✅ уже под `type === 'client'`; direction-бейдж для internal — «Внутренний» |
| «Не трогать» dual-write / STAGE_CONFIG | 🟡 ок по смыслу; `mapToLegacyStage` / STAGE_CONFIG-читатели уже сняты позже |
| Готовность к запуску в CC | ❌ **не запускать** |

**Оценка: 2/10 как живой handoff** (все 5 задач DONE; сниппеты/пути stale; повторный прогон вреден). Как историческая фиксация диагноза и design-решения — 8/10.  
**Рекомендация:** **не запускать в Claude Code.** Пометить DONE / архивировать. Добор уже закрыт `7a3a72b` + review sprint-2. Residual sales-метрики вне скоупа — отдельный мини-бэклог (см. W*).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| Этот sprint (v1): 5 файлов | ✅ **`ca76c6e`** (2026-07-10) — message ≈ секция «КОММИТ» |
| Добор (v2): use-alerts, rm SmartAlerts, виджеты, weekly… | ✅ **`7a3a72b`** (2026-07-10) |
| DROP legacy `projects.stage` + миграция UI на `stage_id` | ✅ 047 + B1/B1.5/B3 (`044253a`…`d904172`) |
| Текущая ветка | `main` (ahead origin), **не** `feat/aura-theme` |

---

## С чем согласен полностью

### 1. Диагноз (был верен на момент написания)

У `type='internal'`: `stage_id`/`pipeline_id`/`direction` NULL, `status='open'` (CHECK `projects_type_pipeline_chk`, schema 032/learnings).  
Фильтр `p.stage !== 'won' && p.stage !== 'lost'` при `stage=null` давал **true** → internal в «активных». Design «sales-метрики = только client» — правильный.

### 2. Нет SQL / миграций / RLS

Только клиентские фильтры — `RLS Coverage: NOT_APPLICABLE` ок. Checklist crm-architect по SECURITY DEFINER / org_id N/A.

### 3. `status` и `type` — реальные поля

`Project` (`use-projects.ts:54–80`):  
`status: 'open'|'won'|'lost'|'on_hold'|'completed'`,  
`type: 'client'|'internal'|'delivery'`.  
Колонки schema: `projects.type`, `projects.status`; **`projects.stage` DROPped 047**.

### 4. Scope «не трогать STAGE_CONFIG-отображение / dual-write / PCT-1 board»

Разумен для v1. В live dual-write и STAGE_CONFIG-читатели уже убраны последующими stage-рефакторами — «не трогать» сейчас = «не воскрешать».

### 5. ContactDetailHub: без type-гейта — верно

Связанные проекты контакта — operational; internal «Пресейл Ориентир» должен оставаться. Live: `status !== 'lost'` (`ContactDetailHub.tsx:172`).

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже выполнен — повторный CC-прогон запрещён

```
ca76c6e fix(pct-1): internal-проекты вне deal-метрик (status/type вместо legacy stage), deal-health скрыт на internal
  DashboardHome.tsx | PipelineBoard.tsx | ProjectDetail.tsx | ContactDetailHub.tsx | SmartAlerts.tsx
```

Все 5 задач v1 закрыты. Повтор: no-op, конфликты со stale-сниппетами (chart на `p.stage`, несуществующий SmartAlerts) или регресс относительно `stage_id`-мира после 047.

### B2. РАЗВЕДКА №1 на live — пусто

```bash
# live main @ 71c613f:
rg -nE "\.stage !== 'won'|\.stage === 'won'|\.stage === 'lost'|\.stage !== 'lost'" src --glob '*.tsx'
# → 0 matches
rg -n "\.stage\b" src --glob '*.{ts,tsx}'  # p.stage / project.stage как поле Project
# → 0 (только stage_id / stage_entered_at / event_type stage_change)
```

Инвентарь «целей правок» **пуст**. Спринт, который просит «найти и починить» по этому grep, — **stale handoff**, не executable prompt.

### B3. SmartAlerts.tsx — неверный путь «алертов» + файла нет

| Утверждение спринта | Live |
|---------------------|------|
| Править `src/components/shared/SmartAlerts.tsx` ~45/58 | **Файла нет** (удалён в `7a3a72b`) |
| KPI-алерты там | Живой код: `src/lib/hooks/use-alerts.ts:34–50` (уже `type === 'client'`) |

В v1 `ca76c6e` правил **мёртвый** SmartAlerts; реальные алерты добраны только в v2. Запуск ЗАДАЧИ 2 сейчас → `ENOENT` / бессмысленный `git add` несуществующего файла.

### B4. Сниппеты с legacy `stage` / неверные line numbers

| Спринт | Live truth |
|--------|------------|
| DashboardHome KPI ~194 | `KpiCards` **:174–176** — уже `type === 'client' && status…` |
| Chart ~435; `active.filter(p.stage === stage)` «не менять» | Chart **:395** — active уже client+status; распределение по **`stage_id`** (:397–400), не `p.stage` |
| ContactDetailHub ~168 | **:172** — уже `status !== 'lost'` |
| PipelineBoard ~133 | HeroMetrics **:116** — уже `type === 'client'` |
| ProjectDetail HealthDot ~333 | **:281–283** — уже `project.type === 'client' && <HealthDot…>` |
| Direction Badge ~330 «ERP при direction=null» | **:260–266** — `type === 'internal'` → Badge «Внутренний»; ERP/IIoT только иначе |
| Ветка `feat/aura-theme` | **`main`** |

Применение chart-сниппета «как есть» (оставить `p.stage === stage`) противоречит post-047 коду и сломает tsc (поля `stage` у `Project` нет).

### B5. Контекст schema: legacy stage больше не «зеркало»

Спринт: «у client legacy `stage` заполнен зеркалом».  
**schema.md 047:** колонка `projects.stage` и тип `deal_stage` **DROPped**; истина — `stage_id → pipeline_stages`.  
Триггер `trg_ab_null_internal_stage` снят вместе с колонкой. Упоминание dual-write `mapToLegacyStage` — мёртвый «не трогать» (символа в `src/` нет).

---

## Предупреждения (желательно, вне обязательного re-run)

### W1. Residual sales-метрики без `type === 'client'`

Не входят в 5 задач v1, но тот же класс риска (если считать «сделки»):

| Место | Поведение |
|-------|-----------|
| `ActivityDrawer` local StatsWidget (`~209`) | `isProjectActive` → internal open = «Сделок»++ (stage_id null → fallback status) |
| `CompaniesTable.tsx:68` | pipeline £ компании: `status` без type → budget internal в «открытом pipeline» |
| `PipelineBoard.tsx:117–118` | `won`/`lost` без type (delivery CHECK: только open/completed → обычно 0; client-only явно чище) |
| `ProjectsTable.tsx:80` | active без type — ок, если список уже scope-filtered; иначе internal в таблице «сделок» |

Операционные (осознанно без type в v2): MeetingModal, DeadlineRadar, DashboardHome deadline ~595, derive-links, ContactDetailHub.

### W2. CompletenessBadge на internal

ProjectDetail: HealthDot скрыт для non-client; `CompletenessBadge` — `{!isDelivery && …}` → **показывается на internal** (поля сделки: budget/stage/…). Косметика, не KPI-leak. Вне скоупа спринта.

### W3. `useAlerts` / StatusBeacon — orphan

После AUDIT C (`Header` удалён) `useAlerts` нигде не импортируется; колокол алертов в shell не монтируется. Фильтр в хуке корректен, UI-сценарий «алерты не показывают internal» **непроверяем**.

### W4. Charts.tsx «Сделки по фазам»

Фильтр через `stage_id` + `!is_won/!is_lost` — internal (stage_id null) **исключён** без явного type. Ок по эффекту; явный `type === 'client'` был бы яснее.

### W5. Commit message / git add в спринте

`git add … SmartAlerts.tsx` — файл отсутствует. Message v1 уже в истории (`ca76c6e`). Не коммитить повторно.

---

## Пропущенные места (относительно заявленного скоупа v1)

| Файл | Строки | Действие |
|------|--------|----------|
| `DashboardHome.tsx` | 174–176, 395 | **DONE** — не трогать |
| `use-alerts.ts` | 34–50 | DONE в v2 (не в v1-списке add) |
| `SmartAlerts.tsx` | — | **удалён** — не add |
| `ContactDetailHub.tsx` | 172 | **DONE** |
| `PipelineBoard.tsx` | 116 | **DONE** (active); won/lost без type — W1 |
| `ProjectDetail.tsx` | 260–283 | **DONE** HealthDot + internal badge |
| `StatsWidget` / `FunnelWidget` / `TasksSidebar` / `WeeklyReview` | — | DONE в **v2**, не v1 |
| `ActivityDrawer` StatsWidget | ~209 | residual (W1) — не в v1 |

---

## Предлагаемые правки в спринт

1. **В шапке:** `STATUS: DONE — ca76c6e (2026-07-10). НЕ ЗАПУСКАТЬ в CC.`  
2. **Ссылка:** добор → `_analysis/sprint-internal-metrics-leak-2.md` / `7a3a72b`.  
3. Убрать/перечеркнуть ЗАДАЧИ 1–5 как executable diff; оставить как design-record.  
4. Заменить «ветка feat/aura-theme» → `main`; убрать упоминания `projects.stage` как живой колонки (→ 047).  
5. ЗАДАЧА 2: SmartAlerts → «удалён; use-alerts починен в v2».  
6. Chart: не ссылаться на `p.stage === stage` — в live `stage_id`.  
7. Residual W1 — отдельный optional sprint, не re-open v1.

---

## Чеклист crm-architect

- [x] Есть РАЗВЕДКА  
- [x] Реальные `status` / `type` (на момент v1; `stage` с тех пор снесён)  
- [ ] Актуальные пути/строки vs live — **провал (stale)**  
- [x] learnings: nullable stage_id/direction для internal учтён в диагнозе  
- [x] Нет миграций из CC  
- [x] org_id / RLS N/A  
- [x] CSS N/A  
- [x] schema update N/A  
- [ ] **Executable для CC** — **нет (DONE)**

---

## Чеклист перед CC

- [x] Подтверждено: `ca76c6e` в history `main`  
- [x] Подтверждено: legacy `.stage !==/=== won|lost` = 0 hits  
- [x] Подтверждено: SmartAlerts отсутствует; use-alerts с type-гейтом  
- [x] Подтверждено: HealthDot / KPI Dashboard / Pipeline active — client-only  
- [ ] **Не запускать** этот файл в Claude Code  
- [ ] (Опционально) пометить sprint DONE / архивировать  
- [ ] (Опционально) residual W1 — отдельный мини-промпт, не v1

---

**Итог:** design-решение и список 5 мест v1 были верны и **уже внедрены**. Как handoff на 2026-07-16 файл **нельзя** отдавать в CC: цели закрыты, разведка пуста, сниппеты ссылаются на несуществующие `stage`/SmartAlerts/line numbers.
