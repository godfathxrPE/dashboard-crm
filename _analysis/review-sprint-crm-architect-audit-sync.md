# Ревью: sprint-crm-architect-audit-sync (schema.md 039–065)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat-ui` @ `6e134b2`; skill `~/.claude/skills/crm-architect/references/schema.md` mtime **2026-07-19 01:48**; спринт `_analysis/sprint-crm-architect-audit-sync.md`; миграции `048`–`067` в git; `docs/schema.md`; `SKILL.md` Migrations **001–067**; prior `sprint-crm-architect-sync` + `_analysis/review-sprint-crm-architect-sync.md`)  
**Объект:** `_analysis/sprint-crm-architect-audit-sync.md` — docs-only догон skill `schema.md` по «дырам» 039–065  
**Контекст:** follow-up к `sprint-crm-architect-sync` (066/067 + SKILL/architecture/learnings); claim «факты authoritative из живой БД … миграции по 067»; кода/БД **не** трогать

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope (только skill schema, без src/supabase/apply) | ✅ |
| РАЗВЕДКА есть | ✅ (но 🟡 баг `\|` в `-E`) |
| Факты paste-блоков vs SQL 048–065 | ✅ в целом |
| Premisa «дыры 039–065, закрыть одним заходом» | ❌ **устарела** — body skill уже закрыт |
| Идемпотентность «grep → не дублируй» | ✅ правильное правило |
| Риск регрессии (тонкий paste поверх богатого body) | 🟡 при наивной замене |
| Task 4 хронология vs live skill | 🟡 skill уже **полнее** спринта |
| Residual: banner Applied/Pending | ❌ спринт **не чинит** шапку |
| «Applied по 067» из workspace | 🟡 claim/гейты; MCP list_migrations здесь не гонялся |
| crm-architect checklist (docs-only) | ✅ |

**Оценка: 6.5/10.** Paste-блоки и миграционные факты в момент написания были сильными; **на live skill-файле работа Tasks 1–4 по body уже сделана**. Остаётся реальный долг — **шапка Applied/Pending = 001–050/051**, которого спринт явно не трогает.

**Рекомендация:** **не запускать as-is.** Либо **skip** (body done), либо короткий residual-промпт: обновить только `Applied`/`Pending` в header skill `schema.md` до **001–067** (и согласовать с `SKILL.md`, где Migrations уже **001–067**). Наивный «вставь все блоки» может урезать уже детальные секции.

---

## Статус (что в skill сейчас vs что пишет спринт)

| Утверждение / задача | Live skill `schema.md` | Вердикт |
|----------------------|------------------------|---------|
| Нет `### quotes` | L628–632 `### quotes _(053…)_` ≈ paste спринта | ✅ уже есть |
| Нет / тонкий `task_dependencies` | L595–626 **богаче** спринта (таблица, errcodes, 062 UPDATE, client notes) | ✅; paste тоньше — не заменять |
| Нет `delivery_templates` | L634–639 ≈ paste | ✅ |
| `project_files` += `comment` (064) | L749–760 колонка + пометка 064 | ✅ |
| `project_members` 8 ролей (063) | L1108–1115 `pm…launch_lead` | ✅ |
| automation 050/051 | L315–370 полный body + `conditions`/`task_overdue` | ✅ (глубже Task 2) |
| profiles `job_title`/`onboarded_at`/`phone` | L167–177 | ✅ |
| tasks milestone/WBS/dates/lane=`next` | L543–565 | ✅ |
| `is_project_member` + SELECT-member (065) | L1053, L1156–1168 | ✅ |
| storage `project-files` (055) | L1170–1176 | ✅ |
| «RLS-раздел обрывается на 038» | После Delivery-P3 уже есть 065 + storage + хронология 039–067 (L1156–1184) | ❌ claim ложен |
| Хронология 039–067 | L1178–1184 **+041/046/детали**, 060→068 | ✅ уже есть и полнее Task 4 |
| RLS-helpers accept/complete/protect/check/is_project_member | L1042–1053 | ✅ |
| Banner **Applied 001–067** | header: **001–050**; Pending **001–051** | ❌ residual |
| `SKILL.md` Migrations 001–067 | ✅ уже 001–067 | skill schema header отстаёт от SKILL |
| 066/067 «прошлый синк» | L641–654 `project_videos` / `project_messages` | ✅; на `feat/chat-ui` есть оба migration-файла |

---

## Разведка (команды спринта vs live)

Спринт РАЗВЕДКА (как написано) vs skill:

| Паттерн | Count | Комментарий |
|---------|------:|-------------|
| `### quotes` | 1 | якорь есть |
| `### task_dependencies` | 1 | якорь есть |
| `### delivery_templates` | 1 | якорь есть |
| `is_project_member` | 8 | helper + политики + 066/067 |
| `projects_select_member` | 2 | блок 065 |
| `check_delivery_completion` / `accept_invitation` / `complete_onboarding` | 3 / 2 / 3 | helpers на месте |
| `project_files.*comment\|comment` | **0** | 🟡 **ложный ноль**: в `-E` `\|` = литерал `\|`, не OR |
| `storage.objects\|project-files` | **0** | 🟡 тот же баг; при `project-files` → **3** |
| `conditions\|trigger_type` | **0** | 🟡 тот же; `trigger_type` и `conditions` есть в body 050 |
| `role = ANY` | 0 | в prose нет SQL `= ANY`; есть `launch_lead` / «8 ролей» |

