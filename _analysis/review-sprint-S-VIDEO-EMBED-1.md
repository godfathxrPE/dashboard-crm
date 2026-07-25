# Ревью: Sprint F2 — S-VIDEO-EMBED-1 (v2)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/video-embed` @ `bb2f0b7` = `origin/main`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-VIDEO-EMBED-1.md` — v2 после ревью 8/10: `project_videos` + embed YouTube/VK/Rutube + секция «Видео»  
**Контекст:** 065 `is_project_member` / `projects_select_member`; образец quotes 053 + `ProjectFiles`; предыдущее ревью `_analysis/review-sprint-S-VIDEO-EMBED-1.md` (v1)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА / якоря (065, L249, L833, CSP, 066 free, quotes stub) | ✅ |
| B1 SELECT = зеркало `projects_select` + member, **без manager** | ✅ исправлено vs v1 |
| INSERT/DELETE = canManage (owner/admin ∨ ownership) | ✅ |
| GRANT / FK org_id·created_by / `TO authenticated` | ✅ |
| Типы-stub gen + entities (W1) | ✅ |
| W7 re-parse `parseVideoUrl` на рендере | ✅ зафиксировано |
| W6 `window.confirm` / W5 `m.youtube.com` | ✅ |
| CC не apply / merge после gate | ✅ |
| Data model 1:N, hard delete, no realtime, scope | ✅ |
| Операционный старт ветки / уже лежащий 066 | 🟡 |
| Мелочи (VideoProvider, hook-образец, CSP commit msg) | 🟡 |

**Оценка: 9/10.**  
**Рекомендация:** **запускать в CC** — блокеров v1 закрыты; ниже только предупреждения и статус репо.

---

## Статус (живой код @bb2f0b7)

| Заход | Факт в репо |
|-------|-------------|
| `HEAD` / sprint `bb2f0b7` | ✅ match (`feat/video-embed` = `origin/main`) |
| Миграции …**065**; номер **066** | ✅ `065_team_visibility.sql`; следующих numbered нет |
| `066_project_videos.sql` | 🟡 **уже есть untracked** (черновик ≈ спринт + `idx_…_created_by`) |
| `is_project_member` DEFINER | ✅ `065_team_visibility.sql:9–23` |
| `projects_select` (baseline) | ✅ org + `owner`/`admin` **OR** `owner_id`/`created_by` — **без manager** (`20260712230000_baseline.sql:3607`) |
| `projects_select_member` | ✅ `065:26–31` → `is_project_member(id)` |
| `canManage` | ✅ `ProjectDetail.tsx:249` = `canManageDeliveryProject` (`project-permissions.ts:10–18`) |
| `<ProjectFiles projectId={…} />` | ✅ L833; **без** canManage-пропа (видео гейтить строже — ок) |
| CSP-lite, **нет** `frame-src` | ✅ `next.config.ts:13`, `netlify.toml:25` |
| Stub-паттерн quotes | ✅ `supabase.gen.ts:1415+`, `entities.ts:38–44` |
| UI/hooks/parser video | ❌ ещё нет (ожидаемо до CC) |
| `window.confirm` delete | ✅ конвенция (`ProjectFiles.tsx:42`, learnings) |

---

## С чем согласен полностью

### 1. B1 закрыт правильно (лучше, чем suggested SQL в v1-ревью)

v1 SELECT с `manager` в роли **раздувал** видимость видео относительно проекта. v2 зеркалит факт:

```text
projects_select:     org ∧ (owner|admin ∨ owner_id ∨ created_by)
projects_select_member: org ∧ is_project_member
```

→ одна policy: owner/admin **OR** ownership **OR** member. **Без manager** — верно: org-manager без ownership/membership проект не откроет (`projects_select`), видео не должны быть шире.

INSERT/DELETE = canManage (без member-write) — совпадает с `canManageDeliveryProject`.

### 2. Модель отдельной таблицы

Не jsonb на `projects` → не упираемся в `projects_update` (owner_id only, без `created_by`). CASCADE с проектом, hard delete, no realtime — здраво.

### 3. Типы W1

