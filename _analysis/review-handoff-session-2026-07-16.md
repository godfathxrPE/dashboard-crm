# Ревью: handoff-session-2026-07-16 (Волна 2, session handoff)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `4a5eeab`, `origin/main` @ `6d86d37`; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/handoff-session-2026-07-16.md` — session handoff: статус сессии + развилка A/B/C, не executable-спринт  
**Контекст:** S-LEGACY-STAGE-1 (B2/B3) + S-GANTT-VIEW-2 закрыты на origin; локально уже есть S-DEPS-1 (`0463596` + fix `4a5eeab`); `claude/wave2-progress.md` в репо отсутствует

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Тип документа (status handoff, не CC-спринт) | ✅ |
| Прод HEAD `6d86d37` vs `origin/main` | ✅ |
| S-LEGACY-STAGE-1 / B3 `d904172` / VIEW-2 в git | ✅ |
| Cache-key грабля + `useUpdateTaskDates` dual-key | ✅ |
| Gantt-фаза = `column_id` + `isPhaseBoard` (`category='phase'`) | ✅ |
| `mskDateKey` + UTC-полдень | ✅ |
| `moveToStageId` / hard-delete projects / no `flowType` | ✅ |
| Backlog: stage_id-логгер + docs-дельта 047 | ✅ |
| Канон `claude/wave2-progress.md` | ❌ файла нет в репо |
| Развилка **(A) S-DEPS-1** как «следующий шаг» | ❌ **устарело**: уже в local `main` (ahead 2) |
| «soft-delete» для `task_dependencies` | ❌ факт: **hard-delete** (как в `sprint-S-DEPS-1.md`) |
| Опция **(C)** «delivery health / Deal Hub / Notes» как «непокрытый P1» | 🟡 частично уже есть в коде |
| Skill schema «→046» / docs без 047–048 | 🟡 backlog верен, skill/docs дрейфуют |
| Пригодность как «промпт в CC as-is» | ❌ **не запускать как спринт** |

**Оценка: 6.5/10** как session-ориентир на момент `6d86d37`; **3/10** как актуальная точка входа «что делать дальше» на текущем дереве (`4a5eeab` + untracked 049).  
**Рекомендация:** **не запускать в Claude Code.** Это handoff статуса, не спринт. Перед следующим чатом — обновить развилку под post-S-DEPS-1 и не слать A повторно.

---

## Статус

| Заход | Статус в handoff | Статус в репо (факт) |
|-------|------------------|----------------------|
| S-LEGACY-STAGE-1 B2 (DROP stage / deal_stage / триггеры) | ✅ закрыт, 047 via MCP | ✅ в истории (`d904172` post-DROP); **файла `047_*.sql` нет** |
| S-LEGACY-STAGE-1 B3 (типы, `LEGACY_STAGE_LABELS`) | ✅ `d904172` | ✅ `src/lib/validators/project.ts` — `LEGACY_STAGE_LABELS`; `STAGE_CONFIG` снят |
| S-GANTT-VIEW-2 drag | ✅ прод HEAD `6d86d37` | ✅ `useUpdateTaskDates` + pointer drag в `GanttTimeline.tsx`; **origin/main = 6d86d37** |
| S-DEPS-1 (опция A) | ⏳ «следующий шаг» | ❌ **уже сделано локально:** `0463596` + fix `4a5eeab`; `048_task_dependencies.sql`, `use-task-dependencies.ts`, link-mode/стрелки |
| S-DEPS-1 polish / 049 | не упомянуто | 🟡 `_analysis/sprint-S-DEPS-1-polish.md`; untracked `049_task_dep_created_by_default.sql` |
| `claude/wave2-progress.md` | «канон, читай первым» | ❌ **нет** dir `claude/` и файла |
| `docs/schema.md` / skill schema дельта 047–048 | backlog 047 | 🟡 skill/docs: applied **001–046**, тело ещё знает `projects.stage` / `deal_stage`; 048 в gen-типах есть |

---

## С чем согласен полностью

### 1. Процесс и стек

