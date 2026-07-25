# Ревью: internal-metrics-leak-2 (добор утечки + SmartAlerts)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `71c613f`, ancestor `7a3a72b`; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-internal-metrics-leak-2.md` — добор internal в deal-метриках (use-alerts, виджеты, weekly, связи/дедлайны, удаление SmartAlerts)  
**Контекст:** первый заход `_analysis/sprint-internal-metrics-leak.md` → `ca76c6e` (2026-07-10); добор → **`7a3a72b`** (2026-07-10) с **байт-в-байт** message из секции «КОММИТ». Позже: DROP `projects.stage` (047 / B1–B3), AUDIT C (удаление `Header.tsx`).

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА есть | ✅ |
| РАЗВЕДКА актуальна vs live | ❌ полностью устарела (утечки уже закрыты; `projects.stage` снесён) |
| Классификация sales vs ops | ✅ корректна (и уже применена) |
| ЗАДАЧА 1 (use-alerts + rm SmartAlerts) | ✅ уже в `7a3a72b`; SmartAlerts нет на диске |
| ЗАДАЧА 2 (Stats/TasksSidebar/Weekly) | ✅ уже `type === 'client'` + `status` / `stage_id` |
| ЗАДАЧА 3 (MeetingModal / derive-links / DeadlineRadar / DashboardHome) | ✅ уже `status`, без `type`-гейта |
| ЗАДАЧА 4 (FunnelWidget) | ✅ уже `type`+`status`+`stage_id` (сильнее сниппета спринта) |
| Пути / line numbers | ❌ устарели (Weekly `~36–37`, DashboardHome `~634`, Funnel «строка 12») |
| Schema: `status` / `type` | ✅ `status`, `type`, `stage_id` есть; **`stage` нет** (047) |
| «Header → use-alerts» | ❌ `Header.tsx` удалён (AUDIT C); `useAlerts` **нигде не импортируется** |
| Scope / «не трогать» | 🟡 ок по смыслу; `mapToLegacyStage` уже снят (B1) |
| Готовность к запуску в CC | ❌ **не запускать** |

**Оценка: 2/10 как живой handoff** (все задачи DONE; повторный прогон сломает/занулит работу). Как историческая фиксация классификации — ок.  
**Рекомендация:** **не запускать в Claude Code.** Пометить спринт DONE / архивировать. Отдельный мини-бэклог — residual sales-метрики вне этого файла (см. W*).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| Первый: DashboardHome KPI/chart, SmartAlerts, ContactDetailHub, PipelineBoard, ProjectDetail health | ✅ `ca76c6e` |
| Добор: use-alerts, rm SmartAlerts, Stats/TasksSidebar/Weekly, MeetingModal, derive-links, DeadlineRadar, DashboardHome deadline, Funnel | ✅ `7a3a72b` (11 файлов: +16/−144) |
| Пост-миграция: `projects.stage` DROP, читатели → `stage_id` | ✅ B1/B1.5/B3 + 047 (`schema.md`) |
| Колокол алертов в шапке | ⚪ `useAlerts`/`StatusBeacon` — **мёртвый контур** (нет consumers) |

---

## С чем согласен полностью

### 1. Design-решение sales vs operational

- **Sales-метрика** → `type === 'client'` + `status` (не legacy stage).  
- **Операционная связь/дедлайн** → internal оставляем, только `status`.  

В live это выдержано в целевых местах спринта.

### 2. Нет SQL / миграций

Клиентские фильтры, RLS N/A — совпадает с checklist crm-architect.

### 3. `status` / `type` — реальные поля

`Project` Row (`supabase.gen`): `status`, `type`, `stage_id`; **`stage` отсутствует** после 047.  
`ProjectType = 'client' | 'internal' | 'delivery'` (`database.ts:151`).  
`DealStatus` включает `open|won|lost|on_hold|completed`.

### 4. SmartAlerts был мёртвым — и уже удалён

`git rm` из спринта уже сделан в `7a3a72b`. Файл `src/components/shared/SmartAlerts.tsx` **отсутствует**. Экспорт из `shared/index.ts` снят.

### 5. Живой код use-alerts уже с type-гейтом

```35:50:src/lib/hooks/use-alerts.ts
(p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && !p.contact_id,
// …
(p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && p.company_id,
```

Идентично сниппету ЗАДАЧИ 1.

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже выполнен — повторный CC-прогон запрещён

Коммит **`7a3a72b`** (2026-07-10) — ancestor `HEAD` `main`, message = секция «КОММИТ» спринта.  
`git show --stat 7a3a72b`: ровно перечисленные файлы + FunnelWidget + `shared/index.ts`.

