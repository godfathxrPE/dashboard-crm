# Fix S-STAGE-PROFILE-1 — палитра карты воронки: насыщенный цвет только на тонкой разметке

**Ветка:** `feat/stage-profile-1` (коммит `6b8753e`, ещё не влита). Работать в ней, новый коммит поверх.
**Файл лежит в `main`** — читать его из `main`, в ветке его нет: `git show origin/main:_analysis/fix-S-STAGE-PROFILE-1-palette.md`.
**Миграций НЕТ. Запросов НЕТ. Логики НЕТ** — только цвета в `globals.css` и `StageProfile.tsx`.

Превью решения по восьми темам (сейчас / предложение, с контрастом): артефакт «Палитра карты воронки»
от 24.09. Владелец принял палитру 24.09.

---

## Зачем

Приёмка владельца: «цвета на этапах сильно контрастируют, вырви глаз, на всех темах; совершенно
отличается от макета». Токены взяты по спеке верно, ошибка в самой спеке: макет рисовал пересвет
тонкой полоской (факты 1–5 дн. при норме 14–30), а на живых нормах 3–5 дн. пересвет — 2/3 столбика.
Полная насыщенность на такой площади кричит. Замер к фону `--zone-work`:

| Роль | Сейчас | Худший случай |
|---|---|---|
| Прошлый факт `--text` 100% | 9.5–15.8:1 | чёрные плиты в светлых, почти белые (13.5–13.9) в frost/aurora |
| Пересвет прошлой `--yellow` 100% | до 12.2:1 | ярко-жёлтый блок в aurora/frost — светлее всего экрана |
| «Следующая» залита `--surface` | — | белый прямоугольник на тонированной зоне (в макете под картой была белая карточка) |

## Правило

Насыщенный цвет — **только на тонкой разметке** (линия нормы, линия «сегодня», числа над
столбиками, контур текущей). Площадь — приглушённая. Иерархия: текущая стадия — самая сильная,
прошлое — второй план. Значение продублировано числом над столбиком, заливка — вспомогательная графика.

---

## РАЗВЕДКА

```bash
git --no-pager branch --show-current                     # feat/stage-profile-1
git --no-pager log --oneline -1                          # 6b8753e
grep -n "profile-norm" src/app/globals.css               # блок --profile-norm (после :root)
grep -n "TONE_COLOR\|var(--text)\|var(--yellow)\|var(--red)\|var(--surface)\|bg-text-main\|bg-yellow" src/components/shared/StageProfile.tsx
```

Ожидание: `--profile-norm` объявлен в `:root` и переопределён для `.t-washi, .t-tidal`;
в `StageProfile.tsx` заливки факта `var(--text)`, пересвет `var(--yellow)`/`var(--red)`,
у «следующей» `background: var(--surface)`, легенда `bg-text-main` / `bg-yellow`.

## ЗАДАЧА 1 — токены заливок в `globals.css`

Сразу ПОСЛЕ блока `--profile-norm` (он стоит после `:root`, порядок в файле решает — см.
комментарий над ним):

```css
/* Fix S-STAGE-PROFILE-1: заливки карты воронки. Насыщенный цвет — только на тонкой
   разметке (норма, «сегодня», числа); площадь приглушена альфой поверх зоны.
   Замер к --zone-work: прошлый факт ≥3:1 во всех 8 темах; пересвет текущей
   заметнее пересвета прошлой; текущая «в норме» (--mark-today) не тронута. */
:root {
  --profile-fact:      color-mix(in srgb, var(--text)   55%, transparent);
  --profile-over-past: color-mix(in srgb, var(--yellow) 55%, transparent);
  --profile-over-now:  color-mix(in srgb, var(--red)    70%, transparent);
}
/* Тёмные темы: --text почти белый, --yellow яркий — та же роль при меньшей альфе. */
.t-tidal, .t-frost, .t-aurora {
  --profile-fact:      color-mix(in srgb, var(--text)   42%, transparent);
  --profile-over-past: color-mix(in srgb, var(--yellow) 42%, transparent);
  --profile-over-now:  color-mix(in srgb, var(--red)    60%, transparent);
}
/* washi/fuji: --yellow бледный (#D4993A / #C4AA78), тинт 55% к зоне 1.22–1.38:1 —
   не виден. База — --yellow-text: 1.9–2.1:1. */
.t-washi, .t-fuji {
  --profile-over-past: color-mix(in srgb, var(--yellow-text) 55%, transparent);
}
```

