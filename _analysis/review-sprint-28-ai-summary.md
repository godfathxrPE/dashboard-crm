# Ревью: Sprint 28 — AI-саммари звонков и встреч

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, archive `028_ai_summary.sql`, baseline `20260712230000_baseline.sql`, active `040`–`046`, `docs/schema.md`, live `supabase/functions/ai-summarize/`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-28-ai-summary.md` — Edge Function `ai-summarize` (JWT+RLS, tool use, anti-injection), поля `ai_summary`/`ai_summary_at`, UI-кнопка в карточках  
**Контекст:** S27 applied; **S28 applied 2026-07-06** (DDL руками + edge); финальный generative smoke + injection + negative HTTP — **done 2026-07-07** (`BACKLOG.md`, `_analysis/injection-test-s28.md`, `smoke-s28-negative.sh`). Позже: S-AI-1 (`ai-run`, `AiWorkspaceModal`), S29+, delivery 035–038, Волна 2 042–046. Живая цепочка до **046**. Аналогично `review-sprint-27` — handoff-артефакт, не runnable-промпт на `main`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** (SQL + edge + hook + UI + docs; гейт/смоки закрыты) |
| Исторический дизайн (vs archive 028 + live edge) | ✅ 1:1 с shipped; security-контур реализован дословно |
| «БД на 027» / миграция миграции | ❌ Устарело: 028–046 applied; next free ≥ **047** |
| РАЗВЕДКА на `main` 2026-07-16 | 🟡 Команды полезны исторически; пути **ломают** поиск (`src/components/modals/` **нет**) |
| Edge `ai-summarize` JWT+RLS, без service_role | ✅ Live `index.ts` (267 строк); `grep service_role` → 0 |
| Anti-injection (4 пункта) | ✅ `<data>`, fixed system, forced `submit_summary`, plain-text UI, 8000 chars |
| UI «кнопка в CallModal/MeetingModal» | 🟡 Было в S28; **сейчас** — `AiSummaryPanel` в `AiWorkspaceModal` (S-AI-1) |
| `docs/schema.md` / skill «028 pending» | ❌ Полный блок «028, applied» + раздел Edge Functions |
| Повторный apply/деплой 028 | ❌ **Риск регрессии** (overwrite edge, дрейф docs, конфликт с baseline/архивом) |
| Контракт «CC пишет, не apply» | ✅ Процесс верный (исторически соблюдён) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности / state / file inventory |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (post-S27, июль 2026): 9/10** — security-дизайн сильный; SQL ушёл в `archive/028_ai_summary.sql`; edge 1:1 со спецификацией; коммит `2845838`; гейт-хвосты закрыты 2026-07-07.

**Рекомендация: не запускать.** Source of truth — archive `028`, baseline колонки, live `supabase/functions/ai-summarize/`, `use-ai-summary.ts`, `AiSummaryPanel` + `AiWorkspaceModal`, `docs/schema.md` § Edge Functions. Новый work (meetings `description` в контекст, model-string audit, UI tweaks) — отдельный спринт поверх **047+**, не «перепрогон 028».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S27 027 stage gates | ✅ applied |
| **S28 028 ai_summary + ai-summarize** | ✅ **applied** 2026-07-06; `archive/028_ai_summary.sql`; baseline L1483–1484 / L1686–1687; edge + `verify_jwt=true` |
| Финальный smoke / Anthropic credits | ✅ done 2026-07-07 (`BACKLOG.md`) |
| Negative HTTP 6/6 + injection checklist | ✅ `smoke-s28-negative.sh`, `injection-test-s28.md` |
| S-AI-1 030 `ai-run` + AI Hub UI | ✅ `supabase/functions/ai-run/`, `AiWorkspaceModal`, `AiRunPanel` |
| 029–046 + baseline | ✅ active `040`–`046` + `20260712230000_baseline.sql` |
| Hooks / types | ✅ `use-ai-summary.ts`, `AiSummary` в `database.ts`, `supabase.gen.ts` |
| UI entry points | ✅ Sparkles → `AiWorkspaceModal` из `CallLog`, `MeetingsList`, `CalendarView` (+ Contact hub per architecture) |
| CallModal / MeetingModal | ✅ **только данные**; AI **не** внутри (architecture.md L57–59, L420–421) |
| **Повторный запуск sprint-28-…md** | ❌ **запрещён** |

Доказательства:

- `docs/schema.md` / crm-architect `schema.md`: «028 … применена руками 2026-07-06»; «финальный смок …» / backlog credits закрыты.
- `ls supabase/functions/` → `ai-summarize`, `ai-run`; `config.toml` `[functions.ai-summarize] verify_jwt = true`.
- `rg ai_summary|use-ai-summary|AiSummaryPanel|ai-summarize src/ supabase/` → полный стек.
- `git log --grep='Sprint 28'` → `2845838 Sprint 28: AI-саммари…`.
- learnings.md: model via env `AI_SUMMARY_MODEL` (S28 pattern).

---

## С чем согласен полностью (как с историческим дизайном S28)

### 1. JWT-клиент, без service_role

`createClient(URL, ANON_KEY, { global.headers.Authorization })` — RLS решает SELECT/UPDATE; 404 на «нет/чужое». Live: `index.ts` L112–117, L125–135, L244–255. `grep service_role` в функции = 0. Минимум привилегий — верно и для S-AI-1 как референс.

### 2. Security-контур (4 пункта)

Все четыре реализованы 1:1:

| Пункт | Live evidence |
|-------|----------------|
| Prompt injection | SYSTEM_PROMPT + user-turn только `<data>` (L37–43, L74–81, L184–192) |
| Только tool `submit_summary` + force | L45–72, L212–213 |
| Plain-text render | `AiSummaryPanel` — `{aiSummary.summary}` / list map; без HTML |
| Лимит 8000 | `MAX_INPUT_CHARS = 8000`, обрезка с пометкой (L26, L190–191) |
| Ключ | `Deno.env.get('ANTHROPIC_API_KEY')` only; 500 нейтральный (L104–108) |
| Вход | `{entity_type, entity_id: uuid}` else 400 (L87–99) |

### 3. DDL: только новые колонки, RLS не трогаем

Archive 028 = 4× `ADD COLUMN IF NOT EXISTS`. Совпадает с задачей 1. Существующие UPDATE-политики calls/meetings покрывают запись — корректно (schema + archive header).

### 4. Структурированный вывод tool use, не парсинг текста

`tool_choice: { type: 'tool', name: 'submit_summary' }` + schema `summary / key_points / risks / suggested_next_step` + meta `{model, generated_by, input_chars}` — как в спринте.

### 5. Контракт миграции / секреты / гейт

«CC пишет, не apply»; секрет в Dashboard; deploy edge на гейте; smoke 400/404/injection — процесс совпал с learnings «CC пишет, Cowork применяет» и с закрытым BACKLOG.

### 6. Контекст сделки + activities

Call/meeting fields, company, project+stage join, last 5 activities — live L126–181; совпадает с задачей 2.

---

## Блокеры (критично — исправить до запуска / не запускать)

### B1. Спринт уже выполнен end-to-end

На `main` есть полный delivery S28 + post-S28 AI Hub. Повторный прогон:

- создаст/перезапишет `028_ai_summary.sql` (номер **занят**, файл в `archive/`, колонки в baseline);
- перепишет live edge (риск регрессии vs `ai-run`/config);
- «обновит» docs «028 pending» — **ложный дрейф** против applied history;
- UI-задача «кнопка в CallModal» **конфликтует** с post-S28 архитектурой.

**Не запускать в CC.**

### B2. Ложный baseline «БД на 027»

Спринт: «БД на 027 (все три уровня синхронны)».  
Факт: applied **001–046**; 028–030+ в schema history; next free ≥ **047**. Любая новая миграция с именем `028_…` — процессный blocker.

### B3. РАЗВЕДКА указывает несуществующие пути

```text
grep … src/components/modals/CallModal.tsx   # каталога modals/ нет
```

Факт (architecture.md + `find`):

| Спринт утверждает | Реальность |
|-------------------|------------|
| `src/components/modals/CallModal.tsx` | `src/components/calls/CallModal.tsx` |
| `src/components/modals/MeetingModal.tsx` | `src/components/meetings/MeetingModal.tsx` |
| AI в edit-модалке | AI в `src/components/ai/AiWorkspaceModal.tsx` + `shared/AiSummaryPanel.tsx` |

CC по разведке №2 посадит кнопку не туда / «не найдёт» карточку.

### B4. Задача 4 (UI) регрессирует S-AI-1

Промпт: кнопка в карточке/edit-режиме Call/Meeting.  
Shipped post-refactor: CallModal/MeetingModal — **только данные**; Sparkles открывает **отдельный** AI workspace (summary + transcript runs). Возврат AI в edit-модалки — осознанный откат architecture.md.

### B5. docs/schema.md уже полный applied-блок

Задача 5 («028 pending», новый раздел Edge) **уже сделана** и расширена (ai-run, 030). Переписать «pending» — порча source of truth.

---

## Предупреждения (желательно учесть; не о запуске 028)

### W1. Мелкий gap: meetings `description` не в AI-контексте

`BACKLOG.md` (open): «Meetings: description не попадает в AI-контекст». Live select meeting: `title, date, time, location, notes, next_step, …` — **без** `description`. Спринт в разведке/задаче 2 упоминает `description`/`notes` шире, чем код. Минорный follow-up, не re-run S28.

### W2. schema.md client-path чуть устарел vs architecture

schema § ai-summarize: «UI — AiSummaryPanel (кнопка Sparkles в CallModal/MeetingModal…)».  
architecture.md: панель в `AiWorkspaceModal`, не в edit. Код = architecture. При любом новом AI-спринте править schema client-path, не CallModal.

### W3. Model string / env

Дефолт live: `claude-haiku-4-5` + `AI_SUMMARY_MODEL`. Learnings: сверять model-строки с docs Anthropic на гейте; смена через env. Для re-deploy — ок; для «запуска S28» — N/A.

### W4. `dangerouslySetInnerHTML` в `src/app/layout.tsx`

Греп спринта «0 в новых компонентах» — верно для AI-панели; глобальный FOUC theme-init в layout — не regression S28. Не трактовать как fail, если смотреть весь `src/`.

### W5. activity_log insert errors только логируются

Live L264: `if (logErr) console.error` — саммари всё равно 200. Исторически приемлемо; при hardening — отдельный note, не blocker старого спринта.

### W6. Нет секции «ЖЁСТКО НЕ ТРОГАТЬ»

Для runnable-спринтов сейчас обязателен out-of-scope (не трогать `ai-run`, transcripts, CallModal data-only). Как handoff 2026-07 — ок; как re-run — опасно.

---

## Пропущенные места (если бы CC шёл по промпту «вслепую»)

| Файл / символ | Статус | Действие при «запуске» |
|---------------|--------|-------------------------|
| `supabase/migrations/archive/028_ai_summary.sql` | ✅ exists | **Не** писать active `028_*.sql` |
| `supabase/functions/ai-summarize/index.ts` | ✅ 267 lines | Не overwrite без diff-ревью |
| `src/lib/hooks/use-ai-summary.ts` | ✅ | Уже есть |
| `src/components/shared/AiSummaryPanel.tsx` | ✅ | Уже есть |
| `src/components/ai/AiWorkspaceModal.tsx` | ✅ post-S28 | Промпт **не знает** — критичный miss |
| `src/components/calls/CallModal.tsx` | data-only | Не монтировать AI обратно |
| `src/components/meetings/MeetingModal.tsx` | data-only | То же |
| `src/components/modals/*` | ❌ path | Ложный target разведки |
| `supabase/functions/ai-run/` | ✅ S-AI-1 | Out of scope S28; не ломать |
| `docs/schema.md` § 028 / Edge | ✅ applied | Не «pending» |
| `functions.invoke` pattern | ✅ use-ai-summary + use-ai-run | Разведка #3 находит оба |

---

## Предлагаемые правки в спринт

**Не править для запуска** — файл = historical handoff. Если нужен актуальный артефакт:

1. В шапке: **STATUS: DONE (2026-07-06/07)** — не runnable; pointer на archive 028 + live edge + `AiWorkspaceModal`.
2. Убрать «БД на 027» / «миграция 028» как todo.
3. Заменить UI-таргет: `AiWorkspaceModal` / entry Sparkles в списках, **не** CallModal edit.
4. Исправленные пути разведки: `src/components/calls/`, `meetings/`, `ai/`.
5. Open follow-ups вынести в отдельный мини-спринт (≥047): meetings `description` в context; schema client-path sync; optional model audit.
6. Ссылка на гейт-артефакты: `injection-test-s28.md`, `smoke-s28-negative.sh`, BACKLOG checked items.

---

## Чеклист перед CC

- [ ] **Не запускать** `_analysis/sprint-28-ai-summary.md` как executable prompt на `main`
- [ ] Source of truth: `archive/028_ai_summary.sql`, baseline columns, live `ai-summarize`, `docs/schema.md` § Edge Functions
- [ ] UI truth: `AiSummaryPanel` ⊂ `AiWorkspaceModal`; Call/Meeting modals data-only
- [ ] Security: JWT+RLS, no service_role, no key in `src/`, plain-text render — **уже в коде**
- [ ] Residual work only via **new** sprint (≥047), не re-apply 028
- [ ] При AI-изменениях — не ломать `ai-run` / transcripts / `verify_jwt` config
- [ ] Не коммитить «новый 028»; не apply migration 028 повторно

---

## crm-architect checklist (condensed)

| Пункт | Как runnable сейчас | Как historical design |
|-------|---------------------|------------------------|
| РАЗВЕДКА first | 🟡 команды есть, пути stale | ✅ |
| Real table/column names | ✅ `ai_summary` / `ai_summary_at` | ✅ |
| Real file paths | ❌ `modals/` | 🟡 post-move |
| learnings gotchas | ✅ no flowType; env model; JWT pattern | ✅ |
| SQL as file, not apply from CC | ✅ contract | ✅ applied on gate |
| org_id / RLS | ✅ delegate to policies | ✅ |
| SECURITY DEFINER new fns | N/A (edge only) | N/A |
| No `flowType: 'implicit'` | N/A | N/A |
| DELETE CASCADE | N/A | N/A |
| CSS tokens | ✅ panel uses tokens | ✅ |
| schema.md after migration | ❌ says pending; reality applied | ✅ was updated post-gate |

---

## Итог одной строкой

**S28 уже в проде и в `main`; промпт — качественный исторический handoff (9/10 design), но 2/10 runnable: не запускать в Claude Code, иначе регрессия AI Hub и ложный re-apply 028.**