`RelaxOrgId` в `database.ts` + ручной блок в `supabase.gen.ts` (как quotes) + alias в `entities.ts` — иначе `supabase.from('project_videos')` не соберётся. Спринт это явно требует.

### 4. Embed security (W7 + id-only embedUrl)

Не доверять stored `provider`/`url` для iframe; `parseVideoUrl` → `embedUrl` из id; `other` → ссылка; attrs iframe (lazy, referrerpolicy, allow, allowfullscreen, без sandbox) — правильный trade-off.

### 5. Гочи org_id / apply / merge

`trg_set_org_id`; CC **не** apply; merge **после** gate — обязательно (прод без таблицы упадёт).

### 6. UI mount

Рядом с Files, **все** типы проектов; `canManage` уже в scope компонента (L249).

### 7. Initplan `(select …)` + `TO authenticated` + GRANT/REVOKE

Паритет 065 / 053.

### 8. Gate RLS-матрица

Owner-not-in-members SELECT ✅ — именно B1-кейс; member INSERT 42501; stranger 0 — достаточно.

---

## Блокеры (критично — исправить до запуска)

**Нет.** B1/W1–W3/W5–W7 из v1 закрыты в тексте спринта и в SQL-задаче 1.

---

## Предупреждения (желательно учесть)

### W1. Ветка `feat/video-embed` уже существует и checkout’нута

Спринт: `git switch -c feat/video-embed` → на текущем дереве **упадёт**.  
**CC:** `git switch feat/video-embed` (или `switch -c` только если ветки нет). HEAD уже `bb2f0b7`.

### W2. Untracked `supabase/migrations/066_project_videos.sql` уже в дереве

Файл ≈ спринт (SELECT/INSERT/DELETE, GRANT, FK, check url/provider) **+** `idx_project_videos_created_by` (хорошо против unindexed FK advisor).  
**CC:** не плодить второй 066; взять/дописать этот файл, сверить с Task 1, закоммитить. Не apply.

### W3. `VideoProvider` не объявлен в Task 2

`ParsedVideo { provider: VideoProvider; … }` — типа в репо нет.  
**Явно:** `export type VideoProvider = 'youtube' | 'vk' | 'rutube' | 'other'`.

### W4. «Паттерн use-project-columns» слегка вводит в заблуждение

`use-project-columns.ts` тянет `useRealtimeSync('project_columns')`. Спринт верно: **без realtime**.  
Ближе: `use-project-files` / `use-quotes` (query + mutate + invalidate, org_id не передавать).

### W5. EXISTS ownership без `p.org_id = current_org_id()`

Как и в ряде мест репо: теоретический cross-org orphan (JWT org A, project_id из org B, если uid = owner). На UI ProjectDetail чужой org не откроется.  
**Усиление (опц.):** в EXISTS добавить `and p.org_id = (select public.current_org_id())` для SELECT/INSERT/DELETE.

### W6. CSP commit message vs optional step

Task 4: CSP **опц.**; КОММИТ 2 всегда: `+ CSP frame-src`.  
Либо сделать CSP обязательным в next.config, либо не обещать в message, если не трогали.  
`netlify.toml` — реликт; прод-headers из `next.config` — ок. `youtube-nocookie` — по желанию.

### W7. Парсер edge (не блокер v1)

| URL | Ожидание v1 |
|-----|-------------|
| `m.youtube.com` / shorts / youtu.be / embed | ✅ в regex + vitest |
| `youtube.com/live/…`, playlist-only | → `other` |
| `www.rutube.ru/…` | может → `other` (нет optional `www.`) |
| `vk.com/video_ext.php?…` | → `other`/ссылка (ок) |

Достаточно для MVP; при желании — `www\.?` на rutube.

### W8. schema.md после apply

Gate п.3: `docs/schema.md` + crm-architect schema — не забыть (сейчас `project_videos` нет; `project_files` ~L799 в docs).

---

## Пропущенные места (grep)

