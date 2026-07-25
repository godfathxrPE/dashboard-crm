# Ревью: Sprint F1 — S-CHAT-1

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `feat/video-embed` @ `cfdc905`; sprint anchors `@bb2f0b7` — совместимы)  
**Объект:** `_analysis/sprint-S-CHAT-1.md` — `project_messages` + realtime + таб «Чат» (MVP, ≠ Активность)  
**Контекст:** 065 `is_project_member`; 066 `project_videos` уже в ветке; **067** свободна; `useRealtimeSync` AUDIT 1.5

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА / якоря | ✅ Tab L151, tabs ~842, realtime hook, relativeTime, gen stub pattern |
| Scope MVP / граница с Активностью | ✅ locked, out-of-scope чёткий |
| Data model + hard delete | ✅ |
| RLS SELECT = projects_select + member (без manager) | ✅ (урок B1 из F2 учтён) |
| INSERT = вся команда, author=self | ✅ vs canManage на видео/фазах |
| UPDATE/DELETE own + admin delete | ✅ |
| Realtime publication + useRealtimeSync | ✅ (+ W3 replica identity) |
| GRANT / FK / TO authenticated | ✅ в SQL-драфте |
| Типы stub gen + entities | ✅ |
| UI composer / autoscroll / XSS text | ✅ |
| CC не apply / merge after gate | ✅ |
| Нумерация 067 после 066 | ✅ |

**Оценка: 8.5/10.**  
**Рекомендация:** **GO for CC** — блокеров нет. W1–W6 желательно в промпт/066-стиль SQL; без них MVP жив.

---

## Статус (живой код)

| Заход | Факт |
|-------|------|
| `066_project_videos.sql` | ✅ есть (ветка video-embed); **067** free |
| `is_project_member` | ✅ 065 |
| `projects_select` + `_member` | ✅ ownership + member; **без** manager — спринт зеркалит верно |
| `useRealtimeSync(table)` | ✅ refcount, debounce 150ms, default key `[table]` → prefix invalidate |
| Realtime pub baseline | activities, ai_runs, calls, … tasks — **без** `project_messages` |
| `ProjectDetail` Tab | ✅ L151; tabs L842+; chat **ещё нет** |
| `ProjectVideos` / Files | ✅ смонтированы; chat — отдельный **таб** (не секция) |
| `relativeTime` | ✅ `activity-events.ts:109` |
| `useAuth` / `useTeamMembers` | ✅ |
| `project_members` embed profiles | образец: `profile:profiles(...)` |
| `ProjectChat` / 067 | ❌ ещё нет |

---

## С чем согласен полностью

### 1. Модульная граница
Отдельная таблица / таб / хук — не `activity_log`, не `EntityTimeline`. Снижает риск «чат = лента событий». UAT-предупреждение уместно.

### 2. RLS-матрица (лучше F2 draft)
- **SELECT** = owner/admin **∨** project ownership **∨** `is_project_member` — как `projects_select` + 065, **без** manager (иначе чат шире, чем карточка проекта; 066 videos уже так).
- **INSERT** = тот же participant-предикат + `author_id = auth.uid()` — команда пишет, не только canManage.
- **UPDATE** = only author + WITH CHECK author frozen.
- **DELETE** = author **∨** owner/admin.
- GRANT / REVOKE / FK org / `TO authenticated` — hygiene из review F2.

### 3. Realtime через существующий менеджер
`useRealtimeSync('project_messages')` → invalidate `['project_messages']` → RQ prefix ловит `['project_messages', projectId]` (как `project_columns`). Не плодить свой channel.

### 4. UI gotchas
Text-only body (no `dangerouslySetInnerHTML`); Enter/Shift+Enter; autoscroll «только если внизу»; confirm delete; stub types.

### 5. Merge order
Apply 067 → smoke → merge → regen. Верно.

---

## Блокеры

**Нет.** SQL + product decisions executable as written.

---

## Предупреждения

### W1. Realtime: `REPLICA IDENTITY FULL` (рекомендуется)

В репо **нет** `REPLICA IDENTITY` на таблицах; Supabase docs: для Realtime **+ RLS** на UPDATE/DELETE лучше:

```sql
alter table public.project_messages replica identity full;
```

Иначе delete/update events иногда плохо фильтруются по RLS (клиент не видит событие → «чужое удаление не пропало» до refetch).  
**Добавить в 067** после create table.

### W2. Publication — идемпотентность

```sql
alter publication supabase_realtime add table public.project_messages;
```

Повторный apply → error. Паттерн baseline:

```sql
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'project_messages'
  ) then
    alter publication supabase_realtime add table public.project_messages;
  end if;
end $$;
```

### W3. `useRealtimeSync` + queryKey

`useRealtimeSync('project_messages')` без 2-го аргумента → key `['project_messages']` — **OK** (prefix).  
Явно можно: `useRealtimeSync('project_messages', ['project_messages'])` для читаемости.

Org **owner/admin** SELECT = **все** сообщения org → realtime event в любом проекте инвалидирует все открытые chat-кэши. MVP ок; later — filter filter: `project_id=eq.…` (отдельный channel, out of scope).

### W4. Embed author: синтаксис join