Проверка: `grep -n "profile-fact\|profile-over" src/app/globals.css` — 3 блока, 8 объявлений.

## ЗАДАЧА 2 — `StageProfile.tsx`: заливки на токены

Только заливки и легенда. Контуры, линии нормы, «сегодня», числа — **не трогать**: это и есть
тонкая разметка, она остаётся насыщенной.

1. Пересвет текущей: в `fill` ветки `col.kind === 'current'`, `t === 'over'` —
   `var(--red)` → `var(--profile-over-now)`. Нижняя часть (`var(--mark-today)`) — без изменений.
2. `warn` текущей: градиент `var(--yellow), var(--mark-today)` → `var(--profile-over-past), var(--mark-today)`.
3. Прошлая с пересветом: `linear-gradient(180deg, var(--yellow) 0 ${top}, var(--text) ${top})` →
   `var(--profile-over-past)` сверху, `var(--profile-fact)` снизу.
4. Прошлая без пересвета: `background: 'var(--text)'` → `'var(--profile-fact)'`.
5. «Следующая»: у элемента контура убрать `background: col.kind === 'next' ? 'var(--surface)' : undefined` —
   контур без заливки. Контур `var(--text)` остаётся.
6. Легенда: свотч «факт» `bg-text-main` → `style={{ background: 'var(--profile-fact)' }}`;
   «сверх нормы» `bg-yellow` → `style={{ background: 'var(--profile-over-past)' }}`.

Не трогать: `TONE_COLOR` (контур текущей), `TONE_TEXT` (числа), контур пересвета прошлой
`borderColor: 'var(--yellow)'` (линия нормы), `opacity-30` у `historic`, `muted` (`--text-dim`).

Проверка:
```bash
grep -n "var(--text)'\|var(--yellow) 0\|var(--red) 0\|'var(--surface)'\|bg-text-main\|bg-yellow" src/components/shared/StageProfile.tsx
```
Ожидание: остаются только контур «следующей» (`borderColor: 'var(--text)'`) и `bg-text-main` линии
«сегодня» — больше ни одного совпадения.

## ТЕСТЫ

Тестов нет: правка только цветов разметки, `buildStageProfile` не меняется
(`tests/unit/stage-profile.test.ts` должен пройти без правок).

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint 2>&1 | tail -3 && npx vitest run 2>&1 | tail -3
python3 scripts/audit-contrast.py 2>&1 | grep -E "^=== " | grep -v " 0 FAIL"   # ровно 3 строки: frost/aurora/tidal nav-active
python3 scripts/audit-tokens.py 2>&1 | tail -2
```

Приёмка глазами (ТОЛЬКО просмотр, ничего не записывать): «Глорус-норд» и «ЭЙЧ ЭНД ЭН» в восьми
темах. Критерий: самое заметное на карте — текущая стадия; пересвет прошлой читается как
жёлтый тинт над серым, а не как блок; «Документы» (следующая) — пустой контур; в frost/aurora
нет белых и ярко-жёлтых плит.

## КОММИТ

```
fix(deals): карта воронки — насыщенный цвет только на тонкой разметке

- заливки на токенах --profile-fact / --profile-over-past / --profile-over-now:
  прошлое приглушено, текущая «в норме» (--mark-today) без изменений
- тёмные темы — меньшая альфа; washi/fuji — пересвет от --yellow-text (бледный жёлтый не виден)
- «следующая» без заливки: --surface давал белый прямоугольник на тонированной зоне
- контуры, линия нормы, «сегодня» и числа не тронуты — это разметка, она остаётся яркой
```

**Не мержить.** Отчёт — на гейт.
