# Ревью: handoff-schema-042-045 (docs-only дельты)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `143afeb`, ahead of `origin/main` by 3; crm-architect `schema.md` / `architecture.md` / `learnings.md`; миграции `042`–`045`)  
**Объект:** `_analysis/handoff-schema-042-045.md` — docs-only: дозаполнить `docs/schema.md` дельтами 042–045  
**Контекст:** handoff написан ~09:25; коммит `e576887` (09:45) уже внёс **ровно** эти правки; позже `143afeb` расширил applied до **001–048** (047/048)

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Есть РАЗВЕДКА | ✅ |
| Docs-only scope (код не трогать) | ✅ |
| Содержимое правок vs миграции 042–045 | ✅ |
| Содержимое правок vs текущий `docs/schema.md` | ❌ **уже внесено** |
| Диагноз «в теле только 046» / «applied 001–041» | ❌ **устарело** |
| «Скилл уже актуализирован, источник и снимок сойдутся» | ❌ skill-тело всё ещё без колонок 042–045 |
| SQL/миграции из CC | ✅ не просит apply |
| Коммит-команда (только `docs/schema.md`) | ✅ (уже исполнена) |
| Пригодность «запустить в CC as-is» | ❌ **не запускать** |

**Оценка: 8.5/10** как handoff *на момент написания* (точные диффы, живые миграции, learnings-aware про `OF status`); **2/10** как актуальная задача на дереве `143afeb`.  
**Рекомендация:** **не запускать в Claude Code.** Работа закрыта коммитом `e576887`. Повторный прогон даст no-op / дубли строк / регресс заголовка. Отдельный follow-up (не этот handoff): **тело** `~/.claude/skills/crm-architect/references/schema.md` ещё не догнало `docs/schema.md`.

---

## Статус

| Заход | Статус в handoff | Статус в репо (факт) |
|-------|------------------|----------------------|
| Заголовок applied 001–041 → 001–046 | ⏳ сделать | ✅ `e576887` → 001–046; сейчас **001–048** (`143afeb`) |
| `activity_log.contact_id` / `company_id` (_042_) | ⏳ | ✅ `docs/schema.md:647–648` |
| `projects.won_reason` / `won_detail` (_043_) | ⏳ | ✅ `docs/schema.md:453–454` |
| `notifications.type` + `deal_won` (_045_) | ⏳ | ✅ `docs/schema.md:210–221` |
| `spawn_delivery_project` v3 + `p_owner_id` (_044_) | ⏳ | ✅ `docs/schema.md:991–997` |
| `notify_deal_won` + `trg_notify_deal_won` (_045_) | ⏳ | ✅ `docs/schema.md:1061–1066` |
| Коммит `docs(schema): дельты 042–045…` | ⏳ | ✅ **`e576887`** (message 1:1) |
| Skill `references/schema.md` body 042–045 | «уже актуализирован» | ❌ в **header** есть bullet 042–046; в **таблицах** contact_id/won_reason/deal_won/spawn v3/notify_deal_won **нет** |
| Гейт `grep -c "_04[2-5]" docs/schema.md` ≥ 6 | ⏳ | ✅ **7** |

---

## С чем согласен полностью

### 1. Формат handoff

- Docs-only, «код не трогаем» — корректный scope.  
- Есть **РАЗВЕДКА** (`grep` по `docs/schema.md`).  
- Коммит только `docs/schema.md`, без push — по learnings и crm-architect.  
- SQL из CC не применяет — ✅.

### 2. Содержимое правок = живые миграции

| Дельта | Миграция | Текст handoff |
|--------|----------|---------------|
| 042 | `supabase/migrations/042_activity_log_entity_links.sql` | FK `contact_id`/`company_id` CASCADE + partial idx — **точно** |
| 043 | `043_won_reason.sql` | `won_reason` / `won_detail` text — **точно** |
| 044 | `044_spawn_delivery_owner.sql` | 4-arg, `COALESCE(p_owner_id, deal.owner_id, auth.uid())`, membership-check, SECURITY DEFINER, ACL authenticated — **точно** |
| 045 | `045_notify_deal_won.sql` | CHECK + `deal_won`; plain `AFTER UPDATE` + WHEN (не `OF status`); EXCEPTION-safe; REVOKE — **точно**, совпадает с learnings.md (строки про smoke-баги 045) |

### 3. `e576887` — буквальное исполнение handoff

Diff `e576887` = все 5 пунктов handoff (header 001–046, notifications, projects, activity_log, spawn v3, notify_deal_won). Message коммита = message из handoff.

### 4. Prod ref

`uoiavcabxgdjugzryrmj` в handoff = header `docs/schema.md` / skill schema.

---

## Блокеры (критично — не запускать)

### B1. Работа уже сделана — handoff stale

| Claim handoff | Факт на `143afeb` |
|---------------|-------------------|
| «в теле есть только 046» | 042–045 **в теле** (`activity_log` 647–648, `won_*` 453–454, `deal_won` 210–221, spawn v3 991–997, notify 1061–1066) |
| «applied 001–041» | **001–048** (`docs/schema.md:8`) |
| «вставить строки» | `e576887` уже вставил; повтор = риск **дублей** или failed search-replace |

