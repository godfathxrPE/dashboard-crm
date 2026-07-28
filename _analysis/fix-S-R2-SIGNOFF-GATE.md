# fix-S-R2-SIGNOFF-GATE — правки гейта, реген типов, amend коммита

**Ветка:** `feat/r2-signoff` (уже на ней). Новых миграций **нет**.
Итог — **один** коммит `3b732e1`, дополненный через `--amend`.

## Контекст

083 и 084 **уже применены в прод** на гейте Cowork (2026-07-28). Ledger:
применены 001–084, следующая свободная — 085.

На гейте в `supabase/migrations/084_signoff_checklists_engine.sql` внесены **две правки**.
Они уже лежат в рабочем дереве и уже в проде — надо их только закоммитить. **Не переписывать
и не «улучшать» их**: применённое тело функции обязано совпадать с файлом.

1. `toggle_checklist_item` — `select … into v_row … for update`.
   Причина: `items` правится read-modify-write по jsonb. Без блокировки две одновременные
   отметки разных пунктов дают last-write-wins, одна молча теряется — ровно в сценарии, ради
   которого фича делается (команда проходит sign-off вместе перед сдачей).
2. `instantiate_project_checklists` — `select distinct on (t.checklist_type)` +
   `order by t.checklist_type, (t.direction is not null) desc, (t.delivery_kind is not null) desc, t.created_at desc`.
   Причина: `uq_checklist_templates_slot` различает шаблоны по `(direction, delivery_kind)`,
   поэтому общий (`direction=null`) и адресный (`direction='erp'`) шаблоны одного
   `checklist_type` сосуществуют легально. Оба матчатся ERP-внедрению, обе строки летят в
   один `unique (project_id, checklist_type)`, и `on conflict do nothing` оставлял бы
   произвольную — адресный шаблон мог молча проиграть общему.

## Задачи

### 1. Проверить, что правки на месте

```bash
git status --short
grep -n "for update" supabase/migrations/084_signoff_checklists_engine.sql
grep -n "distinct on (t.checklist_type)" supabase/migrations/084_signoff_checklists_engine.sql
```

Обе строки должны найтись. Если нет — **стоп и доложить**, файл потерялся.

### 2. Реген типов — только CLI

```bash
npx supabase gen types typescript --project-id uoiavcabxgdjugzryrmj > src/types/supabase.gen.ts
```

MCP-реген **не использовать**: он не отдаёт блок `graphql_public`, который отдаёт CLI, и в
диф приедут ~28 ложных удалений.

После регена в дифе должны появиться `checklist_templates`, `project_checklists`,
`toggle_checklist_item`, обновлённая сигнатура `check_delivery_completion`.
`instantiate_project_checklists` в типах **не появится** — у неё снят `EXECUTE` у
`authenticated`, PostgREST её не видит. Это ожидаемо, не искать причину.

Проверить диф глазами: удалений быть не должно вообще.

```bash
git --no-pager diff --stat src/types/supabase.gen.ts
```

### 3. Снять стабы типов

По `_analysis/fix-S-R2-SIGNOFF-TYPES.md` — заменить ручные интерфейсы на
`Database['public']['Tables'][...]` / `Functions[...]`. `src/types/database.ts` при этом
править **можно** (это ручной файл проекта), `supabase.gen.ts` — нет.

### 4. Проверка

```bash
npx tsc --noEmit     # 0 ошибок
npm test             # зелёные
npm run lint
npm run build        # ПОСЛЕДНИМ и только при остановленном next dev
```

### 5. Amend

```bash
git --no-pager diff --stat
git add -A
git commit --amend --no-edit
```

Ветка не смержена и не запушена, история переписывается безопасно. Конвенция спринта —
один коммит, поэтому именно `--amend`, а не второй коммит сверху.

`CLAUDE.md` в этот коммит **не тянуть** — Олег меняет его отдельно (`chore(docs)`), там
бампается ledger до «применены 001–084, следующая свободная 085».

## Границы

- Миграции 083/084 **не редактировать** (кроме проверки, что правки на месте) — они применены,
  файл обязан совпадать с прод-состоянием.
- Прод-БД не трогать: apply уже сделан на гейте.
- Мерж и пуш — за Олегом.
- `.env` не читать.

## Отчёт

Что сделано: реген (сколько строк добавлено/удалено), какие стабы сняты, результаты
`tsc`/`test`/`lint`/`build`, финальный `git log --oneline -1` и `git --no-pager diff --stat HEAD~1`.
Отчётом, не планом.
