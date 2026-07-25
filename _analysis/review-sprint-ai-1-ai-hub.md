# Ревью: Sprint AI-1 — AI Hub MVP (transcripts + ai_runs + edge `ai-run`)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `6d86d37`, archive `030_ai_hub.sql`, baseline `20260712230000_baseline.sql`, active `040`–`046`, live `supabase/functions/ai-run/`, `docs/schema.md`, crm-architect `schema.md` / `architecture.md` / `learnings.md`, handoff `_analysis/HANDOFF-2026-07-07-ai-hub.md`)  
**Объект:** `_analysis/sprint-ai-1-ai-hub.md` — AI Hub MVP: `transcripts`/`ai_runs`, RLS «по сущности», edge `ai-run` (async + anti-injection), 3 пресета, UI, action items→задачи  
**Контекст:** S28/S29 applied; **S-AI-1 applied 2026-07-07** (коммиты `7b9bfea`, `76b960f`); org-гард INSERT — **040** (2026-07-13); живая цепочка до **046**. Аналогично `review-sprint-28-ai-summary` — handoff-артефакт, не runnable-промпт на `main`.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Актуальность промпта vs репо/прод | ❌ Спринт **уже выполнен** end-to-end (DDL + edge + hooks + UI + docs) |
| Исторический дизайн (vs archive 030 + live) | ✅ Сильный: JWT/RLS, partial unique, CAS-зомби, forced tool, plain-text |
| «max(version)≈027 / миграция 030» | ❌ Устарело: 028–046 applied; 030 в `archive/` + baseline; next free ≥ **047** |
| РАЗВЕДКА на `main` 2026-07-16 | 🟡 Команды полезны исторически; mount-пути **ломают** поиск UI |
| UI «секция AI в CallModal/MeetingModal» | ❌ Было в S-AI-1; **сейчас** — `AiWorkspaceModal` (Sparkles из списков) |
| Edge `ai-run` JWT+RLS, без service_role | ✅ Live `index.ts` (~505 строк); JWT-клиент; `verify_jwt=true` |
| Идемпотентность + STALE CAS | ✅ `ux_ai_runs_active` + `STALE_RUN_MINUTES=10` + conditional UPDATE |
| INSERT org-гард в SQL спринта | 🟡 В 030 **не было** → закрыто **040** (AUDIT 2.3) |
| Model default `claude-sonnet-4-6` | 🟡 В промпте; live + learnings: **`claude-sonnet-5`** (гейт-фикс) |
| Injection-гейт «заметка в `_analysis/`» | 🟡 Есть S28 (`injection-test-s28.md`); **отдельного** injection-артефакта S-AI-1 нет |
| Повторный apply/деплой 030 / overwrite `ai-run` | ❌ **Риск регрессии** (archive+baseline, 040 policy drift, UI mount) |
| Контракт «CC пишет, не apply» | ✅ Процесс верный (исторически соблюдён) |
| crm-architect checklist (как runnable) | ❌ Провалы по актуальности / file inventory / state |

**Оценка: 2/10 как runnable-промпт на `main`.**  
**Как исторический handoff (post-S28/S29, 2026-07-07): 9/10** — дизайн MVP зрелый; SQL ушёл в archive; edge/UI shipped; schema/architecture синхронизированы; post-hoc hardening 040 закрыл дыру INSERT.

**Рекомендация: не запускать.** Source of truth — `archive/030_ai_hub.sql`, baseline tables/policies, live `supabase/functions/ai-run/`, `use-ai-run.ts`, `AiRunPanel` + `AiWorkspaceModal`, `docs/schema.md` § transcripts/ai_runs + Edge `ai-run`. Новый work (S-AI-2 upload/VTT/`/ai`, S-AI-3 entity-пресеты/квоты, dedicated injection-смок ai-run) — отдельный спринт поверх **047+**, не «перепрогон 030».

---

## Статус

