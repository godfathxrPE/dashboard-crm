# Claude Code Prompt — S-GUARD-1: плагин-страж `oleg-guard` (guard + commit-gate)

> Сохранить как `~/Downloads/dashboard-crm/_analysis/sprint-S-GUARD-1.md`.
> В чат CC одной строкой: «прочитай файл `_analysis/sprint-S-GUARD-1.md` и выполни».

## Зачем

Красные линии процесса (CC не применяет миграции, не читает `.env`, не пушит в `main`,
не правит сгенерированные типы) сейчас держатся на инструкциях в CLAUDE.md и скиллах.
Инструкцию модель может не выполнить, особенно после сжатия контекста. Mod (плагин с
function hooks) перехватывает `tool.call` и отказывает детерминированно, в любом
permission mode.

Плагин — **кросс-проектный**: общие правила зашиты, проектные читаются из
`.claude/guard.json` в корне репо. Код плагина живёт в своём репо
`~/Downloads/oleg-guard`, не в dashboard-crm: при загрузке из рабочей копии
dashboard-crm смена ветки или worktree подменяла бы код стража на лету.

Граница честности: страж ловит **промахи**, не враждебного агента. Команда внутри
скрипта (`./scripts/x.sh`) не видна по строке Bash. Это осознанно.

## Ограничения спринта

- Миграций нет, прод-БД не трогать.
- `~/.claude/settings.json` **не редактировать** — подключение плагина делает Олег руками
  после гейта.
- Push нет, ни в одном из двух репо.
- В dashboard-crm работа на ветке `chore/guard-config`. Спринт-файл коммитится туда же.

---

## РАЗВЕДКА

```bash
claude --version
claude plugin --help | grep -E "validate|test"
ls ~/Downloads/oleg-guard 2>/dev/null && echo "EXISTS — стоп, спросить Олега" || echo "free"
cd ~/Downloads/dashboard-crm && git status --short | head -20 && git branch --show-current
git ls-files | grep -E "(database|supabase\.gen)\.ts$"
git check-ignore -v .claude/guard.json || echo "not ignored"
ls .claude 2>/dev/null
grep -nE "checkout -b|switch -c|BRANCH=" scripts/docs-pr.sh | head
cat ~/.claude/settings.json 2>/dev/null | grep -n "CLAUDE_CODE_PLUGIN_DIRS" || echo "no plugin dirs yet"
```

Что зафиксировать до работы:
- `claude plugin validate` и `claude plugin test` есть. Нет — стоп, в ОТЧЁТ «версия CC без
  plugin test», ничего не писать.
- Реальные пути сгенерированных типов (ожидаются `src/types/database.ts` и
  `…/supabase.gen.ts`; брать вывод `git ls-files`, не этот текст).
- `.claude/guard.json` не игнорируется git. Игнорируется — в ОТЧЁТ, не править `.gitignore`.
- Префикс веток, который создаёт `scripts/docs-pr.sh`. Он идёт в `branchPrefixes`.

Затем загрузи встроенный скилл **`plugin-authoring`** и прочитай `reference.md` из него.
Источник истины по API — файл типов `claude-code.d.ts`, который скилл называет при загрузке.
Перед кодом найди в нём: `ToolCallResult`, `PreToolUseResult`, `ProcessRunResult`,
входы встроенных инструментов `Bash` / `Read` / `Edit` / `Write` / `NotebookEdit` / `Grep`
(имена полей: `command`, `file_path`, `notebook_path`, `path`).
**Папку из раздела WHERE TO WRITE IT скилла не используй** — плагин пишется в
`~/Downloads/oleg-guard`.

---

## ЗАДАЧА 1: каркас плагина

### Context
Мод — три файла плюс модуль правил. Правила — чистые функции в отдельном файле:
их тестирует `claude plugin test` без движка, а `register.ts` только связывает их с событиями.

### Steps
```
~/Downloads/oleg-guard/
  .claude-plugin/plugin.json   { "name": "oleg-guard", "version": "0.1.0", "description": "Красные линии процесса: БД, секреты, git, commit-gate" }
  hooks/hooks.json             { "modules": ["./register.ts"] }
  hooks/register.ts            связывание событий
  hooks/rules.ts               чистые функции: (input, ctx) => Verdict
  hooks/config.ts              чтение и валидация .claude/guard.json
  hooks/rules.test.ts
  README.md                    что блокирует, как подключить, как выключить
```
`git init -b main` в `~/Downloads/oleg-guard`.