| Файл | Строки / факт | Действие |
|------|----------------|----------|
| `ProjectDetail.tsx` | L833 `ProjectFiles` | Монтаж `ProjectVideos` рядом; `canManage` в scope |
| `src/lib/utils/video-embed-helpers.ts` | нет | Создать (Task 2) |
| `src/lib/hooks/use-project-videos.ts` | нет | Создать (Task 3) |
| `src/components/projects/ProjectVideos.tsx` | нет | Создать (Task 4) |
| `src/types/supabase.gen.ts` / `entities.ts` | quotes есть; video нет | Stub + aliases |
| `supabase/migrations/066_project_videos.sql` | untracked draft | Не дублировать; довести/закоммитить |
| `ProjectFiles` / storage | — | **Не трогать** (scope) |

Ложных путей в спринте нет: L249, L833, CSP L13, 065 helper, quotes stub — совпали.

---

## Сверка SQL Task 1 ↔ факт policies

| Требование | Код / schema |
|------------|----------------|
| SELECT ⊇ кто видит проект | ✅ owner/admin ∨ ownership ∨ `is_project_member` |
| Не шире проекта (нет manager-only) | ✅ |
| Write = canManage | ✅ `canManageDeliveryProject` без manager |
| `set_org_id` BEFORE INSERT | ✅ паттерн baseline / 053 |
| FK org → organizations CASCADE | ✅ |
| created_by → profiles SET NULL + default `auth.uid()` | ✅ как 053 |
| GRANT select/insert/delete; REVOKE anon | ✅ как 053 |
| NO UPDATE | ✅ |
| Initplan `(select …)` | ✅ |

Черновик 066 в репо соответствует; index на `created_by` — улучшение относительно текста спринта (можно оставить).

---

## crm-architect checklist

| Пункт | |
|-------|--|
| РАЗВЕДКА перед правками | ✅ |
| Реальные table/column / новые в 066 | ✅ |
| Пути (ProjectDetail, types, next.config) | ✅ |
| learnings: confirm, set_org_id, DEFINER reuse | ✅ |
| Миграция файлом; CC не apply | ✅ |
| org boundary first + role/membership | ✅ |
| Новые DEFINER-функции | N/A (reuse `is_project_member`) |
| CSS variables / theme | ✅ (UI на токенах border/text) |
| schema.md после apply | 🟡 gate |
| flowType implicit | N/A |
| DELETE CASCADE | ✅ FK on project |

---

## Предлагаемые правки в спринт (косметика, не блокер)

1. РАЗВЕДКА: `git switch feat/video-embed` **или** create-if-missing; не слепой `-c`.  
2. Task 1: «если 066 уже в working tree — сверить и использовать».  
3. Task 2: `export type VideoProvider = …`.  
4. Task 3: «паттерн use-quotes / use-project-files, **без** realtime».  
5. (Опц.) EXISTS + `p.org_id = current_org_id()`.  
6. Commit 2 message без CSP, если hardening не делали.

---

## Чеклист перед CC

- [x] B1 SELECT = projects_select + member (без manager)  
- [x] GRANT + FK + `TO authenticated` + url/provider checks  
- [x] W1 gen stub + entities aliases  
- [x] W7 re-parse на render; W6 confirm; W5 m.youtube  
- [ ] Не `git switch -c` на существующую ветку  
- [ ] Не затереть/не дублировать untracked 066  
- [ ] `VideoProvider` + parser + vitest  
- [ ] hooks без realtime; ProjectVideos + mount @ Files  
- [ ] `tsc` / vitest / build  
- [ ] **Не** apply 066; **не** merge main until gate apply  
- [ ] Gate: advisors + JWT matrix (owner-not-member SELECT; member INSERT 42501; stranger 0)  
- [ ] После apply: docs/schema + skill schema  

---

## Итог

v2 качественно закрыл единственный must-fix v1 (SELECT ownership) и hygiene (GRANT, stub, confirm, re-parse, m.youtube). SQL, RLS, apply/merge order и UI-контракт согласованы с живым кодом @`bb2f0b7` и crm-architect.  

**GO for Claude Code** с учётом W1–W2 (ветка + уже лежащий 066). Оценка **9/10**.
