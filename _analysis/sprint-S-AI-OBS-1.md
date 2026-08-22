# Claude Code Prompt — S-AI-OBS-1: `ai_runs` перестаёт быть слепым на capture

**Контекст.** Разбор AI-контура 21.08 сделал вывод «из семи пресетов живёт один, AI
повёрнут наружу» — и вывод **неверен по источнику**. `ai_runs` по устройству не может
записать `ai-capture`, то есть всю AI-работу по собственным данным, встроенную в поток
ввода: резолв исполнителя, сделки, компании по справочникам. За 19–21.08 через capture
прошло минимум 14 разборов (столько черновиков в `telegram_capture_drafts`) плюс
неизвестное число из веб-виджета. В логе — ноль.

Пока лог слеп, любая статистика по AI врёт в одну сторону, и выбор между «улучшить
контекст пресетов» (S-AI-1) и «дать пресету момент, когда его естественно нажать»
делается вслепую. **Наблюдаемость здесь дороже фичи.**

**Разведка живой БД 21.08** — capture блокируют **четыре** механизма, а не два:

| Механизм | Определение | Почему мешает |
|---|---|---|
| `entity_id` | `NOT NULL` | capture работает **до** появления сущности |
| `entity_type` | `NOT NULL` | то же |
| `ai_runs_entity_type_check` | `IN ('call','meeting','project','company')` | `'capture'` не пройдёт |
| `ai_runs_transcript_required` | `transcript_id IS NOT NULL OR preset_key IN (5 пресетов)` | **не упомянут в контекст-документе**; сломается на `'capture'` так же, как первые два |

Плюс уникальный индекс, который определяет **способ записи**:

```
ux_ai_runs_active_entity UNIQUE (entity_type, entity_id, preset_key)
  WHERE transcript_id IS NULL AND status IN ('pending','running')
```

## Ключевое решение — прочитать до кода

**Capture пишется ОДНОЙ вставкой постфактум, сразу со статусом `done` / `error`.**

Не так, как `ai-run` (INSERT `pending` → работа → UPDATE): capture синхронный, к моменту
записи результат уже есть. Одна вставка вместо двух — и, что важнее, **строка не попадает
под `ux_ai_runs_active_entity`**: индекс частичный, `WHERE status IN ('pending','running')`.
Параллельные разборы не будут блокировать друг друга даже теоретически.

Побочно: при `entity_id = NULL` уникальность в Postgres всё равно не сработала бы
(`NULL <> NULL`), но опираться на это не нужно — статус выводит строку из-под индекса
целиком.

**Источник (telegram / web) кладём в `result`, а не в новую колонку.** Колонки `meta`
у `ai_runs` нет (сверено: есть `model`, `prompt_version`, `input_tokens`, `output_tokens`,
`duration_ms`, `rating`, `feedback_note`). Плодить колонку ради одного поля дороже, чем
положить `source` в уже существующий `result`.

## РАЗВЕДКА

```bash
grep -n "entity_type\|entity_id\|ai_runs" supabase/functions/ai-run/index.ts | sed -n '1,20p'
grep -n "return\|Response\|catch\|LLM\|callLlm" supabase/functions/ai-capture/index.ts | head -30
grep -rn "ai-capture" src --include=*.ts --include=*.tsx | head
grep -rn "ai-capture\|GATEWAY\|invoke" supabase/functions/telegram-webhook/capture.ts | head
```

Номер миграции — **запросом к `supabase_migrations.schema_migrations`**, не из папки.
Ориентир: последняя применённая — `20260821211823 org_export` (126) ⇒ **127**. Сверить.

## ЗАДАЧА 1: миграция 127 — снять четыре блокировки

### Context
Аддитивно: existing-строки не трогаются, все существующие прогоны продолжают проходить
те же проверки. Расширяем допустимое, не сужаем.

### Steps
`supabase/migrations/127_ai_runs_capture.sql`:

