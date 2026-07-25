# Гейт Cowork — S-VIDEO-EMBED-1 (F2 волны) · ЗАКРЫТ, миграция 066 применена

**Дата:** 2026-07-18 · **Ветка:** `feat/video-embed` (53e789f, cfdc905) — **в main ещё НЕ мёржена** (мёрж за Олегом, см. ниже). **Миграция 066 применена на прод** (Cowork MCP).

## Что вошло (2 коммита)
- **53e789f** — `066_project_videos.sql` (77) + `video-embed-helpers.ts` (49) + `entities.ts` (+6) + `supabase.gen.ts` stub (+59) + тесты (127, **17**).
- **cfdc905** — `ProjectVideos.tsx` (199) + `use-project-videos.ts` (85) + `ProjectDetail.tsx` (+4 монтаж) + `next.config.ts` (CSP frame-src).
- CC: tsc 0 / vitest **204/204** (17 новых) / build 0.

## Гейт Cowork — PASS

### 1. Верификация SQL 066 (прочитан целиком до apply)
Таблица + FK (`org_id→organizations CASCADE`, `created_by→profiles SET NULL`), CHECK (`provider`, `url` length), `trg_set_org_id`, 3 индекса. RLS SELECT = **точное зеркало `projects_select`** (owner/admin OR project ownership OR `is_project_member`, **без manager** — сверено с живым `projects_select`). INSERT/DELETE = canManage (owner/admin OR ownership вкл. created_by). NO UPDATE. GRANT/REVOKE, всё `TO authenticated` в `(select …)`.

### 2. apply_migration 066 → success
`list_migrations`: 065 была последней, 066 свободна. Применена атомарно через MCP (санкция Олега).

### 3. advisors — чисто
- **Security:** нет новых проблем от 066 (RLS on, политики есть). `is_project_member` в 0029-списке — **тот же известный шум** (SECURITY DEFINER executable by authenticated; не эксплойт — как отмечено в learnings). `leaked_password` — старый инфра-долг.
- **Performance:** `project_videos` FK **проиндексированы** (нет в unindexed). `project_videos` **НЕ в multiple-permissive** (одна SELECT-политика, а не две как tasks/projects — чище по перфу). `unused_index` на 3 новых индексах — ожидаемо (только создал, рассосётся под нагрузкой).

### 4. RLS-смок матрицей (симуляция JWT, всё в rollback — прод не тронут)
| Проверка | Ожидание | Факт |
|---|---|---|
| member (участник) SELECT | видит | **1** ✅ |
| **B1: владелец-не-member SELECT** (ownership-ветка) | видит | **1** ✅ |
| посторонний (не член org) SELECT | 0 | **0** ✅ |
| member (не владелец) INSERT в чужой проект | 42501 | **42501** ✅ |
| владелец проекта INSERT (контроль) | ok | **1** ✅ |

**B1 закрыт смоком:** владелец-не-member видит видео (главный фикс ревью Grok). Все ветки RLS (role/ownership/membership) подтверждены; write-гейт canManage бэкапится RLS полностью (в отличие от E, где tasks_insert был шире).

### 5. Код (git show)
W1 gen-stub `project_videos` в `supabase.gen.ts` ✅; W7 — `iframe.src` всегда из `parseVideoUrl(video.url)` на рендере, stored provider не доверяется ✅; embed из captured id (injection-safe); `other` → карточка-ссылка `noopener`; confirm-delete; write-UI за canManage.

## ⏭ ЗА ОЛЕГОМ (порядок важен)
1. **Мёрж `feat/video-embed` → main** (git через мост не гоняю). Таблица 066 уже в проде → прод-код не упадёт. Vercel auto-deploy подхватит.
2. **regen типов** (`npx supabase gen types typescript …`) — снимет ручной stub из `supabase.gen.ts` (заменит на реальный). Сдифить, не потерять hand-edits (RelaxOrgId и пр.).
3. **docs/schema.md + crm-architect `schema.md`** — добавить `project_videos` (таблица + RLS).
4. **UI-смок** (вручную): секция «Видео» на проекте → добавить youtu.be/VK/Rutube → плеер 16:9; Я.Диск → карточка-ссылка; удалить (confirm, canManage); без canManage — только просмотр.

## Скилл-долги (crm-architect, мосту недоступен)
- `schema.md` += `project_videos`; ранее: `tasks` += is_milestone/wbs/dates/parent; `supabase.gen.ts` full-regen; learnings +pointer-burst/Trash-clip; architecture Гант read-only→write.

## Волна фидбека Олега (12 пунктов) — ЗАКРЫТА
A✅ B✅ C✅ VISIBILITY✅ D✅ E✅ **F2✅** (+F1 чат — решение Олега отложить/делать). Дальше — по бэклогу: fast-follow (VISIBILITY-2 storage · W2 canManage/projects_update · Gantt full-width Trash-clip · опц. tasks_insert-сужение) или Фаза 3, или новый вход Олега. Открыто на решение: W4-паритет Ганта; F1 (чат) — единственный незакрытый пункт волны.
