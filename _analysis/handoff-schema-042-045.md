# Claude Code — docs/schema.md: дозаполнить дельты 042–045 (docs-only)

**Зачем:** репо `docs/schema.md` пропустил 042–045 (в теле есть только 046 от DATES-спринта). Скилл-снимок берётся ИЗ него → следующий пере-снимок потеряет дельты. Латаем у источника.
**Всё ниже сверено по живой БД (prod `uoiavcabxgdjugzryrmj`, 2026-07-15) — applied, не гипотеза.** Правка диф-стилем: вставить строки в соответствующие секции, стиль таблиц сохранить. Код не трогаем.

## РАЗВЕДКА
```bash
cd ~/Downloads/dashboard-crm
grep -n "activity_log\|## .*projects\|## .*notifications\|won_reason\|spawn_delivery_project\|notify_deal_won\|001–04\|applied" docs/schema.md | head -30
```
Найти секции: `activity_log`, `projects`, `notifications`, список функций/триггеров, и строку-заголовок диапазона applied-миграций.

## ПРАВКИ (verified live)

### 1. Заголовок диапазона
Строку вида «applied 001–041» (или последний упомянутый номер) → **001–046**.

### 2. `activity_log` (042 — entity-links)
Добавить 2 строки в таблицу колонок:
```
| contact_id | uuid | _042_ → contacts ON DELETE CASCADE. Entity-link (лента активности контакта). Partial idx `idx_activity_log_contact` WHERE NOT NULL |
| company_id | uuid | _042_ → companies ON DELETE CASCADE. Partial idx `idx_activity_log_company` WHERE NOT NULL |
```

### 3. `projects` (043 — причина выигрыша)
Добавить 2 строки (рядом с loss_reason/loss_detail — симметрия):
```
| won_reason | text | _043_ причина выигрыша сделки |
| won_detail | text | _043_ комментарий к причине выигрыша |
```

### 4. `notifications` (045 — новый тип)
В описании колонки `type` CHECK: было `task_assigned`/`project_assigned` → добавить **`deal_won`**. Актуальный CHECK на проде:
`CHECK (type = ANY (ARRAY['task_assigned','project_assigned','deal_won']))`.

### 5. Функции / триггеры
Дописать/обновить:
- **`spawn_delivery_project(p_deal_id uuid, p_kind text, p_template_id uuid, p_owner_id uuid)`** _(044/044b)_ — 4-арг; `p_owner_id DEFAULT NULL`, `COALESCE(p_owner_id, deal.owner_id, auth.uid())`; назначаемый owner валидируется по `memberships` (та же org). SECURITY DEFINER; ACL: EXECUTE только `authenticated` (anon revoked). Идемпотентно (CREATE OR REPLACE).
- **`notify_deal_won()` + триггер `trg_notify_deal_won` AFTER UPDATE ON projects** _(045)_ — при переходе в won вставляет `notifications` type=`deal_won`, recipient=`owner_id`, actor=`auth.uid()`, entity=projects/NEW.id. SECURITY DEFINER, EXCEPTION-safe. **Plain `AFTER UPDATE` + WHEN (НЕ `OF status`)** — `status` дерайвится BEFORE-триггером `trg_sync_deal_stage_fields`, `UPDATE OF status` бы не сработал. REVOKE anon/PUBLIC.

## КОММИТ
```bash
git add docs/schema.md
git commit -m "docs(schema): дельты 042–045 (activity_log links, won_reason, spawn owner, notify_deal_won)"
```
Только `docs/schema.md`. Не пушить (уедет с общим пушем). Скилловый `references/schema.md` уже актуализирован ранее — теперь источник и снимок сойдутся.

## Заметка гейта (Cowork)
Дельты verified по проду (columns/CHECK/args/trigger присутствуют). После — `grep -c "_04[2-5]" docs/schema.md` должен показать ≥6 попаданий. Гейтить по `git show --stat` (только docs/schema.md).
