# Ревью: S-DOCS-SYNC — дельта схемы 047–050 (docs + skill)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `71c613f`, WT `docs/schema.md` dirty, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-DOCS-SYNC.md` — docs-only синк `docs/schema.md` + skill `references/schema.md` + `learnings.md` под applied 047–050  
**Контекст:** 047 DROP legacy stage (MCP, файла нет) → 048 `task_dependencies` → 049 `created_by` default (`143afeb`) → 050 workflow engine S-WF-2A (`71c613f`); prior polish-ревью `_analysis/review-sprint-S-DEPS-1-polish.md`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope docs-only / без apply SQL | ✅ |
| РАЗВЕДКА есть | ✅ |
| Факты дельт 048/049/050 vs migration files | ✅ |
| 047 no-file / 048–050 in repo | ✅ |
| Таблицы/колонки/RLS/ACL (048, 050) | ✅ |
| Premisa «docs отстали на 4 миграции» vs live WT | ❌ устарела |
| HOW Task 1 (вставка «как есть» в пустой слот) | ❌ риск дублей |
| Полнота Task 1 (хвосты тела schema) | 🟡 |
| Task 2 skill `schema.md` | ✅ ещё нужен |
| Task 3 skill `learnings.md` (6 уроков) | 🟡 4/6 уже есть |
| Гейт / коммит scope | ✅ |
| crm-architect checklist | ✅ (docs-only) |

**Оценка: 7/10.** Содержимое дельт точное и полезное; **исполнительный HOW для Task 1 уже не соответствует live-состоянию** (HEAD + dirty WT частично сделали работу). Наивный прогон CC «вставь блоки 047–050» испортит `docs/schema.md`.  
**Рекомендация:** **только после правок спринта (или с явным delta-режимом)** — добить residual + skill; **не** переигрывать Task 1 с нуля.

---

## Статус

| Артефакт | HEAD (`71c613f`) | Working tree (на момент ревью) | Skill `~/.claude/...` |
|----------|------------------|-------------------------------|------------------------|
| Applied header | 001–**048**, 049 **PENDING** | 001–**050**, 049/050 applied | 001–**048**, 049 **PENDING** |
| Дельта 047 (header + projects.stage DROPped) | ✅ | ✅ | ✅ (header/projects) |
| Блок `task_dependencies` | ✅ (049 pending) | ✅ (049 applied) | ✅ (049 pending) |
| Дельта 049 applied | ❌ PENDING | ✅ | ❌ PENDING |
| Дельта 050 header + automation body | ❌ | ✅ (таблицы/движок) | ❌ |
| `notifications` +`automation` | ❌ | ✅ | ❌ |
| Раздел «С S29» / функции `null_internal_stage` / AFTER-order | v1 + live `on_stage_change` / `null_internal_*` | **ещё stale** | stale |
| «Порядок применения» 040–050 | нет (обрыв ~039) | нет | нет |
| learnings Волна-2 (loop/HMR/confirm/NULL-safe) | — | — | ✅ уже есть |
| learnings 0029-authenticated / role-smoke ROLLBACK | — | — | ❌ нет |
| Файл `047_*.sql` | ❌ нет | ❌ нет | — |
| `048`/`049`/`050` SQL | ✅ в репо | ✅ | — |

---

## Разведка (факт vs спринт)

