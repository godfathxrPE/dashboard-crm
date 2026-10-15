# Chore S-DEBT-1 — `docs-pr.sh` (кириллица, номер PR) и мёртвый код (`LegacyRow`, `--glass-sheen`)

**15.10.2026.** Пункты «Очереди» STATUS ревизии 95: «fix `docs-pr.sh`: кириллица в имени файла», «fix `docs-pr.sh`: номер PR подставляется и в прозу», хвост S-LEAD-V2-HEALTH-1 «`LegacyRow` без потребителей», долг темы `--glass-sheen`. **Ветка:** `chore/debt-1` от свежего `origin/main` (`946d4f7` или новее), worktree — по `worktree-isolation`. **Миграций нет.** Без push.
Этот файл лежит в основном чекауте (`~/Downloads/dashboard-crm/_analysis/chore-S-DEBT-1.md`, untracked) — скопировать в `_analysis/` worktree и закоммитить вместе с правками (страж, правило `sprint-file`).

## Зачем

Три независимых долга без решений владельца, каждый — отдельным коммитом.

1. `docs-pr.sh`, шаг 1: `git diff --name-only` и `git ls-files --others` экранируют не-ASCII путь (`core.quotePath`), и проверка путей видит `"_analysis/\320…"` вне `_analysis/` — отказ на любом файле с кириллицей в имени (поймано 04.10 на `_analysis/план.mxl`).
2. `docs-pr.sh`, шаг 5б: `sed "s/| #PR |/…/g"` меняет плейсхолдер во всём файле, включая прозу. Строка #165 в реестре STATUS читается «строка `| #166 |`». Плейсхолдер — только первая ячейка строки таблицы.
3. `LegacyRow` в `PipelineCockpit` — ветка `gauge === null`, потребителей нет с S-LEAD-V2-HEALTH-1 (#143): `ProjectStageCockpit` и `LeadDetail` передают `gauge` всегда. `--glass-sheen` объявлен в блоке `.t-cobalt`, `var(--glass-sheen)` нет нигде.

## Что НЕ меняется

- **Проп `focusNextAction` у `ProjectModal` — НЕ мёртвый, не трогать.** STATUS называет его хвостом S-TODAY-V3, но `PipelineBoard.tsx` держит state и ставит `setFocusNextAction(true)` (~стр. 715, prompt после переноса стадии) — фокус на «Дата шага» живой. Пункт STATUS поправит гейт.
- Шрифты (`layout.tsx`) — отдельный спринт после решения владельца.
- `docs-pr.sh`: остальные шаги, порядок отказов, авто-мерж, ожидание.
- `CockpitRow`, `MiniMap`, `GateChip` — разметка и классы без изменений.
- `DealSignals.tsx:56` — `gauge: null` там про доменную шкалу сигналов, не про проп кокпита. Не трогать.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
grep -n 'CHANGED="\|placeholder=\|grep -qF -- "\$placeholder"\|sed "s/| #PR |' scripts/docs-pr.sh
grep -rn "LegacyRow" src
grep -rn "<PipelineCockpit" -A8 src | grep -n "gauge"
grep -rn "glass-sheen" src
```

Ожидание:
- коммит `946d4f7` или новее;
- `docs-pr.sh`: `CHANGED=` на ~стр. 87, `placeholder='| #PR |'` ~250, `grep -qF` ~257, `sed` ~263;
- `LegacyRow` — только `src/components/shared/PipelineCockpit.tsx` (комментарии ~26–32, ~47, вызов ~184, функция с ~193) и комментарий `src/components/projects/ProjectStageCockpit.tsx` ~288;
- `gauge` у обоих вызовов — не `null`: `ProjectStageCockpit` передаёт результат `stageTimeGauge(...)`, `LeadDetail` — `statusGauge?.gauge ?? { days: null, … }`;
- `glass-sheen` — `src/app/globals.css`: объявление ~879 и комментарий ~2144–2148.

Расхождение с ожиданием — остановиться и записать в «Вопросы и риски», не чинить вслепую.

## ЗАДАЧА 1 — `docs-pr.sh`: кириллица в путях

`scripts/docs-pr.sh`, строка `CHANGED=`:

```bash
CHANGED="$( { git diff --name-only HEAD 2>/dev/null; git ls-files --others --exclude-standard; } | sort -u)"
```
→
```bash
CHANGED="$( { git -c core.quotePath=false diff --name-only HEAD 2>/dev/null; git -c core.quotePath=false ls-files --others --exclude-standard; } | sort -u)"
```

Над строкой — комментарий в одну-две строки: без `core.quotePath=false` git экранирует не-ASCII путь в кавычки, и проверка префиксов видит его вне `_analysis/` (04.10, `_analysis/план.mxl`).

Других вызовов, выводящих имена файлов, в скрипте быть не должно — проверить `grep -n "name-only\|ls-files" scripts/docs-pr.sh`; найдётся ещё — тот же `-c`, строкой в отчёт.

**Проверка:**
```bash
bash -n scripts/docs-pr.sh && echo SYNTAX_OK
touch "_analysis/проверка-кириллицы.md" && git -c core.quotePath=false ls-files --others --exclude-standard | grep "проверка" ; rm "_analysis/проверка-кириллицы.md"
```
Ожидание: `SYNTAX_OK`; путь выведен кириллицей, без `\320`.

## ЗАДАЧА 2 — `docs-pr.sh`: номер PR только в первую ячейку

Шаг 5б. Плейсхолдер — строка таблицы, начинающаяся с `| #PR |`. Прозу не трогать.

- `grep -qF -- "$placeholder" "$f"` → `grep -q -- '^| #PR |' "$f"`;
- `sed "s/| #PR |/| #${PR_NUM} |/g" "$f"` → `sed "s/^| #PR |/| #${PR_NUM} |/" "$f"` (якорь `^`, без `g`; в BRE `|` и `#` — литералы, BSD sed на macOS ведёт себя так же);
- переменную `placeholder` оставить — её печатает сообщение об ошибке ниже;
- заголовок шага: «литерал "| #PR |", БЕЗ регулярок по "#"» → «только первая ячейка строки таблицы — `^| #PR |`»; в комментарии — одна строка, почему: прозу с упоминанием плейсхолдера `sed /g` переписывал (строка #165 реестра).

**Проверка (вне репо, на образце):**
```bash
printf '%s\n' '| #PR | docs | текст про `| #PR |` в прозе |' 'проза с | #PR | посередине' > /tmp/s-debt-1.md
grep -q -- '^| #PR |' /tmp/s-debt-1.md && echo FOUND
sed "s/^| #PR |/| #999 |/" /tmp/s-debt-1.md
rm /tmp/s-debt-1.md
```
Ожидание: `FOUND`; первая строка начинается с `| #999 |`, а `| #PR |` внутри неё и вся вторая строка — без изменений.

**Коммит 1** (задачи 1 и 2 — один файл):
```
git add scripts/docs-pr.sh _analysis/chore-S-DEBT-1.md
```
```
git commit -m "fix(scripts): docs-pr.sh — кириллица в путях (core.quotePath) и номер PR только в первую ячейку строки"
```

## ЗАДАЧА 3 — `PipelineCockpit` без `LegacyRow`

`src/components/shared/PipelineCockpit.tsx`:

1. Удалить функцию `LegacyRow` целиком вместе с её JSDoc («Строка до S-COCKPIT-ROW-1 — ветка лида…»).
2. `PipelineCockpit`:
   ```tsx
   return props.gauge === null ? <LegacyRow {...props} /> : <CockpitRow {...props} gauge={props.gauge} />;
   ```
   →
   ```tsx
   return <CockpitRow {...props} />;
   ```
3. `PipelineCockpitProps.gauge`: `StageTimeGauge | null` → `StageTimeGauge`; JSDoc поля — «Шкала времени в стадии; у лида — `leadStatusGauge`.» Если `CockpitRow` типизирует `gauge` отдельно (`… & { gauge: StageTimeGauge }`) — упростить до `PipelineCockpitProps`.
4. Шапка файла (~стр. 24–34): фразы «Тайм-часть опциональна (`gauge: null` → `LegacyRow`)», «`LegacyRow` без потребителей» и абзац «Всё новое включается НАЛИЧИЕМ `gauge`: у лида (`gauge === null`) строка рендерится прежней веткой `LegacyRow`…» заменить одной фразой: «Тайм-часть обязательна; ветка без шкалы (`LegacyRow`) удалена в S-DEBT-1 — потребителей не было с S-LEAD-V2-HEALTH-1.» Остальной текст шапки не трогать.
5. Константы и хелперы, которые после удаления никто не читает (кандидаты — `FILL_BY_STATE`, `BORDER_BY_STATE`, `STATE_COLOR`, `STATE_TEXT` и др.): для каждого `grep -n "<имя>" src/components/shared/PipelineCockpit.tsx`; ноль использований вне объявления — удалить. Неиспользуемые импорты — удалить. Сомнение — оставить и строкой в отчёт.

`src/components/projects/ProjectStageCockpit.tsx` ~стр. 288, комментарий: «Лидов это не касается: их строка — LegacyRow без норм.» → «Лидов это не касается: их шкала — `leadStatusGauge`, без норм организации.»

**Проверка:**
```bash
grep -rn "LegacyRow" src
npx tsc --noEmit
```
Ожидание: `grep` пусто; tsc — 0 ошибок (у `LeadDetail` и `ProjectStageCockpit` `gauge` не `null` по типу).

## ЗАДАЧА 4 — `--glass-sheen`

`src/app/globals.css`:
- удалить объявление `--glass-sheen: linear-gradient(160deg, …);` в блоке `.t-cobalt` (~стр. 879);
- в комментарии над `.glass-sheet` (~стр. 2144–2148) удалить абзац «⚠️ `--glass-sheen` в этот список НЕ входит: … он про другое.» целиком; предыдущий абзац про `--glass-bg` / `--glass-blur` / `--glass-border` / `--glass-inset` оставить.

**Проверка:**
```bash
grep -rn "glass-sheen" src
```
Ожидание: пусто.

**Коммит 2** (задачи 3 и 4):
```
git add src/components/shared/PipelineCockpit.tsx src/components/projects/ProjectStageCockpit.tsx src/app/globals.css
```
```
git commit -m "chore(cleanup): убрать LegacyRow из PipelineCockpit и неиспользуемый --glass-sheen (S-DEBT-1)"
```

---

## ТЕСТЫ

Тестов нет: правка bash-скрипта (проверяется прогоном на образце в задачах 1–2) и удаление кода без потребителей (проверяется `tsc` и `grep`). Новой логики в `src/lib/` нет.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -6
bash -n scripts/docs-pr.sh && echo SYNTAX_OK
grep -rn "LegacyRow\|glass-sheen" src
git --no-pager log --oneline origin/main..HEAD
git --no-pager diff --stat origin/main...HEAD
```

Ожидание: tsc и lint — 0 ошибок; vitest — столько же тестов, сколько на `main`, все passed; `SYNTAX_OK`; `grep` — пусто; два коммита; в `--stat` пять файлов (`_analysis/chore-S-DEBT-1.md`, `scripts/docs-pr.sh`, `PipelineCockpit.tsx`, `ProjectStageCockpit.tsx`, `globals.css`), у `PipelineCockpit.tsx` и `globals.css` — в основном удаления.

Визуально ничего не меняется: `LegacyRow` не рендерился, `--glass-sheen` не читался. `npm run build` — у владельца перед PR.

## КОММИТ

Два коммита — в задачах 2 и 4. `git add` и `git commit` — отдельными вызовами Bash (страж oleg-guard, правило C2). Без push.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «удалил функцию», не «функция была удалена».
- Один термин = одно значение. Сущности называй как в коде: имя файла, функции, токена.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд.
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · N тестов passed · grep пусто · SYNTAX_OK).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».
