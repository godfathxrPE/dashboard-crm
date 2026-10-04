# Claude Code Prompt — fix S-TODAY-V3-SCREEN-1: находки гейта

**Ветка:** `feat/today-v3-screen` — та же, вторым коммитом. PR ещё не открыт.
**Основание:** гейт SCREEN-1 от 04.10.2026: дифф и живой экран (`localhost:3000`, тема `t-cobalt`, ширина контента 1154 и 994 px). Миграций нет. Домен (`today-deals.ts`, `today-model.ts`, `deal-touch.ts`) не меняется.

## РАЗВЕДКА

```bash
git branch --show-current
git status --short src tests
git log --oneline main..HEAD
grep -n "const loadError = projectsQ.isError || touchesQ.isError;" src/components/today/TodayView.tsx
grep -n "void projectsQ.refetch(); void touchesQ.refetch();" src/components/today/TodayView.tsx
grep -n 'className="mt-1.5 line-clamp-2 text-xs text-text-dim"' src/components/today/TodayMoveCard.tsx
grep -n "Дни без активности" src/components/projects/DealPulseCard.tsx
grep -n "layout.collapsed ? collapsedSummary(g) : TODAY_GROUP_RULES\[g.key\]" src/components/today/TodayGroups.tsx
grep -n "Дедлайн сделки" src/components/today/TodayDealPanel.tsx
ls tests/unit/today-text.test.ts 2>&1
```

Ожидание: ветка `feat/today-v3-screen`, один коммит `28f1a77` сверх `main`, рабочее дерево по `src` и `tests` чистое, каждый `grep` даёт ровно одну строку, файла `today-text.test.ts` нет. Иначе — стоп и вопрос в чат.

## ЗАДАЧА 1: упавший запрос КП или стадий — ошибка, а не вечный скелетон

Файл `src/components/today/TodayView.tsx`.

Модель ждёт четыре запроса (`projectsQ`, `stagesQ`, `touchesQ`, `quotesQ`), а ошибку экран показывает только по двум. Упал запрос `quotes` или стадий → `model` остаётся `null`, `loadError` — `false`, скелетон висит без текста и без «Повторить».

Замена:

```ts
  const loadError = projectsQ.isError || touchesQ.isError;
```

на:

```ts
  // Все четыре запроса модели: без КП и стадий модель не собирается, и без ошибки
  // на экране скелетон висел бы вечно.
  const loadError = projectsQ.isError || stagesQ.isError || touchesQ.isError || quotesQ.isError;
```

Кнопка «Повторить» перезапрашивает те же четыре:

```tsx
            onClick={() => { void projectsQ.refetch(); void touchesQ.refetch(); }}
```

на:

```tsx
            onClick={() => {
              void projectsQ.refetch();
              void stagesQ.refetch();
              void touchesQ.refetch();
              void quotesQ.refetch();
            }}
```

Проверка: `grep -c "quotesQ.isError" src/components/today/TodayView.tsx` → `1`.

## ЗАДАЧА 2: «почему здесь» на карточке хода не обрезается

Файл `src/components/today/TodayMoveCard.tsx`.

Замер на живом экране: при ширине контента 994 px (окно 1280) у третьей карточки строка «почему здесь» обрезана — «…Квалификация · перенесён …». Число переносов — цена хода, его нельзя прятать.

```tsx
      <p className="mt-1.5 line-clamp-2 text-xs text-text-dim">
```

на:

```tsx
      <p className="mt-1.5 text-xs text-text-dim">
```

`line-clamp-2` у шага карточки (абзац с `data-today-step`) не трогать. Ряд кнопок прижат к низу через `mt-auto` — карточки одной строки сетки остаются одной высоты.

## ЗАДАЧА 3: «Пульс» карточки сделки — одно число тишины, не два

Файл `src/components/projects/DealPulseCard.tsx`.

Подпись «Дни без активности · N дн.» печатает то же `pulse.longestSilence.days`, что и «тишина N дн.» строкой выше. Подпись удалить, отступ перед полосой сохранить:

```tsx
      <div className="mb-1.5 mt-2.5 text-[10.5px] text-text-mute">
        Дни без активности · {pulse.longestSilence.days} дн.
      </div>
      <PulseDayStrip
        days={pulseDays}
        dueLabel={dueInWindow && project.next_action_date ? mskDayCaption(project.next_action_date) : undefined}
      />
```

на:

```tsx
      <div className="mt-2.5">
        <PulseDayStrip
          days={pulseDays}
          dueLabel={dueInWindow && project.next_action_date ? mskDayCaption(project.next_action_date) : undefined}
        />
      </div>
```