| Заход | Статус в репо / проде |
|-------|------------------------|
| S28 028 `ai-summarize` | ✅ applied; live edge + `AiSummaryPanel` |
| S29 029 automation | ✅ applied |
| **S-AI-1 030 transcripts + ai_runs + `ai-run`** | ✅ **applied 2026-07-07** via MCP `apply_migration`; `archive/030_ai_hub.sql`; в baseline |
| Edge `ai-run` deploy + model gate | ✅ `verify_jwt=true`; default sonnet → **`claude-sonnet-5`** |
| Hooks / types / presets | ✅ `use-ai-run.ts`, types в `database.ts`, `ai-presets.ts` |
| UI | ✅ `AiRunPanel` + 4 renderers + `AiWorkspaceModal`; entry: CallLog / MeetingsList / CalendarView / ContactDetailHub |
| CallModal / MeetingModal | ✅ **только данные**; AI **не** внутри (`rg AiRunPanel` → exit 1) |
| 040 org-INSERT hardening | ✅ `transcripts_insert` / `ai_runs_insert` + `org_id = current_org_id()` |
| 041–046 + baseline | ✅ active chain; next migration ≥ **047** |
| Injection S-AI-1 formal artifact | 🟡 smoke на живом звонке (handoff); formal checklist = S28 baseline only |
| 👎 + `feedback_note` UI | ✅ код есть (`AiRunPanel` + `useRunRating`); handoff отмечал «не проверено» как хвост UX |
| **Повторный запуск sprint-ai-1-…md** | ❌ **запрещён** |

Доказательства:

- `docs/schema.md` / crm-architect `schema.md`: «030 … применена **2026-07-07**»; полный блок tables + Edge `ai-run`.
- `ls supabase/functions/` → `ai-summarize`, `ai-run`; `config.toml` `[functions.ai-run] verify_jwt = true`.
- `ls supabase/migrations/archive/` → `030_ai_hub.sql`; active dir: `040`…`046` + baseline (не `030_*.sql`).
- `git log`: `7b9bfea Sprint AI-1: AI Hub MVP…`; `76b960f chore: гейт S-AI-1 закрыт…`.
- architecture.md L57–59, L398–426: AI в `AiWorkspaceModal`, не в edit-модалки.
- learnings.md: model-string gate (`claude-sonnet-4-6 → claude-sonnet-5`).

---

## С чем согласен полностью (как с историческим дизайном S-AI-1)

### 1. РАЗВЕДКА + контракт «CC не apply»

Структура спринта правильная: диагностика S28-эталона, разделение CC (код+миграция) / гейт (apply+secrets+advisors). Live edge клонирует JWT-контур: `createClient(URL, ANON, { global.headers.Authorization })` — `ai-run/index.ts` ~L392–406; `service_role` в функции не используется.

### 2. Схема transcripts / ai_runs + partial unique

DDL спринта ≈ archive 030: entity polymorphic (`call`|`meeting`), `source` paste/file, `transcript_id NOT NULL`, статусы pending/running/done/error, tokens/rating/feedback_note, `ux_ai_runs_active (transcript_id, preset_key) WHERE status IN ('pending','running')`, `trg_set_org_id`, Realtime на `ai_runs`. В baseline: tables L1391+/L1940+, index `ux_ai_runs_active`, triggers, policies.

Отличие archive vs SQL в промпте (улучшение при ship): `created_by … DEFAULT auth.uid()` — упрощает клиентский INSERT.

### 3. RLS «по сущности» через EXISTS

Политики SELECT/INSERT с `EXISTS` к `calls`/`meetings` под их RLS — без дублирования owner/admin-логики. Initplan-обёртки `( SELECT current_org_id() )` / `( SELECT auth.uid() )` — верно. `ai_runs_update`: author ∨ owner/admin — покрывает edge-статусы и rating.

### 4. Async + анти-залипание зомби