Тип вердикта:
```ts
export type Verdict =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason: string }
```
Каждый `reason` начинается с `oleg-guard: ` и говорит, **что делать вместо**
(«миграцию применяет гейт Cowork — закоммить файл в supabase/migrations/»). Модель читает
reason как результат инструмента: голый «запрещено» приводит к попыткам обхода.

### Verification
`claude plugin validate ~/Downloads/oleg-guard` → без ошибок.

---

## ЗАДАЧА 2: guard — общие правила (работают в любом репо)

### Context
Эти правила действуют без `.claude/guard.json`. Deny — в хуке `tool.call` (типизированный `e`).
Ask — в хуке `classic.PreToolUse` (только он умеет `{ ask }`).

### Steps — таблица правил

| # | Инструмент | Условие | Вердикт |
|---|---|---|---|
| G1 | MCP Supabase: имя `/^mcp__.*supabase.*__/i` | инструмент **не** из allow-list: `list_*`, `get_*`, `search_docs`, `generate_typescript_types`, `execute_sql` | deny: «БД меняет только гейт Cowork» |
| G2 | MCP Supabase `execute_sql` | `query` после удаления комментариев (`--…`, `/*…*/`) не начинается с `select` / `with` / `explain` / `show`, **или** содержит слово `insert` / `update` / `delete` / `merge` / `drop` / `alter` / `create` / `truncate` / `grant` / `revoke` / `comment on` / `vacuum` / `refresh` | deny: «только read-only SQL» |
| G3 | Bash | `supabase` + `db (push\|reset\|execute)` или `migration (up\|repair\|squash)`; отдельное слово `psql` или `pg_restore` | deny |
| G4 | Read / Edit / Write / NotebookEdit / Grep(`path`) | путь матчит `(^\|/)\.env(\.[^/]*)?$`, кроме `\.env\.(example\|sample\|template)$` | deny: «секреты не читаются; нужна переменная — спроси Олега» |
| G5 | Bash | любой токен команды (без кавычек, без префиксов `<`, `--env-file=`) матчит G4 | deny |
| G6 | Edit / Write / NotebookEdit | путь — `~/.claude/settings.json`, `~/.claude/settings.local.json`, `<repo>/.claude/settings*.json`, `<repo>/.claude/guard.json`, любой файл под папкой плагина | deny: «настройки среды меняет Олег» |
| G7 | Bash | упоминает пути из G6 **и** содержит маркер записи: `>`, `tee`, `sed -i`, `perl -i`, `mv `, `cp `, `rm `, `jq … >`, `python`, `node` | deny |
| G8 | Bash | `rm` с рекурсивным флагом (`-r`, `-R`, `--recursive`, склейки `-rf` / `-fr` / `-Rf`); хоть одна цель — не `node_modules`, `.next`, `dist`, `build`, `out`, `coverage`, `.turbo` (с `./` или без, с подпутём) и не под `/tmp/` / `$TMPDIR`; или цель содержит `~`, `..`, `*`, равна `/` или `.` | deny |
| G9 | Bash | `git push` с `--force` / `-f` / `--force-with-lease` / `+refspec` в защищённую ветку (по умолчанию `main`, `master`, `dev`; явная цель или текущая ветка, если цель не указана) | deny |
| G10 | Bash | `git push` в защищённую ветку без force | deny: «в main только через PR руками» |
| G11 | Bash | `gh pr merge` | deny: «мерж руками у Олега» |
| A1 | Bash | любой другой `git push`; `git reset --hard`; `git clean -f…`; `git branch -D`; `git stash drop\|clear`; `git checkout -- .` / `git restore .` | ask |

Детали реализации:
- Текущая ветка — `$.process.run(['git','rev-parse','--abbrev-ref','HEAD'])`. Если команда
  начинается с `git -C <path>`, cwd = `<path>`.
- Домашняя папка — `$.env.get` для `HOME`. Пути в G6/G7 сравнивать в обоих написаниях:
  `~/…` и абсолютный.
- Разбор Bash — по сегментам между `&&`, `||`, `;`, `|`. Каждое правило проверяет каждый сегмент.
- **Выключатель только БД-правил (G1–G3):** переменная окружения хоста
  `OLEG_GUARD_DB=off` через `$.env.get`. Модель её не выставит: `export` в Bash меняет
  окружение дочернего процесса, не хоста. Зачем: если плагин когда-нибудь подхватится
  в сессии гейта, Олег выключит БД-блок одной переменной, не удаляя плагин.
