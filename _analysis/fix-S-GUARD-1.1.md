# Claude Code Prompt — fix-S-GUARD-1.1: страж 0.2.0 + Supabase MCP только на чтение

> Сохранить как `~/Downloads/dashboard-crm/_analysis/fix-S-GUARD-1.1.md`.
> В чат CC одной строкой: «прочитай файл `_analysis/fix-S-GUARD-1.1.md` и выполни».
> Зависимость: S-GUARD-1 влит (#167), страж 0.1.0 подключён и работает в этой сессии.

## Зачем

Гейт S-GUARD-1 нашёл два обхода:
1. `execute_sql: select lead_convert(1)` проходит. SECURITY DEFINER-функция меняет прод-данные
   через `select`, регэксп этого не видит.
2. `bash -c "cat .env.local"` проходит: строка внутри `-c` не разбирается.

Обход 1 регэкспом не закрыть надёжно. Настоящая граница — сервер: hosted Supabase MCP с
`read_only=true` исполняет запросы только на чтение, мутирующая функция падает на сервере.
Сейчас CC ходит в БД через коннектор `claude.ai Supabase`. Это общий коннектор аккаунта,
им же гейт Cowork применяет миграции, поэтому сделать его read-only нельзя.

Решение:
- В dashboard-crm заводится проектный сервер `supabase_ro` (`.mcp.json`, `read_only=true`).
- Страж читает `.mcp.json` репо. Если там есть Supabase-сервер с `read_only=true`, все
  остальные Supabase-серверы в этом репо закрыты. CC остаётся только read-only путь.
- Признак read-only берётся из URL в `.mcp.json`, а не из `guard.json`. Поэтому схема
  `guard.json` не меняется, и порядок обновления плагина и мержа PR неважен.

## Ограничения спринта

- **Живой страж 0.1.0 работает в этой сессии.** Код в `~/Downloads/oleg-guard` CC править не
  может (правило G6/G7) — так задумано. Работа идёт в клоне `~/Downloads/guard-src`. Живую
  папку обновляет Олег руками после гейта.
- `git add` и `git commit` — **отдельными вызовами Bash** (правило C2).
- Push нет. Миграций нет. `guard.json` не трогать.
- dashboard-crm: ветка `chore/guard-1.1`, спринт-файл коммитится туда же.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/oleg-guard && git log --oneline -1 && git status --short
ls ~/Downloads/guard-src 2>/dev/null && echo "EXISTS — стоп, спросить Олега" || echo free
cd ~/Downloads/dashboard-crm && git switch main && git pull --ff-only && git log --oneline -1
ls .mcp.json 2>/dev/null || echo "no .mcp.json"
git check-ignore -v .mcp.json || echo "not ignored"
sed -n 20,28p CLAUDE.md
grep -n "^## КОММИТ" -A2 sprint-prompt-builder/SKILL.md
grep -n "git add" sprint-prompt-builder/references/templates.md
grep -n "сцеплять" crm-architect/references/learnings.md
```

Через Supabase MCP (read-only), для смока владельца:
```sql
select sequence_schema || '.' || sequence_name as seq from information_schema.sequences
where sequence_schema = 'public' order by 1 limit 3;
```
Имя первой последовательности — в ОТЧЁТ, раздел «Вопросы и риски». Нет ни одной — так и написать.

---

## ЗАДАЧА 1: клон для разработки

```bash
git clone ~/Downloads/oleg-guard ~/Downloads/guard-src
cd ~/Downloads/guard-src && claude plugin test .
```
Базовая линия: 66 pass. Иначе — стоп, в ОТЧЁТ.

Вся дальнейшая работа над кодом — только в `~/Downloads/guard-src`.

---

## ЗАДАЧА 2: Supabase — read-only сервер из `.mcp.json`

### Steps
1. `RepoInfo` получает поле `readOnlySupabaseServers: string[]`. `register.ts` читает
   `<root>/.mcp.json` через `$.fs` (если файл есть), `rules.ts` получает готовый список.
   Разбор — отдельная чистая функция `parseMcpJson(text: string | null): string[]` в новом
   `hooks/mcp-config.ts`:
   - вход `unknown` + type guards, без `any`;
   - сервер попадает в список, если ключ в `mcpServers` или `url` содержит `supabase`
     (без учёта регистра) **и** в `url` есть параметр запроса `read_only=true`;
   - имя нормализуется как в имени инструмента: `name.replace(/[^A-Za-z0-9_]/g, '_')`;
   - невалидный JSON или нет файла → `[]` (строгий режим ниже, не отказ).
   У MCP-вызова нет пути файла: репо берётся по `ctx.cwd` (`ctx.repo(ctx.cwd)`). Не в git —
   список пуст.
2. Сервер инструмента = часть между `mcp__` и последним `__`.
3. Новая логика G1/G2 для Supabase-инструмента:

| Случай | Вердикт |
|---|---|
| Сервер в `readOnlySupabaseServers` | G1 по имени инструмента (allow-list ниже). G2 **не применяется**: запрос ограничивает сервер |
| Список не пуст, сервер не в нём | deny: «В этом репо Supabase — только через `<имена>` (read-only). Коннектор claude.ai Supabase — инструмент гейта Cowork» |
| Список пуст | G1 + G2 + новое правило G2b |

4. В allow-list G1 добавить `query_logs`.
5. **G2b**: вызов функции в `execute_sql` на не-read-only сервере. В `bare`-тексте (после
   `scrubSql`) найти `идентификатор(` (с необязательной схемой `x.y(`). Разрешены только
   встроенные: агрегаты и оконные (`count sum avg min max string_agg array_agg json_agg
   jsonb_agg bool_and bool_or row_number rank dense_rank lag lead first_value last_value`),
   скалярные (`coalesce nullif greatest least lower upper length trim btrim ltrim rtrim
   substring substr position replace split_part concat concat_ws left right round floor ceil
   abs now current_date current_timestamp date_trunc date_part extract age to_char to_date
   to_timestamp make_interval format jsonb_build_object json_build_object jsonb_array_length
   jsonb_typeof jsonb_object_keys json_object_keys unnest generate_series cast`), каталожные
   (`pg_get_functiondef pg_get_viewdef pg_get_constraintdef pg_get_indexdef pg_get_triggerdef
   pg_get_expr format_type obj_description col_description has_table_privilege
   has_function_privilege pg_relation_size pg_total_relation_size pg_size_pretty`).
   Ключевые слова перед `(` функциями не считаются: `in exists any all values over filter
   within as on using select from where and or not`. Остальное → deny: «вызов функции
   `<имя>()` закрыт: функция может писать. Нужна функция — read-only сервер».

### Verification — тесты (дописать в `rules.test.ts` и новый `mcp-config.test.ts`)

| Вход | Ожидание |
|---|---|
| `parseMcpJson` с `supabase_ro`, url `…/mcp?project_ref=x&read_only=true` | `['supabase_ro']` |
| то же без `read_only=true` | `[]` |
| `read_only=false` | `[]` |
| невалидный JSON / `null` | `[]` |
| сервер `supabase-ro` (дефис) | `['supabase_ro']` |
| RO-список `['supabase_ro']`, `mcp__claude_ai_Supabase__list_tables` | deny |
| RO-список `['supabase_ro']`, `mcp__supabase_ro__execute_sql` `select lead_convert(1)` | allow (решает сервер) |
| RO-список `['supabase_ro']`, `mcp__supabase_ro__apply_migration` | deny (G1) |
| RO-список пуст, `select lead_convert(1)` | deny G2b |
| RO-список пуст, `select count(*), coalesce(max(x),0) from deals where id in (select 1)` | allow |
| RO-список пуст, `select pg_get_functiondef('public.f'::regproc)` | allow |
| RO-список пуст, `select public.recalc_all()` | deny G2b |
| RO-список пуст, `select nextval('s')` | deny G2b |
| `mcp__claude_ai_Supabase__query_logs`, RO-список пуст | allow |

---

## ЗАДАЧА 3: Bash — рекурсия, граница пути, новые защищённые файлы

### Steps
1. **Рекурсия.** Сегмент `bash|sh|zsh|dash [флаги] -c <строка>` и `eval <аргументы>`: строку
   (для `eval` — аргументы через пробел) прогнать через ту же проверку Bash, что и всю команду,
   с тем же `cwd`. Глубина ≤ 3, глубже → deny «слишком глубокая вложенность `-c`».
   То же для A1 (ask).
2. **Граница пути плагина** в `checkSettingsShell`: вместо `cmd.includes(s)` — регэксп с
   экранированным путём и границей после него: `(?=[/\s'"\`;|&)<>]|$)`.
3. **Защищённые файлы G6/G7**: добавить `.mcp.json` (в корне любого репо) и `~/.claude.json`.
   Read разрешён, запись — deny с тем же `ENV_REASON`.

### Verification — тесты

| Вход | Ожидание |
|---|---|
| `bash -c "cat .env.local"` | deny G5 |
| `sh -c 'rm -rf src'` | deny G8 |
| `eval "git push origin main"` | deny G10 |
| `bash -c "bash -c \"cat .env\""` | deny G5 (глубина 2) |
| `bash -c "git reset --hard"` | ask A1 |
| `bash -c "ls -la"` | allow |
| `cd ~/Downloads/oleg-guard-dev && npx vitest > /tmp/o.txt` | allow |
| `cd ~/Downloads/oleg-guard && echo x > /tmp/o.txt` | deny (граница есть, маркер записи есть) |
| Edit `/repo/.mcp.json` | deny |
| Read `/repo/.mcp.json` | allow |
| Bash `jq . .mcp.json > /tmp/x && mv /tmp/x .mcp.json` | deny |

---

## ЗАДАЧА 4: dashboard-crm — сервер, правило, шаблоны

```bash
cd ~/Downloads/dashboard-crm && git switch -c chore/guard-1.1
```

1. **`.mcp.json`** в корне (если в РАЗВЕДКЕ файла не было — создать; был — добавить ключ):
```json
{
  "mcpServers": {
    "supabase_ro": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=uoiavcabxgdjugzryrmj&read_only=true"
    }
  }
}
```
   `.mcp.json` в `.gitignore` → в ОТЧЁТ, добавить через `git add -f`.

2. **CLAUDE.md, правило 1** — заменить фразы от «Прод-БД из CC не трогать» до «система прав
   этого не различает.» на:
```
   Прод-БД из CC не трогать. Три слоя:
   (1) БД из CC — только проектный сервер `supabase_ro` (`.mcp.json`, `read_only=true`):
   запрос исполняется только на чтение, мутирующая функция через `select` падает на сервере;
   (2) страж `oleg-guard` закрывает в CC коннектор `claude.ai Supabase` целиком, пока в
   `.mcp.json` есть read-only сервер, и мутаторы любого Supabase MCP по имени;
   (3) `deny` в `.claude/settings.local.json`.
   Коннектор `claude.ai Supabase` — инструмент гейта Cowork (apply_migration).
```

3. **sprint-prompt-builder** (источник в репо):
   - `SKILL.md`, скелет, секция `## КОММИТ`: строку заменить на
     `git add (включая `_analysis/<этот спринт-файл>`) и git commit — двумя отдельными вызовами Bash (страж oleg-guard, C2); без push`;
   - тот же смысл — в чеклисте («КОММИТ with descriptive message…») и во всех блоках КОММИТ
     `references/templates.md`: `git add` и `git commit` — отдельные строки с пометкой
     «отдельными вызовами».
4. **learnings.md**, раздел «Многострочные команды владельцу» — после предложения про
   сцепку `git add … && git commit …` дописать одно предложение:
   `Это правило — для блоков владельцу (его терминал, без стража). CC — наоборот: add и commit отдельными вызовами Bash, иначе страж oleg-guard (C2) отказывает.`
5. Раскатка изменённых скиллов:
```bash
cd ~/Downloads/dashboard-crm && ./scripts/skill-deploy.sh sprint-prompt-builder && ./scripts/skill-deploy.sh crm-architect
```
   Загрузку `.skill` в аккаунт делает Олег.

### Verification
`node -e "JSON.parse(require('fs').readFileSync('.mcp.json','utf8'))"` → без ошибки.
`grep -c "отдельными вызовами" sprint-prompt-builder/SKILL.md sprint-prompt-builder/references/templates.md` → не 0.

---

## ЗАДАЧА 5: версия и README в guard-src

- `plugin.json`: `"version": "0.2.0"`, добавить `"author": "Oleg"` (снимает warning validate).
- README: раздел «Разработка» — код правится в `~/Downloads/guard-src`, живая папка
  `~/Downloads/oleg-guard` обновляется только Олегом:
  `git -C ~/Downloads/oleg-guard pull --ff-only ~/Downloads/guard-src main`.
  Раздел «Supabase» — признак read-only из `.mcp.json`, поведение по трём случаям.

---

## ТЕСТЫ

Таблицы в ЗАДАЧАХ 2 и 3 — минимальный набор, каждая строка — отдельный `test`. Все 66 старых
тестов остаются зелёными без правки ожиданий. Если старый тест пришлось поменять — в ОТЧЁТ,
раздел «Отклонения», с причиной.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
cd ~/Downloads/guard-src && claude plugin validate . && claude plugin test .
cd ~/Downloads/dashboard-crm && git diff --stat main...HEAD
```
В dashboard-crm в диффе: `.mcp.json`, `CLAUDE.md`, `sprint-prompt-builder/SKILL.md`,
`sprint-prompt-builder/references/templates.md`, `crm-architect/references/learnings.md`,
`_analysis/fix-S-GUARD-1.1.md`. Других файлов нет.

## КОММИТ

Каждая строка — отдельный вызов Bash. `git -C` вместо `cd … &&`: у `git commit` в сегменте
не должно быть соседей, иначе C2 отказывает.
```
git -C ~/Downloads/guard-src add -A
git -C ~/Downloads/guard-src commit -m "feat: oleg-guard 0.2.0 — read-only Supabase из .mcp.json, рекурсия -c/eval, граница пути"
git -C ~/Downloads/dashboard-crm add .mcp.json CLAUDE.md sprint-prompt-builder crm-architect/references/learnings.md _analysis/fix-S-GUARD-1.1.md
git -C ~/Downloads/dashboard-crm commit -m "chore(guard): supabase_ro для CC, правило БД в CLAUDE.md, add/commit раздельно (fix-S-GUARD-1.1)"
```
Если `.mcp.json` игнорируется — `git -C ~/Downloads/dashboard-crm add -f .mcp.json` отдельным вызовом. Без push.

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