```sql
-- S-AI-OBS-1: ai_runs перестаёт быть слепым на ai-capture.
--
-- ПОЧЕМУ. Вывод «AI повёрнут наружу, из 7 пресетов живёт 1» был построен на этом логе
-- и оказался неверен по источнику: capture — AI по СОБСТВЕННЫМ данным (резолв
-- исполнителя, сделки, компании по справочникам) — не журналировался вообще.
-- Только за 19–21.08 мимо лога прошло ≥14 разборов. Долг известен с S-QUICK-CAPTURE-1.
--
-- ЧЕТЫРЕ механизма блокировали запись, не два (третий и четвёртый находятся только
-- разведкой БД, в документации их нет):
--   1. entity_id NOT NULL
--   2. entity_type NOT NULL
--   3. ai_runs_entity_type_check      — IN (call, meeting, project, company)
--   4. ai_runs_transcript_required    — transcript_id NOT NULL OR preset_key IN (5 шт)
--
-- Изменение АДДИТИВНОЕ: расширяем допустимое, existing-строки под старые правила
-- по-прежнему проходят.

alter table public.ai_runs alter column entity_id   drop not null;
alter table public.ai_runs alter column entity_type drop not null;

alter table public.ai_runs drop constraint if exists ai_runs_entity_type_check;
alter table public.ai_runs add  constraint ai_runs_entity_type_check
  check (entity_type is null or entity_type = any (array['call','meeting','project','company','capture']));

alter table public.ai_runs drop constraint if exists ai_runs_transcript_required;
alter table public.ai_runs add  constraint ai_runs_transcript_required
  check (
    transcript_id is not null
    or preset_key = any (array['deal_progression','analytic_note','meeting_prep',
                               'deal_summary','company_brief','capture'])
  );

-- Сущностные прогоны обязаны нести обе координаты: расширение сделано ради capture,
-- а не ради возможности потерять привязку у call/meeting/project/company.
alter table public.ai_runs add constraint ai_runs_entity_pair_or_capture
  check (
    (entity_type = 'capture' and entity_id is null)
    or (entity_type is not null and entity_id is not null)
    or (entity_type is null and entity_id is null and transcript_id is not null)
  );

comment on constraint ai_runs_entity_pair_or_capture on public.ai_runs is
  'S-AI-OBS-1. entity_type/entity_id снялись с NOT NULL ради capture (работает до '
  'появления сущности). Этот CHECK не даёт снятию расползтись на сущностные прогоны: '
  'у capture обе координаты пустые, у остальных — обе заполнены.';
```

⚠️ **Миграцию НЕ применять.** Написать и закоммитить — применяет гейт.

⚠️ Проверить перед коммитом, что существующие строки проходят новый
`ai_runs_entity_pair_or_capture`: у всех 34 прогонов `entity_type`/`entity_id` заполнены.
Если найдётся строка с `transcript_id` и пустой парой — она попадёт в третью ветку.

### Verification
```bash
ls supabase/migrations/ | tail -2
```

## ЗАДАЧА 2: `ai-capture` пишет в `ai_runs`

### Context
Одна вставка постфактум. Запись не должна ронять сам разбор: **журналирование —
побочный эффект, отказ лога не отменяет результат для пользователя.**

### Steps
В `supabase/functions/ai-capture/index.ts`:

1. Замерить `started = Date.now()` до вызова LLM.
2. После получения ответа (и в ветке ошибки тоже) — вставка:

```ts
// Журналируем постфактум одной вставкой: capture синхронный, результат уже есть.
// status сразу done/error — строка не попадает под частичный уникальный индекс
// ux_ai_runs_active_entity (он WHERE status IN ('pending','running')).
// Ошибка записи НЕ отменяет разбор: лог — побочный эффект.
try {
  await supabase.from('ai_runs').insert({
    org_id:        orgId,
    preset_key:    'capture',
    entity_type:   'capture',
    entity_id:     null,
    status:        ok ? 'done' : 'error',
    result:        ok ? { source, kind, draft_id: draftId } : null,
    error:         ok ? null : errorText,
    model:         modelSlug,
    input_tokens:  usage?.input_tokens  ?? null,
    output_tokens: usage?.output_tokens ?? null,
    duration_ms:   Date.now() - started,
    created_by:    profileId,
    finished_at:   new Date().toISOString(),
  });
} catch (e) {
  console.error('[ai-capture] журнал ai_runs не записан:', e);
}
```

3. `source` — `'telegram'` или `'web'`, определить по фактическому признаку из разведки
   (как функция уже различает вызовы). **Не угадывать**: если признака нет — писать
   `'unknown'` и отметить в отчёте, а не изобретать новый параметр.
4. `kind` — что разобрали (`contact` / `company` / `task`), из существующей логики.

⚠️ **Не менять поведение разбора.** Единственное новое — вставка в `ai_runs`.