- Хуки `tool.call` при deny возвращают `{ deny: reason }` без вызова `next`.
  При allow — `next(e)` без изменений.

### Verification
Тесты из секции ТЕСТЫ по G1–G11, A1 зелёные.

---

## ЗАДАЧА 3: commit-gate — проектные правила из `.claude/guard.json`

### Context
Commit-gate включается, только если в корне репо (`git rev-parse --show-toplevel`) есть
`.claude/guard.json`. В репо без файла он молчит: плагин кросс-проектный, у чужого репо
своих конвенций нет.

Важно: журнал / learnings / STATUS commit-gate **не требует**. По протоколу crm-architect
их пишет гейт после приёмки, а свой номер PR в STATUS вносится вторым коммитом после
`gh pr create`. Требование этих файлов в коммите CC противоречило бы процессу.

### Steps — схема `guard.json` (v1)

```json
{
  "version": 1,
  "baseBranch": "main",
  "protectedBranches": ["main", "master", "dev"],
  "branchPrefixes": ["feat/", "fix/", "chore/", "refactor/"],
  "generatedFiles": ["src/types/database.ts"],
  "commitRules": [
    {
      "id": "sprint-file",
      "ifChanged": "^(src|supabase|scripts)/",
      "requireInBranch": "^_analysis/(sprint|fix)-.+\\.md$",
      "message": "Спринт-файл коммитится в ветку спринта: git add _analysis/<файл>.md"
    },
    {
      "id": "schema-doc",
      "ifChanged": "^supabase/migrations/",
      "requireInBranch": "^docs/schema\\.md$",
      "message": "Миграция без docs/schema.md: обнови раздел миграции тем же PR"
    }
  ]
}
```
`config.ts`: валидировать вручную (`unknown` + type guards, без `any`, без zod — у мода
нет node_modules). Невалидный файл → каждый `git commit` получает deny с текстом ошибки
валидации: тихий пропуск правил хуже явной поломки.

### Steps — правила

| # | Условие (есть guard.json) | Вердикт |
|---|---|---|
| C1 | Edit / Write / NotebookEdit по пути из `generatedFiles` | deny: «только генератор: scripts/gen-types.sh» |
| C2 | Bash-сегмент `git commit`, а в той же команде есть ещё сегменты (`git add … && git commit …`) | deny: «git add и git commit — отдельными вызовами» (иначе staged-набор на момент проверки неполный) |
| C3 | `git commit -a` / `--all` | deny: «стейджь явно» |
| C4 | текущая ветка в `protectedBranches` | deny: «коммит в защищённую ветку; создай ветку с префиксом» |
| C5 | текущая ветка не начинается ни с одного из `branchPrefixes` | deny |
| C6 | первая строка сообщения (из `-m "…"` или первой строки heredoc после `-m "$(cat <<'EOF'`) не матчит `^(feat\|fix\|chore\|refactor\|docs\|test\|perf\|style\|ci\|build)(\([^)]+\))?!?: .+` | deny. Сообщение не распарсилось — правило пропускается, не deny |
| C7 | для каждого `commitRules[i]`: изменённые = staged (`git diff --cached --name-only`) ∪ ветка (`git diff --name-only <baseBranch>...HEAD`); если хоть один путь матчит `ifChanged`, а ни один — `requireInBranch` | deny с `message` правила |

C7 смотрит на ветку целиком, не на один коммит: спринт-файл коммитится один раз, а
фикс-коммиты после него не должны его повторять.

### Verification
Тесты C1–C7 зелёные; невалидный guard.json → deny с текстом ошибки (отдельный тест).

---

## ЗАДАЧА 4: `.claude/guard.json` для dashboard-crm

### Steps
```bash
cd ~/Downloads/dashboard-crm && git switch -c chore/guard-config
```
Создать `.claude/guard.json` по схеме из ЗАДАЧИ 3:
- `generatedFiles` — **реальные пути из РАЗВЕДКИ** (`git ls-files`), не из этого текста.
- `branchPrefixes` — четыре базовых плюс префикс из `scripts/docs-pr.sh`, если он другой.
- `ifChanged` в `sprint-file` — сверить с реальными верхними папками кода (`ls`).