| Утверждение спринта | Live | Вердикт |
|---------------------|------|---------|
| Docs/skill отстали на 4 миграции (047–050) | **HEAD** `docs/schema.md`: 047/048 уже есть, 049 PENDING, 050 нет. **WT**: почти 047–050. **Skill**: 001–048 + 049 PENDING, 050 нет | ❌ формулировка устарела |
| 047 — applied via MCP, файла нет | `ls supabase/migrations/*047*` → no match; numbered: `046`, `048`, `049`, `050` | ✅ |
| 048/049/050 — файлы в репо | `048_task_dependencies.sql`, `049_task_dep_created_by_default.sql`, `050_workflow_engine.sql` | ✅ |
| Цепочка 001–050 applied в проде | Файлы + коммиты 049/050 есть; MCP `list_migrations` из этой среды **не** гонялся | 🟡 доверяем claim Cowork / не верифицировано здесь |
| 048 DDL: DAG, CHECK FS/SS/FF/SF, RLS select org / insert·delete owner\|admin\|manager, no UPDATE | 048 L1–123: совпадает (B1 NULL-safe org-гард L52–62, errcodes, `trg_zz_check_task_dependency`) | ✅ |
| 049: `created_by SET DEFAULT auth.uid()` | 049 L1–4 exact | ✅ |
| 050: CHECK triggers/actions, `conditions`, `trigger_key`, `wf_eval_conditions`, `run_stage_automations` re-entrancy `wf.ran`, set_field whitelist, notifications +`automation`, ACL revoke authenticated | 050 L9–290: совпадает | ✅ |
| `LEGACY_STAGE_LABELS` в коде | `src/lib/validators/project.ts:11`, consumers `activity-events.ts`, `DashboardHome.tsx` | ✅ |
| `window.confirm` 25+ сайтов | ~25 match-lines / 18 файлов в `src/**/*.{ts,tsx}`; `ConfirmDialog`/`useConfirm` нет | 🟡 «25+» завышено (ближе к 18–25) |
| skill path `~/.claude/skills/crm-architect/references/` | `schema.md`, `learnings.md`, `architecture.md` на месте | ✅ |
| Git gate: только `docs/schema.md` | skill вне репо — верно; **сейчас** `git status`: `M docs/schema.md` (+ посторонние dirty, не из этого спринта) | 🟡 |
| Accuracy: NOT_VERIFIED | честно | ✅ |

---

## С чем согласен полностью

### 1. Docs-only scope — правильный хвост

После `143afeb` (049 + docs 047/048) и `71c613f` (050 SQL) единственный системный долг — документация. SQL в CC **не** apply; tsc/build не нужны. Коммит только `docs/schema.md`, skill правится out-of-tree — соответствует learnings / конвенции.

### 2. Факты дельт 048 / 049 / 050 — сходятся с миграциями

Блоки спринта по `task_dependencies`, `created_by` default, workflow engine (3 trigger / 4 action / conditions / `trigger_key` / `wf.ran` / whitelist set_field / double EXCEPTION) — **не выдуманы**: 1:1 с `supabase/migrations/048_*.sql`, `049_*.sql`, `050_*.sql`.

### 3. 047 no-file + backlog реконструкции

Отсутствие `047_*.sql` при applied-via-MCP — подтверждено. Пометка DROPped на `projects.stage` / `deal_stage` и опора на `LEGACY_STAGE_LABELS` — верный контракт.

### 4. Task 2 (skill schema) — реальная дыра

Skill `references/schema.md` L8: **001–048**, **049 PENDING**; блок 047–049 есть, **050 нет**; automation body всё ещё v1 (L294–333); `task_dependencies` 049 pending (L546/561). Это главный незакрытый consumer crm-architect.

### 5. Гейт `git diff --stat` + commit message

Адекватны docs-only спринту. Сообщение коммита покрывает 047–050.

---

## Блокеры (критично — исправить до запуска)

### B1. Task 1 HOW предполагает пустой слот — live уже частично (WT) / частично (HEAD) закрыт

Спринт: «вставляй дельты 047–050 как есть».

**Факт:**
- **HEAD:** header 001–048, 047/048 дельты, `task_dependencies`, 049 PENDING, automation = S29 v1.
- **WT (dirty `docs/schema.md`, +53/−21):** header **001–050**, 049/050 header-дельты, automation-таблица + движок 050, notifications +`automation`, `task_dependencies` 049 applied.

Наивный CC:
1. продублирует header-дельты 047–050 / automation-блоки;
2. либо «улучшит» уже верные абзацы хаотично;
3. gate `git diff --stat` станет шумным, а accuracy упадёт.

**Фикс в спринт (обязателен):**

```text
РАЗВЕДКА-дополнение:
  git status docs/schema.md
  grep -n "001–05\|049\|050\|trigger_key\|task_dependencies\|pending" docs/schema.md | head -40

Task 1 = IDEMPOTENT residual only:
  - НЕ вставлять заново блоки, если маркер уже есть
  - добить только gaps (см. W1–W3)
  - если WT уже содержит большую часть 050 — review diff, не rewrite
```

