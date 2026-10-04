# Фикс BRIEF-SHAPE-BACKOFF — пауза автосбора брифа на 7 суток после двух сбоев `shape` подряд

**04.10.2026.** Хвост эпика BRIEF-IN-DEAL-1: STATUS ревизия 84, «Очередь» → BRIEF-IN-DEAL-1, первый пункт. **Ветка:** `fix/brief-shape-backoff` от свежего `origin/main` (`30cda19` или новее), worktree — по `worktree-isolation`. **Миграция 140 пишется и коммитится, НЕ применяется**: apply делает гейт Cowork через MCP, CC прод-БД не трогает. **139 не занимать** — она зарезервирована за «Авто-видом внедрения» (STATUS). Без push.
Этот файл лежит в основном чекауте (`~/Downloads/dashboard-crm/_analysis/fix-BRIEF-SHAPE-BACKOFF.md`, untracked) — скопировать в `_analysis/` worktree и закоммитить вместе с правками (страж, правило `sprint-file`).

## Зачем

`company_brief_candidates()` (138) держит паузу 45 мин после ошибки и не больше 2 автопопыток на компанию за сутки МСК — назавтра всё заново. Компания, о которой веб-поиск ничего не находит (`shape|Поиск не дал ни одного источника…`, текст — `EMPTY_SOURCES_TEXT` в `supabase/functions/ai-run/shape.ts`), будет каждый день съедать 2 из 10 слотов org, без конца. Панель брифа при этом обещает автоповтор.

Первой под это попадёт «Тест · смок ACT-1»: ручной прогон 04.10 — `shape`, 13 278 / 2 466 токенов. Живая БД 04.10: 28 компаний с прогонами брифа, серий из двух `shape` подряд — 0, кандидатов в очереди — 7 (все `no_brief`). Сегодня правило никого не исключает; тестовая компания выпадет после первого же автопрогона 05.10.

## Правило (решение гейта)

- Две последние по `created_at` строки `ai_runs` с `preset_key = 'company_brief'` у компании — обе `status = 'error'` и `error` начинается с `shape|` ⇒ компания вне очереди **7 суток** от `coalesce(finished_at, created_at)` более поздней из двух.
- Ручные прогоны считаются наравне с автозапуском: ручной повтор, который снова упал, — тот же сигнал; удачный прогон (`done`) серию обрывает.
- В счёт только класс `shape`. `upstream` (таймаут, реклейм тика), `access`, `network` — сбои провайдера, не компании: пауза по ним выключила бы автосбор всей org на неделю после одного сбоя у провайдера.
- Класс, а не текст `EMPTY_SOURCES_TEXT`: текст пишется для человека и меняется, класс — контракт `runError()` в `supabase/functions/ai-run/index.ts`. Две подряд ошибки формата ответа тоже честно ставят паузу: внутри прогона `ai-run` уже делает ретрай, серия из двух прогонов — четыре неудачных ответа подряд.
- `company_brief_auto_state()` не меняется: `reason` берётся из `company_brief_candidates()` и на паузе станет `NULL` сам.

## Что НЕ меняется