Разделение CC (код/git/build) vs Cowork (миграции MCP, smoke Chrome) совпадает с learnings («CC пишет, Cowork применяет»). Стек Next 15 + TS + Tailwind (6 тем) + Supabase + Netlify — совпадает с `architecture.md`. Прод ref `uoiavcabxgdjugzryrmj` — в header skill-schema.

### 2. Закрытые заходы сессии — git подтверждает

| Утверждение handoff | Доказательство |
|---------------------|----------------|
| B3 `d904172` | `d904172 refactor(stage): снять легаси-символы deal_stage…` |
| VIEW-2 `6d86d37` | `6d86d37 feat(gantt): drag-to-resize/move…`; **origin/main** на этом SHA |
| `LEGACY_STAGE_LABELS` вместо `STAGE_CONFIG` | `project.ts:4–11` |
| `useUpdateTaskDates` патчит board + `['tasks']` | `use-tasks.ts:296–331` |

### 3. Главные грабли — живые и верные

| Грабля handoff | Код |
|----------------|-----|
| Cache-key: Гант читает `['tasks','board',projectId]` | `useUpdateTaskDates` dual-key + rollback (`use-tasks.ts:299–337`) |
| Фаза = `column_id` + `isPhaseBoard`, не `phase_group` | `delivery-phases.ts:85–87`; `use-project-schedule.ts:6,44,52` |
| Даты: `mskDateKey` + UTC-полдень | `date-helpers.ts:1–69` |
| `moveToStageId(id, stageId, opts?)` | `use-projects.ts:488–503` |
| projects hard-delete | `use-projects.ts` — `.delete().eq('id', id)` |
| no `flowType` override | `src/lib/supabase/client.ts` — только URL/anon |
| `entities.ts` — деривиты, не regen-цель | `src/types/entities.ts` (36 строк); комментарий в `use-projects.ts:51` |

### 4. Backlog stage_id-логгер и docs 047

После B2 `on_stage_change` / `log_stage_change` убраны; клиентский degraded-логгер снят (`use-projects.ts:435–436`: «Полноценный stage_id-логгер — backlog»).  
`docs/schema.md` и skill `schema.md` всё ещё описывают `projects.stage` / enum `deal_stage` и «applied 001–046» — дельта 047 реально нужна; 048 в skill/docs тоже не отражена.

### 5. Roadmap-ссылки по смыслу

- §9.3 Gantt v2 (FS + critical path) — `improvements/CRM-ROADMAP-projects-deals.md`  
- §14 / «главный структурный разрыв» Workflow — строки ~749, 765 (`S-WF-2`, D1)  
- 13 эпиков P1–P5 — структура roadmap на месте  

Совет «deps дают причинность, иначе Гант — картинка» продуктово верен (на момент handoff).

---

## Блокеры (критично — до использования handoff как точки входа)

### B1. Канонический статус-файл отсутствует

Handoff: *«Полный статус — в `claude/wave2-progress.md` (читай первым, он канонический)»*.

**Факт:** `claude/` в workspace **нет**, `wave2-progress.md` **не найден**.  
Точка входа для нового чата ведёт в пустоту. Либо файл жил только вне git (Claude Project), либо путь устарел. Без него handoff **не dual-source of truth**.

**Fix:** положить канон в репо (`_analysis/wave2-progress.md` или `claude/…` + commit) **или** убрать/заменить ссылку на живые источники: `git log`, `_analysis/sprint-S-DEPS-1*.md`, этот handoff после правки.

### B2. Развилка (A) S-DEPS-1 — работа уже в local tree

Handoff остановился на выборе A/B/C; дефолт = **A**.

**Факт на `main` (ahead 2 от origin):**

| Артефакт | Путь / SHA |
|----------|------------|
| feat S-DEPS-1 | `0463596` |
| fix infinite-loop стрелок | `4a5eeab` ← **HEAD** |
| миграция | `supabase/migrations/048_task_dependencies.sql` |
| hook | `src/lib/hooks/use-task-dependencies.ts` |
| UI | `GanttTimeline.tsx` — `linkMode`, стрелки, deps |
| типы | `supabase.gen.ts` — `task_dependencies`; `database.ts:279` |
| спринты/ревью | `_analysis/sprint-S-DEPS-1.md` (+ polish, fix-gantt-loop) |

