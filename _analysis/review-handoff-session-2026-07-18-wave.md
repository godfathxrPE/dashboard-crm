# Ревью: handoff-session-2026-07-18-wave (A→F1 ПОЛНОСТЬЮ закрыта)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat` @ `8d3647f`, `feat/video-embed` @ `cfdc905`, `origin/main` = `bb2f0b7`; crm-architect `schema.md` / `architecture.md` / `learnings.md`; гейты `_analysis/s-{gantt-ux-2,plan-import-1,video-embed-1,chat-1}-gate.md`)  
**Объект:** `_analysis/handoff-session-2026-07-18-wave.md` — session handoff: волна фидбека A→F1 закрыта; две ветки ждут мёржа; next free migration **068**  
**Контекст:** предыдущее `_analysis/review-handoff-session-2026-07-18-wave.md` (mtime 00:56) **устарело** — описывало срез «A→F2, F1 открыт, next 067». Текущий handoff (mtime 01:19) — post-F1. Спринты/гейты: `_analysis/sprint-S-{GANTT-UX-2,PLAN-IMPORT-1,VIDEO-EMBED-1,CHAT-1}.md` + matching `s-*-gate.md` / `review-sprint-*`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Тип документа (status handoff, **не** CC-спринт) | ✅ |
| `origin/main` = `bb2f0b7` | ✅ |
| SHA D: merge `a28b2bc` (S-GANTT-UX-2) на main | ✅ |
| SHA E: merge `bb2f0b7` (S-PLAN-IMPORT-1) = tip main | ✅ |
| F2 `feat/video-embed` = `cfdc905` (53e789f+cfdc905), local=origin | ✅ |
| F1 `feat/chat` = `8d3647f` (62d1e2c+8d3647f), local=origin | ✅ |
| Обе ветки **не** в main; merge-base обеих = `bb2f0b7` (независимы) | ✅ |
| 066 `project_videos` только на F2; 067 `project_messages` только на F1; next free **068** | ✅ в git |
| «066/067 applied» в живой БД | 🟡 по гейтам; из workspace **не** верифицируется |
| Конфликт мёржа: stub gen/entities + **ProjectDetail.tsx** | 🟡 handoff сужает до «stub» — см. W1 |
| F2 RLS: SELECT = projects_select+member **без manager**; write canManage | ✅ `066_project_videos.sql` |
| F1 RLS: SELECT зеркало; INSERT participant+author=uid; UPDATE свои; DELETE свои+admin | ✅ `067_project_messages.sql` |
| F1 realtime: publication + `useRealtimeSync('project_messages')` | ✅ SQL + hook |
| Gate F2/F1 PASS + RLS-матрицы (док) | ✅ `_analysis/s-video-embed-1-gate.md`, `s-chat-1-gate.md` |
| E: `lane:'next'`, tasks_insert org-manager-wide | ✅ код + gate E |
| Open: VISIBILITY-2 / W2 / Trash-clip / tasks_insert / W4 | ✅ код подтверждает gap |
| SoT `claude/backlog-…` / `claude/s-*-gate.md` | ❌ dir `claude/` **нет**; гейты в `_analysis/` |
| docs/schema +062–067; skill schema ~051; architecture «Gantt read-only» | 🟡 долг (handoff честно) |
| Handoff как executable-промпт | ❌ не спринт — статус + next steps |

**Оценка: 9/10** как session handoff и точка входа «где мы после A→F1 / что за Олегом».  
**Оценка: n/a (0 как sprint)** — в CC **не** слать as-is; это статус + locked-решения + open-list.

**Рекомендация:** **handoff использовать** для нового чата (статус волны, ветки, locked-решения, гочи). **Не** запускать как спринт. Ближайшие действия — вне CC-кода: (1) мёрж `feat/video-embed` + `feat/chat` → main (порядок любой, конфликт минутный), (2) regen types (оба stub), (3) docs/schema + crm-architect, (4) live-смоки F1 realtime / F2 embed. Пути SoT/гейта поправить на `_analysis/` (или явно: SoT вне git).

---