## ЗАДАЧА 4: раскрытая группа и дедлайн сделки говорят правду

**4.1. `src/components/today/TodayGroups.tsx`, `GroupHeading`, ветка `layout.collapsible`.**

Сейчас у раскрытой «Решить судьбу» счётчик 8, строк под ним 7, а пояснение «одна — в ходах наверху» пропадает (у несворачиваемых групп оно есть). Правило раскрытой группы набрано `text-body`, у остальных групп — `text-xs`.

```tsx
        <span className="min-w-0 flex-1 text-body text-text-dim">
          {layout.collapsed ? collapsedSummary(g) : TODAY_GROUP_RULES[g.key]}
        </span>
```

на:

```tsx
        <span className={cn('min-w-0 flex-1 text-text-dim', layout.collapsed ? 'text-body' : 'text-xs')}>
          {layout.collapsed ? collapsedSummary(g) : TODAY_GROUP_RULES[g.key]}
        </span>
        {!layout.collapsed && g.inMoves > 0 && (
          <span className="shrink-0 text-xs text-text-mute">{inMovesText(g.inMoves)}</span>
        )}
```

**4.2. Дедлайн сделки: год и время.**

На экране «Дедлайн сделки · 14 авг» у сделки с дедлайном 14.08.2027 читается как прошедший; «Дедлайн сделки · 30 сент» у прошедшего дедлайна читается как будущий.

В `src/lib/utils/today-text.ts` добавить:

```ts
/**
 * «Дедлайн сделки · 14 авг 2027» / «Дедлайн сделки был 30 сент».
 * Год печатается, когда он не текущий: дата без года читается как этот год.
 */
export function deadlineText(key: string, todayKey: string): string {
  const day = key.slice(0, 10);
  const year = day.slice(0, 4) !== todayKey.slice(0, 4) ? ` ${day.slice(0, 4)}` : '';
  return day < todayKey
    ? `Дедлайн сделки был ${dayText(day)}${year}`
    : `Дедлайн сделки · ${dayText(day)}${year}`;
}
```

В `src/components/today/TodayDealPanel.tsx`:

```tsx
            {project.deadline && <p>Дедлайн сделки · {dayText(project.deadline)}</p>}
```

на:

```tsx
            {project.deadline && <p>{deadlineText(project.deadline, localDateKey(now))}</p>}
```

Импорты: `deadlineText` — из `@/lib/utils/today-text`, `localDateKey` — из `@/lib/utils/date-helpers`.

## ЗАДАЧА 5: текстовые кнопки — высота 28 px, как у `Button size="sm"`

Замер: «Подробнее» и «Отложить» на карточке — 24 px, «Готово» в панели — 22 px, `Button size="sm"` рядом — 28 px.

- `TodayMoveCard.tsx`, кнопки «Подробнее»/«Свернуть» и «Отложить»: в `className` заменить `py-1` на `inline-flex min-h-7 items-center`.
- `TodayDealPanel.tsx`, кнопки «Готово» и «Выполнен»: в `className` заменить `py-0.5` на `inline-flex min-h-7 items-center`.

Других кнопок не трогать.

## ТЕСТЫ

Новый файл `tests/unit/today-text.test.ts`. `today-text.ts` — логика в `src/lib/` с ветвлением, тестов к ней в спринте не было.

Вид для тестов собирается руками (минимальный `TodayDealView`), без `buildTodayModel`: проверяются слова, не модель.