### B2. Premisa спринта вводит CC в заблуждение

«`docs/schema.md` … отстали от живой БД на 4 миграции» — **ложно** для HEAD (отставание ~049 status + 050 body) и **ещё ложнее** для WT. Оставить как есть = CC будет «чинить» уже починенное.

**Фикс:** переписать цель:

| Цель | Статус |
|------|--------|
| `docs/schema.md` | residual consistency + 050 body (если не в WT) + хвосты истории |
| skill `schema.md` | full 049 applied + 050 |
| skill `learnings.md` | только отсутствующие уроки |

---

## Предупреждения (желательно исправить)

### W1. Residual gaps в `docs/schema.md` (даже после WT-дельты 050)

Даже при уже обновлённых header/automation-table остаются **противоречивые «живые» упоминания 047-drop'нутого**:

| Место (WT) | Проблема | Действие |
|------------|----------|----------|
| L45–46, L57–59 (PCT-1 / Delivery intro) | `trg_ab_null_internal_stage` / `null_internal_stage` описаны как текущие | пометить DROPped в 047 или past-tense |
| L895–923 «С S29 — автоматизация v1» | тело v1 only; AFTER-order: `on_stage_change` → … | pointer «обобщено в 050» + убрать `on_stage_change` из **текущего** порядка |
| L1129–1131 `public.null_internal_stage()` | функция как live | ~~strikethrough~~ DROPped 047 |
| L1191, L1206 (history 032/035) | ok как history; не путать с current | ок, если current section починен |
| «Порядок применения» обрывается на **039** | нет 040–050 | добавить краткие applied-строки 040…050 (спринт просит Migration history) |
| L114 verified date «2026-07-14» при дельтах 16-го | косметика | обновить дату сверки |

Спринт **не** перечисляет эти хвосты явно — CC их пропустит.

### W2. Task 3 learnings — 4 из 6 уже в файле

| Урок спринта | skill `learnings.md` | Действие |
|--------------|----------------------|----------|
| DOM measure + setState loop | ✅ L291–298 (есть 0463596→4a5eeab; **нет** S-CRIT-PATH) | optional: +«S-CRIT-PATH переиспользовал» |
| HMR / vendor-chunks | ✅ L300–304 (**нет** distDir) | optional: +строка про изолированный `distDir` |
| NULL-safe DEFINER / current_org_id | ✅ L98–116 (PCT-1); S-DEPS-1 B1 как update | optional: +ссылка S-DEPS-1 B1 |
| authenticated=X / 0029-advisor | ❌ **нет** | **добавить** (разница 048 vs 050: 048 revoke public/anon only; 050 revoke +authenticated) |
| window.confirm 25+ | ✅ L306–310 | skip / не дублировать |
| role smoke set_config + ROLLBACK | частичный L182 `set_config jwt`; **нет** цельного «txn + SET LOCAL ROLE + ROLLBACK для WF» | **добавить** блок S-WF-2A |

**HOW:** «добавь если ещё нет» — ок, но дать `grep -n` маркеры, чтобы не плодить дубликаты DOM/HMR/confirm.

### W3. Проверка prod 001–050 — out-of-band

Спринт опирается на Cowork MCP `list_migrations`. Локально подтверждены только файлы + commits. Для docs-sync это приемлемо, но Accuracy остаётся **NOT_VERIFIED**, как и написано. Если 049/050 **не** applied в проде, header «001–050 applied» станет ложью — гейт Cowork перед коммитом docs желателен.

### W4. `window.confirm` «25+»

Факт: ~25 совпадений, **18 файлов**. Урок всё равно верный; число — косметика.

### W5. Параллельный dirty tree

`git status` показывает dirty не только `docs/schema.md` (reviews, `tsconfig.json`, untracked `_analysis/*`). Gate «только docs/schema.md» правильный — **явно** `git add docs/schema.md` (не `git add .`).

### W6. architecture.md не в scope

