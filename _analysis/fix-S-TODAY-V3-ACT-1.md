# Claude Code Prompt — fix S-TODAY-V3-ACT-1: находки гейта

**Ветка:** `feat/today-v3-act` — та же, вторым коммитом. PR ещё не открыт.
**Основание:** гейт ACT-1 от 04.10.2026: дифф, сверка тестовой сделки в БД, живой экран (`localhost:3000`, тема `t-minimal`, ширина контента 1394 и 994 px). Миграций нет.

## РАЗВЕДКА

```bash
git branch --show-current
git status --short src tests
git log --oneline main..HEAD
grep -n "containerRef: queueRef," src/components/today/TodayView.tsx
grep -n "шаги записаны в сделки" src/components/today/TodayMoves.tsx
grep -n "{extra}" src/components/today/TodayStepActions.tsx
grep -n "actions.closeLink &&" src/components/today/TodayStepActions.tsx
grep -n "'Подробнее'" src/components/today/TodayMoveCard.tsx
grep -n "export function validateStepInput" src/lib/domain/step-flow.ts
grep -n "const MONTHS" src/lib/domain/step-dates.ts
grep -n "D — сделано" src/components/today/TodayView.tsx
```

Ожидание: ветка `feat/today-v3-act`, один коммит `f04ccaa` сверх `main`, рабочее дерево по `src` и `tests` чистое, каждый `grep` даёт ровно одну строку. Иначе — стоп и вопрос в чат.

## ЗАДАЧА 1: клавиши экрана молчат, пока открыта форма хода

Файл `src/components/today/TodayView.tsx`.

Воспроизведено на живом экране: `J` → `T` открывает форму «Перенести», фокус на кнопке «Пн 5 окт». `Enter` дату не выбирает (`aria-pressed` остаётся `false`), а раскрывает панель под карточками: обработчик `useKeyboardNav` ловит `Enter` на `window` и зовёт `preventDefault`. У строки группы тот же `Enter` закрывает панель вместе с формой. `S` при фокусе на любой кнопке формы откладывает сделку — это запись в `queue_snoozes`. `isInputFocused` в хуке знает только `input`, `textarea`, `select`.

До ACT-1 эту роль играл `isActive: () => !modalOpen`; вместе с `ProjectModal` он ушёл. Вернуть для формы:

```tsx
    containerRef: queueRef,
    enabled: mounted && queue.length > 0,
```

на:

```tsx
    // Форма хода открыта — клавиши экрана молчат: иначе Enter на кнопке даты раскрывает
    // панель вместо выбора даты, а S откладывает сделку посреди ввода.
    isActive: () => composer === null,
    containerRef: queueRef,
    enabled: mounted && queue.length > 0,
```

`Escape` формы работает сам — у неё свой `onKeyDown`. Хук `use-keyboard-nav.ts` не менять.

## ЗАДАЧА 2: когда все ходы сделаны, «Вернуть» остаётся

Файл `src/components/today/TodayMoves.tsx`, ветка `allDone`.

Сейчас после записи последнего хода карточки сворачиваются в строку, и «Вернуть» пропадает у всех ходов сразу — в тот момент, когда ошибку в последней записи только что заметили.

```tsx
            <p className="text-xs text-text-dim">
              {moves.map((v) => v.source.name).join(', ')} — шаги записаны в сделки
            </p>
```

на:

```tsx
            <ul className="mt-1 space-y-0.5">
              {moves.map((v) => {
                const done = doneOf(v);
                return (
                  <li key={v.source.id} className="flex flex-wrap items-center gap-x-1.5 text-xs text-text-dim">
                    <span className="font-medium text-text-main">{v.source.name}</span>
                    <span>— {done?.text ?? 'шаг записан'}</span>
                    {done?.onRestore && (
                      <button
                        type="button"
                        disabled={done.restoring}
                        onClick={done.onRestore}
                        className="inline-flex min-h-7 items-center rounded px-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main disabled:opacity-50"
                      >
                        Вернуть
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
```

«Вернуть» снимает отметку — набор перестаёт быть сделанным целиком, и карточки возвращаются сами.

## ЗАДАЧА 3: ряд действий карточки — в одну линию на 1280

Замер на живом экране при ширине контента 994 px: внутри карточки 291 px, кнопки «Сделано» 67 + «Перенести» 76 + «Подробнее» 78 + «Отложить» 70 = 291 px плюс зазоры — ряд переносится в две линии у двух карточек из трёх, карточки выросли со 178 до 210 px. У третьей карточки ссылка «Закрыть сделку — в карточке» стоит под рядом, и её кнопки на 21 px выше соседних.

**3.1. `src/components/today/TodayMoveCard.tsx`** — «Подробнее» становится кнопкой-шевроном (как раскрытие строки в списке). В `toggle`:

