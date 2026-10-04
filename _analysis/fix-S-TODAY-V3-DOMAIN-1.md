# Claude Code Prompt — fix S-TODAY-V3-DOMAIN-1: тишина после касания

**Ветка:** `feat/today-v3-domain` — та же, вторым коммитом. PR ещё не открыт.
**Основание:** гейт DOMAIN-1 от 04.10.2026. Миграций нет, экран не меняется.

## Зачем

Правило 3 `classifyDeal` держит сделку в `stale`, если после срока шага было хоть одно касание — сколько бы ни длилась тишина потом. На живой БД 04.10 так стоят две сделки: «М Д М» и «Продовольственный фонд», тишина по 18 дней. Сделка без шага с той же тишиной уходит в `decide` (правила 7–8). Свёрнутая строка «Решить судьбу» в SCREEN-1 говорит «N сделок молчат дольше 14 дней» — при старом правиле она врёт на две сделки.

Новое правило: касание после срока держит сделку в `stale`, пока от последнего касания прошло не больше `decideDays` дней. Дальше — `decide`. Один порог тишины на сделки с просроченным шагом и без шага.

## РАЗВЕДКА

```bash
git branch --show-current
git status --short src tests
git log --oneline main..HEAD
grep -n "if (touchedAfterDue) group = 'stale'" src/lib/domain/today-deals.ts
grep -n "Так согласовано владельцем" src/lib/domain/today-deals.ts
grep -n "дальше тишина → stale" tests/unit/today-deals.test.ts
grep -n "группы 3/1/5/6/2" tests/unit/today-deals.test.ts
grep -n "useIsProjectActive()(project) === true" _analysis/today-v3-spec.md
grep -n "пять строк; \`stale\` пять строк" _analysis/sprint-S-TODAY-V3-SCREEN-1.md
```

Ожидание: ветка `feat/today-v3-domain`, один коммит `10ccd7f` сверх `main`, рабочее дерево по `src` и `tests` чистое, каждый `grep` даёт ровно одну строку. Иначе — стоп и вопрос в чат.

## ЗАДАЧА 1: правило тишины в `classifyDeal`

Файл `src/lib/domain/today-deals.ts`.

Замена ветки:

```ts
  } else if (health === 'overdue-action') {
    if (touchedAfterDue) group = 'stale';
    else group = (overdueDays ?? 0) <= thresholds.decideDays ? 'fresh' : 'decide';
  } else if (input.planned) {
```

на:

```ts
  } else if (health === 'overdue-action') {
    if (touchedAfterDue && lastTouchAt) {
      // Касание после срока держит сделку в «Обновить шаг», пока оно свежее. Дальше —
      // та же тишина, что у сделки без шага (правила 7–8): порог один на оба случая.
      const silentDays = diffDaysKey(mskDateKey(lastTouchAt), eventTodayKey);
      group = silentDays <= thresholds.decideDays ? 'stale' : 'decide';
    } else {
      group = (overdueDays ?? 0) <= thresholds.decideDays ? 'fresh' : 'decide';
    }
  } else if (input.planned) {
```

`touchedAfterDue === true` означает, что касание с днём не позже сегодня есть, поэтому `lastTouchAt` не `null`; вторая половина условия — для типов.

В докблоке `classifyDeal` список правил привести к виду:

```
 * 1. шаг впереди, сигналов нет → `plan`;          2. шаг впереди, сигнал есть → `risk`;
 * 3. срок прошёл, касание после дня срока, от последнего касания ≤ decideDays → `stale`;
 *    касание после дня срока было, но тишина после него > decideDays → `decide`;
 * 4. срок прошёл, касаний после нет, просрочка ≤ decideDays → `fresh`; 5. > decideDays → `decide`;
 * 6. шага нет, есть встреча/звонок впереди → `plan`;
 * 7. шага нет, тишина ≤ decideDays → `stale`;     8. тишина > decideDays → `decide`.
```

Абзац с `⚠️ «Касание сразу после срока, потом тишина» — stale … Так согласовано владельцем.` удалить целиком: правило другое, согласования не было.

Комментарий у поля `TodayThresholds.decideDays` заменить на: `Дней тишины, после которых сделка без шага впереди уходит в «решить судьбу».`

Проверка:

```bash
grep -n "silentDays" src/lib/domain/today-deals.ts
grep -c "согласовано" src/lib/domain/today-deals.ts
npx tsc --noEmit 2>&1 | head -5
```

Ожидание: две строки с `silentDays`, счётчик `0`, ошибок `tsc` нет.

## ЗАДАЧА 2: документы эпика

Только текст. Код и фикстура не трогаются. В заменах ниже запись `\`` — обычный обратный апостроф из файла, обратную косую в документы не переносить.

**`_analysis/today-v3-spec.md`**

1. Строка «Сделка экрана»: `projects.type = 'client'` и `useIsProjectActive()(project) === true` → `projects.type = 'client'`, `projects.status = 'open'` и `useIsProjectActive()(project) === true`. После этого предложения добавить: `Сделка на паузе (\`on_hold\`) на экран не попадает — как и сейчас: \`getDealHealth\` для неё всегда \`ok\`.`
2. Таблица групп, строка `stale`: правило → `срок шага прошёл, после дня срока есть касание, и последнее касание не старше 14 дней; либо шага или даты нет, а последнее касание (или создание сделки) не старше 14 дней`.
3. Таблица групп, строка `decide`: правило → `срок шага прошёл, и тишина дольше 14 дней — от срока, если после него касаний не было, иначе от последнего касания; либо шага или даты нет и тишина дольше 14 дней`.

