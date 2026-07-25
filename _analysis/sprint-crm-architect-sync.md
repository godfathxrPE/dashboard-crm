# Claude Code Prompt — Sync skill `crm-architect` (после волны D/E/F2/F1)

**Обновить память проекта `~/.claude/skills/crm-architect/` — миграции 062–067 + накопленные учения/архитектура. Только документация скилла, кода НЕ трогать.**

> Прод @ `main` после мёржа F2+F1. Миграции применены **по 067**. Блоки ниже — **готовые, вставляй как есть** (сверены Cowork по живой БД и гейт-смокам). Правь только 4 файла скилла.

## РАЗВЕДКА (найти якоря вставки)
```bash
cd ~/.claude/skills/crm-architect
grep -n "Migrations applied\|следующая свободная\|001–061\|001-061" SKILL.md
grep -n "### quotes\|### tasks\|### project_columns\|## Tenant" references/schema.md | head
grep -n "^### tasks\|is_milestone\|wbs_code\|start_date" references/schema.md | head
grep -n "PM-Гант\|read-only\|GanttTimeline\|ProjectFiles\|## Key Components\|## Hook Patterns" references/architecture.md | head
grep -n "Волна 2\|## Sprint Prompt Writing\|Gantt-фаза\|useRef\|stale closure" references/learnings.md | head
```

---

## ЗАДАЧА 1 — `references/schema.md`

### 1a. Вставить две новые таблицы (рядом с `### quotes`, в блок Tenant-таблиц)
```markdown
### project_videos _(066, S-VIDEO-EMBED-1)_ — видео проекта (embed YouTube/VK/Rutube)
Колонки: id, org_id (set_org_id, FK organizations CASCADE), project_id (FK projects CASCADE), url (text NOT NULL, CHECK length 1–2048), provider (text NOT NULL, CHECK in youtube/vk/rutube/other — **только badge**; embed на рендере из `parseVideoUrl(url)`, stored provider НЕ доверяем — anti-XSS), title, sort_order (int default 0), created_by (FK profiles SET NULL, default auth.uid()), created_at.
Индексы: (project_id, sort_order), (org_id), (created_by). Триггер: trg_set_org_id. **Hard delete.**
RLS (066): SELECT = **зеркало projects_select + projects_select_member** (org AND (owner/admin OR project ownership owner_id/created_by OR is_project_member(project_id)); **БЕЗ manager** — иначе видео виднее проекта). INSERT/DELETE = canManage (org AND (owner/admin OR project ownership вкл. created_by)). **NO UPDATE.** GRANT authenticated / REVOKE anon. Одна SELECT-политика (не multiple-permissive). Гейт-смок verified: владелец-не-member SELECT видит; member INSERT в чужой проект → 42501.
Клиент: `use-project-videos`, `components/projects/ProjectVideos.tsx` (таб/секция рядом с ProjectFiles), парсер `lib/utils/video-embed-helpers.ts` (17 vitest). CSP frame-src whitelist в next.config.ts.

### project_messages _(067, S-CHAT-1)_ — чат проекта (отдельный модуль, ≠ activity_log)
Колонки: id, org_id (set_org_id), project_id (FK projects CASCADE), author_id (**nullable** FK profiles SET NULL, default auth.uid() — история переживает автора), body (text NOT NULL, CHECK length 1–4000; рендер как текст, без dangerouslySetInnerHTML — XSS-контур), edited_at (при правке), created_at.
Индексы: (project_id, created_at), (org_id), (author_id). Триггер: trg_set_org_id. **Hard delete.**
**Realtime:** в publication `supabase_realtime` (RLS применяется к realtime — участник получает события только своих проектов).
RLS (067): SELECT = зеркало projects_select + member (кто видит проект — читает чат). INSERT = **ВСЯ команда проекта (participant), НЕ только canManage**: org AND author_id=auth.uid() AND (owner/admin OR project ownership OR is_project_member) (жёсткая привязка автора — подмена → 42501). UPDATE = свои (author_id=auth.uid(), зеркальный WITH CHECK). DELETE = свои + модерация owner/admin. GRANT authenticated / REVOKE anon. Гейт-смок 5/5: участник пишет→ok; подмена автора→42501; UPDATE чужого рядовым→deny; admin DELETE чужого→ok; посторонний SELECT→0.
Клиент: `use-project-messages` (общий `useRealtimeSync('project_messages')`, optimistic + dedupe по id), `components/projects/ProjectChat.tsx`, таб «Чат» в ProjectDetail. Граница (locked): НЕ activity_log/EntityTimeline/ActivityComposer.
```