Запуск «подготовь/сделай S-DEPS-1» по этому handoff = **повтор реализации**.  
Нюанс: **origin/main = 6d86d37** — на remote DEPS ещё может быть не запушен/не задеплоен; локально код уже есть. Handoff обязан различать: *prod/origin* vs *local worktree*.

### B3. Неверная модель lifecycle для deps: «soft-delete»

Handoff (A): *«таблица `task_dependencies` (FS) + … + soft-delete»*.

**Факт** (`sprint-S-DEPS-1.md` + `048`): **hard-delete**, осознанно, по прецеденту `contact_company` (ребро графа без истории). Колонки `deleted_at` нет.

Если следующий агент спроектирует soft-delete «по handoff» — конфликт с уже написанной 048/RLS/hooks.

### B4. Документ ≠ executable sprint для CC

Нет: РАЗВЕДКА-блока правок, TASK-списка, «ЖЁСТКО НЕ ТРОГАТЬ», DoD, миграционного контракта.  
**Вердикт skill:** это pre-flight **status handoff**. В CC «as-is» не отдавать. Для реализации — существующие `_analysis/sprint-S-DEPS-1*.md` (уже отработаны) или **новый** спринт post-DEPS.

---

## Предупреждения (желательно исправить)

### W1. Опция (C) частично overlapping с уже существующим кодом

Handoff перечисляет как «другой P1»:

| Тема handoff | Факт в репо |
|--------------|-------------|
| delivery health score | `src/lib/utils/delivery-health.ts` + `DeliveryHealthDot.tsx` |
| Deal Delivery Hub на won | `DealDeliveryHub.tsx`, вшит в `ProjectDetail.tsx` |
| Notes в EntityTimeline | Волна 2: `042_activity_log_entity_links.sql` / S-NOTES-TIMELINE-1 в roadmap; `EntityTimeline` жив |
| Workflow MVP (S-WF-2) | ✅ всё ещё gap (S29 узкий); §14 верен |

Без уточнения «что именно residual» опция C вводит в заблуждение (health/hub ≠ greenfield).

### W2. Опция (B) — код edge-cases уже есть; gap = data/smoke

В `GanttTimeline.tsx` уже:

- clamp `end < start` → `end = start` (~L119)  
- материализация deadline-only (коммент ~L121)  
- веха: `start = end = shiftDateKeyByBuckets…` (~L110)  
- zoom day/week/month через `shiftDateKeyByBuckets`  

Handoff честен: «код-верифицировано, не гонялось на проде — нет данных». Это **smoke/seed**, не feature-sprint. Имеет смысл как короткий checklist, не как «добить VIEW-2 кодом».

### W3. Skill «schema→046» — верно на 7/16, уже отстаёт

Handoff: skill актуализирован 7/16, schema→046.  
Skill `references/schema.md` header: applied **001–046**, в теле `projects.stage` ещё legacy-кандидат.  
Локально: 047 (MCP, без файла), 048 (в репо), untracked **049**.  
Backlog handoff про docs 047 — ✅; нужно расширить: **047 file reconstruct + 048/049 body + skill re-sync**.

### W4. «notifications — только триггеры»

Создание — да (S26 trigger path). Клиентский `use-notifications.ts` есть (read / mark read / realtime). Формулировка ок для *write of new rows*, но лучше: «insert — триггеры; UI — read/ack».

### W5. Soft claim «всё задеплоено и сможено, прод HEAD = 6d86d37»

Согласуется с **origin/main**. Локально **+2 commit S-DEPS-1** — если handoff читают «сейчас на этой машине», «прод = HEAD» путает local HEAD. Явно: `origin/main == prod snapshot handoff; worktree ahead`.

### W6. Migration 047 file gap — зафиксирован верно, риск baseline