ВЕРИФИКАЦИЯ (исправленные ключи) на live: `quotes` 4, `task_dependencies` 6, `delivery_templates` 3, `is_project_member` 8, `projects_select_member` 2, `project-files` 3, `launch_lead` 1, `comment` 3; `grep -cE "06[0-7]|05[0-9]|04[0-9]"` → **86**.

Миграции в репо (сверка цепочки):

| # | Файл | Статус |
|---|------|--------|
| 039 | `archive/039_reorder_tasks.sql` | ✅ в archive |
| 040–046, 048–059, 061–067 | `supabase/migrations/*.sql` | ✅ (в т.ч. 066 на `feat/chat-ui`) |
| 047 | — | ✅ no-file (MCP), как в docs/skill |
| 044b | отдельного файла нет | 🟡 содержимое в `044_spawn_delivery_owner.sql` |
| 060 | reserved/skip | ✅ |

---

## С чем согласен полностью

### 1. Scope «только документация скилла, кода/БД НЕ трогать»
Правильный audit-sync. Нет apply, нет tsc-гейта app. Каталог скилла вне git — «коммит не нужен» ✅.

### 2. Правило вставки «сначала grep, не дублируй»
Единственное, что делает повторный прогон относительно безопасным. Без него CC задвоит секции.

### 3. Факты paste vs SQL (когда body ещё был пуст — верно)

| Блок | Доказательство |
|------|----------------|
| `quotes` 053 | `053_quotes.sql`: enum, amount копейки, partial-uniq accepted, `trg_zz_stamp_quote_status`, RLS owner/admin/manager; UI `canEditQuotes` в `QuotesTab.tsx` |
| `task_dependencies` 048/049/062 | 048 validator errcodes 23514/23503/42501/P0001; 049 default `created_by`; 062 `task_dep_update` |
| 8 ролей 063 | `CHECK (role = ANY (ARRAY['pm',…,'launch_lead']))` |
| `comment` 064 | `ALTER … ADD COLUMN comment text` |
| team-visibility 065 | `is_project_member` DEFINER + 3 SELECT policies; storage **не** трогает (VISIBILITY-2) |
| storage 055 | own-path `(foldername)[1] = auth.uid()` SELECT/INSERT/DELETE |
| accept 058 / onboarding 061 | сигнатуры совпадают; email-guard в 061 поверх 058 |
| automation 050/051 | `conditions`, расширенные CHECK, `task_id` в runs |

### 4. «066/067 уже внесены прошлым синком»
Согласуется с prior review + live: `project_videos` L641, `project_messages` L648, `SKILL.md` Migrations 001–067.

### 5. Docs-only + no-apply миграций
Соответствует crm-architect: SQL как файлы в репо; CC не apply. Learnings: schema обновлять тем же заходом, что миграция — этот спринт как раз чинит дрейф docs.

---

## Блокеры (критично — до запуска)

### B1. Premisa спринта ложна: body skill **уже закрыт**

Спринт: «не задокументированы 039–065», «закрыть одним заходом», «RLS-раздел обрывается на 038».

Факт: все Task 1–4 body-якоря на месте (quotes, deps, templates, comment, 8 ролей, automation, profiles, tasks, 065, storage, хронология, helpers). После Delivery-P3 уже есть `### С S-TEAM-VISIBILITY-1 (065)`, storage 055 и `### Хронология applied-миграций 039–067`. Это post-sync state, не «дырявый» schema.

**Запуск as-is** = в лучшем случае no-op по правилу grep; в худшем — «дополнить»/переписать и **урезать** L595–626 (`task_dependencies`) или L315–370 (automation) до коротких paste.

**Фикс:** переписать шапку: «Body 039–065 **уже в skill**; residual only» **или** отменить спринт.

### B2. Единственный реальный residual не в задачах: header Applied/Pending

Live skill:

- `> **Applied …** миграции **001–050** … **051** …` (L8)
- `> **Pending:** … цепочка **001–051** в проде` (L62)

При этом body + хронология + `SKILL.md` говорят про **001–067**.  
`docs/schema.md` header уже **001–061** (лучше skill, но тоже не 067).  
Спринт Task 4 добавляет блок хронологии (уже есть), **не** инструктирует поправить banner. После «успешного» CC шапка останется врать.

**Фикс (1–2 строки в спринт / residual handoff):**  
«В header skill `schema.md`: Applied **001–067** (pointer на хронологию L1178+); Pending: нет непринятых DDL, открытый хвост S28 credits; 060 skip → next **068**. Не трогать body-секции.»

---

## Предупреждения (желательно)