- Сигнатура `company_brief_candidates()` — тот же `RETURNS TABLE`, тот же ACL. Только `create or replace`, без `drop` и DO-блоков: MCP `apply_migration` на `drop` виснет (`learnings.md`).
- `brief_auto_tick()`, `company_brief_auto_state()`, лимиты, крон, `ai-run`.
- Состояния кнопки: `briefKind` не трогаем, `failed` остаётся `failed`. Меняется только примечание в панели.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
ls supabase/migrations | tail -4
grep -n "create or replace function public.company_brief_candidates" supabase/migrations/138_brief_auto.sql
grep -n "45 minutes\|brief_auto_day_start()) < 2\|comment on function public.company_brief_candidates\|on function public.company_brief_candidates" supabase/migrations/138_brief_auto.sql
grep -n "BRIEF_AUTO_MAX_ATTEMPTS\|export type BriefRuns\|export function pickBriefRuns\|export function briefNote\|case 'failed'\|export function formatBriefChipDate" src/lib/domain/company-brief.ts
grep -rn "briefNote(\|latestDone: null, active: null, latest: null" src tests | grep -v "^src/lib/domain/company-brief.ts"
grep -n "company_brief_candidates()\|\*\*Не чаще:\*\*" docs/schema.md
```

Живую функцию сверить с файлом 138 через `supabase_ro` (только чтение):

```sql
select pg_get_functiondef('public.company_brief_candidates'::regproc);
```

Тело расходится с 138 — основой для 140 берётся живая функция, расхождение — в «Вопросы и риски».

## ЗАДАЧА 1 — миграция 140: пауза в очереди

**Файл:** `supabase/migrations/140_brief_shape_backoff.sql`.

- Шапка по образцу 138: номер и смысл; строка `-- СТАТУС: НАПИСАНА, НЕ ПРИМЕНЕНА (fix-BRIEF-SHAPE-BACKOFF)`; «Зачем» и «Правило» из этого файла, коротко; «DO-блоков и drop нет — MCP `apply_migration`»; обратимость — `create or replace` с телом из 138.
- `create or replace function public.company_brief_candidates()` — тело живой функции без изменений, плюс одно условие в итоговый `where`, рядом с «пауза после сбоя: 45 мин» и «не больше двух автопопыток»:
  ```sql
  -- межсуточная пауза после серии shape (140): две последние попытки брифа — ошибки
  -- класса shape ⇒ компания вне очереди 7 суток от конца более поздней. Зеркало —
  -- BRIEF_SHAPE_BACKOFF_* в src/lib/domain/company-brief.ts, менять парой.
  and not exists (
    select 1
      from (select r.status, coalesce(r.error, '') as error,
                   coalesce(r.finished_at, r.created_at) as ended_at
              from public.ai_runs r
             where r.entity_type = 'company' and r.entity_id = s.company_id
               and r.preset_key = 'company_brief'
             order by r.created_at desc
             limit 2) last2
    having count(*) = 2
       and bool_and(last2.status = 'error' and last2.error like 'shape|%')
       and max(last2.ended_at) > now() - interval '7 days'
  )
  ```
  `coalesce(r.error, '')` обязателен: `bool_and` пропускает `NULL`, и ошибка без текста рядом с `shape` иначе дала бы ложную паузу.
- `comment on function public.company_brief_candidates()` — прежний текст + предложение про паузу после двух `shape` подряд.
- Hardening и ACL — строки 138 дословно (`security definer set search_path = public, pg_temp`, `revoke …`, `grant …`, если есть).

**Проверка:** `grep -n "shape|%" supabase/migrations/140_brief_shape_backoff.sql` → одна строка; `grep -ci "drop " supabase/migrations/140_brief_shape_backoff.sql` → 0.

## ЗАДАЧА 2 — `docs/schema.md`

- Раздел «138 (S-BRIEF-IN-DEAL-1.1)», пункт «**Не чаще:**» — дописать: «С 140 — после двух ошибок `shape` подряд (две последние попытки, ручные в счёт) компания вне очереди 7 суток; `upstream`/`access`/`network` не в счёт (fix-BRIEF-SHAPE-BACKOFF, **140 — НАПИСАНА, НЕ ПРИМЕНЕНА**).»
- Таблица функций, строка `company_brief_candidates()` — в колонку «Что» добавить «+ пауза 7 сут после двух `shape` подряд (140)».

Статус `applied` впишет гейт после apply — не трогать.

## ЗАДАЧА 3 — домен: пауза видна панели

`src/lib/domain/company-brief.ts`:

- Константы рядом с `BRIEF_AUTO_MAX_ATTEMPTS`:
  ```ts
  /** Зеркало межсуточной паузы company_brief_candidates() (миграция 140) — менять парой. */
  export const BRIEF_SHAPE_BACKOFF_STREAK = 2;
  export const BRIEF_SHAPE_BACKOFF_DAYS = 7;
  ```
- `BriefRuns` += `backoffUntil: string | null` — ISO-момент, до которого компания вне автоочереди; `null` — паузы нет.
- `pickBriefRuns` считает `backoffUntil` по уже отсортированным `briefs`: первые `BRIEF_SHAPE_BACKOFF_STREAK` штук — все `status === 'error'` и `(error ?? '').startsWith('shape|')` ⇒ наибольший `finished_at ?? created_at` среди них + `BRIEF_SHAPE_BACKOFF_DAYS` суток; иначе `null`. От «сейчас» не зависит — сравнение с `now` делает `briefNote`.
- `briefNote` — во вход добавить `now: Date`. Ветка `failed`, первой проверкой: `runs.backoffUntil` задан и позже `now` ⇒ `Две попытки подряд не дали брифа. Автосбор вернётся к компании ${formatBriefChipDate(runs.backoffUntil)}.` Иначе — прежняя логика без правок.
- Остальные ветки `briefNote` не трогать: у `stale` фраза про очередь уйдёт сама — RPC отдаст `reason = NULL`.

`src/components/projects/DealBriefPanel.tsx`: вызов `briefNote({ kind, runs, auto, now })`; `const now = new Date()` поднять выше вызова.

**Проверка:** `npx tsc --noEmit` — все места, где собирается `BriefRuns`, получили `backoffUntil`.

## ТЕСТЫ

`tests/unit/company-brief.test.ts`:

- Хелпер `runsOf` — `backoffUntil: null` по умолчанию; кейс «пусто → все null» — с `backoffUntil: null`.
- `pickBriefRuns`, поле `backoffUntil`:
  - две последние — `shape|…`, у более поздней `finished_at` = T ⇒ ISO от `T + 7 сут`;
  - последняя `shape`, предыдущая `done` ⇒ `null`;
  - две ошибки, одна `upstream|Прогон прерван по таймауту.` ⇒ `null`;
  - у одной из двух `error: null` ⇒ `null`;
  - одна попытка, `shape` ⇒ `null`;
  - `finished_at: null` ⇒ отсчёт от `created_at`;
  - прогон чужого пресета между двумя `shape` серию не рвёт.
- `briefNote`, `failed`:
  - `backoffUntil` через 3 суток от `now` ⇒ текст начинается с «Две попытки подряд» и содержит `formatBriefChipDate(backoffUntil)`; момент брать на 12:00 UTC, чтобы дата не съехала ни в одной TZ;
  - `backoffUntil` в прошлом ⇒ прежние тексты: «примерно через час» или «завтра» — по `auto`;
  - существующие вызовы `briefNote` в тестах — с `now`.

SQL юнит-тестами не покрывается: проверку на живой БД делает гейт после apply.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -6
grep -n "shape|%" supabase/migrations/140_brief_shape_backoff.sql
grep -ci "drop " supabase/migrations/140_brief_shape_backoff.sql
grep -n "BRIEF_SHAPE_BACKOFF" src/lib/domain/company-brief.ts supabase/migrations/140_brief_shape_backoff.sql
```

Ожидание: tsc, lint, vitest — 0 ошибок; `shape|%` — одна строка; `drop ` — 0; `BRIEF_SHAPE_BACKOFF` — в домене и в комментарии миграции.

## КОММИТ

Явным списком. `git add` и `git commit` — двумя отдельными вызовами Bash (страж oleg-guard, правило C2). Без push.

```
git add _analysis/fix-BRIEF-SHAPE-BACKOFF.md supabase/migrations/140_brief_shape_backoff.sql docs/schema.md src/lib/domain/company-brief.ts src/components/projects/DealBriefPanel.tsx tests/unit/company-brief.test.ts
```

```
git commit -m "fix(ai): пауза автосбора брифа на 7 суток после двух сбоев shape подряд — миграция 140, текст панели (fix-BRIEF-SHAPE-BACKOFF)"
```

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, таблицы, функции.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд. Без цепочек «осуществление проведения проверки».
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · 42 теста passed · build exit 0).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».