**Доказательство:**  
`git log -1 --format="%h %ci %s" e576887` → `e576887 2026-07-16 09:45:18 docs(schema): дельты 042–045…`  
Handoff mtime: `2026-07-16 09:25`.

### B2. Task 1 с неверным целевым диапазоном *сейчас*

Handoff: «001–041 → **001–046**».  
Сейчас: **001–048** (+047 MCP drop stage, +048 deps). При наивном «поставить 001–046» — **регресс** документации после `143afeb`.

### B3. Утверждение про skill — ложное (source of truth dрейфует)

Handoff: *«Скилловый `references/schema.md` уже актуализирован… источник и снимок сойдутся»*.

Факт skill body:

- `activity_log` — **без** `contact_id` / `company_id` (только `project_id` / `user_id` / …).  
- `projects` — **без** `won_reason` / `won_detail`.  
- `notifications.type` — CHECK только `task_assigned`/`project_assigned`, **без** `deal_won`.  
- Нет `spawn_delivery_project` v3 / `notify_deal_won` в теле DEFINER-секций.  
- Header skill всё ещё пишет: *«042–046 … ещё НЕ отражены в теле `docs/schema.md`»* — **уже неверно**.  
- Pending skill: «001–041» vs docs: «049 pending, 001–048 in prod».

После `e576887` **источник** (`docs/schema.md`) догнал прод-дельты 042–045; **снимок скилла** — нет (только bullet-блок в шапке). Handoff **не** чинит skill и **не** должен перезапускаться «чтобы сошлись» — нужен **отдельный** sync skill ← docs.

---

## Предупреждения (желательно)

### W1. РАЗВЕДКА-команда на текущем дереве вводит в заблуждение

`grep … | head -30` на живом файле покажет **уже заполненные** секции и `001–048`. Без явного «если уже есть — STOP» CC может «улучшить» повторно.

### W2. Handoff не упоминает 046 в body vs header

На момент handoff 046 уже был (DATES). `e576887` корректно поднял header до 001–046, не дублируя 046 в tasks. Сейчас docs/skill ушли дальше (047–049) — вне scope handoff, но важно для «не трогать header вслепую».

### W3. Мелкая неполнота описания 045 (и в handoff, и в docs)

Миграция: `NEW.type='client' AND owner_id IS NOT NULL` + payload `{title}`. Handoff/docs фокусируются на type/`OF status`/entity — ок для docs-delta, но не полный контракт триггера.

### W4. `044b`

Handoff пишет «044/044b»; в репо один файл `044_spawn_delivery_owner.sql`. Не блокер (содержимое = v3), просто нет отдельного `044b_*.sql`.

### W5. learnings «schema.md + skill одним заходом»

Паттерн нарушен исторически (docs починили, skill body — нет). Handoff закрепляет ошибку фразой «скилл уже ок».

---

## Пропущенные места

Для **этого** handoff gaps в `docs/schema.md` **нет** — цель достигнута.

| Файл | Строки | Действие |
|------|--------|----------|
| `docs/schema.md` | 8, 210–221, 453–454, 647–648, 991–997, 1061–1066 | ✅ уже содержит 042–045 |
| `~/.claude/skills/crm-architect/references/schema.md` | body `activity_log` / `projects` / `notifications` / DEFINER | ❌ перенести строки из docs; убрать «ещё НЕ отражены в теле docs» |
| `_analysis/handoff-schema-042-045.md` | весь | пометить done / не отдавать в CC |

---

## Предлагаемые правки в спринт

1. **Не править handoff под повторный CC** — добавить шапку:

   > **STATUS (2026-07-16):** DONE in `e576887`. Do not re-run.

2. Если нужен follow-up — **новый** docs/skill sync, не 042–045:

   - перенести в **тело** skill schema то же, что в `docs/schema.md` (042–045 + при необходимости 047–048);  
   - выровнять Applied/Pending (001–048, 049 pending);  
   - удалить/переписать блок «дельты ещё НЕ отражены в теле docs».

3. В любых будущих docs-handoff: после РАЗВЕДКИ — **exit criteria**:

   ```bash
   # stop if already present
   grep -q "won_reason" docs/schema.md && echo "STOP: already done"
   ```

---

## Чеклист перед CC

- [x] РАЗВЕДКА есть  
- [x] Правки сверены с `042`–`045` SQL  
- [x] Нет apply_migration из CC  
- [x] Коммит только docs  
- [ ] **Целевой gap в `docs/schema.md` ещё существует** → **НЕТ** (`e576887` + `143afeb`)  
- [ ] Skill body синхронизирован с docs → **НЕТ** (отдельная задача)  
- [ ] Безопасно запускать as-is → **НЕТ**

**Итог:** handoff был качественным и уже **исполнен**. В CC **не слать**. Следующий полезный docs-ход — sync **skill** schema body (и header-notes) с актуальным `docs/schema.md`, а не повтор 042–045.