### Verification
`node -e "JSON.parse(require('fs').readFileSync('.claude/guard.json','utf8'))"` → без ошибки.
Тест в плагине грузит **этот** файл как фикстуру (скопировать в `hooks/fixtures/dashboard-crm.guard.json`)
и прогоняет C7 на двух наборах путей: миграция без schema.md → deny; миграция + schema.md → allow.

---

## ЗАДАЧА 5: проверка загрузки (без правки settings.json)

### Steps
```bash
cd ~/Downloads/oleg-guard &&
claude plugin validate . &&
claude plugin test . &&
npx -y tsc -p . --noEmit
```
`tsc -p .` работает только после того, как движок хоть раз загрузил плагин и положил
`.claude-plugin/types/` и `tsconfig.json`. До этого — проверка по `tsconfig.json` из шапки
файла типов, держать его вне папки плагина (так написано в скилле).

Подключение к среде — **не делать**. В ОТЧЁТ, раздел «Вопросы и риски», вывести
абсолютный путь плагина одной строкой.

---

## ТЕСТЫ

`hooks/rules.test.ts`, импорт `test`, `expect` из `claude-code/testing`. Кейсы — поведением,
вход → вердикт. Минимальный набор (каждая строка — отдельный `test`):

| Вход | Ожидание |
|---|---|
| MCP `mcp__supabase__apply_migration` | deny |
| MCP `mcp__claude_ai_Supabase__list_tables` | allow |
| `execute_sql`: `select count(*) from deals` | allow |
| `execute_sql`: `/* x */ with d as (delete from deals returning *) select * from d` | deny |
| `execute_sql`: `-- select\nupdate deals set x=1` | deny |
| Bash `npx supabase db push` | deny |
| Bash `npx supabase gen types typescript --project-id x > src/types/database.ts` | allow по G3 (C1 его не ловит: C1 только Edit/Write) |
| Read `/repo/.env.local` | deny |
| Read `/repo/.env.example` | allow |
| Bash `cat .env \| grep KEY` | deny |
| Bash `grep -r NEXT_PUBLIC src/` | allow |
| Edit `~/.claude/settings.json` | deny |
| Bash `jq '.env={}' ~/.claude/settings.json > /tmp/s && mv /tmp/s ~/.claude/settings.json` | deny |
| Bash `cat ~/.claude/settings.json` | allow |
| Bash `rm -rf node_modules .next` | allow |
| Bash `rm -rf src` | deny |
| Bash `rm -fr ./dist ~/x` | deny (одна плохая цель) |
| Bash `git push --force origin main` | deny |
| Bash `git push -f origin feat/x` | allow по G9 (A1 → ask) |
| Bash `git push origin main` | deny |
| Bash `gh pr merge 12 --merge` | deny |
| Bash `git reset --hard HEAD~1` | ask |
| Bash `git add -A && git commit -m "feat: x"` (guard.json есть) | deny C2 |
| Bash `git commit -m "fix stuff"` на ветке `feat/x` | deny C6 |
| Bash `git commit -m "fix(deals): ok"` на ветке `main` | deny C4 |
| Bash `git commit -m "fix(deals): ok"` на ветке `wip/x` | deny C5 |
| Без guard.json: `git commit -m "anything"` на `main` | allow (commit-gate молчит) |
| Ветка `feat/x` меняет `supabase/migrations/130_x.sql` без `docs/schema.md` | deny C7 `schema-doc` |
| Та же ветка + `docs/schema.md` | allow |
| `OLEG_GUARD_DB=off` + `apply_migration` | allow |

Правила, которым нужны git и окружение (ветка, staged, HOME), получают их аргументом `ctx`.
Внутри `rules.ts` нет ни `$.process`, ни `$.env`. Так тесты не зависят от реального репо.

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
cd ~/Downloads/oleg-guard && claude plugin validate . && claude plugin test .
cd ~/Downloads/dashboard-crm && git status --short && git diff --stat main...HEAD
```
В dashboard-crm в диффе ровно два файла: `.claude/guard.json` и `_analysis/sprint-S-GUARD-1.md`.
`npm run lint` / `tsc` / `vitest` в dashboard-crm не нужны: код приложения не менялся.

## КОММИТ

```bash
cd ~/Downloads/oleg-guard && git add -A && git commit -m "feat: oleg-guard 0.1.0 — guard и commit-gate"
cd ~/Downloads/dashboard-crm && git add .claude/guard.json _analysis/sprint-S-GUARD-1.md && git commit -m "chore(guard): конфиг oleg-guard для dashboard-crm (S-GUARD-1)"
```
Без push.

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