Поток `INSERT pending → {run_id} → EdgeRuntime.waitUntil → done/error` + 23505 → age check + CAS `UPDATE … WHERE status IN ('pending','running')` — live L28, L444–500. Без этого partial unique блокировал бы пару навсегда (wall-clock kill isolate). В MVP cron-cleanup осознанно out-of-scope — согласен.

### 5. Security-контур пресетов

- `ANTI_INJECTION` + user-turn в `<data>`;
- forced `tool_choice` per-preset tools (`submit_protocol` / `submit_note` / `submit_spin`);
- maxInputChars 120k + `meta.truncated`;
- plain-text UI (нет `dangerouslySetInnerHTML`);
- промпты **только** в edge; клиент — `AI_PRESETS` metadata + `estimateRunCostRub`;
- `{claim, quote}` для needs/deal_risks — анти-галлюцинация без multi-agent.

### 6. Хуки и killer-фича задачи

`useTranscript` / `useEntityRuns` (Realtime + refetch-страховка) / `useStartRun` / `useRunRating` — как в architecture. Action item → `TaskModal` с `defaultText`/`defaultDeadline` + default*Id; **AI не пишет CRM** — только предлагает (injection + trust). Live: `ProtocolRenderer` «Создать задачу», `AiRunPanel` L279–284.

### 7. Скоуп-границы S-AI-2 / S-AI-3

Upload/VTT/`/ai`/docx/follow-up; prep-to-call/diff/квоты/`org_ai_settings` — корректно отложены. Совпадает с `AI-HUB-CONCEPT.md` §9–10 и handoff.

---

## Блокеры (критично — исправить до запуска / не запускать)

### B1. Спринт уже выполнен end-to-end

На `main` полный delivery S-AI-1 + post-fixes. Повторный прогон CC:

- создаст/перезапишет `supabase/migrations/030_ai_hub.sql` (номер **занят**, файл в `archive/`, объекты в baseline);
- может overwrite live `ai-run/index.ts` (505 строк, sonnet-5, CAS-логика);
- риск дрейфа UI обратно в CallModal/MeetingModal против architecture.

**Не запускать.** Source of truth: archive 030 + live stack + schema § AI Hub.

### B2. Нумерация миграции / state «ожидаем 027»

Промпт: «max(version) ожидаем 027 (028/029 pending)», файл `030_ai_hub.sql`.  
Факт 2026-07-16: applied **001–046**; active migrations `040`…`046` + baseline; pending нет (`schema.md` header). Следующий номер ≥ **047**. Любой «создать 030» на `main` — конфликт с archive/history.

### B3. UI mount в промпте противоречит текущей архитектуре