### 1b. Дополнить строку `### tasks` (в живой БД поля есть, в доке отсутствовали)
Найди `### tasks _(...)_` и в перечень колонок добавь: **`is_milestone` (bool NOT NULL default false, 038), `wbs_code` (text, 052), `start_date`/`end_date` (date nullable, 046, CHECK `tasks_dates_order_chk`), `parent_task_id` (nullable → tasks SET NULL, 052 WBS-иерархия), `lane` (task_lane NOT NULL default 'now' — но delivery UI пишет `'next'`, см. learnings)**.

---

## ЗАДАЧА 2 — `references/learnings.md` (добавить в конец, новый блок «Волна D/E/F2/F1»)
```markdown
## Волна 2 добор — Gantt-UX · Импорт · Видео · Чат (2026-07-18)

### ⚠️ Pointer-хендлеры высокой частоты — истина в `useRef`, не в state-замыкании
Быстрый свайп: pointer-события приходят пачкой ДО ре-рендера → guard по state-замыканию теряет `pointermove`, короткий свайп открывает edit вместо дропа (S-GANTT-UX-2, drag из «Без дат»). Fix: источник правды drag → `useRef`, `state` только для рендера призрака. Класс = stale-closure в useEffect-хендлерах. **Ловится ТОЛЬКО рантайм-смоком** (tsc/build не видят).

### ⚠️ Delivery-задачи: `lane = 'next'` («Не начата»), НЕ `'now'` («В работе»)
Фазовая доска/шаблоны создают задачи с `lane:'next'` (ProjectBoard phaseMode, ProjectDetail defaultLane, copy_delivery_template 036); `'now'` = «В работе»; progress (037) считает по lane. Массовое создание (импорт плана) обязано ставить `'next'` — иначе весь план мгновенно «В работе». **Источник истины — delivery-путь (ProjectBoard/template), НЕ общий TaskModal/CallLog.** Урок: при сборке промпта сверять delivery-специфичные дефолты по delivery-пути, не по первому грепу (ловилось в D и E как «B1»).

### ✅ Новую RLS на project-scoped таблице — ЗЕРКАЛИТЬ с политики видимости проекта
`project_videos_select`/`project_messages_select` = точная копия `projects_select` + `projects_select_member` (owner/admin OR project ownership OR is_project_member; **без manager**). Не изобретать role-список: «кто видит проект — видит его видео/чат». Если добавить manager (которого нет в projects_select) — дочерняя запись виднее родителя (ловилось в F2 как «B1»; забыть ownership-ветку — владелец-не-member не видит свои данные).

### ⚠️ canManage — UI-гейт; RLS бэкапит АСИММЕТРИЧНО
- tasks_update/delete: RLS строже-или-равно UI (owner/admin OR assigned/created) — manager-не-owner deny.
- **tasks_insert: RLS ШИРЕ UI** — пускает любого org-manager (org owner/admin/manager). canManage для создания задач — только UI-гейт (импорт плана E: org-manager может лить задачи в любой проект org). project_columns/project_videos — RLS согласован с canManage (owner/admin OR ownership). **Чат project_messages INSERT — намеренно ВСЯ команда** (participant), не canManage.

### ⚠️ Overflow клиппит не только тултип — hover-Trash на full-width баре
Gantt full-width bar → hover-кнопка удаления уезжает за `overflow`-контейнер (тот же класс, что тултип в overflow-x-auto). Fallback: удаление такой задачи с доски «План». Known-issue (не блокер).

### ✅ Migration-спринт: мёрж в main ТОЛЬКО после apply; ветки эпиков — от main
Прод-код обратится к несуществующей таблице, если смёржить до apply миграции. Ветки эпиков заводить от main (независимые PR — F2/F1 так). Типы до apply — ручной stub в supabase.gen.ts (паттерн quotes) + alias в entities.ts; regen после apply снимает stub (сдифить — не потерять RelaxOrgId hand-edits).
```