```tsx
          className="inline-flex min-h-7 items-center whitespace-nowrap rounded px-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
        >
          {expanded ? 'Свернуть' : 'Подробнее'}
        </button>
```

на:

```tsx
          aria-label={expanded ? 'Свернуть' : 'Подробнее'}
          title={expanded ? 'Свернуть' : 'Подробнее'}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
        >
          <ChevronDown size={14} aria-hidden="true" className={cn('transition-transform', expanded && 'rotate-180')} />
        </button>
```

`ChevronDown` — из `lucide-react`. `aria-expanded` остаётся.

**3.2. `src/components/today/TodayStepActions.tsx`** — шеврон встаёт последним в ряду, после «Отложить»; ссылка закрытия — над рядом, чтобы ряды кнопок трёх карточек стояли на одной линии.

- `{extra}` перенести: сейчас он перед кнопкой «Отложить» — поставить после неё. `ml-auto` остаётся у «Отложить».
- Блок `{actions.closeLink && (<Link …>Закрыть сделку — в карточке</Link>)}` перенести выше ряда кнопок; класс ссылки: `mt-1 inline-block` → `mb-1.5 inline-block`.

Проверка в браузере: смок 3 ниже.

## ЗАДАЧА 4: форма не пишет дату в прошлом и честно говорит о частичной записи

**4.1. `src/lib/domain/step-flow.ts`.**

`validateStepInput` получает день «сегодня» и прежние значения:

```ts
export type StepInputError = 'no_step' | 'no_date' | 'past_date' | 'same_date';

/** Проверка ввода формы; `null` — ошибок нет. Порядок: шаг, дата, дата в прошлом, та же дата. */
export function validateStepInput(mode: StepMode, input: StepInput, todayKey: string, prev: StepPrev): StepInputError | null {
  if (mode !== 'move' && !input.nextStep.trim()) return 'no_step';
  if (!input.dateKey) return 'no_date';
  // Следующий шаг в прошлом — сделка сразу просрочена; `<input type="date">` это позволяет.
  if (input.dateKey < todayKey) return 'past_date';
  // Перенос на ту же дату — пустая запись, а экран обещал бы «перенесён N+1 раз».
  if (mode === 'move' && input.dateKey === prev.next_action_date?.slice(0, 10)) return 'same_date';
  return null;
}
```

Новая функция там же:

```ts
/**
 * Прежний шаг уже снят, а план не дописан: запись `{ null, null }` стоит раньше
 * упавшего шага `from`. Форма обязана сказать об этом — иначе «Отмена» оставит
 * сделку без шага, и пользователь об этом не узнает.
 */
export function stepAlreadyCleared(writes: readonly StepWrite[], from: number): boolean {
  return writes.some(
    (w, i) => i < from && w.kind === 'project' && w.next_step === null && w.next_action_date === null,
  );
}
```

**4.2. `src/components/today/TodayStepComposer.tsx`.**

- `const [todayKey] = useState(() => localDateKey(new Date()));` — рядом с `dates`; импорт `localDateKey` из `@/lib/utils/date-helpers`.
- `const problem = validateStepInput(mode, input, todayKey, prev);` и `const invalid = problem !== null;` вместо нынешней строки `invalid`.
- У `<input type="date">` добавить `min={todayKey}`.
- Под рядом дат, после цены переноса, строка причины — только для двух новых ошибок:

```tsx
        {(problem === 'past_date' || problem === 'same_date') && (
          <p className="mt-1.5 text-xs text-text-dim">
            {problem === 'past_date' ? 'Дата шага раньше сегодняшнего дня' : 'Шаг уже стоит на эту дату'}
          </p>
        )}
```

- Текст ошибки записи — по `stepAlreadyCleared(failure.writes, failure.from)`:
  - `true` → `Прежний шаг по «{source.name}» снят, новый не записан. Нажми «Повторить» — иначе сделка останется без шага.`
  - `false` → нынешний текст без изменений.

## ЗАДАЧА 5: тексты

**5.1. `src/lib/domain/step-dates.ts`** — месяц быстрой даты той же записью, что у остальных дат экрана. Сейчас свой массив `MONTHS` даёт «сен», «ноя», «фев», а `mskDayCaption` рядом печатает «сент», «нояб», «февр».

Массив `MONTHS` удалить. Подпись:

```ts
    return { key, label: showMonth ? `${WEEKDAYS[weekday(key)]} ${mskDayCaption(key)}` : `${WEEKDAYS[weekday(key)]} ${day}` };
```

Импорт `mskDayCaption` из `@/lib/utils/date-helpers`. Переменная `month` больше не нужна.