### W1. РАЗВЕДКА: `\|` под `grep -E` даёт ложные нули

В ERE `|` = OR, `\|` = литерал. Паттерны  
`project_files.*comment\|comment`, `storage.objects\|project-files`, `conditions\|trigger_type`  
на **заполненном** schema показывают `[0]` и толкают CC «добавить уже существующее».

**Фикс:** `a|b` без backslash или два отдельных `grep`.

### W2. Paste Task 4 **тоньше** уже лежащей хронологии

Спринт опускает **041** phones, **046** gantt-dates, детали 051 cron / 054 freeze / 057 non-idempotent / 061 avatars+session_gate. Live skill L1180–1184 это уже содержит. «Вставить Task 4» = регресс, если replace.

### W3. `accepted → projects.budget = amount`

В **053 SQL нет** триггера budget (только `stamp_quote_status` для `sent_at`/`accepted_at`). Это **UI**: `QuotesTab.tsx` `updateProject.mutate({ budget: accepted.amount })` + комментарий в `quote.ts`. Формулировка в paste/docs звучит как DB-enforcement — 🟡 overclaim. Для skill лучше: «accept→budget — клиент (`QuotesTab`), не триггер».

### W4. `protect_last_owner` ≠ «введена в 059»

059 ужесточает RLS memberships; `protect_last_owner` — с **026** (`archive/026_…`, baseline); 059 оставляет как backstop. Live skill L1051 корректен (`026, +059`); paste Task 4 «(059)» упрощает.

### W5. `044b` / `047` / applied-067

- `044b` — нет отдельного файла (как в review handoff-042-045).  
- `047` — MCP, файла нет — ок.  
- «Миграции applied по 067» — из этой среды **не** верифицировано MCP; для skill-docs ок, если опираемся на гейты/`SKILL.md`, но git-ветку не выдавать за SoT прода.

### W6. `delivery_templates`: internal RPC = `copy_delivery_template`

Спринт пишет `apply_delivery_template` / `spawn_delivery_project`. Верно для клиента; internal copy — `copy_delivery_template` (REVOKE). Live skill Delivery-P2a/P2b это раскрывает; короткий paste ок как summary.

### W7. mtime sprint vs skill

Skill `schema.md` mtime **01:48**; спринт/review на диске **10:50**. Premisa спринта описывает pre-sync state; body skill новее содержания premisa. Не запускать «закрыть дыры», не перечитав live grep.

---

## Пропущенные места

| Место | Строки (skill) | Действие |
|-------|----------------|----------|
| Header Applied | ~L8 | **Обновить 001–067** (residual) |
| Header Pending | ~L62 | **Обновить** (не 001–051) |
| Body Tasks 1–4 | L167+, L315+, L543+, L595+, L628+, L749+, L1042+, L1108+, L1156–1184 | **Не трогать** — уже синкнуто |
| `docs/schema.md` | header 001–061 | Вне scope спринта; skill banner всё ещё хуже docs |
| architecture / learnings | — | Вне scope; SKILL.md уже 001–067 |

---

## Предлагаемые правки в спринт

1. **Статус-баннер вверху:** «На 2026-07-19 body skill schema **уже содержит** 039–067 блоки; этот промпт → **только residual header** (или CANCEL).»  
2. **Убрать / пометить done** Tasks 1–3 и body Task 4.  
3. **Новая единственная задача:** header Applied/Pending → 001–067 + next 068; сверить с `SKILL.md` Migrations.  
4. **Починить РАЗВЕДКА-grep** (`|` без `\`).  
5. Опционально: уточнить quotes budget = UI; protect_last_owner = 026+059.  
6. Явно: **не replace** секции `task_dependencies` / `automation_rules` короткими paste.

---

## Чеклист перед CC

- [ ] Признать: body 039–065 **done** (не «дыры»)
- [ ] Либо skip, либо residual-only (header Applied/Pending)
- [ ] Не paste-replace `task_dependencies` / automation body
- [ ] Починить grep `|` в разведке, если оставляете диагностику
- [ ] После residual: `SKILL.md` Migrations и header skill `schema.md` оба = **001–067**
- [ ] Кода/БД/apply не трогать (как в спринте)
- [ ] Коммит скилла не нужен (каталог вне git)

---

## crm-architect checklist (docs-only)

- [x] РАЗВЕДКА перед правками  
- [x] Реальные table/column/RPC из schema + migrations (paste)  
- [x] Пути: только `~/.claude/skills/crm-architect/references/schema.md`  
- [x] learnings (schema sync same pass) учтён scope’ом  
- [x] SQL не apply из CC  
- [x] org_id / RLS / DEFINER в paste согласованы с 048–065  
- [x] schema.md — целевой артефакт  
- [ ] **Header skill не синхронизирован с 001–067** — residual вне Tasks  

**Итог:** спринт был бы **9/10** как handoff *до* body-синка; *сейчас* — **не запускать**. Реальная работа: 5–10 строк header skill `schema.md`, не четыре задачи paste.