---

## ЗАДАЧА 3 — `references/architecture.md`

### 3a. Гант: снять «read-only»
Найди пометку про PM-Гант «read-only» (~секция Key Components / PM-Гант) → заменить на: **«PM-Гант (Волна 2, WRITE): drag-to-resize/move дат, drag из «Без дат» → проставление дат, удаление задач/фаз в Ганте (S-GANTT-UX-2). Write-действия за `canManage`.»**

### 3b. Добавить компоненты/хуки (в Key Components / Hook Patterns)
```markdown
### ProjectVideos (S-VIDEO-EMBED-1) — видео-материалы проекта
`components/projects/ProjectVideos.tsx` (рядом с ProjectFiles, все типы проектов) + `use-project-videos.ts` + `lib/utils/video-embed-helpers.ts` (parseVideoUrl → embed из id, provider youtube/vk/rutube/other). Embed на рендере из parseVideoUrl(url) — stored provider не доверяем. Гейт canManage на write.

### ProjectChat (S-CHAT-1) — чат проекта (отдельный модуль, ≠ Активность)
`components/projects/ProjectChat.tsx` (таб «Чат» в ProjectDetail, все типы) + `use-project-messages.ts` (live через общий `useRealtimeSync('project_messages')`, optimistic + dedupe по id). Лента + composer (Enter — отправить, Shift+Enter — перенос), правка/удаление своих, admin модерирует. body как текст (XSS-контур). Пишет ВСЯ команда проекта (participant RLS), не только canManage. Граница locked: не трогает activity_log/EntityTimeline/ActivityComposer.
```
Плюс: в перечень табов ProjectDetail добавить **`'chat'` («Чат»)** к `activity/board/timeline/quotes`.

### 3c. Excel-импорт плана (S-PLAN-IMPORT-1)
В раздел Excel Import добавить: **`components/tasks/PlanImport.tsx` (`PlanImportButton`) — импорт плана из Excel в задачи (фазы→project_columns, задачи с lane='next', даты, вехи); `lib/utils/plan-import-helpers.ts` (autoDetectPlanMapping, parsePlanDate→localDateKey, parseMilestone; 19 vitest). Клиентский skip-and-continue (как companies/ExcelImport), гейт canManage.**

---

## ЗАДАЧА 4 — `SKILL.md`
Найди строку про миграции и обнови: **`Migrations applied` → 001–067** (060 зарезервирована, пропущена; 062 task_dep_update, 063 project_member_roles, 064 project_files_comment, 065 team_visibility, 066 project_videos, 067 project_messages; **следующая свободная — 068**). Deploy = Vercel (если ещё Netlify — поправить). Прочее не трогать.

---

## ВЕРИФИКАЦИЯ
```bash
cd ~/.claude/skills/crm-architect
grep -c "project_videos\|project_messages" references/schema.md references/architecture.md   # >0 в обоих
grep -n "useRef\|lane = 'next'\|зеркалить" references/learnings.md | head
grep -n "001–067\|068" SKILL.md
```
Кода нет → tsc/build/commit по обычному флоу скилла (если он под git). Это чистое обновление документации памяти проекта.
```