## Статус

| Заход | Handoff | Факт в репо |
|-------|---------|-------------|
| **A** S-UI-POLISH-1 | закрыт (волна) | ✅ `af0e49d` / `2938630` на main |
| **B** S-TEAM-ROLES-1 | закрыт, **063** | ✅ `51581bc`; `063_project_member_roles_expand.sql` |
| **C** S-PROJECT-WORKSPACE-1 | закрыт, **064** | ✅ `75d6698`; `064_project_files_comment.sql` |
| **VISIBILITY** S-TEAM-VISIBILITY-1 | закрыт, **065** | ✅ `0ac3189`; `065_team_visibility.sql` + `is_project_member` |
| **D** S-GANTT-UX-2 | закрыт `a28b2bc` | ✅ merge на main; write + undated-drag + Trash; gate PASS |
| **E** S-PLAN-IMPORT-1 | закрыт `bb2f0b7` | ✅ tip main; helpers + PlanImport + `lane:'next'`; gate PASS |
| **F2** S-VIDEO-EMBED-1 | gate PASS, **066 applied**, merge за Олегом | ✅ код на `feat/video-embed` @ `cfdc905`; **не** в main; apply — по gate 🟡 |
| **F1** S-CHAT-1 | gate PASS, **067 applied**, merge за Олегом | ✅ код на `feat/chat` @ `8d3647f`; **не** в main; apply — по gate 🟡 |
| Миграции «по 067» / next **068** | claimed | ✅ highest numbered files: 066 (F2 only) + 067 (F1 only); **нет** `068_*.sql` |
| Fast-follow VISIBILITY-2 (storage) | open | ✅ 055: `(foldername)[1] = auth.uid()` own-path; 065 явно «storage — VISIBILITY-2» |
| Fast-follow W2 canManage align | open | ✅ `canManage` ∪ `created_by`; `projects_update` **без** `created_by` (baseline ~L3611 / 054) |
| Fast-follow Gantt Trash-clip | open | ✅ hover-Trash `-right-4` + контейнер `overflow-x-auto` ~L981 `GanttTimeline.tsx` |
| Опц. сужение `tasks_insert` | open | ✅ insert = owner/admin/**manager** org-wide (baseline L3652); gate E |
| W4 паритет assignee в Ганте | ждёт Олега | ✅ Gantt write = `canManage`; RLS `tasks_update` шире (assignee/created_by) |
| docs/schema +062–067; skill; architecture Gantt write | CC/skill debt | ✅ docs header → **~061** (+файлы 062–065 в репо без тела 066/067); skill schema ~**051**, **нет** `project_videos`/`project_messages`; architecture L157 «PM-Гант … **read-only**» |
| gen-stub снять (оба) | за Олегом / post-merge | ✅ stub comments живы на обеих ветках |
| Supabase ref | `uoiavcabxgdjugzryrmj` | ✅ schema header / handoff |

---

## Разведка (факт vs handoff)

| Утверждение | Проверка |
|-------------|----------|
| `origin/main = bb2f0b7` | ✅ `git rev-parse origin/main` → `bb2f0b7` Merge feat/plan-import |
| Current workspace `feat/chat` @ `8d3647f` | ✅ `git branch --show-current` + HEAD |
| F2 commits `53e789f` + `cfdc905` | ✅ migration+parser+stub+tests; UI+hook+CSP |
| F1 commits `62d1e2c` + `8d3647f` | ✅ migration+hook+stub; ProjectChat+tab |
| merge-base обеих веток = main | ✅ `bb2f0b7` для video и chat |
| 066 **не** на main / **не** на feat/chat | ✅ `git show main:…066…` отсутствует; на chat только 067 |
| 067 **не** на main / **не** на feat/video-embed | ✅ симметрично |
| Next free **068** | ✅ нет `068_*.sql` в репо (при условии, что 066+067 applied — 🟡 live) |
| F2 SELECT без manager + ownership + `is_project_member` | ✅ 066 L35–44 |
| F2 INSERT/DELETE canManage (ownership вкл. created_by); **NO UPDATE** | ✅ 066 L48–74 |
| F1 SELECT зеркало projects_select+member | ✅ 067 L32–45 |
| F1 INSERT participant + `author_id = auth.uid()` | ✅ 067 L48–62 |
| F1 UPDATE свои (WITH CHECK зеркало) | ✅ 067 L65–74 |
| F1 DELETE свои + owner/admin | ✅ 067 L77–85 |
| F1 `alter publication supabase_realtime add table` | ✅ 067 L89 |
| `trg_set_org_id` + GRANT authenticated / REVOKE anon | ✅ 066/067 |
| UI F2: `ProjectVideos` mount ProjectDetail + re-parse iframe | ✅ video-branch `ProjectDetail.tsx:837`; `parseVideoUrl` на рендере |
| UI F1: таб «Чат» + `ProjectChat` | ✅ `ProjectDetail.tsx:846,889`; XSS text `whitespace-pre-wrap` |
| Realtime hook F1 | ✅ `useRealtimeSync('project_messages')` в `use-project-messages.ts:29` |
| E `lane: 'next'` | ✅ `PlanImport.tsx:159` (gate E писал ~198 — drift строк, факт корректен) |
| D undated-drag `useRef` | ✅ `undatedDragRef` + pointer handlers в `GanttTimeline.tsx` |
| Gate F1 smoke 5/5 (participant INSERT, author spoof 42501, UPDATE чужого 0, admin DELETE, outsider SELECT 0) | ✅ `_analysis/s-chat-1-gate.md` §4 |
| Gate F2 smoke 5/5 (member SELECT, B1 owner-not-member SELECT, outsider 0, member INSERT 42501, owner INSERT) | ✅ `_analysis/s-video-embed-1-gate.md` §4 |
| Конфликт «stub gen.ts/entities.ts» | 🟡 **также** `ProjectDetail.tsx` (import+mount vs tab) — см. W1 |
| SoT `claude/backlog-unified-2026-07-18.md` | ❌ `claude/` directory **does not exist** |
| Гейты `claude/s-*-gate.md` | ❌ фактический путь: `_analysis/s-*-gate.md` |
| «066/067 applied» | 🟡 только по gate docs; MCP/list_migrations из этой сессии не гонялись |

---

## С чем согласен полностью

### 1. Волна A→F1 закрыта по коду + гейтам
A–E на main; F2/F1 на feature-ветках с gate PASS. Handoff корректно отделяет «код+DDL готовы» от «мёрж/regen/docs/live-смок за Олегом».

### 2. Независимые ветки от main — правильная модель
`merge-base(main, feat/video-embed) = merge-base(main, feat/chat) = bb2f0b7`. Параллельные 066/067 без fork-off-each-other — осознанно; next 068 корректен.

### 3. Locked write-семантика
- Видео/фазы/Гант write = canManage (RLS бэкапит video write; Gantt/фазы — UI+RLS).  
- Чат write = вся команда проекта (participant OR ownership OR owner/admin) + `author_id=auth.uid()`.  
- Чат ≠ activity_log: отдельная таблица, таб, хук — соблюдено.

### 4. SELECT-зеркало projects_select (без manager)
Оба SQL сознательно **без** org-manager в SELECT — иначе артефакт был бы «виднее проекта». Согласуется с уроком handoff и с ревью F2 (B1 owner-not-member).

### 5. E: lane='next' + tasks_insert org-manager-wide
`PlanImport.tsx:159` `lane: 'next'`. Gate E + baseline `tasks_insert` (owner/admin/**manager**) — граница честно названа; fast-follow сужения валиден.

### 6. Процесс и гочи
Пайплайн Cowork→Grok-ревью→CC→gate; prod-миграции с санкции; merge after apply; JWT-smoke; pointer→useRef; delivery lane='next'; RLS-зеркало; чат≠activity — совпадает с learnings + фактом сессии.

### 7. Долг docs/skill назван явно
Handoff не притворяется, что schema/architecture актуальны. Фактически: skill `schema.md` ~051; docs header ~061; architecture «PM-Гант read-only» (L157) — устарело после D.

---

## Блокеры (критично — исправить до запуска)

**Нет блокеров для использования handoff как статуса.**  
Как **executable CC-sprint** — документ **не предназначен** (нет РАЗВЕДКИ-тасков, нет scope «сделай X»). Слать в CC as-is = ❌.

### B1. SoT-пути `claude/*` в git-workspace не существуют
Handoff:

- «Бэклог (истина) — `claude/backlog-unified-2026-07-18.md`»
- «Гейты — `claude/s-*-gate.md`»

Факт: `ls claude` → **No such file or directory**. Реальные гейты сессии:

| Ожидание handoff | Факт |
|------------------|------|
| `claude/s-*-gate.md` | `_analysis/s-gantt-ux-2-gate.md`, `s-plan-import-1-gate.md`, `s-video-embed-1-gate.md`, `s-chat-1-gate.md` |
| `claude/backlog-unified-2026-07-18.md` | **отсутствует** в workspace |

**Риск:** новый чат/агент ищет SoT и «теряет» гейты.  
**Фикс handoff (1 строка):** «гейты: `_analysis/s-*-gate.md`; бэклог: [путь в Project / вне git / создать]».

---

## Предупреждения (желательно исправить)

### W1. Конфликт мёржа шире, чем «stub gen.ts/entities.ts»
`comm` пересечение `main...feat/video-embed` ∩ `main...feat/chat`:

| Файл | Конфликт |
|------|----------|
| `src/types/supabase.gen.ts` | stub-блоки `project_videos` vs `project_messages` (оба ~L1690) |
| `src/types/entities.ts` | alias-блоки VIDEO vs CHAT |
| **`src/components/projects/ProjectDetail.tsx`** | import+mount `ProjectVideos` vs import+tab `ProjectChat` |

Handoff: «тривиальный конфликт stub». **Дополнить:** ProjectDetail — keep both (секция Видео + таб Чат). Минутный, но не «только stub».

### W2. «066/067 applied» — trust gate, not git
Из workspace нельзя подтвердить `supabase_migrations.schema_migrations`. Оба gate claim apply success + RLS smoke. Для merge-after-apply контракта этого достаточно **если** Олег/Cowork не отменяли apply. Перед мёржем в main: `list_migrations` (MCP) — 066+067 present.

### W3. `replica identity full` на 067 отсутствует
В sprint-ревью S-CHAT-1 рекомендовали `ALTER TABLE project_messages REPLICA IDENTITY FULL` для UPDATE/DELETE realtime payload. Файл `067_project_messages.sql` — **только** `alter publication … add table`, **без** replica identity.  
Gate PASS realtime-publication ✅; live two-window UPDATE/DELETE events — 🟡 до live-смока. Follow-up 068, если payload пустой.

### W4. Stub `Insert.org_id: string` (required) vs клиент не передаёт org_id
Паттерн проекта: `trg_set_org_id` + client omit. Хуки:

- video: `Omit<…, 'project_id' | 'org_id' | 'created_by'>`
- chat: `.insert({ project_id, body })`

Работает через RelaxOrgId / cast в database types. **Regen** после merge обязан сохранить hand-edits (handoff уже предупреждает) — подтвердить.

### W5. docs/schema + crm-architect сильно отстают
| Источник | Состояние |
|----------|-----------|
| `docs/schema.md` header | applied ~001–061; **нет** 062–067 body / `project_videos` / `project_messages` |
| skill `schema.md` | ~051; **нет** 052–067 |
| skill `architecture.md` L157 | «PM-Гант (Волна 2, **read-only**)» — ложь после D |
| skill `learnings.md` | нет pointer-burst / Trash-clip / chat≠activity (handoff debt list) |

Handoff уже кладёт это в «За Олегом» / «долг CC/скилла» — ок, но **до следующего DB-спринта** skill-сверка опасна (угадывание имён).

### W6. 060 отсутствует (резерв contact_last_touch)
Цепочка …059 → **061** → …065 → 066/067. docs header знает «060 reserved». Handoff next=068 — **корректно** (не предлагать 060). Не блокер.

### W7. Порядок мёржа F2 vs F1
Handoff: обе независимы. Рекомендация: мёржить **любую первой**, вторую — с resolve ProjectDetail+stubs; затем **один** regen. Не мёржить «поверх» не-regen stub второй ветки без диффа hand-edits.

### W8. Live-смоки за Олегом (не gate SQL)
| Смоук | Почему нельзя закрыть gate'ом |
|-------|-------------------------------|
| F1 realtime 2 окна | publication ✅ ≠ browser channel |
| F2 embed YouTube/VK/Rutube + `other` link | CSP frame-src на video-branch; UI |
| F1 edit/delete own; admin delete | UI+confirm |

---

## Пропущенные места (handoff gaps, не code bugs)

| Тема | Где | Действие |
|------|-----|----------|
| Путь гейтов/бэклога | handoff L3, L45–46 | → `_analysis/s-*-gate.md`; бэклог — уточнить |
| ProjectDetail в conflict list | handoff L6, L21 | добавить к «stub» |
| `replica identity` 067 | SQL / follow-up | опц. 068 если live UPDATE payload empty |
| architecture «Gantt read-only» | skill | обновить при docs-pass |
| Existing review file stale | `_analysis/review-handoff-session-2026-07-18-wave.md` | этот документ заменяет pre-F1 срез |

---

## Предлагаемые правки в handoff (косметика, не блокер)

1. **Пути SoT:** `claude/*` → `_analysis/s-*-gate.md` (+ явная пометка, где живёт backlog, если вне git).  
2. **Конфликт:** «stub gen/entities **и** `ProjectDetail.tsx` (Видео-секция + таб Чат — keep both)».  
3. **Опц.:** «067 без `REPLICA IDENTITY FULL` — проверить на live-смоке UPDATE/DELETE; иначе 068».  
4. **Не** превращать handoff в sprint — оставить status; для next work — отдельный `_analysis/sprint-*.md`.

---

## crm-architect checklist (handoff context)

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА в handoff | n/a (status doc) |
| Real table/column names | ✅ `project_videos` / `project_messages` match SQL |
| Real file paths | 🟡 code paths ok; SoT `claude/` ❌ |
| learnings gotchas | ✅ process notes align; skill body not yet updated |
| SQL migrations separate; not applied from CC | ✅ gates: Cowork apply |
| org_id / RLS org-first + role helpers | ✅ 066/067 initplan `(select …)` |
| SECURITY DEFINER + ACL for new fns | n/a (066/067 — table policies only; 065 `is_project_member` already) |
| No `flowType: 'implicit'` | n/a this session |
| DELETE CASCADE | ✅ project_id CASCADE; author/created_by SET NULL |
| CSS variables / theme | n/a material |
| schema.md after migration | ❌ debt explicit |

---

## Чеклист перед следующим шагом (Олег / не CC-sprint)

- [ ] Подтвердить live: `list_migrations` содержит **066** и **067**
- [ ] Мёрж `feat/video-embed` → main (066 already applied → safe)
- [ ] Мёрж `feat/chat` → main; resolve **ProjectDetail + gen + entities** (keep both features)
- [ ] `npx supabase gen types …` → diff; не потерять RelaxOrgId / hand-edits
- [ ] `docs/schema.md` += `project_videos`, `project_messages` (+062–067 header)
- [ ] crm-architect: schema + architecture (Gantt **write**/canManage) + learnings (pointer-ref, Trash-clip, chat≠activity)
- [ ] Live-смок F1 realtime (2 окна); F2 embed/CSP; UI chat/video
- [ ] Поправить пути SoT в handoff **или** завести `claude/` / symlink
- [ ] Next free migration number: **068**
- [ ] Не слать этот handoff в CC как implementation prompt

---

## Итог одной строкой

Handoff **точный** по SHA/веткам/RLS/закрытию волны A→F1; **единственный системный дефект** — мёртвые пути `claude/*`; «applied» и live-UI — trust gates + manual. **Использовать как статус; не как sprint.**
