# Ревью: sprint-crm-architect-sync (память скилла после D/E/F2/F1)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui` @ `6e134b2`, `origin/main` @ `2fe8806`; skill `~/.claude/skills/crm-architect/` — `SKILL.md` + `references/{schema,architecture,learnings}.md`; SQL `066`/`067` на main; клиент video/chat/plan-import; vitest 17/19)  
**Объект:** `_analysis/sprint-crm-architect-sync.md` — обновление только документации скилла crm-architect (кода не трогать)  
**Контекст:** Волна D (Gantt write) + E (plan import) + F2 (video 066) + F1 (chat 067) уже в `origin/main` (merge `feat/chat` + regen типов). Предыдущее ревью (`_analysis/review-sprint-crm-architect-sync.md`) описывало **pre-sync** skill; **текущее состояние skill = post-apply**.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Тип спринта (skill docs only, кода нет) | ✅ |
| РАЗВЕДКА есть | ✅ (якоря **устарели** — target-state уже в skill) |
| Контент блоков 066/067 vs SQL + код | ✅ |
| Learnings (useRef, lane=`next`, RLS mirror, canManage) vs код | ✅ |
| Architecture: Gantt WRITE; PlanImport; ProjectChat/Videos; tab chat | ✅ уже в skill |
| SKILL.md: 001–067 + next 068 + Deploy Vercel | ✅ уже в skill |
| «Прод @ `main` после мёржа F2+F1» | ✅ **сейчас верно** (`origin/main` содержит 066/067 + клиент) |
| «Миграции applied по 067» | 🟡 файлы/мерж в git ✅; живая БД из этой сессии MCP-ом не перепроверялась (гейты/handoff claim) |
| Идемпотентность при повторном запуске CC | ❌ нет guard «уже есть — skip» |
| Scope / «кода НЕ трогать» | ✅ |

**Оценка: 9/10 по качеству paste-контента; 2/10 по актуальности как runnable-спринта.**  
**Рекомендация: не запускать в CC — работа уже сделана.** Skill-память синхронизирована с заявленным target-state. Повторный прогон создаст дубликаты секций / бессмысленные str_replace. Если нужен «закрыть спринт» — пометить done / archive, не исполнять.

---

## Статус (что в репо / skill vs что пишет спринт)

| Утверждение спринта | Факт сейчас |
|---------------------|-------------|
| Прод-код @ `main` после мёржа F2+F1 | ✅ `origin/main`: `999a538 Merge branch 'feat/chat'`, есть `066`/`067`, video + chat + types regen |
| Миграции 062–067 в репо | ✅ на `origin/main` (060 файла нет — reserved/skip) |
| skill `Migrations applied` → 001–067, next 068 | ✅ `SKILL.md` L37 — **уже** |
| Deploy Vercel | ✅ `SKILL.md` L39 (netlify.toml как реликт) |
| skill `### project_videos` / `### project_messages` | ✅ `schema.md` L641–654 — **уже** |
| skill `### tasks` + is_milestone/wbs/dates/parent/lane note | ✅ L543–559 — **уже** (таблица, не «плоский перечень») |
| skill PM-Гант WRITE | ✅ `architecture.md` L157–160 — **уже** (read-only снят) |
| skill ProjectVideos / ProjectChat / PlanImport | ✅ L168–173, L579–583 — **уже** |
| skill learnings «Волна 2 добор» | ✅ L435–454 — **verbatim** блок спринта |
| Клиент video/chat/import | ✅ `ProjectVideos.tsx`, `ProjectChat.tsx`, hooks, `PlanImport.tsx`, helpers |
| Tab `'chat'` | ✅ `ProjectDetail.tsx` L152, L850, L893 |
| Vitest 17 / 19 | ✅ `tests/unit/video-embed-helpers.test.ts` (17), `plan-import-helpers.test.ts` (19) |
| CSP `frame-src` | ✅ `next.config.ts` (youtube/vk/rutube whitelist) |
| `docs/schema.md` applied header | 🟡 всё ещё «001–061» в шапке, при этом тела 066/067 есть — **вне scope** спринта (skill-only) |

