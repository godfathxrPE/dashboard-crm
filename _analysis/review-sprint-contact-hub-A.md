# Ревью: Sprint Contact-Hub-A — EntityTimeline + Contact Hub

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, commits `d2b7d96` / `c776118` / `a62ae94`, archive `031_timeline_fk_indexes.sql`, live `src/types/supabase.gen.ts`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-contact-hub-A.md` — переиспользуемый `<EntityTimeline>` + unified timeline Contact Hub (calls/meetings/tasks/projects), связи, key-info  
**Контекст:** Оценка `_analysis/estimate-contact-hub.md` (2026-07-07). **Спринт A уже выполнен** 2026-07-08 (`d2b7d96`, message 1:1 с блоком «Коммит» промпта). В тот же день — Company/Deal Hub (`c776118`). Позже: entity-links `activity_log` 042 (`a62ae94`), Волна 2 042–046. Живая цепочка до **046+**. Аналогично `review-sprint-28` — handoff/исторический артефакт, **не** runnable-промпт на `main`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо | ❌ **Спринт уже выполнен** (типы, адаптеры, хук, UI, Contact Hub, 031) |
| Исторический дизайн (vs shipped `d2b7d96`) | ✅ 1:1; даже улучшен (`sourceId`, `openTimelineEvent`, таб «Сделки») |
| РАЗВЕДКА на `main` 2026-07-16 | 🟡 Команды полезны исторически; **line ranges устарели** (файл 603 стр., timeline уже `EntityTimeline`) |
| Факты схемы (contact_id / date columns) | ✅ Прямые источники верны; 🟡 `activity_log` «только project_id» — **устарело** после 042 |
| Per-entity серверный фильтр vs org-fetch | ✅ `useEntityTimeline` `.eq(col, id)` + `limit(50)` + queryKey `['timeline', kind, …]` |
| Company/Deal «отдельно потом» | ❌ Уже в `CompanyDetail` / `ProjectDetail` (`c776118`) |
| `includeSystem` off в UI A | ❌ На всех трёх хабах сейчас `options={{ includeSystem: true }}` |
| architecture.md post-gate | ✅ Раздел «EntityTimeline + per-entity…» полный |
| learnings.md post-gate | 🟡 Learning есть в **architecture.md**; отдельной записи в `learnings.md` **нет** |
| Индексы 031 | ✅ applied, в `archive/031_timeline_fk_indexes.sql` |
| Повторный прогон в CC | ❌ **Риск регрессии** (перезапись A, откат post-A улучшений B/notes/hubs) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности / state / file inventory |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (post-estimate, 2026-07-07→08): 9/10** — правильное архитектурное решение (reuse с day one), точные колонки/адаптеры, covering indexes, коммит `d2b7d96` закрыл scope A; follow-up B/hubs уже поверх.

**Рекомендация: не запускать.** Source of truth — live код:

| Артефакт | Путь |
|----------|------|
| Тип | `src/types/timeline.ts` |
| Адаптеры | `src/lib/timeline/adapters.ts` |
| Open event | `src/lib/timeline/open-event.ts` |
| Хук | `src/lib/hooks/use-entity-timeline.ts` |
| UI | `src/components/shared/EntityTimeline.tsx` |
| Contact Hub | `src/components/contacts/ContactDetailHub.tsx` |
| Индексы | `supabase/migrations/archive/031_timeline_fk_indexes.sql` |

Новый work (снять org-fetch для `linkedProjects`/`upcomingCall`, attachments, AI-роллапы) — **отдельный** спринт, не «перепрогон A».

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| **Contact-Hub-A** (`d2b7d96`, 2026-07-08) | ✅ **shipped** — types + adapters + hook + EntityTimeline + Contact Hub + 031 |
| Company/Deal на EntityTimeline (`c776118`, тот же день) | ✅ **shipped** (в A был out-of-scope) |
| `openTimelineEvent` | ✅ `src/lib/timeline/open-event.ts` |
| 031 covering indexes | ✅ applied → archive |
| `includeSystem` + ActivityComposer + notes 042 | ✅ contact/company/project hubs; `includeSystem: true` |
| architecture.md EntityTimeline | ✅ обновлён (Hook Patterns) |
| learnings.md «не тянуть org» | 🟡 текст в architecture; **не** в `learnings.md` |
| Attachments / project_files в Contact Hub | ✅ сознательно пропущено (как в скоупе A) |
| Org-fetch долг `useCalls`/`useProjects` в Contact Hub | 🟡 **остался** (upcomingCall, linkedProjects) — architecture.md § Долг |

---

## С чем согласен полностью

### 1. Ключевое решение: reuse с day one
`<EntityTimeline entityType entityId>` для contact/company/project — верно. Реализация не осталась contact-only: company/deal подключились в `c776118` без переписывания ядра.

### 2. Антипаттерн org-fetch + useMemo
Диагноз точен. Исторически `ContactDetailHub` тянул `useCalls()` (весь org) и фильтровал. Сейчас timeline на серверном `.eq`; **остаточный** org-fetch только для сайдбара (см. W1).

### 3. Карта источников (прямые 4)
| Источник | Привязка | Дата | Live |
|----------|----------|------|------|
| `calls` | `contact_id` | `date` | ✅ `supabase.gen` + schema |
| `meetings` | `contact_id` | `date` | ✅ (+ `project_id`, `company_id`) |
| `tasks` | `contact_id` | `deadline` / fallback `created_at` | ✅ `taskToEvent` |
| `projects` | `contact_id` | `created_at` | ✅ |

Overdue: `deadline < now && lane !== 'done'` — ✅ `adapters.ts` L79–86 (не `!done` по status, а lane — корректно для kanban).

### 4. Задачи 1–4 (тип / хук / UI / встраивание) — design match
Shipped 1:1 + разумные дельты:
- `TimelineEvent.sourceId` (промпт не указывал) — нужно для `openTimelineEvent`;
- `openTimelineEvent` — единый kind→action (точечный `.eq('id').single()`, не org-fetch);
- таб фильтра **«Сделки»** вместо «Проекты» (согласовано с rename e3839ee/4c1f2ad);
- `renderAction` — AI Sparkles остаётся в родителе (generic presenter).

### 5. Задачи 5–6 (связи + key-info)
- Компании + сделки со счётчиком/стадией/«Нет сделок» — ✅ сайдбар Contact Hub ~L505–534;
- Tickets/Payments не добавлены — ✅;
- `project_files` не изобретены — ✅;
- last-touch через `useLastTouchMap` / `touchLevel` в шапке — ✅ ~L309–318.

### 6. Скоуп-границы и SQL-процесс
- AI-роллапы → B — ок;
- Server-side pagination не нужна (`.limit(50)`) — ок;
- 031 как отдельный migration file, не apply из CC — соблюдено исторически.

### 7. РАЗВЕДКА (как методология)
Секция есть; хуки-источники (`use-calls`/`use-meetings`/`use-tasks`) действительно org-level `staleTime: 60_000` без entity-фильтра — диагноз «фильтр на клиенте» был верен на дату спринта.

---

## Блокеры (критично — не запускать как runnable)

### B1. Спринт уже в `main` — повторный прогон = регрессия
Существуют все target-файлы промпта + post-A:

```
src/types/timeline.ts                         (30 строк)
src/lib/timeline/adapters.ts                  (111)
src/lib/timeline/open-event.ts                (58)   — post-A
src/lib/hooks/use-entity-timeline.ts          (290)
src/components/shared/EntityTimeline.tsx      (172)
src/components/contacts/ContactDetailHub.tsx  — уже <EntityTimeline … includeSystem>
```

Коммит `d2b7d96` message **байт-в-байт** совпадает с блоком «Коммит» промпта. CC по этому файлу перезапишет/раздвоит уже живой стек и может откатить `openTimelineEvent`, notes-042 ветку `fetchActivity`, company/deal hubs.

### B2. РАЗВЕДКА со stale line ranges
`sed -n '146,260p' ContactDetailHub.tsx` на `main` показывает **уже** `useProjects`/`useCalls` + `handleOpenEvent`/`openTimelineEvent`/`EntityTimeline` imports — не «самодельный timeline useMemo calls+projects». Агент, слепо «заменяющий timeline», будет править не тот код.

### B3. Факт схемы `activity_log` устарел (для любого переписывания includeSystem)
Промпт (на 2026-07-07): *«activity_log — только `project_id`»*.  
Live после **042**: `activity_log.contact_id` / `company_id` (+ partial indexes).  
`useEntityTimeline.fetchActivity` уже делает **direct** `.eq(col, id)` + transitive projects — шире, чем MVP A. Повтор по тексту A отрежет notes-timeline.

### B4. Out-of-scope A уже сделан — промпт врёт про границы «потом»
| Промпт | Live |
|--------|------|
| Company/Deal Hub → отдельно | `CompanyDetail` L237, `ProjectDetail` L827–830 |
| `includeSystem` UI off | **true** на contact/company/project |
| architecture/learnings «после» | architecture **уже** описывает полный паттерн |

---

## Предупреждения (желательно учесть в follow-up, не в перепрогоне A)

### W1. Долг org-fetch в Contact Hub (ожидаемый, задокументирован)
```
ContactDetailHub.tsx:146  useProjects() → linkedProjects (filter contact_id)
ContactDetailHub.tsx:148  useCalls()    → contactCalls / upcomingCall
```
Timeline **не** зависит от этих хуков. Architecture.md § Долг это фиксирует. Follow-up: `useProjectsByContact(id)` / `useUpcomingCall(contactId)` с серверным фильтром — отдельный микро-спринт.

### W2. `learnings.md` не получил dedicated entry
Промпт: *«Learnings: timeline-источники — серверный фильтр…»*.  
Текст живёт в `architecture.md` L335–337. В `learnings.md` grep по timeline/EntityTimeline/org-fetch — **пусто**. Не блокер кода; пробел памяти skill.

### W3. `schema.md` body `activity_log` без contact_id/company_id
Дельта 042 — в header changelog, **не** в таблице колонок activity_log (L614–625 только `project_id`). Для следующих спринтов — сверить `supabase.gen.ts`, не body schema.

### W4. meetings: body schema vs live
schema body meetings: `company_id / contact_id` (012). Live Row также **`project_id`** — критично для `entityType="project"` (иначе лента встреч на сделке пустая). `useEntityTimeline` корректно фильтрует `.eq('project_id', id)`.

### W5. Таб «Проекты» в промпте vs «Сделки» в UI
Промпт FILTERS: «Проекты». Live: `{ key: 'project', label: 'Сделки' }` — правильнее post-rename. Не баг; при любом rewrite сохранить «Сделки».

### W6. Attachments
Скоуп A: пропустить, если нет прямой привязки. `project_files` → только `project_id`. В Contact Hub вложений нет — ок. Не открывать в «перепрогоне».

---

## Пропущенные места (file inventory vs промпт)

| Файл / символ | Статус | Примечание |
|---------------|--------|------------|
| `src/types/timeline.ts` | ✅ есть | +`sourceId`, `TimelineStatus` |
| `src/lib/timeline/adapters.ts` | ✅ есть | 4 адаптера, pure |
| `src/lib/hooks/use-entity-timeline.ts` | ✅ есть | + includeSystem activity/ai_runs, notes direct+transitive |
| `src/components/shared/EntityTimeline.tsx` | ✅ есть | groups + tabs + empty |
| `ContactDetailHub` EntityTimeline | ✅ L574–582 | `includeSystem: true`, `renderAction`, composer |
| `src/lib/timeline/open-event.ts` | ✅ post-A | промпт не требовал отдельный модуль — better |
| `031_timeline_fk_indexes.sql` | ✅ archive | `idx_calls_contact`, `idx_projects_contact` |
| Company/Deal EntityTimeline | ✅ | out-of-scope A, already done |
| `project_files` sidebar | ✅ отсутствует | by design |
| Локальный timeline useMemo (calls+projects only) | ✅ удалён | заменён EntityTimeline |

**Ложных «надо создать» в промпте:** все пути Задач 1–4 уже существуют — inventory для CC = full false-positive на create.

---

## РАЗВЕДКА — сверка команд промпта (2026-07-16)

| Команда | Ожидание промпта | Факт `main` |
|---------|------------------|-------------|
| `sed 146–260 ContactDetailHub` | старый timeline useMemo | `useProjects`/`useCalls` + modals state + `handleOpenEvent` → `openTimelineEvent`; **не** старый slice timeline |
| hooks grep queryKey/from | org-fetch | ✅ `useCalls`/`useMeetings`: full org select, `staleTime: 60_000`; mutations уже `invalidateQueries(['timeline'])` |
| types grep call/meeting/task | типы источников | ✅ `CallStatus`, `TaskLane`, etc. в `database.ts` |
| CallModal/MeetingModal/TaskModal | подключены | ✅ imports L20–24, render L587–589, quick actions L344–354 |

---

## crm-architect checklist (если считать runnable)

- [x] Есть РАЗВЕДКА  
- [x] Реальные table/column (прямые источники)  
- [ ] 🟡 activity_log привязка — устарела post-042  
- [x] Пути файлов (исторически верные; сейчас все уже есть)  
- [ ] 🟡 learnings gotcha — в architecture, не в learnings.md  
- [x] SQL 031 отдельным файлом; не apply из CC  
- [x] org boundary через RLS существующих таблиц (новых RPC нет)  
- [x] CSS variables / no emoji  
- [ ] ❌ **State:** спринт applied — checklist «можно в CC» **fails**

---

## Предлагаемые правки в спринт

*Не редактировать и не запускать. Если нужен артефакт для архива:*

1. **Banner в шапку:**  
   `> ⚠️ SHIPPED 2026-07-08 (d2b7d96). Не запускать в CC. Source of truth — live src/ + archive/031. Follow-ups: c776118 (company/deal), a62ae94/042 (notes).`
2. Заменить РАЗВЕДКА line ranges на `rg -n EntityTimeline|useEntityTimeline|openTimelineEvent src/`.
3. Обновить таблицу activity_log: `project_id` **и** `contact_id`/`company_id` (042).
4. Скоуп-границы: Company/Deal / includeSystem — **done**, не «потом».
5. В «После»: learnings — явно дописать в `learnings.md` (или снять пункт как done via architecture).
6. Для нового work — отдельный файл, напр. `_analysis/sprint-contact-hub-debt-org-fetch.md` (W1), не reuse A.

---

## Чеклист перед CC

- [ ] **Не запускать** этот файл в Claude Code на `main`
- [x] A уже в git: `d2b7d96` + 031 archive
- [x] Hubs: Contact + Company + Project на EntityTimeline
- [x] architecture.md § EntityTimeline актуален
- [ ] (optional) Добавить learning в `learnings.md` одним абзацем
- [ ] (optional) Перенести 042 колонки activity_log в body `schema.md`
- [ ] Follow-up scope (если нужен): per-entity hooks для sidebar deals/upcoming call; не timeline rewrite
- [ ] Sprint B / AI-роллапы — только если продукт ещё не закрыт отдельно; `includeSystem` UI уже on

---

**Итог:** промпт был сильным runnable-спеком на 2026-07-07 и **полностью исполнен** (`d2b7d96`). На 2026-07-16 это архивный handoff. **В CC не отдавать.**
