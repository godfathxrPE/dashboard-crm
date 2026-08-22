# S-AI-OBS-2 — журнал ai_runs связывается с созданной сущностью

**PR #11 (`a510eda`) · миграция 128 · 2026-08-22 · гейт пройден, живой смок зелёный**
Бриф: `claude/backlog-S-AI-OBS-2.md` (Claude Project). Состояние — `crm-architect/STATUS.md`.

## Проблема

Прогон capture заканчивался на «разобрано»: компания создавалась через ~10 секунд другим
вызовом webhook (кнопка «Создать»), и связи между строками не было. Главный вопрос недели
наблюдения — «сколько разборов дошли до записи» — не отвечался. Тот же класс дефекта, что
пять случаев сессии 21.08: механизм не падает, он молчит.

## Решение — и почему НЕ по брифу

Бриф предлагал писать реальный тип в колонки `entity_type`/`entity_id`. На разведке
выяснилось: capture держат шесть механизмов 127 (CHECK не знает contact/task, парный CHECK
требует пустой entity_id, SELECT-политика перечисляет ветки), а потребители
(`ai-run-sources`, `CompanyAiDigest`) фильтруют `entity_type='company'` — запись типа в
колонки молча изменила бы их поведение: capture-прогоны полезли бы в таймлайны сущностей.

**Связь живёт в `result` jsonb:** `outcome` (created | matched_existing | rejected),
`entity_kind`, `entity_id`. Отсутствие `outcome` — тоже исход: разбор никуда не дошёл
(черновик истёк, дубль проигнорирован, модалку закрыли).

## Механика

- id прогона едет в черновике: `telegram_capture_drafts.ai_run_id` (nullable, без FK —
  журнал побочен, его отказ не отменяет разбор)
- исход проставляют RPC создания **атомарно**: `tg_apply_capture` → created /
  matched_existing (ветка duplicate_inn), `tg_cancel_capture` → rejected
- веб: `parseText` возвращает `{result, runId}`; «Открыть» на дубле → matched_existing;
  модалки получили опциональный `onCreated(id)` → created через RPC `capture_set_outcome`
- `capture_set_outcome` — SECURITY INVOKER + RLS-политика `ai_runs_update_capture`
  (только свои capture-строки, USING = WITH CHECK, перекрасить capture в company нельзя).
  RPC, а не client-update: supabase-js заменяет jsonb целиком и затёр бы source/kind
- мусорный outcome падает громко (22023), не no-op

## Гейт (всё фактами)

- advisors: ноль новых; `capture_set_outcome` не DEFINER (`prosecdef=false`), `tg_*` — только service_role
- смоки под сессиями: свой прогон под JWT Олега — записано; чужая сессия — RLS отсекла,
  outcome не перезаписан; полный цикл прогон→черновик→apply — result целиком, id совпал
  с созданной записью; всё тестовое откатано транзакцией
- негатив: `capture_set_outcome(...,'garbage')` → exception 22023
- lint 0 (первая правка edge-функций после S-CI-2 — мина eslint по Deno-коду не сработала),
  tsc 0 после регена, CI зелёный на PR #11
- живой смок: 10:13 rejected (Отмена), 10:14 created + entity_id → join вытащил
  ООО «ПОТЕНЦИАЛ» / ИНН 1217006507. Утренний прогон 08:31 без outcome — корректно, до 128

## Запрос недели наблюдения

```sql
select result->>'source' as src, result->>'kind' as kind,
       coalesce(result->>'outcome', '(нет — не дошёл)') as outcome, count(*)
from ai_runs where preset_key='capture'
group by 1,2,3 order by 1,4 desc;
```

## Известные границы (сознательно)

- Дубль в боте без нажатий (человек увидел «уже есть» и ушёл) — исхода нет; это честный
  «не дошёл», отличить от «истёк» нельзя и не нужно
- CompanyModal со своим внутренним дедупом по ИНН (переход к дублю из модалки) исход
  не пишет — у модалки нет runId вне capture-сценария; редкий путь, принято
- Утренние прогоны до 128 остаются без outcome — бэкфилл не делался намеренно (2 строки)