- `dayText('2026-09-30')` → `30 сент`; `dayWeekdayText('2026-10-09')` → `пт 9 окт` (без запятой).
- `dueText`: просрочка 4 дня, срок 30.09 → `{ label: 'срок 30 сент', days: '4 дн.' }`; шаг впереди на 09.10 → `{ label: 'шаг пт 9 окт', days: null }`; шага нет → `{ label: 'шага нет', days: null }`.
- `afterText` по каждому виду: `silence_after_due` → `после срока тишина`; `touched_after_due`, 30.09, `stage` → `после срока: 30 сент — смена стадии`; `silence_since`, 17.09 → `тишина с 17 сент`; `no_touches` при `wholeLife` → `касаний не было`, иначе → `давно без касаний`; `last_touch`, 02.10, `note` → `касание 2 окт — заметка`; `signals` → текст `signalsText`; `planned` → текст `plannedText`.
- `signalsText`: КП истекло 18.09 и задача с 15.09 → `КП истекло 18 сент · задача с 15 сент`; звонок с 01.10 → `звонок с 1 окт`.
- `plannedText`: встреча 08.10 в 14:00 → `встреча 8 окт, 14:00`; звонок 05.10 без времени → `звонок 5 окт`.
- `moveWhy`: слот `fresh`, просрочка 4 дня, 6 переносов → `lead` `Свежий срыв.`, `due.days` `4 дн.`, в `facts` есть стадия и `перенесён 6 раз`, нет `после срока тишина`; 1 перенос → в `facts` нет слова `перенесён`; слот `biggest`, группа `decide`, `silence_since` 17.09 → `due.days` `null`, в `facts` есть `тишина с 17 сент`; слот `assigned` со временем `11:00` → `due` `null`, первый факт `11:00`.
- `inMovesText`: 1 → `одна — в ходах наверху`; 2 → `две — в ходах наверху`; 3 → `3 — в ходах наверху`.
- `namesText`: пять имён → все через запятую; семь → пять имён и ` и ещё 2`.
- `planItemText`: шаг впереди на 05.10 → `Имя — пн 5 окт`; шага нет, встреча 08.10 в 14:00 → `Имя — чт 8 окт, 14:00`.
- `deadlineText`: `('2027-08-14', '2026-10-04')` → `Дедлайн сделки · 14 авг 2027`; `('2026-09-30', '2026-10-04')` → `Дедлайн сделки был 30 сент`; `('2026-12-01', '2026-10-04')` → `Дедлайн сделки · 1 дек`; дедлайн сегодня → без слова `был`.

```bash
npx vitest run tests/unit/today-text.test.ts 2>&1 | tail -10
```

Смоки в браузере (тема владельца не меняется, записи в живые сделки нет):

1. DevTools → Network → заблокировать запросы с `quotes` в адресе → обновить `/`. Ожидание: блок «Не удалось загрузить сделки» с кнопкой «Повторить», скелетона нет. Снять блокировку → «Повторить» → экран построен.
2. Окно 1280 → у каждой карточки хода строка «почему здесь» видна целиком, у третьей виден хвост «перенесён 4 раза». Три карточки одной высоты, ряд кнопок на одной линии.
3. Карточка любой сделки → «Пульс · 30 дней»: строки «Дни без активности» нет, полоса из 30 капсул на месте.
4. Раскрыть «Решить судьбу» → справа в заголовке «одна — в ходах наверху»; правило группы того же кегля, что у «Сорвано недавно».
5. «Подробнее» у «ЭЙЧ ЭНД ЭН» → «Дедлайн сделки · 14 авг 2027». Раскрыть «Глорус-норд» → «Дедлайн сделки был 30 сент».
6. Высота кнопок «Подробнее», «Отложить», «Готово» — 28 px (DevTools → Computed).

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
git diff --stat HEAD
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, предупреждений не больше 33.
2. `vitest` — 153 файла, всё зелёное; прежние 2573 теста не изменились.
3. `audit-tokens` — без новых находок.
4. `git diff --stat HEAD` — `TodayView.tsx`, `TodayMoveCard.tsx`, `TodayGroups.tsx`, `TodayDealPanel.tsx`, `DealPulseCard.tsx`, `today-text.ts`, `tests/unit/today-text.test.ts`.

`npm run build` не запускать, если работает `next dev`: владелец держит dev-сервер для просмотра экрана на гейте. Напиши это в «Не сделано».

## ЧЕГО В ЭТОМ ФИКСЕ НЕТ

- Правок домена, хуков, `globals.css`, фикстуры и существующих тестов.
- Фильтра ленты в панели (правки полей в списке «Было») — отдельное решение владельца.

## КОММИТ

```bash
git add src/components/today/TodayView.tsx src/components/today/TodayMoveCard.tsx src/components/today/TodayGroups.tsx src/components/today/TodayDealPanel.tsx src/components/projects/DealPulseCard.tsx src/lib/utils/today-text.ts tests/unit/today-text.test.ts _analysis/fix-S-TODAY-V3-SCREEN-1.md
git diff --cached --stat
git commit -m "fix(today): находки гейта SCREEN-1 — ошибка загрузки, обрезка, дедлайн, тесты текстов

- TodayView: упавший запрос КП или стадий показывает ошибку и «Повторить», а не вечный скелетон
- TodayMoveCard: «почему здесь» не обрезается — «перенесён N раз» виден на 1280
- TodayGroups: раскрытая сворачиваемая группа показывает «в ходах наверху»
- TodayDealPanel: дедлайн сделки с годом и временем («был»)
- DealPulseCard: убрана подпись, дублировавшая число тишины
- текстовые кнопки — 28 px, как Button sm
- today-text: тесты текстов строк, карточек и итогов

Основание: _analysis/fix-S-TODAY-V3-SCREEN-1.md"
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