**5.2. `src/components/today/TodayView.tsx`** — в строке подсказки клавиш `D — сделано` → `D — главное действие`: по таблице хода `D` бывает «Сделано», «Обновить шаг», «Вернуть в работу» и «Назначить шаг».

## ТЕСТЫ

**`tests/unit/step-flow.test.ts`**

- Существующие вызовы `validateStepInput` получают третий и четвёртый аргумент; ожидания прежних кейсов не меняются.
- `done`, дата вчера → `past_date`; дата сегодня → `null`.
- `move`, дата равна прежней дате шага → `same_date`; прежняя дата пришла таймстампом `2026-10-08T00:00:00+00:00` и совпала по дню → `same_date`; дата позже → `null`.
- Порядок: `done` без текста и с датой в прошлом → `no_step`.
- `stepAlreadyCleared`: план `done` с заметкой (`note`, снять, назначить): `from = 0` → `false`; `from = 1` → `false`; `from = 2` → `true`. План `move`, `from = 0` → `false`. План «Оставить без шага», упал на снятии → `false`.

**`tests/unit/step-dates.test.ts`**

- Ожидания ноября: `Пн 2 ноя` → `Пн 2 нояб` (два кейса).
- Новый кейс: пятница 28.08.2026 → `Пн 31 авг`, `Вт 1 сент`, `Ср 2`, `Пн 7`.

```bash
npx vitest run tests/unit/step-flow.test.ts tests/unit/step-dates.test.ts 2>&1 | tail -10
```

Смоки в браузере — только без записи в живые сделки; запись — на тестовой сделке «Тест · смок ACT-1»:

1. `J` → `T` → `Enter` на «Пн …»: дата выбрана (кнопка нажата, поле даты заполнено), панель под карточками не раскрылась. `Esc` закрывает форму.
2. Форма открыта, фокус на кнопке «Отмена», `S` → сделка не отложена, блок «Отложено» не появился.
3. Ширина окна 1280: у всех трёх карточек ряд действий в одну линию, шеврон последним; ряды кнопок трёх карточек на одной высоте; у «ЭЙЧ ЭНД ЭН» ссылка закрытия над рядом.
4. Форма «Сделано», в поле даты руками вчерашний день → кнопка записи выключена, под датами «Дата шага раньше сегодняшнего дня».
5. Тестовая сделка: «Перенести», выбрать её же текущую дату → кнопка выключена, «Шаг уже стоит на эту дату».
6. Все ходы набора сделаны (как в смоке 10 спринта, через `localStorage` своего браузера) → в свёрнутом блоке строка на каждый ход; у хода с итогом в памяти — «Вернуть».

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
2. `vitest` — всё зелёное; прежние 2637 тестов на месте, кроме двух ожиданий ноября.
3. `audit-tokens` — без новых находок.
4. `git diff --stat HEAD` — `TodayView.tsx`, `TodayMoves.tsx`, `TodayMoveCard.tsx`, `TodayStepActions.tsx`, `TodayStepComposer.tsx`, `step-flow.ts`, `step-dates.ts`, два тест-файла.

`npm run build` не запускать, если работает `next dev`: владелец держит dev-сервер для просмотра экрана на гейте. Напиши это в «Не сделано».

## ЧЕГО В ЭТОМ ФИКСЕ НЕТ

- Правок `use-keyboard-nav.ts`, `use-step-flow.ts`, `day-moves.ts`, `today-model.ts`.
- Отката записи при ошибке: порядок «заметка → снять → назначить» остаётся, меняется только текст ошибки.
- Высоты карточек при открытой форме.

## КОММИТ

```bash
git add src/components/today/TodayView.tsx src/components/today/TodayMoves.tsx src/components/today/TodayMoveCard.tsx src/components/today/TodayStepActions.tsx src/components/today/TodayStepComposer.tsx src/lib/domain/step-flow.ts src/lib/domain/step-dates.ts tests/unit/step-flow.test.ts tests/unit/step-dates.test.ts _analysis/fix-S-TODAY-V3-ACT-1.md
git diff --cached --stat
git commit -m "fix(today): находки гейта ACT-1 — клавиши при открытой форме, «Вернуть», ряд действий

- TodayView: клавиши экрана молчат, пока открыта форма хода (Enter на кнопке даты раскрывал панель, S откладывал сделку)
- TodayMoves: в свёрнутом блоке «все ходы сделаны» у каждого хода остаётся «Вернуть»
- карточка хода: «Подробнее» — шеврон, ряд действий в одну линию на 1280; ссылка закрытия над рядом
- форма: дата в прошлом и перенос на ту же дату не пишутся; ошибка говорит, что прежний шаг уже снят
- быстрые даты: месяц той же записью, что у остальных дат экрана

Основание: _analysis/fix-S-TODAY-V3-ACT-1.md"
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
