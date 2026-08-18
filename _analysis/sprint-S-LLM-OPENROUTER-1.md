# S-LLM-OPENROUTER-1 — переезд LLM с Anthropic на OpenRouter

Дата: 2026-08-18 · Статус: код готов, не задеплоен · Риск: средний (меняется модель, не только транспорт)

## WHY

Цель — уйти с прямого Anthropic API на OpenRouter и сменить модели на дешёвые
(DeepSeek / Qwen). Ключа для этого недостаточно: `https://api.anthropic.com/v1/messages`
был захардкожен в четырёх edge-функциях, а у OpenRouter другой протокол
(OpenAI-совместимый `/api/v1/chat/completions`): другая авторизация, другой формат
инструментов, аргументы приходят JSON-строкой, `usage` в других полях.

Решение — один адаптер вместо четырёх копий fetch. Провайдер переключается секретом,
без правки кода и без редеплоя, старый путь сохранён целиком.

## WHAT — что изменилось

| Файл | Изменение |
|------|-----------|
| `supabase/functions/_shared/llm.ts` | **Новый.** `callLlmTool` (структурированный вывод через форс инструмента) и `callLlmText` (обычный текст). Внутри — обе реализации: anthropic и openrouter |
| `ai-run/index.ts` | `callClaude` → адаптер, параметр `apiKey` убран. `callClaudeWithSearch` **НЕ тронут** |
| `ai-summarize/index.ts` | fetch → `callLlmTool`; в `meta.model` пишется фактический слаг |
| `ai-capture/index.ts` | fetch → `callLlmTool` |
| `transcribe/index.ts` | cleanup-вызов → `callLlmText`. ASR остался на Groq Whisper |
| `supabase/config.toml` | Блок с описанием всех секретов провайдера |

Контракт ответов функций не изменился ни в одной: те же коды (400/401/404/429/500/502),
те же тела, тот же формат `ai_summary` и `ai_runs.result`. Клиентский код не трогали.

## Что НЕ переехало и почему

`ai-run`, пресеты с `webSearch: true` (сейчас — `company_brief`) остаются на прямом
Anthropic и требуют `ANTHROPIC_API_KEY` независимо от `LLM_PROVIDER`.

Причина: там используется **серверный** web search Anthropic со своим протоколом —
`server_tool_use.web_search_requests`, продолжение диалога по `stop_reason: 'pause_turn'`,
теги `<cite>`, которые снимает `shape.ts`. У OpenRouter это другой инструмент
(`openrouter:web_search`) с другим форматом цитат (`url_citation`-аннотации).
Перенос — отдельная задача с переписыванием `stripCiteTags`, а не «заодно».

Это защищено в коде: `ai-run` отбивает 500 до INSERT прогона, если пресет с поиском,
а ключа Anthropic нет.

## HOW — секреты

```bash
# ключ OpenRouter
npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...

# слаги моделей (для OpenRouter ОБЯЗАТЕЛЬНО с вендором)
npx supabase secrets set \
  AI_RUN_MODEL_SONNET=deepseek/deepseek-v4-flash \
  AI_RUN_MODEL_HAIKU=deepseek/deepseek-v4-flash \
  AI_SUMMARY_MODEL=deepseek/deepseek-v4-flash \
  AI_CAPTURE_MODEL=deepseek/deepseek-v4-flash \
  TRANSCRIBE_CLEANUP_MODEL=deepseek/deepseek-v4-flash

# переключение — по одной функции, а не всё сразу
npx supabase secrets set AI_CAPTURE_PROVIDER=openrouter
# ... убедились, что работает → следующая:
npx supabase secrets set AI_SUMMARY_PROVIDER=openrouter
npx supabase secrets set TRANSCRIBE_PROVIDER=openrouter
npx supabase secrets set AI_RUN_PROVIDER=openrouter

# когда все четыре обкатаны — можно глобально:
# npx supabase secrets set LLM_PROVIDER=openrouter
```

Необязательные: `OPENROUTER_APP_URL`, `OPENROUTER_APP_TITLE` (подпись трафика в консоли
OpenRouter), `OPENROUTER_DATA_COLLECTION` (дефолт `deny`), `OPENROUTER_PROVIDER_ORDER`.

Дефолт `LLM_PROVIDER` — `anthropic`. Функция, задеплоенная без новых секретов, работает
ровно как до переезда.

## Деплой

```bash
npx supabase functions deploy ai-capture
npx supabase functions deploy ai-summarize
npx supabase functions deploy transcribe
npx supabase functions deploy ai-run
```

## Смоуки

### 0. ДО деплоя — проверить, что модель вообще умеет форсированный tool call

Это главный риск переезда на DeepSeek/Qwen: если провайдер игнорирует `tool_choice`,
все три структурированные функции начнут отдавать 502.