Baseline `20260712230000_baseline.sql` всё ещё **CREATE** `deal_stage` / `log_stage_change` / `on_stage_change`. Без файла 047 fresh-replay ≠ prod. Backlog «восстановить 047 в репо» — не косметика.

---

## Пропущенные места / inventory gaps

| Тема | Handoff | Live | Действие |
|------|---------|------|----------|
| `claude/wave2-progress.md` | канон | отсутствует | B1 |
| S-DEPS-1 код | «готовить» | commits + 048 + hooks + UI | обновить развилку |
| `049_task_dep_created_by_default.sql` | — | untracked | учесть в post-DEPS / не потерять |
| soft-delete deps | заявлен | hard-delete | B3 |
| DealDeliveryHub / delivery-health | «P1 C» | components+utils | W1 |
| `docs/schema.md` `projects.stage` | backlog DROP | всё ещё в таблице schema | docs-спринт |
| skill schema 048 | — | нет | sync после apply 048 на prod |

---

## Предлагаемые правки в handoff (если обновлять документ)

1. **Шапка статуса (обязательно):**
   - `origin/main` / prod smoke anchor: `6d86d37` (VIEW-2)  
   - local worktree: `4a5eeab` (S-DEPS-1 + loop fix), `ahead 2`  
   - 048 в репо; apply/push/deploy — отдельный гейт  

2. **Заменить «СЛЕДУЮЩИЙ ШАГ»:**
   - ~~(A) писать S-DEPS-1~~ → **(A′) гейт DEPS:** push + Cowork `apply_migration` 048 (+049?) + advisors + Chrome smoke link-mode/DAG  
   - **(B)** seed+smoke VIEW-2 edge-cases (данные)  
   - **(C)** residual P1: **stage_id-логгер**, **docs/skill 047–048**, **S-WF-2**; не «написать Deal Hub/health с нуля»  
   - **(D)** critical path (roadmap §9.3 remainder) — только после стабильного DEPS на проде  

3. Убрать **soft-delete** → **hard-delete** (как 048).  

4. `wave2-progress`: либо commit в репо, либо ссылка на `_analysis/sprint-S-DEPS-1*.md` + git log.  

5. Явно: *«этот файл — orientation, не CC prompt»*.

---

## Чеклист crm-architect (для handoff-типа)

- [x] Не претендует на SQL-задачи без имён таблиц (кроме краткого A)  
- [ ] ❌ A: soft-delete vs реальный hard-delete  
- [x] Реальные пути/символы в «граблях» (cache-key, `isPhaseBoard`, `moveToStageId`)  
- [x] Learnings: no flowType, CASCADE delete, CC≠apply — отражены  
- [ ] ❌ Канон progress-файла не верифицируется  
- [ ] N/A: РАЗВЕДКА/миграции/RLS checklist — документ не спринт  
- [x] Backlog schema.md после 047 назван  

---

## Чеклист перед следующим шагом (не «перед CC по этому файлу»)

- [ ] Не гонять S-DEPS-1 с нуля — сверить `048` / hooks / `GanttTimeline`  
- [ ] Решить: push `0463596`+`4a5eeab` и гейт apply 048 на prod, или сначала polish/049  
- [ ] Восстановить или переписать канон статуса (wave2-progress)  
- [ ] Обновить этот handoff (B1–B3, W1) перед новым чатом  
- [ ] Отдельный docs-спринт: `docs/schema.md` + skill schema (047 DROP + 048 deps)  
- [ ] stage_id-логгер — отдельный architect-sprint (триггер на `stage_id`, не возврат `projects.stage`)  
- [ ] Опция B — только seed+smoke, без нового feature-scope  
- [ ] Не коммитить/не править sprint-файлы из этого ревью (headless)

---

## Итог одной строкой

Handoff **честен для конца сессии на `6d86d37`**, грабли и backlog stage/docs **сильны**, но как **точка входа «сейчас»** он **сломан**: нет `wave2-progress`, дефолт **A уже реализован локально**, soft-delete **ложный**, опция C **частично greenfield-иллюзия**. Обновить статус → гейтить DEPS/docs/logger; **в CC этот файл не отдавать**.
