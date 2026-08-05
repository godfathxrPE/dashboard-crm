# Handoff — сессия 2026-07-18 (волна фидбека Олега A→F1 ПОЛНОСТЬЮ закрыта)

> Для нового чата: продолжай с нуля. Бэклог (истина) — `claude/backlog-unified-2026-07-18.md`. Гейты — `claude/s-*-gate.md`. Здесь — срез + следующий шаг.

## TL;DR
- **Прод:** `origin/main = bb2f0b7`. **Две ветки ждут мёржа** (обе от main, независимы): `feat/video-embed` (F2, **066 applied**) + `feat/chat` (F1, **067 applied**). Мёрж за Олегом — тривиальный конфликт stub в gen.ts/entities.ts, затем regen.
- **Supabase: миграции по 067.** Следующая свободная — **068**.
- **🏁 Волна фидбека Олега (12 пунктов) A→F1 ПОЛНОСТЬЮ ЗАКРЫТА.** За сессию: 4 спринта (D/E/F2/F1), 2 миграции применены гейтом.
- **Дальше — новый вход Олега** ИЛИ fast-follow / Фаза 3 / follow-up фич.

## Что сделано этой сессией (D · E · F2 · F1)
- **D. S-GANTT-UX-2** — `a28b2bc` (клиент). Удаление задач/фаз в Ганте + drag из «Без дат». Находка: pointer-burst → `useRef`. Known-issue: full-width Trash-clip.
- **E. S-PLAN-IMPORT-1** — `bb2f0b7` (клиент). Импорт Excel-плана → задачи (lane='next', дедуп фаз). Граница: tasks_insert org-manager-wide.
- **F2. S-VIDEO-EMBED-1** — `feat/video-embed`, **066 applied**. project_videos + embed YouTube/VK/Rutube. RLS SELECT зеркало projects_select; write=canManage. Гейт PASS (смок 5/5, B1 владелец-не-member видит).
- **F1. S-CHAT-1** — `feat/chat`, **067 applied**. project_messages + чат-лента + realtime (`useRealtimeSync`, publication). RLS: SELECT зеркало; **INSERT вся команда (participant + author=uid)**; UPDATE/DELETE свои + admin-модерация. Гейт PASS (смок 5/5: участник пишет→ok, подмена автора→42501, UPDATE чужого→0, admin DELETE чужого→ok, посторонний SELECT→0; realtime-publication ✅). Отдельный модуль (не Активность — граница Олега). MVP без unread/тредов.

## Урок процесса (4 спринта)
Grok ревьюил каждый промпт ДО реализации, ловил мой B1 = якорь из неверного контекста (D useUpdateTaskDates; E lane='now'→'next'; F2 SELECT без ownership). На F2 я поймал ошибку Grok (он оставил лишний `manager` в SELECT — убрал, сверив projects_select). Качество промптов росло 6.5→7.5→8. **Правила:** delivery-дефолты сверять по delivery-пути; новую RLS зеркалить с существующей политики видимости (SELECT project_videos/project_messages = копия projects_select+_member).

## ⏭ За Олегом
1. **Мёрж F2 + F1** (feat/video-embed, feat/chat → main; 066/067 в проде → безопасно; конфликт stub минутный).
2. **regen типов** — снимет оба stub (project_videos + project_messages); hand-edits не потерять.
3. **docs/schema.md + crm-architect schema.md** — +project_videos, +project_messages.
4. **Live-смоки:** F1 realtime (два окна — сообщение без рефреша); F2 embed (плеер/ссылка); UI-смоки обоих.

## Открыто — решения Олега (не из волны)
- **W4-паритет Ганта** — assignee двигает свои даты в Ганте (canEdit+RLS) или canManage.
- **Fast-follow:** VISIBILITY-2 (storage) · W2 (canManage/projects_update) · Gantt Trash-clip · tasks_insert-сужение.
- **Follow-up фич:** чат F1.1 (unread-бейдж) · треды/вложения/реакции · видео-плейлисты · план WBS-иерархия.
- **Фаза 3 по сигналу:** W4b (распил ProjectDetail) → S-PM-TODAY-1 → S-WORKLOAD-1 + S-MILESTONES-1.

## Ключевые решения (locked)
- Видео/фазы write = canManage (RLS бэкапит). **Чат write = вся команда проекта** (participant + author=uid; RLS смоком подтверждён). Гант write = canManage.
- Чат = отдельный модуль (project_messages ≠ activity_log; отдельный таб/хук). Realtime через общий useRealtimeSync.
- Импорт плана: lane='next', клиентский skip-and-continue, v1 плоский.
- Migration-спринт: мёрж после apply; ветки эпиков от main.

## Рабочая модель + гочи
- Пайплайн: Cowork промпт (сверка по живому коду) → Grok-ревью промпта ДО реализации → CC пишет+пушит → Cowork-гейт (git show / apply_migration MCP / advisors / realtime-check / RLS-смок). Vercel.
- **Прод-миграции — с подтверждения Олега.** **Мёрж в main ТОЛЬКО после apply.**
- RLS-смок гейта — симуляцией JWT + rollback: `begin; insert (bypass) …; set local role authenticated; select set_config('request.jwt.claims', json_build_object('sub','<uid>')::text, true); <select/insert/update/delete → count / 42501>; rollback;`.
- Гочи: git через мост read-only; build при живом dev нельзя; window.confirm морозит CDP; pointer-хендлеры — истина в useRef; delivery lane='next'; сверять delivery-дефолты по delivery-пути; новую RLS зеркалить с политики видимости; чат ≠ activity_log; `rm -rf .next` после pull при смене globals/tailwind.

## Где что лежит
- Бэклог (истина): `claude/backlog-unified-2026-07-18.md`. Гейты: `claude/s-*-gate.md`.
- Промпты/ревью: `_analysis/sprint-*.md` / `review-sprint-*.md` (мак, tracked) + Project.
- Skill: `~/.claude/skills/crm-architect` (мосту недоступен — CC). Supabase ref: `uoiavcabxgdjugzryrmj`.
- Долг CC/скилла: gen.ts regen (снять оба stub); docs/schema +062–067; crm-architect (learnings/architecture/schema.md += project_videos, project_messages, tasks-поля, pointer-burst, Trash-clip, Гант write).