```bash
curl -sS https://openrouter.ai/api/v1/chat/completions \
  -H "authorization: Bearer $OPENROUTER_API_KEY" \
  -H "content-type: application/json" \
  -d '{
    "model": "deepseek/deepseek-v4-flash",
    "max_tokens": 512,
    "provider": { "require_parameters": true, "data_collection": "deny" },
    "messages": [
      {"role":"system","content":"Ты разбираешь текст в поля CRM. Отвечай только вызовом инструмента."},
      {"role":"user","content":"Иванов Иван, коммерческий директор ООО \"Ромашка\", +7 999 111-22-33"}
    ],
    "tools": [{"type":"function","function":{"name":"submit_capture","description":"Вернуть разбор","parameters":{"type":"object","properties":{"intent":{"type":"string"},"first_name":{"type":"string"},"last_name":{"type":"string"},"position":{"type":"string"},"phone":{"type":"string"}},"required":["intent"]}}}],
    "tool_choice": {"type":"function","function":{"name":"submit_capture"}}
  }' | jq '.choices[0].message.tool_calls, .choices[0].finish_reason, .usage'
```

Ожидаем непустой `tool_calls[0].function.arguments` с валидным JSON.
Если пусто или JSON битый — модель не годится, смотрим Qwen3.6 Plus или Gemini Flash.
Тот же curl прогнать для `qwen/qwen3.6-plus`, чтобы было с чем сравнивать.

### 1. ai-capture (самый дешёвый путь проверки)
Виджет быстрого ввода → вставить визитку → поля должны заполниться.
Проверить, что ИНН/КПП/ОГРН модель **не** придумала (инвариант фичи).

### 2. ai-summarize
Резюме по звонку с заполненными договорённостями. Проверить `ai_summary.meta.model` —
там должен быть слаг OpenRouter, а не старый `claude-haiku-4-5`.

### 3. transcribe (cleanup)
Блок сырого ASR → вычитка. Проверить пунктуацию, метки говорящих и что термины
из глоссария (маркировка, ЧЗ, ЭДО) не переписаны моделью на свой лад.

### 4. ai-run — сравнение качества, а не только «работает»
Прогнать `meeting_protocol` и SPIN-пресет на **одном и том же** транскрипте:
сначала при `AI_RUN_PROVIDER=anthropic`, затем `=openrouter`. Сравнить:
- заполнена ли структура (`shape_warning` в `ai_runs.meta` — пустой?);
- сколько было ретраев формы (`retried` в meta);
- содержательность на русском.

Отдельно: `company_brief` (веб-поиск) обязан работать как раньше — он не переезжал.

```sql
-- ретраи и претензии к форме за последние прогоны
select preset_key, status, meta->>'model' as model,
       meta->'shape_warning' as shape_warning, meta->>'retried' as retried, created_at
from ai_runs
order by created_at desc
limit 20;
```

## Откат

```bash
npx supabase secrets unset AI_RUN_PROVIDER AI_SUMMARY_PROVIDER AI_CAPTURE_PROVIDER TRANSCRIBE_PROVIDER
npx supabase secrets set LLM_PROVIDER=anthropic
```
Редеплой не нужен — секреты читаются на каждый вызов. Слаги моделей при откате тоже
вернуть на Claude-значения (адаптер режет префикс `anthropic/`, но `deepseek/...`
на api.anthropic.com не поедет).

## Риски

| Риск | Severity | Что делать |
|------|----------|------------|
| DeepSeek/Qwen срывается со структурированного вывода чаще Claude — в `ai-run` уже заложен ровно ОДИН ретрай формы (fix-S-R2-AI-SHAPE, ~25% отказов на инъекционном входе у Claude) | Warning | Мерить `retried` и `shape_warning` в `ai_runs.meta` первую неделю. Вырастет доля `error` — вернуть Sonnet-класс на ai-run, дешёвую модель оставить на capture/summarize |
| Русский язык на SPIN-разборе и протоколе встречи у дешёвых моделей заметно слабее | Warning | A/B из смоука 4 — решение принимать по нему, не по цене |
| ПДн контактов и коммерческие условия уезжают китайскому провайдеру | **Blocker для клиентских данных, если политика компании это запрещает** | `data_collection: deny` уже стоит по умолчанию. Но юрисдикция провайдера меняется — это вопрос к политике Первого Бита, не к коду |
| OpenRouter отвечает 200 с телом-ошибкой при сбое провайдера | покрыто | Адаптер это проверяет и бросает `LlmError` |
| Провайдер молча игнорирует `tool_choice` | покрыто | `provider.require_parameters: true` исключает таких из маршрутизации |

## Экономика

DeepSeek V4 Flash — $0.068 / $0.168 за Mtok (вход/выход) против Claude Haiku 4.5
$1 / $5. Порядок экономии на capture/summarize — 15–30×. По ai-run и вычитке
транскриптов считать после смоуков: там дороже модель и длиннее контекст.
Цены — OpenRouter, проверено 2026-08-18, меняются.

## VERIFICATION

```
Type Safety:            PASS (tsc --strict на llm.ts чисто; на четырёх функциях
                              новых ошибок нет — baseline оригиналов идентичен)
RLS Coverage:           NOT_APPLICABLE (RLS не затронут, клиенты под JWT как были)
Backward Compatibility: PASS по коду (дефолт LLM_PROVIDER=anthropic сохраняет
                              прежнее поведение), NOT_VERIFIED по качеству моделей
Runtime Tested:         NOT_VERIFIED (edge-функции не деплоились, curl к OpenRouter
                              из среды разработки недоступен — смоук 0 обязателен)
Regional Availability:  UNKNOWN (доступность OpenRouter из РФ и оплата — проверить
                              до перевода прода)
```