**Вывод:** целевой diff спринта к skill **нулевой**. Спринт описывает правильный end-state, который уже записан.

---

## С чем согласен полностью

### 1. Scope «только 4 файла скилла, кода не трогать»
Корректный follow-up на handoff-долг. Нет миграций из CC, нет tsc/build на app. Уместно.

### 2. Блок `project_videos` (066) — сверка с SQL
`supabase/migrations/066_project_videos.sql` (main):
- колонки url CHECK 1–2048, provider CHECK youtube/vk/rutube/other, sort_order, created_by SET NULL default `auth.uid()`
- индексы (project_id, sort_order), org, created_by; `trg_set_org_id`; hard delete
- SELECT = owner/admin OR ownership (owner_id/created_by) OR `is_project_member` — **без manager**
- INSERT/DELETE = canManage (owner/admin OR ownership); **NO UPDATE**
- GRANT authenticated / REVOKE anon  
Клиент: `use-project-videos`, `ProjectVideos.tsx` рядом с `ProjectFiles` (ProjectDetail ~L835–838), `parseVideoUrl` не доверяет stored provider, 17 vitest, CSP — совпадает.

### 3. Блок `project_messages` (067) — сверка с SQL
`067_project_messages.sql`:
- author_id nullable + SET NULL + default; body CHECK 1–4000; edited_at; hard delete
- Realtime publication; RLS на SELECT зеркало projects; INSERT participant + `author_id = auth.uid()`; UPDATE свои + WITH CHECK; DELETE свои + owner/admin  
Клиент: `useRealtimeSync('project_messages')` в `use-project-messages.ts`, `ProjectChat.tsx`, tab «Чат», граница ≠ activity_log — совпадает.

### 4. Learnings «Волна 2 добор» — доказательная база