Повтор: no-op diff или `git rm` несуществующего файла + риск «исправить» уже мигрированный Weekly/Funnel устаревшими сниппетами.

### B2. РАЗВЕДКА №2 врёт про «оставшиеся» `.stage`-фильтры

```bash
# live (2026-07-16, main):
rg -nE "\.stage !== 'won'|\.stage === 'won'|…" src  →  0 matches
```

Инвентарь «ещё 8 мест legacy-фильтров» **пуст** не «после захода», а **уже сейчас**. Причина: добор `7a3a72b` + B1.5/B3 (`f3ec081`, `d904172`) + DROP 047.

Спринт, который просит CC «найти и починить» пустой grep-результат, — **stale handoff**, не executable prompt.

### B3. Сниппеты с `p.stage` / `getPhaseForStage(p.stage)` сломают tsc

| Место в спринте | Live truth |
|-----------------|------------|
| WeeklyReview: `p.stage !== 'new_lead'`, `p.stage === 'won'` | `!atEntryStage(p.stage_id)` + `p.status === 'won'` + `type === 'client'` (`WeeklyReview.tsx:50–51`) |
| FunnelWidget «оставить getPhaseForStage(p.stage)» | `phaseOf(p.stage_id)` + `PHASE_GROUP_TO_PHASE` (`FunnelWidget.tsx:8–31`) |
| DashboardHome `~634` | deadline-фильтр на **~595** |
| Колонка `projects.stage` | **DROP 047** (`schema.md`: stage_id — единственный источник стадии) |

Применение сниппетов «как написано» → ошибки типов / регресс относительно B1.5.

### B4. Утверждение «алерты ещё не починены» + «Header → use-alerts» — ложь в обе стороны

1. **Фильтр в `use-alerts.ts` уже починен** (`type === 'client'`).  
2. **UI-колокол не живёт через Header:** `architecture.md` — `Sidebar.tsx`/`Header.tsx` удалены (AUDIT C); layout = `ContentHeader` / `TextNavSidebar`.  
3. **`useAlerts` и `StatusBeacon` — orphan:**  
   - `rg useAlerts src` → только определение в `use-alerts.ts`;  
   - `StatusBeacon` нигде не монтируется.  

Ручной сценарий 1 («колокол в шапке не показывает internal») **непроверяем** — контура нет. Чинить «живые алерты» этим спринтом больше нельзя: хук починен, wiring отсутствует.

### B5. `git rm SmartAlerts` без существования файла

РАЗВЕДКА №1 live: 0 импортов **и** 0 файла. Команда из ЗАДАЧИ 1 упадёт. (Ветка/контекст `feat/aura-theme` не спасает: тот же `7a3a72b` уже в истории ветки.)

---

## Предупреждения (желательно, не блокеры повторного запуска — запуск и так запрещён)

### W1. Ветка в шапке спринта vs рабочее дерево

Спринт: `feat/aura-theme`.  
Live review: `main` (ahead origin), содержит оба fix-коммита. Запуск «на aura» без rebase даст ту же already-done картину.

### W2. Residual sales-метрики **вне** этого спринта (если когда-то делать «leak-3»)

| Файл | Суть | Класс |
|------|------|--------|
| `CompaniesTable.tsx:68–70` | pipeline £ по company: `status !== won/lost` **без** `type === 'client'` | sales £ — internal/delivery budget может течь |
| `ActivityDrawer.tsx:206–210` | label «Сделок» = `isProjectActive` **без** type | счётчик; internal `status=open` → true (`use-pipelines.ts:79–82`) |
| `PipelineBoard.tsx:117–118` | `won`/`lost` без type (active уже с type) | conversion; internal rarely won |
| `TodayView.tsx:106` | `activeProjects` без type (health-список на :94 — с type) | ops/sales mixed |
| `Charts.tsx:159–163` | active через `stage_id` → is_won/is_lost | internal (`stage_id=null`) **отсечён** — ок |

Не чинить «по этому спринту» — иначе scope creep; завести отдельный micro-sprint при необходимости.

### W3. `useAlerts` / `StatusBeacon` — мёртвый код

Либо вмонтировать в `ContentHeader` (и тогда фильтр client уже готов), либо удалить/не трогать. Вне скоупа leak-2, но сценарий «колокол» из ПРОВЕРКИ — fiction.

### W4. Diagnostic grep по `database.ts` для status/type