`architecture.md` skill: Gantt/task hooks без явного `task_dependencies` / workflow 050. Для docs-sync schema — ок; при желании backlog, не блокер.

---

## Пропущенные места (если CC идёт «как написано»)

| Файл | Строки (WT) | Действие |
|------|-------------|----------|
| `docs/schema.md` | ~45–59 | past-tense / DROPped для `null_internal_stage` в PCT-1/Delivery intro |
| `docs/schema.md` | ~895–923 | «С S29» → +050; AFTER-order без `on_stage_change` |
| `docs/schema.md` | ~1129–1131 | функция `null_internal_stage` — DROPped 047 |
| `docs/schema.md` | ~1250 (конец «Порядок применения») | +040…050 applied one-liners |
| skill `schema.md` | L8, L62–63, L106–117, L294–333, L546/561 | 049 applied + 050 full (как Task 1) |
| skill `learnings.md` | конец UI/Волна-2 секции | только 0029-ACL + role-smoke ROLLBACK |

---

## Предлагаемые правки в спринт

1. **Переписать преамбулу:** «частичный sync уже в HEAD/WT; цель — residual + skill, не full rewrite».
2. **Task 1 → checklist residual** (маркеры `grep`), не paste-all блоков 047–050.
3. **Явно добавить хвосты** из W1 (S29 section, functions, Migration history 040–050, past-tense null_internal).
4. **Task 3:** `grep` before insert; skip DOM/HMR/confirm/NULL-safe если есть; must-add: authenticated=X/0029 + role-smoke ROLLBACK.
5. **B1 HOW:** при dirty `docs/schema.md` — сначала `git diff docs/schema.md`, продолжить diff, не reset.
6. (Опц.) Одна строка: «prod applied 001–050 — подтвердить Cowork `list_migrations` перед commit header».

Минимальный residual-checklist для CC:

```bash
# docs/schema.md
grep -n "049, pending\|on_stage_change →\|null_internal_stage()\|С S29 (029\|001–050\|trigger_key\|Порядок применения" docs/schema.md
# skill
grep -n "001–048\|049.*PENDING\|050\|trigger_key\|task_dependencies" ~/.claude/skills/crm-architect/references/schema.md | head
grep -n "authenticated=X\|0029\|Ролевой смок\|Maximum update\|vendor-chunks\|window.confirm" ~/.claude/skills/crm-architect/references/learnings.md
```

---

## Чеклист перед CC

- [ ] **B1/B2:** спринт переписан под residual / idempotent (не full insert 047–050)
- [ ] Зафиксировать baseline: `git diff docs/schema.md` (не терять чужой WIP)
- [ ] Task 1 residual: 049 pending→applied (если ещё), S29→050 pointer, DROP null_internal live refs, Migration history 040–050
- [ ] Task 2: skill schema → applied **001–050**, 049 applied, блок 050 + automation body
- [ ] Task 3: только missing learnings (0029-ACL, role-smoke); не дублировать DOM/HMR/confirm
- [ ] (Желательно) Cowork: `list_migrations` содержит 047–050
- [ ] `git add docs/schema.md` only; skill out of git
- [ ] `git diff --stat` → один файл `docs/schema.md`
- [ ] Не apply SQL; не трогать `src/`, `supabase/migrations/*`
- [ ] Не commit посторонних dirty (`tsconfig.json`, reviews, …)

---

## crm-architect checklist

- [x] РАЗВЕДКА есть (слабая — не ловит partial-done state)
- [x] Имена таблиц/колонок из реальных миграций (не догадки)
- [x] SQL как файлы; CC не apply
- [x] org_id / RLS описаны корректно (048, 050)
- [x] DEFINER + search_path / ACL в дельтах
- [x] schema.md update — **цель** спринта
- [ ] HOW не создаёт дубликаты при повторном прогоне — **провал до правки B1**

---

## Итог одной строкой

Дельты **фактологически верные**, scope docs-only **верный**, skill **действительно отстаёт**; но Task 1 **нельзя** гонять as-is — WT/HEAD уже содержат большую часть `docs/schema.md`, нужны residual + skill-only HOW.