⚠️ Проверить, откуда берётся `org_id` и `profileId` в текущем коде функции: если
`ai-capture` вызывается из `telegram-webhook` через шлюз, `created_by` может быть
не `auth.uid()`. Взять то, что функция уже знает; при отсутствии — `null`.

### Verification
```bash
npx tsc --noEmit
grep -n "ai_runs" supabase/functions/ai-capture/index.ts
```

## ЗАДАЧА 3: пробник — различить причину пяти ошибок 18–19.08

### Context
Пять `error` в `company_brief`: три 18.08 без токенов с отказом за 1–1,9 с (похоже на
401/402 **до** модели), одна `shape|` 19.08, одна `upstream|` на 51 с. Две версии:
**A** — `company_brief` единственный пресет не переехал на OpenRouter и требует
`ANTHROPIC_API_KEY`; **B** — с 18.08 Supabase отдаёт `SUPABASE_SERVICE_ROLE_KEY`
в формате `sb_secret_…`, который не JWT, и шлюз отвечает 401.

Различитель универсальный: POST с заведомо невалидным телом. **400** от тела функции —
шлюз пропустил (версия A). **401** — не пропустил (версия B).

### Steps
Это **разведка, не код**. Выполнить и записать в отчёт:

```bash
# Подставить URL проекта; ключ НЕ из .env — взять из окружения, которое уже настроено,
# либо выполнить из браузерной сессии. Секреты в отчёт не копировать.
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/ai-capture" \
  -H "Content-Type: application/json" -d '{"__probe__":true}'
```

Затем логи edge `ai-capture` и `ai-run` за 18.08 19:27–19:48 — чей именно 401.

⚠️ `.env` не читать. Если для пробника нужен ключ, которого нет в окружении —
не добывать его, а записать в отчёт, что пробник не выполнен и почему.

### Verification
В отчёте: код ответа пробника и вывод — версия A или B, либо «не определено».

## ЗАДАЧА 4: тесты

`tests/unit/ai-runs-capture.test.ts`:

1. Список пресетов в `ai_runs_transcript_required` из файла миграции **содержит**
   `capture` и все пять прежних — регуляркой по файлу, как в `org-export.test.ts`
2. `ai_runs_entity_type_check` содержит `capture` и четыре прежних значения
3. Миграция снимает `not null` с **обеих** колонок (`entity_id`, `entity_type`)
4. В миграции присутствует `ai_runs_entity_pair_or_capture` — защита от расползания

### Verification
```bash
npm run test
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npm run lint && npx tsc --noEmit && npm run test
git status --short
```

## КОММИТ

Ветка `feat/ai-runs-capture` **от свежего main**:

```bash
git checkout main && git pull
git checkout -b feat/ai-runs-capture
git add supabase src tests docs
git commit -m "feat(ai): журналировать ai-capture в ai_runs — лог перестаёт быть слепым (S-AI-OBS-1)"
```

**Не мержить, не пушить, миграцию не применять.**
`docs/schema.md` обновить тем же коммитом (правило 5).

## ОТЧЁТ

Отчёт: номер миграции и подтверждение из ledger; как определяется `source` в `ai-capture`
(фактический признак, не предположение); результат пробника из ЗАДАЧИ 3 и вывод A/B;
подтверждение, что все 34 существующие строки `ai_runs` проходят новый CHECK;
вывод финальной проверки.

---

## На гейте (не задача CC)

1. `apply_migration` → advisors
2. **Редеплой `ai-capture`** — правка в edge-функции, без деплоя журнал не появится
3. Смок: разбор через Telegram-бота и через веб-виджет → в `ai_runs` две строки
   `preset_key='capture'` с разными `result->>'source'`
4. Контрольный запрос: доля capture в общем логе за неделю — с этого момента статистика
   по AI перестаёт врать

## Что НЕ входит

- **S-AI-1** (контекст пресетов из `entity_timeline`) — следующий, но уже на честных
  данных. Возможно, после недели наблюдений он окажется не нужен: если capture закрывает
  сценарий, а `deal_summary` не нажимают даже с полным контекстом — вывод будет «у пресета
  нет момента», и лечить надо триггер, а не контекст
- **Перенос `company_brief` на OpenRouter** — отдельная задача: другой инструмент поиска
  (`openrouter:web_search`), другой формат цитат (`url_citation`), переписывать
  `stripCiteTags`
- **Бэкфилл прошлых capture-разборов** — невозможен: данных о них нет нигде, кроме
  14 черновиков в `telegram_capture_drafts` без токенов и длительности
