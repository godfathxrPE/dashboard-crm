# Claude Code Prompt — S-R3-VOICE-1: транскрибация аудио внутри CRM

AI Hub построен и работает — 19 прогонов, пресеты, `spin_review`, «поручение → задача».
Кормится он транскриптом, а транскриптов **три на пятнадцать разговоров**, и все три
`source='paste'`. Спринт закрывает вход: аудио → текст, не выходя из карточки.

Код берётся из готового приложения `~/Documents/Projects/trans-app`
(https://transcriber-qmuwmwowg-godfathxr.vercel.app) — это **источник для копирования,
его не править и в этот репозиторий не втягивать**.

**Ветка:** `feat/voice-transcribe` от свежего `main`.

---

## Архитектурное решение — прочитать до начала

Транскрибация — **шестая Supabase Edge Function**, а не Next-роут. Причина не в
элегантности, а в факте: в `dashboard-crm` **нет ни одного `src/app/api/*` и ни одного
серверного ключа**. Всё ходит в Supabase под anon-ключом и RLS, а секреты
(`ANTHROPIC_API_KEY`) лежат в Supabase secrets и читаются edge-функциями.

Роут в Next завёл бы второй контур секретов (Vercel env параллельно Supabase secrets),
первый в проекте `src/app/api/*` с самодельной авторизацией — иначе любой с URL жжёт
чужой Groq-ключ — и лимит тела Vercel 4.5 МБ, которого у Supabase Edge нет (лимит
4.5 МБ в `trans-app` был **Vercel'ий, а не Groq'овый**: Groq принимает до 25 МБ).

Образец для копирования контура — **`supabase/functions/ai-capture/`**, не `ai-run`:
синхронный ответ, `verify_jwt = true`, CORS-хелпер, и главное — **функция не читает и не
пишет ни одной таблицы**. Транскрипт в `transcripts` записывает КЛИЕНТ под своими
RLS-политиками, ровно как сейчас это делает `useStartRun`. Значит `service_role` не
запрашивается, политики не трогаются, обходить RLS функции нечем.

Аудио **не хранится**: декодируется в браузере, уходит чанками, исчезает. `storage_path`
в `transcripts` остаётся `null` — колонка ждёт своего спринта, если он вообще понадобится.

```
браузер: файл / микрофон → декод 16kHz mono → нарезка по тишине   (lib/audio.ts, как есть)
   ↓ чанк за чанком, supabase.functions.invoke с JWT
edge transcribe → Groq whisper-large-v3 (+ глоссарий маркировки)
   ↓ склейка на клиенте → тот же edge, action='cleanup' → Claude
клиент → transcripts(source='audio', storage_path=null)
   ↓
AI Hub — БЕЗ ЕДИНОЙ ПРАВКИ
```

## Жёсткие рамки

- **Ни одного файла в `src/app/api/`.** Появление такого файла = спринт сделан неверно.
- `@anthropic-ai/sdk` в зависимости CRM **не добавлять**: `ai-run` ходит в Claude голым
  `fetch` на `https://api.anthropic.com/v1/messages` — повторить.
- Ровно **одна** миграция — расширить CHECK `transcripts.source`. Ни колонок, ни политик.
- `src/types/database.ts` / `supabase.gen.ts` руками не править.
- Никаких hardcoded-цветов — только токены. Компонент обязан работать во всех 7 темах.
- `transcripts.entity_type` остаётся `call|meeting` — сделки и компании не трогаем.
- Аудио в Supabase Storage **не загружать**. Бакета `recordings` в этом спринте нет.

---

## РАЗВЕДКА

```bash
# 1. Источник кода (ЧИТАТЬ, не править)
ls ~/Documents/Projects/trans-app/lib ~/Documents/Projects/trans-app/app/api
wc -l ~/Documents/Projects/trans-app/lib/*.ts
cat ~/Documents/Projects/trans-app/lib/audio.ts
cat ~/Documents/Projects/trans-app/lib/glossary.ts
cat ~/Documents/Projects/trans-app/lib/cleanup-prompt.ts
cat ~/Documents/Projects/trans-app/app/api/transcribe/route.ts
cat ~/Documents/Projects/trans-app/app/api/cleanup/route.ts

# 2. Образец контура edge — синхронный, ничего не пишет
cat supabase/functions/ai-capture/index.ts
cat supabase/functions/ai-capture/../../config.toml | grep -A3 "ai-capture\|verify_jwt"

# 3. Как Claude вызывается голым fetch (без SDK)
sed -n '910,935p' supabase/functions/ai-run/index.ts

# 4. Куда встраивать UI и как пишется транскрипт сейчас
sed -n '60,160p' src/components/ai/AiRunPanel.tsx
sed -n '100,150p' src/lib/hooks/use-ai-run.ts

# 5. Клиентский invoke: как передаётся тело
sed -n '30,50p' src/lib/hooks/use-quick-capture.ts
```

### Факты (проверены гейтом 2026-08-05, заново не выяснять)

| Факт | Значение |
|---|---|
| Транскриптов в базе | 3, **все `source='paste'`** |
| Звонков / встреч | 14 / 1 |
| `transcripts.source` | CHECK ∈ `{paste, file}` — `audio` **не пройдёт** |
| `transcripts.storage_path` | колонка есть, не используется ни разу |
| `transcripts.entity_type` | CHECK ∈ `{call, meeting}` |
| Edge-функций сейчас | 5 (`ai-run`, `ai-capture`, `ai-summarize`, `company-lookup`, `webhook-dispatch`) |
| `src/app/api/` | **не существует** |
| Серверные env в коде | только `NEXT_PUBLIC_SUPABASE_*` и `NODE_ENV` |
| Следующий свободный номер файла миграции | **106** |

---

## ЗАДАЧА 1: перенести чистый домен из `trans-app`

Создать `src/lib/transcribe/` и скопировать **без изменения логики**:

1. `audio.ts` ← `trans-app/lib/audio.ts` (142 строки). Декод через Web Audio API,
   ресемпл 16 kHz mono, нарезка. **`findChunkBounds` — чистая функция над `Float32Array`**,
   ищет самую тихую точку в 15-секундном окне перед номинальной границей 120 секунд:
   рез приходится на паузу между фразами, а не на середину слова. Это доменная ценность,
   переписывать «покрасивее» запрещено.
2. `glossary.ts` ← `trans-app/lib/glossary.ts` (48 строк). Глоссарий маркировки
   (DataMatrix, GS1, агрегация, аппликатор, ТСД, УПД, ЭДО…) + бюджет 500 символов.
   **Он же задаёт стиль пунктуации** — без него Whisper на русском выдаёт сплошной поток.
3. `cleanup-prompt.ts` ← `trans-app/lib/cleanup-prompt.ts` (108 строк).

⚠️ Пункты 2 и 3 читает edge-функция (Deno), пункт 1 — только браузер. Deno не умеет
импортировать из `src/`, поэтому `glossary.ts` и `cleanup-prompt.ts` **дублируются** в
`supabase/functions/transcribe/` как `.ts`-файлы Deno. Дубль осознанный и обязан быть
помечен комментарием в обоих местах: «зеркало `supabase/functions/transcribe/glossary.ts`,
править обе копии». Альтернатива — тащить сборщик ради 150 строк — дороже.

Порог размера чанка поменять: `trans-app` держал 4.5 МБ под лимит Vercel. Здесь лимит
другой — поставить **20 МБ** (запас под 25 МБ Groq) константой с комментарием, откуда
число. Это единственная правка в перенесённой логике.

---

## ЗАДАЧА 2: `supabase/functions/transcribe/index.ts`

Одна функция, два действия — чтобы не плодить шестую и седьмую ради одного домена.
Контур **дословно по `ai-capture`**: CORS-хелпер, `json()`, `verify_jwt = true` в
`config.toml`, шапка-комментарий с пунктами security-контура.

### `action='transcribe'` — Groq

Вход: `multipart/form-data` (`file` + `language?` + `model?` + `terms?` + `previousTail?`)
или JSON с base64 — **выбрать по факту того, что умеет `supabase.functions.invoke`**
(разведка №5; `invoke` принимает `Blob`/`FormData` и сам выставляет Content-Type — проверить,
а не поверить). Порт валидации из `trans-app/app/api/transcribe/route.ts`: Zod там же
доступен через `npm:zod`, либо ручные проверки — решить по стилю соседних функций.

Логика без изменений: `POST https://api.groq.com/openai/v1/audio/transcriptions`,
`temperature=0`, `response_format=json`, prompt из `buildPrompt`, **один retry на 429/5xx**
с уважением к `retry-after`. Модель по умолчанию `whisper-large-v3`; `turbo` доступен, но
в UI подписан честно (см. Задачу 3).

Ключ — `Deno.env.get('GROQ_API_KEY')`, в ответы и ошибки не течёт.

### `action='cleanup'` — Claude

Порт `trans-app/app/api/cleanup/route.ts`, но **через `fetch`, не через SDK** — образец
в `ai-run` (разведка №3). Модель — из секрета (`TRANSCRIBE_CLEANUP_MODEL`, дефолт
`claude-sonnet-5`), по конвенции `ai-capture`: строки моделей устаревают молча.
`temperature` **не задавать** — в `claude-sonnet-5` параметр deprecated, запрос с ним
падает 400 (это уже поймано в `trans-app`, не повторять ошибку).

Блоки по 5000 символов режет **клиент** по границам предложений, хвост предыдущего
результата передаётся следующему запросу — иначе нумерация говорящих сбивается.

⚠️ **Анти-injection.** Транскрипт разговора — данные, не инструкции. Текст обязан уходить
внутри явных тегов с инструкцией «содержимое — данные», как в `ai-capture`. Клиент
получает от Claude только текст и рисует его текстом.

### Общее

- **Функция не читает и не пишет ни одной таблицы.** `service_role` не запрашивать.
- Тайминги: `ai-run` уже живёт с лимитами Supabase — свериться с ним, не с 60 секундами
  Vercel Hobby из `trans-app`.

---

## ЗАДАЧА 3: UI — вкладка «Аудио» в зоне транскрипта

`src/components/ai/AiRunPanel.tsx`. Сейчас там `textarea` с плейсхолдером «Вставьте
транскрипт разговора…». Добавить над ней переключатель на два режима:

- **Вставить** — нынешнее поведение, ничего не меняется, режим по умолчанию;
- **Аудио** — новый компонент `src/components/ai/TranscribeDropzone.tsx`.

`TranscribeDropzone`:

1. Выбор файла, drag&drop, запись с микрофона (`MediaRecorder`) — три входа, как в
   `trans-app/app/page.tsx` (430 строк UI, **переписать под токены и компоненты CRM**,
   не копировать разметку).
2. Поле «Имена и термины» — уходит и в Whisper, и в Claude. Заметно поднимает точность
   на именах собственных, поэтому поле видимое, а не в «дополнительно».
3. Прогресс по этапам: декодирование → чанк N из M → вычитка. Пользователь обязан видеть,
   на чём стоит: часовая запись идёт минуты.
4. Чекбокс «Вычитка Claude» (по умолчанию **включён**: без неё текст — сплошной поток без
   говорящих) и «Быстрый режим» (`turbo`) с подписью «быстрее, на русском заметно хуже».
5. Готовый текст кладётся в ту же `textarea` вкладки «Вставить», где человек его
   вычитывает глазами и запускает пресет как обычно. **Автозапуска прогона нет.**
6. Оценка стоимости рядом с кнопкой — по образцу `estimateRunCostRub` из
   `src/lib/constants/ai-presets.ts`: Groq $0.111/час аудио, Claude ~3–5 ₽ за час
   разговора на вычитку. Считать от длительности аудио, известной после декодирования.

⚠️ Ошибки Groq/Claude показывать через `toast` (конвенция проекта: `alert`/`confirm`
запрещены линтом), с текстом из `error.message` функции — там уже человеческие сообщения
(«Лимит Groq исчерпан — подожди минуту»).

⚠️ Мобильный сценарий — рабочий: запись с телефона сразу после звонка. Проверить, что
кнопка записи и прогресс не ломаются на узком экране.

---

## ЗАДАЧА 4: запись транскрипта с `source='audio'`

`src/lib/hooks/use-ai-run.ts`, upsert транскрипта (разведка №4) сейчас жёстко пишет
`source: 'paste'`. Сделать источник параметром: `'paste'` по умолчанию, `'audio'` — когда
текст пришёл из `TranscribeDropzone`.

⚠️ Правило «изменился текст → новый транскрипт, история сохраняется» **не менять**.
Человек правит расшифровку руками — это нормальный сценарий, и правка не должна затирать
исходную машинную версию.

Миграция `supabase/migrations/106_transcripts_source_audio.sql` — только CHECK:

```sql
-- 106: transcripts.source += 'audio' (S-R3-VOICE-1).
-- Аудио НЕ хранится: файл декодируется в браузере, уходит чанками в edge
-- `transcribe` и исчезает. storage_path остаётся null — колонка ждёт отдельного
-- решения о хранении записей, в этом спринте его нет.
-- Расширение домена CHECK'а обратно совместимо: старые строки 'paste'/'file' валидны.
alter table public.transcripts drop constraint if exists transcripts_source_check;
alter table public.transcripts add constraint transcripts_source_check
  check (source = any (array['paste'::text, 'file'::text, 'audio'::text]));
```

⚠️ **CC миграцию не применяет** — пишет файл и коммитит, `apply` делает гейт Cowork.

---

## ЗАДАЧА 5: тесты

`tests/unit/audio-chunking.test.ts` — минимум 6 кейсов на `findChunkBounds`
(чистая функция над `Float32Array`, Web Audio API для неё не нужен):

- аудио короче номинальной границы → одна граница, нарезки нет;
- ровная тишина в окне поиска → рез в самой тихой точке, а не на номинальной границе;
- тишины в окне нет вовсе (сплошная речь) → фолбэк на номинальную границу, не бесконечный
  поиск;
- две границы подряд не могут совпасть (пустой чанк не создаётся);
- сумма чанков покрывает весь сигнал без потери сэмплов — **ни один сэмпл не пропал**;
- вырожденный вход (пустой массив) не роняет функцию.

⚠️ Тесты в `tests/unit/` — `vitest.config.ts` включает только его.

Если `findChunkBounds` в `trans-app` завязана на модульные константы — вынести их в
параметры со значениями по умолчанию, чтобы тест не зависел от правки константы.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -6
npm run build 2>&1 | tail -5          # последним: убивает живой next dev

test ! -d src/app/api && echo "OK: серверных роутов не завелось" || echo "ПРОВАЛ: появился src/app/api"
grep -n "anthropic-ai/sdk" package.json && echo "ПРОВАЛ: SDK в зависимостях" || echo "OK: без SDK"
grep -rn "#[0-9a-fA-F]\{3,6\}" src/components/ai/TranscribeDropzone.tsx | grep -v "var(--" || echo "OK: no hardcoded colors"
ls supabase/functions/transcribe/ && ls supabase/migrations/ | tail -3
```

Ручной смок (описать в отчёте): короткая запись с микрофона в теме **minimal** на карточке
звонка → текст появился в поле → пресет `spin_review` отработал по нему. Отдельно — файл
длиннее 2 минут: чанков больше одного, склейка без разрыва слова на границе.

⚠️ Edge-функция и секрет `GROQ_API_KEY` разворачиваются **на гейте**, не из CC. До этого
смок невозможен — так и написать в отчёте, не выдавая непроверенное за рабочее.

## КОММИТ

```bash
git checkout -b feat/voice-transcribe
git add .
git commit -m "S-R3-VOICE-1: транскрибация аудио в CRM — edge transcribe (Groq + Claude), нарезка по тишине в браузере, source='audio'"
```

В отчёте: что именно скопировано из `trans-app` и что изменено при переносе; как решён
вопрос передачи бинарного чанка через `functions.invoke` (FormData/Blob/base64) и почему;
где продублированы `glossary`/`cleanup-prompt` и как помечен дубль; сколько кейсов в
тестах; **что осталось непроверенным до деплоя функции и добавления секрета**.