Спринт: `author:profiles!author_id(id, full_name, avatar_url)`.  
Live образец members: `profile:profiles(...)`.

Оба валидны при однозначном FK. Если PostgREST ругнётся на ambiguous — `!project_messages_author_id_fkey`.  
После insert `.select('*, author:profiles!…')` для optimistic/return.

### W5. UPDATE: `project_id` / `org_id` не заморожены политикой

WITH CHECK только `org_id` + `author_id`. Автор теоретически может `UPDATE … SET project_id = <другой свой проект>`.  
Низкий риск; **опц.:** trigger `NEW.project_id = OLD.project_id` или сузить update-колонки на клиенте только `{ body, edited_at }`.

`freeze_org_id` из 054 **не** навешивается автоматически на таблицы после 054 (066 тоже без него). Org reassignment: WITH CHECK `org_id = current_org_id()` режет чужой org.

### W6. Клиент: trim + temp-id dedupe

- `body.trim()`; reject empty; CHECK `length 1–4000` на **после** trim (иначе пробелы пройдут CHECK).
- Optimistic `temp-${crypto.randomUUID()}` (не `Date.now()` — коллизии).
- Realtime invalidate refetch: temp уйдёт, real придёт — **не** append payload blindly without dedupe if mixing optimistic + patch.

### W7. Модерация UI

DELETE policy: owner/admin. UI: `useOrgRole()` — кнопка «Удалить» на чужих только при `owner|admin`.  
Не путать с `canManage` (project owner member ≠ org admin).

### W8. Лимит выборки

`order created_at asc` **без limit** — на длинном чате тяжело. MVP: ок; later cursor/limit 200 + «загрузить ещё».  
Опц. в v1: `.limit(500)` + toast.

### W9. origin/main в спринте

Спринт: `bb2f0b7`. Сейчас tip video-embed `cfdc905` (+066). CC: ветка от **актуального main после merge 066**, миграция **067**. Не 066.

### W10. Deploy wording

«Vercel» — фактически Netlify. Не блокер.

---

## Задачи 1–4 (кратко)

| Task | Вердикт |
|------|---------|
| 1 Migration 067 + stub | ✅ + W1/W2 |
| 2 Hooks + realtime | ✅; insert only `{ project_id, body }` |
| 3 ProjectChat | ✅; XSS text; confirm; autoscroll |
| 4 Tab «Чат» all project types | ✅; no canManage gate on composer |

---

## Suggested SQL deltas (additive to sprint)

```sql
-- after CREATE TABLE:
alter table public.project_messages replica identity full;

-- publication (idempotent) instead of bare ADD TABLE:
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'project_messages'
  ) then
    alter publication supabase_realtime add table public.project_messages;
  end if;
end $$;
```

RLS policies — **оставить как в спринте** (уже правильные).

---

## crm-architect checklist

| Пункт | |
|-------|--|
| РАЗВЕДКА | ✅ |
| Schema / new table | ✅ 067 |
| Paths | ✅ |
| Migration not applied from CC | ✅ |
| org first + role/membership | ✅ |
| New DEFINER | N/A (reuse is_project_member) |
| Realtime publication | ✅ (+ idempotent W2) |
| CSS variables | ✅ |
| schema.md after apply | 🟡 gate |

---

## Предлагаемые правки в спринт

1. W1 `REPLICA IDENTITY FULL`.  
2. W2 idempotent publication.  
3. W6 trim + UUID temp ids.  
4. W7 `useOrgRole` for admin delete (не canManage).  
5. Ветка: after 066 on main → 067.

Минимальный GO: **без правок** (W1/W2 — strongly recommended before gate).

---

## Чеклист перед CC

- [ ] Branch `feat/chat` от main **с 066** (или stack after video)  
- [ ] `067_project_messages.sql` (+ replica identity + idempotent pub)  
- [ ] Stub `project_messages` in `supabase.gen.ts` + `entities.ts`  
- [ ] `use-project-messages.ts` + `useRealtimeSync('project_messages')`  
- [ ] `ProjectChat` + tab in `ProjectDetail`  
- [ ] **Не** touch Activity / activity_log / notifications  
- [ ] `tsc` / build; **не** apply 067  
- [ ] Gate: apply → advisors → publication membership → RLS JWT matrix (вкл. author spoof 42501) → two-browser realtime smoke → merge  

---

## Gate RLS matrix (как в спринте + extras)

| Роль | SELECT | INSERT | UPDATE own | DELETE own | DELETE other |
|------|--------|--------|------------|------------|--------------|
| project member | ✅ | ✅ (self author) | ✅ | ✅ | ❌ |
| project owner (not member row) | ✅ | ✅ | ✅ | ✅ | ❌ |
| org owner/admin | ✅ all org | ✅ | ✅ own | ✅ | ✅ |
| outsider same org | 0 | 42501 | — | — | — |
| INSERT author_id ≠ uid | — | 42501 | — | — | — |

---

## Итог

Крупный, но **хорошо нарезанный** MVP: правильная RLS (команда пишет, зеркало visibility), realtime через существующий менеджер, чёткая граница с Активностью.  
**GO** — усилить 067 replica identity + idempotent publication; остальное implementation detail.