**`_analysis/sprint-S-TODAY-V3-SCREEN-1.md`**

1. `Вход \`deals\` уже отфильтрован вызывающим: \`type === 'client'\` и \`isProjectActive\`.` → `Вход \`deals\` уже отфильтрован вызывающим: \`type === 'client'\`, \`status === 'open'\` и \`isProjectActive\`.`
2. В правиле `after`: `шаг просрочен и \`touchedAfterDue\` → \`touched_after_due\`; просрочен, группа \`fresh\` → \`silence_after_due\`` → `шаг просрочен, группа \`stale\` → \`touched_after_due\`; просрочен, группа \`fresh\` → \`silence_after_due\``. Остаток предложения не менять: `decide` с касанием теперь получает `silence_since`.
3. В ожиданиях `today-model.test.ts`: `\`decide\` \`total\` 6, \`inMoves\` 1, пять строк; \`stale\` пять строк` → `\`decide\` \`total\` 8, \`inMoves\` 1, семь строк; \`stale\` три строки`.
4. Там же, в строке `after`: после `\`hn\` → \`silence_since\`, день 2026-09-17;` добавить `\`mdm\` → \`silence_since\`, день 2026-09-16;`.

Проверка:

```bash
grep -c "status = 'open'" _analysis/today-v3-spec.md
grep -c "total\` 8" _analysis/sprint-S-TODAY-V3-SCREEN-1.md
grep -c "mdm\` → \`silence_since\`" _analysis/sprint-S-TODAY-V3-SCREEN-1.md
```

Ожидание: `1`, `1`, `1`.

## ТЕСТЫ

**`tests/unit/today-deals.test.ts`**

`now` в блоке `classifyDeal` — `2026-10-03T12:00:00+03:00`, как сейчас.

1. Кейс «срок 40 дней назад, касание через день после срока, дальше тишина → stale» заменить: то же входное → `group` `decide`, `touchedAfterDue` `true`, `overdueDays` 40.
2. Новый кейс, граница порога: срок `2026-08-24`, последнее касание `2026-09-19` (14 дней назад) → `stale`; последнее касание `2026-09-18` (15 дней) → `decide`.
3. Новый кейс: срок `2026-08-24`, касания `2026-08-25` и `2026-10-01` → `stale` (считается последнее касание, не первое после срока).
4. Кейс «касание в день срока → fresh; на следующий день → stale» остаётся без правок и проходит.
5. Эталон 03.10 19:00: заголовок «группы 3/1/3/8/2»; `stale` → `['glorus', 'hleb', 'rodina']`; `decide` → `['prodfond', 'mdm', 'hn', 'lid', 'rus', 'agroh', 'agros', 'zerde']`. `fresh`, `risk`, `plan`, `countNoStepAhead` 14 и ходы `lorenz`, `nytva`, `hn` — без изменений.
6. Эталон 05.10 09:00 — без изменений и проходит.

**`tests/unit/deal-touch.test.ts`**

7. Новый кейс: каждый тип из `TOUCH_EVENT_TYPES` даёт у `touchKindOfActivity` не `null`. Список запроса (SCREEN-1) и таблица видов не должны разойтись молча.

Фикстура `tests/unit/fixtures/today-2026-10-03.ts` не меняется.

```bash
npx vitest run tests/unit/deal-touch.test.ts tests/unit/today-deals.test.ts tests/unit/deal-pulse.test.ts 2>&1 | tail -12
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
git diff --stat HEAD
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, предупреждений не больше 33.
2. `vitest` — всё зелёное; три файла эпика — 73 теста (было 70: плюс три новых кейса).
3. `git diff --stat HEAD` — только `src/lib/domain/today-deals.ts`, два тест-файла, два файла `_analysis/`.

`npm run build` запускать только при остановленном `next dev`. Работает dev-сервер — не запускай и напиши это в «Не сделано».

## ЧЕГО В ЭТОМ ФИКСЕ НЕТ

- Правок `pickMoves`, `compareByWeight`, `riskSignals`, `deal-touch.ts`, `deal-pulse.ts`, фикстуры.
- Правок `getDealHealth`.
- Правок файла `_analysis/sprint-S-TODAY-V3-DOMAIN-1.md`: он остаётся записью того, что было поручено.

## КОММИТ

```bash
git add src/lib/domain/today-deals.ts tests/unit/today-deals.test.ts tests/unit/deal-touch.test.ts _analysis/today-v3-spec.md _analysis/sprint-S-TODAY-V3-SCREEN-1.md _analysis/fix-S-TODAY-V3-DOMAIN-1.md
git diff --cached --stat
git commit -m "fix(today): тишина после касания дольше 14 дней — «Решить судьбу»

- classifyDeal: касание после срока держит сделку в stale, пока от последнего касания ≤ decideDays; дальше decide
- эталон 03.10: группы 3/1/3/8/2, ходы прежние
- спека: правила stale/decide, сделка экрана — status open
- SCREEN-1: ожидания модели под новое правило

Основание: _analysis/fix-S-TODAY-V3-DOMAIN-1.md"
```

Пуша нет.

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