| Промпт (Задача 5 / разведка #2 / commit list) | Live truth |
|-----------------------------------------------|------------|
| `AiSummaryPanel` + `AiRunPanel` в `CallModal` / `MeetingModal` | **Нет** (`rg` exit 1) |
| — | `AiWorkspaceModal` = Summary + Run; Sparkles в CallLog, MeetingsList, CalendarView, ContactDetailHub |

Разведка `grep AiSummaryPanel CallModal MeetingModal` на `main` **пуста** — CC «по ожиданиям» подумает, что S28 UI отсутствует, и начнёт встраивать заново. architecture.md L57–59, L416–421 — канон.

### B4. Overwrite edge / config без re-review

Live `ai-run` уже содержит gate-фикс модели, STALE CAS, PRESETS. Слепое «скопировать из спринта» откатит `claude-sonnet-5` → `claude-sonnet-4-6` и потеряет post-ship нюансы.

---

## Предупреждения (желательно учесть; не блокируют «не запускать»)

### W1. INSERT policies без `org_id` в SQL спринта / archive 030

В промпте и archive 030: `transcripts_insert` / `ai_runs_insert` — только `created_by` + EXISTS, **без** `org_id = current_org_id()`. AUDIT-B2 **040** закрыл: «автор мог вставить строку с чужим org_id».  
Для истории дизайна: пробел; для runnable rewrite — **обязательно** включать org-гард 040, не копировать 030 as-is.

### W2. Model string в промпте устарел

Спринт: `claude-sonnet-4-6`. Live + learnings + architecture: default **`claude-sonnet-5`** (env `AI_RUN_MODEL_SONNET`). Паттерн env-override верный; hardcoded default в промпте — нет.

### W3. TaskModal: `defaultValues` vs shipped props

Промпт предлагает объект `defaultValues: { text, deadline, project_id, … }`.  
Ship: props `defaultText?` / `defaultDeadline?` / `defaultProjectId` / … (handoff: «у TaskModal не было defaultValues → расширен»). Паттерн learnings «prefill from context» соблюдён, API другой.

### W4. Injection-гейт S-AI-1 не формализован отдельным артефактом

Задача 6 требует заметку в `_analysis/`. Есть:

- `_analysis/injection-test-s28.md` (baseline контура; «методика переносится на S-AI-1»);
- handoff: live smoke «транскрипт → analytic_note с цитатами».

Нет `injection-test-ai-run.md` / e2e-чеклиста 1–5 из Задачи 6 (чужой JWT 404, double-click 23505, forced tool). Для нового AI-work — дописать смок; для «перепрогона» — не re-implement.

### W5. `ALTER PUBLICATION … ADD TABLE` без идемпотентной обёртки

В SQL спринта/archive: голый `ADD TABLE`. Baseline re-seed publication — через `IF NOT EXISTS` loop (L4175+). Повтор apply 030 на БД, где `ai_runs` уже в publication, может упасть — ещё один аргумент «не replay 030».

### W6. Realtime + EXISTS policy

Промпт верно предупреждает: walrus может не тянуть EXISTS → refetch 60s + focus + UI «завис >10 мин». Live hook это реализует. Не баг; помнить при S-AI-2 `/ai` history.

### W7. Разведка «последняя миграция tail -8»

На `main` tail показывает `040`…`046` + baseline/README/archive — **не** «после 027 ждать 030». Ожидание в промпте вводит в заблуждение.

### W8. Handoff-хвост UX feedback

`HANDOFF-2026-07-07-ai-hub.md`: «👎 + feedback_note не проверены в UI». Код 2026-07-16 есть; e2e-проверка остаётся лёгким хвостом, не scope re-sprint.

---

## Пропущенные / ложные места (file inventory)

| Файл / символ | В промпте | Live 2026-07-16 | Действие при «запуске» |
|---------------|-----------|-----------------|------------------------|
| `supabase/migrations/030_ai_hub.sql` | создать active | **archive only** + in baseline | ❌ не создавать active 030 |
| `supabase/functions/ai-run/` | создать | ✅ ~505 LOC | ❌ не overwrite без diff |
| `src/lib/hooks/use-ai-run.ts` | создать | ✅ 141 LOC | уже есть |
| `src/lib/constants/ai-presets.ts` | создать | ✅ 65 LOC | уже есть |
| `src/components/ai/AiRunPanel.tsx` | создать | ✅ | уже есть |
| `src/components/ai/renderers/*` | Protocol / Analytic / Spin | ✅ + `AiResultRenderer` | диспетчер — bonus |
| `src/components/ai/AiWorkspaceModal.tsx` | **не упомянут** | ✅ канон mount | пропущен в inventory спринта |
| `CallModal` / `MeetingModal` AI section | встроить | AI **убран** | ❌ не монтировать обратно |
| `src/types/database.ts` Transcript/AiRun | добавить | ✅ | уже есть |
| `supabase/config.toml` `[functions.ai-run]` | добавить | ✅ | уже есть |
| `040_rls_hardening` org INSERT | отсутствует | ✅ applied | truth для policy rewrite |
| `_analysis/injection-test-s-ai-1*` | гейт-артефакт | ❌ нет (есть S28) | optional follow-up |

---

## Предлагаемые правки в спринт

*Не править файл, пока не нужен архивный rewrite. Если обновлять для истории / AI-index:*

1. **Баннер в шапке:** «✅ APPLIED 2026-07-07 — не запускать в CC. SoT: archive 030, live ai-run, AiWorkspaceModal. См. HANDOFF-2026-07-07-ai-hub.md».
2. **State:** applied chain **046**; next free **047+**; 030 — archive only.
3. **UI truth:** entry Sparkles → `AiWorkspaceModal`; Call/Meeting modals data-only; убрать «встроить в CallModal/MeetingModal».
4. **SQL truth:** `created_by DEFAULT auth.uid()`; INSERT WITH CHECK **+ org_id** (как 040); Realtime add — идемпотентный helper.
5. **Model:** default `claude-sonnet-5` + env override (learnings).
6. **TaskModal:** `defaultText` / `defaultDeadline` / default*Id, не generic `defaultValues` blob.
7. **Разведка:** `ls functions/ai-run`; `rg AiWorkspaceModal`; `ls archive/030*`; `ls migrations/ \| tail` → 046; не ожидать AiSummary в edit-модалки.
8. **Commit file list:** + `AiWorkspaceModal.tsx`; − обязательный AI-edit Call/Meeting (если только data scroll-fix — optional).
9. **Задача 6:** ссылка на `injection-test-s28.md` + «formal ai-run checklist — optional residual / S-AI-2 gate».

---

## Чеклист перед CC

- [ ] **Не запускать** `_analysis/sprint-ai-1-ai-hub.md` как runnable на `main`
- [ ] SoT: `archive/030_ai_hub.sql`, baseline transcripts/ai_runs/policies, live `ai-run`, `docs/schema.md` § 030 + Edge
- [ ] UI truth: `AiWorkspaceModal` ⊂ CallLog / MeetingsList / Calendar / Contact hub; edit modals data-only
- [ ] Policies truth: INSERT org-гард из **040**, не «голый» 030
- [ ] Model truth: `claude-sonnet-5` + `AI_RUN_MODEL_*` env
- [ ] Next AI work → **новый** sprint prompt (S-AI-2/3 или residual smoke), migration **≥ 047**
- [ ] Не overwrite edge/config/hooks без явного diff-ревью против live
- [ ] Optional residual: formal injection/idempotency smoke для `ai-run`; e2e 👎+feedback_note

---

## crm-architect checklist (как runnable на main)

| Пункт | Статус | Комментарий |
|-------|--------|-------------|
| Starts with РАЗВЕДКА | 🟡 | Есть, но ожидания/пути **stale** |
| Real table/column names | ✅ | transcripts/ai_runs 1:1 schema (hist.) |
| Real file paths architecture | ❌ | CallModal mount vs AiWorkspaceModal |
| learnings gotchas | 🟡 | model env — в промпте 4-6, learnings 5; org INSERT — later 040 |
| SQL migrations separate; not applied from CC | ✅ | Контракт верный; 030 уже applied |
| org_id / RLS org first + role | 🟡 | SELECT/UPDATE ok; INSERT org — 040 |
| New functions DEFINER+ACL | ✅ | N/A (edge only; set_org_id reuse) |
| No `flowType: 'implicit'` | ✅ | N/A / not introduced |
| DELETE CASCADE | ✅ | transcript → runs CASCADE |
| CSS variables only | ✅ | UI tokens |
| schema.md after migration | ✅ | Done post-gate (docs + skill) |

---

## Итог одной строкой

**Исторически — отличный S-AI-1 (shipped 2026-07-07); как промпт для Claude Code на `main` 2026-07-16 — не запускать: already done, wrong migration number, wrong UI mount, policy/model truth moved to 040 + sonnet-5.**