`grep … database.ts | client|internal` почти бесполезен: поля Row живут в `supabase.gen` / `entities.ts` (`export type Project = …Row`). Тип `ProjectType` — да; колонок `status:` на интерфейсе Project в `database.ts` нет.

### W5. «Не трогать mapToLegacyStage / STAGE_CONFIG»

`mapToLegacyStage` в `src` **отсутствует** (снят B1). STAGE_CONFIG-читатели частично ушли на `stage_id` (ProjectCard и др.). Формулировка «не трогать» безвредна, но описывает мир pre-047.

### W6. delivery (`type='delivery'`)

Спринт говорит только internal vs client. Delivery: `status` open/completed (CHECK 035), не won/lost — в «active !== won/lost» попадает. Для **sales** pipeline это тоже не deal; `type === 'client'` это закрывает. Для ops (дедлайны) delivery в радаре — осознанно или нет, спринт не обсуждает.

---

## Пропущенные места (относительно заявленного инвентаря)

| Файл | Live (релевантные строки) | Действие для CC |
|------|---------------------------|-----------------|
| `use-alerts.ts` | 35, 50 — уже client+status | **не трогать** |
| `SmartAlerts.tsx` | отсутствует | **не rm повторно** |
| `StatsWidget.tsx` | 47–48 — client+status | done |
| `TasksSidebar.tsx` | 181 — client+status | done |
| `WeeklyReview.tsx` | 50–51 — client + stage_id entry + status won | done (лучше сниппета) |
| `MeetingModal.tsx` | 41 — status only | done |
| `derive-links.ts` | 53 — status only | done |
| `DeadlineRadar.tsx` | 43 — status only | done |
| `DashboardHome.tsx` | 174–176, 395 — client; 595 — deadline status only | done |
| `FunnelWidget.tsx` | 23, 38–39 — client+status; phase via stage_id | done |
| `Header.tsx` | **нет файла** | не искать |

Пробелов «надо дописать в этот спринт» для заявленных 8 мест **нет**.

---

## Предлагаемые правки в спринт

1. **Шапка:** `STATUS: DONE 2026-07-10 · 7a3a72b` (+ first pass `ca76c6e`). **Do not re-run.**  
2. Удалить/зачеркнуть executable-задачи и `git rm` / commit-block.  
3. РАЗВЕДКА → verification-only: ожидать **0** `.stage`-фильтров won/lost; отсутствие SmartAlerts; наличие type-гейтов в списке файлов.  
4. Убрать ссылки на `p.stage` / `Header.tsx`; зафиксировать post-047: `stage_id` + `status` + `type`.  
5. Сценарий алертов: либо «N/A — useAlerts orphan», либо отдельный sprint «wire StatusBeacon в ContentHeader».  
6. Опционально: backlog «leak-3» только для `CompaniesTable` pipeline £ (+ при желании ActivityDrawer «Сделок»).

---

## Чеклист crm-architect (condensed)

- [x] Есть РАЗВЕДКА  
- [ ] РАЗВЕДКА совпадает с live — **нет**  
- [x] Реальные колонки `status`/`type` (не выдуманы)  
- [ ] Сниппеты не ссылаются на удалённый `stage` — **нет**  
- [x] SQL/миграции не требуются  
- [x] org_id/RLS не затронуты  
- [x] SECURITY DEFINER N/A  
- [x] Нет `flowType: 'implicit'`  
- [x] CSS N/A  
- [x] schema.md после миграции N/A (миграция не в скоупе)  
- [ ] Executable для CC — **нет (DONE)**  

---

## Чеклист перед CC

- [x] Подтверждено: `7a3a72b` в `main` / `feat/aura-theme`  
- [x] SmartAlerts отсутствует; use-alerts с `type === 'client'`  
- [x] Виджеты Stats/Funnel/TasksSidebar/Weekly — client-гейт  
- [x] MeetingModal / derive-links / DeadlineRadar / DashboardHome:595 — status, internal сохранён  
- [x] `rg '\.stage !== .won'` → пусто  
- [ ] **Не** запускать Claude Code по этому файлу  
- [ ] Пометить `_analysis/sprint-internal-metrics-leak-2.md` как DONE (вручную)  
- [ ] (Опц.) отдельный micro-sprint: CompaniesTable pipeline £; wire/delete useAlerts  

---

**Итог:** класс «internal течёт в deal-метрику» по инвентарю этого handoff **закрыт с 2026-07-10**. Документ — архивная инструкция, не runnable sprint. Запуск в CC = регресс-риск (устаревшие `stage`-сниппеты) + no-op/ошибка на `git rm`.