| Урок | Код |
|------|-----|
| pointer-burst → `useRef` | `GanttTimeline.tsx`: `undatedDragRef` ~L685–735; state только для призрака |
| delivery `lane='next'` | `PlanImport.tsx` L159; `ProjectBoard` `lane={phaseMode ? 'next' : undefined}` L170; `ProjectDetail` `defaultLane={isDelivery ? 'next' : undefined}` L944; `TaskModal` иначе `'now'` L126 |
| RLS mirror parent | 066/067 SQL |
| tasks_insert шире UI | baseline `tasks_insert` = owner/admin/**manager** |
| merge only after apply | process lesson; согласуется с правилами skill |

### 5. Architecture 3a–3c (как target-state)
- Gantt WRITE + canManage — факт на main  
- PlanImport / helpers / lane=`next` / 19 vitest — факт  
- ProjectChat + ProjectVideos + tab chat — факт  
Описания end-state **верны**; в skill уже лежат.

### 6. SKILL.md 001–067 / 068 / Vercel
Цепочка 062–067 в тексте спринта = имена файлов на main; 060 skip; Deploy Vercel уместен.

### 7. crm-architect checklist (docs-only)

| Пункт | |
|-------|--|
| РАЗВЕДКА | ✅ |
| Реальные table/column/RLS | ✅ (сверены с 066/067) |
| Реальные пути файлов | ✅ |
| learnings gotchas | ✅ (они и есть deliverable) |
| SQL migrations as files; not applied from CC | ✅ N/A (нет SQL-задач) |
| org_id / RLS / SECURITY DEFINER | ✅ в документируемых политиках |
| No flowType implicit / CSS / CASCADE | N/A (нет app-кода) |
| schema.md skill после миграций | ✅ цель спринта; **достигнута** |

---

## Блокеры (критично — исправить до запуска)

### B1. Спринт уже исполнен — повторный CC-прогон неидемпотентен
Все 4 target-файла skill уже содержат:
- `### project_videos` / `### project_messages`
- расширенный `### tasks`
- «Волна 2 добор» в learnings
- PM-Гант WRITE + ProjectVideos/ProjectChat + PlanImport
- `Migrations applied` **001–067**, next **068**, Deploy **Vercel**

«Вставляй как есть» без guard → дубликаты заголовков / шумный diff / риск разъезда памяти.

**Fix (если всё же гонять):** в РАЗВЕДКУ добавить fail-fast:
```bash
grep -q "### project_videos" references/schema.md && echo "ALREADY_SYNCED — stop"
```
и в каждой задаче: «если якорь/блок уже есть — skip, не дублировать».

### B2. РАЗВЕДКА ищет pre-state, которого больше нет
Спринт грепает `001–061`, Gantt `read-only` — сейчас:
- `SKILL.md` уже `001–067`
- PM-Гант уже `WRITE`, не read-only

CC по «дырам» из разведки может решить, что «нечего делать», или наоборот вслепую вставить paste. Якоря разведки **не соответствуют** инструкции «вставить».

---

## Предупреждения (желательно учесть)

### W1. Task 1b формулировка устарела
«В живой БД поля есть, **в доке отсутствовали**» — в skill `### tasks` поля **уже** в таблице (is_milestone, wbs_code, start/end_date, parent_task_id, lane + warning про `'next'`). Повтор «добавить в перечень» некуда / создаст дубль.

### W2. «таб/секция» для ProjectVideos
В коде это **секция** под `ProjectFiles`, не tab. Skill wording «секция рядом с ProjectFiles» точнее sprint-черновика «таб/секция». Мелочь, не блокер контента.

### W3. ВЕРИФИКАЦИЯ `grep -c project_videos|project_messages` по architecture
В `architecture.md` строка `project_messages` есть; **имени таблицы** `project_videos` в architecture может не быть (есть `ProjectVideos` / `use-project-videos`). Команда `>0 в обоих` fragile — лучше якоря `ProjectVideos` / `ProjectChat` / `PlanImport`.

### W4. `docs/schema.md` header applied всё ещё ~001–061
Skill впереди repo-docs header. Спринт scope = skill only — ок, но для «единой памяти» стоит отдельный мини-sync docs header → 067 (не этот спринт).

### W5. Applied-в-живой-БД
Git + гейты/SQL-файлы подтверждают цепочку; эта сессия не дергала Supabase MCP `list_migrations`. Для skill-sync достаточно; для claim «прод applied по 067» — доверяем гейтам, не перепроверяли.

### W6. Workspace branch `feat/chat-ui`
Локально не `main`, а UI-полировка чата поверх. На skill-sync не влияет (skill вне репо), но не путать с «кода спринта нет» vs feature-work в app.

---

## Пропущенные места

| Место | Статус |
|-------|--------|
| `~/.claude/skills/crm-architect/SKILL.md` | ✅ target met |
| `references/schema.md` 066/067 + tasks | ✅ target met |
| `references/architecture.md` Gantt/Videos/Chat/PlanImport | ✅ target met |
| `references/learnings.md` Волна 2 добор | ✅ target met |
| `docs/schema.md` applied header | 🟡 lag (out of scope) |
| Дублирующие вставки при re-run | ❌ риск (B1) |

Новых missed app-файлов для **этого** спринта нет — app-файлы только evidence для paste-accuracy.

---

## Предлагаемые правки в спринт

1. **Статус в шапке:** `DONE / ALREADY APPLIED (skill 2026-07-19)` — не запускать CC.  
2. Если оставить как runnable template: **идемпотентные** шаги («insert only if missing»).  
3. Обновить РАЗВЕДКУ под **post-state** (проверять наличие, не искать `001–061` / read-only).  
4. Task 1b: убрать claim «отсутствовали» или заменить на «verify present».  
5. Опционально follow-up: `docs/schema.md` header applied → 001–067 (отдельный 5-минутный chore).

---

## Чеклист перед CC

- [x] Контент блоков сверен с 066/067 SQL и клиентом  
- [x] Learnings подтверждены кодом (Gantt useRef, lane next, RLS)  
- [x] Target skill-файлов уже содержит весь diff  
- [ ] **Не запускать CC «as-is»** — no-op / риск дублей  
- [ ] При необходимости закрытия процесса: пометить спринт done, не re-apply  
- [ ] (Опционально) sync `docs/schema.md` applied header отдельно  

**Итог:** paste-блоки спринта **фактически верны и уже вшиты** в `crm-architect`. Это ретроспективно качественный handoff-sync, но **не актуальная runnable-задача**.
