# Гейт Cowork — S-CHAT-1 (F1 волны) · ЗАКРЫТ, миграция 067 применена

**Дата:** 2026-07-18 · **Ветка:** `feat/chat` (62d1e2c, 8d3647f) — **в main НЕ мёржена** (мёрж за Олегом). **Миграция 067 применена на прод.** Ветка заведена от `main` (не от feat/video-embed) — PR-ы независимы.

## Что вошло (2 коммита)
- **62d1e2c** — `067_project_messages.sql` (92) + `use-project-messages.ts` (158) + `entities.ts` (+10) + `supabase.gen.ts` stub (+53).
- **8d3647f** — `ProjectChat.tsx` (282) + `ProjectDetail.tsx` (+8, таб «Чат»).
- CC: tsc 0 / vitest 187/187 / build 0.

## Гейт Cowork — PASS

### 1. Верификация SQL 067 (прочитан до apply)
Таблица + FK (`org_id/project_id CASCADE`, `author_id→profiles SET NULL` — история переживает автора), `body` CHECK 1–4000, `trg_set_org_id`, 3 индекса. RLS: SELECT зеркало `projects_select` (без manager); **INSERT = participant + `author_id=auth.uid()`** (вся команда пишет, анти-подмена); UPDATE свои (зеркальный WITH CHECK); DELETE свои + admin. `alter publication supabase_realtime add table`. GRANT/REVOKE, `TO authenticated`, `(select …)`.

### 2. apply_migration 067 → success
066 была последней, 067 применена атомарно (санкция Олега).

### 3. Realtime + advisors
- **`project_messages` в `supabase_realtime` publication** ✅ (RLS применяется к realtime → участник получает события только своих проектов).
- **advisors security:** нет новых проблем от 067 (RLS on, 4 политики). `is_project_member`/прочие в 0029-списке — известный шум (как и раньше). `leaked_password` — старый инфра-долг.

### 4. RLS-смок матрицей (симуляция JWT, всё в rollback)
| Проверка | Ожидание | Факт |
|---|---|---|
| участник (Иван, member) INSERT author=self | success | **1** ✅ |
| подмена автора (чужой `author_id`) | 42501 | **42501** ✅ |
| рядовой участник UPDATE чужого | deny | **0** ✅ |
| admin (org-owner) DELETE чужого (модерация) | success | **1** ✅ |
| посторонний (не член org) SELECT | 0 | **0** ✅ |

**Ключевое подтверждено:** чат пишет ВСЯ команда (участник INSERT author=self → success — отличие от видео/фаз=canManage); подмена автора невозможна (42501); правка/удаление — только свои (admin модерирует).

### 5. Код (git show)
Realtime через общий `useRealtimeSync('project_messages')` (refcount-менеджер, не свой канал); optimistic send + dedupe по id; `body` как текст (`whitespace-pre-wrap`, без `dangerouslySetInnerHTML` — XSS-контур); Активность не тронута (отдельный таб/таблица/хук — граница Олега соблюдена).

## ⏭ ЗА ОЛЕГОМ (порядок)
1. **Мёрж `feat/chat` → main** (067 в проде → безопасно). При мёрже F2+F1 — **тривиальный конфликт** в `supabase.gen.ts`/`entities.ts` (оба спринта добавляют stub-блоки в одно место) — минутный.
2. **regen типов** — снимет оба stub (project_videos + project_messages). Сдифить, hand-edits (RelaxOrgId) не потерять.
3. **docs/schema.md + crm-architect** — добавить `project_videos` (F2) + `project_messages` (F1).
4. **Live-смок realtime** (два окна): сообщение появляется у второго юзера проекта без рефреша. UI-смок: правка/удаление своих, admin удаляет чужое, не-участник чат не видит.

## Скилл-долги (crm-architect)
- `schema.md` += `project_videos` + `project_messages`; ранее: `tasks` += is_milestone/wbs/dates/parent; gen.ts regen; learnings +pointer-burst/Trash-clip; architecture Гант write.

## 🏁 ВОЛНА ФИДБЕКА ОЛЕГА (12 пунктов) — ПОЛНОСТЬЮ ЗАКРЫТА
A✅ B✅ C✅ VISIBILITY✅ D✅ E✅ F2✅ **F1✅**. За сессию: 4 спринта (D/E/F2/F1), 2 миграции применены гейтом (066/067). Осталось только: мёрж F2+F1 (за Олегом) + regen + docs. **Дальше — новый вход Олега или fast-follow / Фаза 3.**

## Открытые (не из волны)
- **Fast-follow:** VISIBILITY-2 (storage download) · W2 (canManage/projects_update) · Gantt full-width Trash-clip · опц. tasks_insert-сужение.
- **Ждёт решения:** W4-паритет Ганта; unread-бейдж чата (F1.1 — таблица reads + счётчик); чат-follow-up (треды/вложения/реакции/@упоминания).
- **Фаза 3 по сигналу:** W4b (распил ProjectDetail) → S-PM-TODAY-1 → S-WORKLOAD-1 + S-MILESTONES-1.
