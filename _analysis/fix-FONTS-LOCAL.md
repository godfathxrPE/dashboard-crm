# Фикс FONTS-LOCAL — шрифты из `@fontsource-variable/*` вместо `next/font/google`

**15.10.2026.** Пункт «Очереди» STATUS — **fix-FONTS-LOCAL** (бывшие D-1 и fix-FONT-UNBOUNDED). Решение владельца 15.10: пакеты `@fontsource-variable/*`, не свои файлы. **Ветка:** `fix/fonts-local` от свежего `origin/main` **после мержа chore-S-DEBT-1** (оба спринта правят `globals.css`, в разных местах), worktree — по `worktree-isolation`. **Миграций нет.** Без push.
Этот файл лежит в основном чекауте (`~/Downloads/dashboard-crm/_analysis/fix-FONTS-LOCAL.md`, untracked) — скопировать в `_analysis/` worktree и закоммитить вместе с правками (страж, правило `sprint-file`).

## Зачем

`src/app/layout.tsx` грузит все пять шрифтов из `next/font/google` (Manrope, IBM Plex Sans, Onest, Unbounded, Inter). На сборке Next ходит в Google Fonts, и сборка на Vercel падает случайно: прод-деплой docs-PR #110 (`TypeError … reading '1'`, `loader.js:122`), превью #147 (`Cannot read properties of null`). Повторы у загрузчика есть (`fetch-css-from-google-fonts.js` в Next 15.5.14 зовёт `retry`) — и не спасают. Required-чек `checks` при этом зелёный: сборки в CI нет.

Почему не `next/font/local`: пакеты шрифтов режут файлы по наборам символов (latin, cyrillic, …) и связывают их через `unicode-range`, а `next/font/local` его не поддерживает. Fontsource подключается CSS-импортом: файлы лежат в `node_modules`, Next кладёт их в `.next/static/media`, браузер качает только нужные наборы.

Цена решения (принята владельцем): нет preload и подгонки метрик запасного шрифта — на первой загрузке возможен короткий сдвиг текста при подмене шрифта.

## Что НЕ меняется

- Имена переменных `--font-manrope`, `--font-plex`, `--font-onest`, `--font-unbounded`, `--font-inter` и все их потребители: `globals.css` (`--font-app` в темах, заголовок Unbounded ~стр. 1448), `src/components/analytics/Charts.tsx` (`var(--font-unbounded, …)`), `tailwind.config.ts` (`sans: ['var(--font-app)', …]`).
- Класс `t-cobalt` на `<html>`, FOUC-гард темы, `suppressHydrationWarning`.
- Веса в UI: вариативные шрифты покрывают все прежние (Plex 400/500/600 → 100–700, Onest 400–700 → 100–900, Unbounded 400/700 → 200–900, Inter 400–700 → 100–900, Manrope — 200–800).
- Зависимость `geist` в `package.json` — не трогать в этом спринте (строкой в «Вопросы и риски», если она без потребителей).

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -3
grep -rn "next/font" src
grep -rn "font-manrope\|font-plex\|font-onest\|font-unbounded\|font-inter" src tailwind.config.ts | grep -v "^src/app/layout.tsx"
grep -n "Шрифт приложения: темы переопределяют --font-app" src/app/globals.css
grep -n "@fontsource" package.json
```

Ожидание:
- в `log` есть коммит закрытия chore-S-DEBT-1 (иначе — стоп, сначала мерж S-DEBT-1);
- `next/font` — только `src/app/layout.tsx`;
- потребители переменных — только `var(--font-*, …)` в `globals.css` (~102, 291, 526, 793, 861, 1448) и `Charts.tsx` (~146, 156); объявлений `--font-*:` в CSS нет;
- комментарий `--font-app` — один, в блоке `:root` (~стр. 99);
- `@fontsource` в `package.json` нет.

Расхождение — остановиться и записать в «Вопросы и риски».

## ЗАДАЧА 1 — зависимости

```bash
npm install --save-exact @fontsource-variable/manrope@5.3.0 @fontsource-variable/ibm-plex-sans@5.3.0 @fontsource-variable/onest@5.3.1 @fontsource-variable/unbounded@5.3.0 @fontsource-variable/inter@5.3.0
```

**Проверка:**
```bash
grep -n "@fontsource-variable" package.json
for p in manrope ibm-plex-sans onest unbounded inter; do grep -m1 "font-family" node_modules/@fontsource-variable/$p/wght.css; done
```
Ожидание: пять строк в `dependencies` с точными версиями; семейства — `'Manrope Variable'`, `'IBM Plex Sans Variable'`, `'Onest Variable'`, `'Unbounded Variable'`, `'Inter Variable'`. Другое имя — записать, в задаче 3 взять фактическое.

## ЗАДАЧА 2 — `layout.tsx` без `next/font/google`

`src/app/layout.tsx`:

1. Удалить `import { Manrope, IBM_Plex_Sans, Onest, Unbounded, Inter } from 'next/font/google';` и пять вызовов (`const manrope = Manrope({…})` … `const inter = Inter({…})`) вместе с их комментариями.
2. На место импорта — пять CSS-импортов **до** `import './globals.css';` и комментарий над ними:
   ```tsx
   // fix-FONTS-LOCAL: шрифты из пакетов, без обращения к Google Fonts на сборке
   // (next/font/google ронял деплой Vercel: #110, #147). Переменные --font-* —
   // в globals.css, :root. Веса не перечисляются: файлы вариативные (wght).
   import '@fontsource-variable/manrope/wght.css';
   import '@fontsource-variable/ibm-plex-sans/wght.css';
   import '@fontsource-variable/onest/wght.css';
   import '@fontsource-variable/unbounded/wght.css';
   import '@fontsource-variable/inter/wght.css';
   ```
3. `<html className={`t-cobalt ${manrope.variable} ${plexSans.variable} ${onest.variable} ${unbounded.variable} ${inter.variable}`}` → `<html className="t-cobalt"`. Остальные атрибуты и FOUC-гард — без изменений.

**Проверка:**
```bash
grep -rn "next/font" src
npx tsc --noEmit
```
Ожидание: `grep` пусто; tsc — 0 ошибок.

## ЗАДАЧА 3 — переменные шрифтов в `globals.css`

В блоке `:root` с палитрой (тот, где `--font-app: var(--font-manrope, 'Manrope');`) — перед комментарием «/* Шрифт приложения: темы переопределяют --font-app, html применяет.» вставить:

```css
  /* fix-FONTS-LOCAL: семейства из @fontsource-variable/* (импорт wght.css в layout.tsx).
     До 15.10 эти переменные ставил next/font/google классом на <html>. */
  --font-manrope: 'Manrope Variable';
  --font-plex: 'IBM Plex Sans Variable';
  --font-onest: 'Onest Variable';
  --font-unbounded: 'Unbounded Variable';
  --font-inter: 'Inter Variable';
```

Потребителей (`var(--font-*, '…')`) не трогать — их фолбэки остаются как были.

**Проверка:**
```bash
grep -n "^  --font-\(manrope\|plex\|onest\|unbounded\|inter\):" src/app/globals.css
```
Ожидание: пять строк, все в одном блоке `:root`.

## ЗАДАЧА 4 — сборка без Google

```bash
npm run build 2>&1 | tail -15
grep -rl "fonts.gstatic\|fonts.googleapis" .next/static .next/server 2>/dev/null | head
ls .next/static/media | grep -c "\.woff2$"
grep -rl "Inter Variable" .next/static/css | head -2
```

Ожидание: build exit 0; `grep` по `gstatic|googleapis` — пусто; `woff2` в `media` — больше нуля (порядка 30: пять семейств × наборы символов); `Inter Variable` найден в CSS сборки.

Глазами (dev-сервер, тема **minimal** — рабочая тема владельца, затем aura): `npm run dev`, открыть `/`, в DevTools → Computed у `body` или любого текста — `font-family` начинается с `"Inter Variable"` (minimal) / `"Onest Variable"` (aura); заголовок страницы в aura — `"Unbounded Variable"`. Вкладка Network при загрузке страницы — ни одного запроса к `fonts.gstatic.com`. Если глазами проверить нечем — строкой в «Не сделано», гейт проверит на проде.

---

## ТЕСТЫ

Тестов нет: смена способа подключения шрифтов (зависимости, импорты, CSS-переменные), логики в `src/lib/` нет. Регресс ловят `tsc`, `grep` и сборка задачи 4.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -6
grep -rn "next/font" src
git --no-pager log --oneline origin/main..HEAD
git --no-pager diff --stat origin/main...HEAD
```

Ожидание: tsc и lint — 0 ошибок; vitest — столько же тестов, сколько на `main`, все passed; `grep` пусто; один коммит; в `--stat` — `_analysis/fix-FONTS-LOCAL.md`, `package.json`, `package-lock.json`, `src/app/layout.tsx`, `src/app/globals.css`.

## КОММИТ

`git add` и `git commit` — двумя отдельными вызовами Bash (страж oleg-guard, правило C2). Без push.

```
git add _analysis/fix-FONTS-LOCAL.md package.json package-lock.json src/app/layout.tsx src/app/globals.css
```

```
git commit -m "fix(fonts): шрифты из @fontsource-variable вместо next/font/google — сборка без Google Fonts (fix-FONTS-LOCAL)"
```

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил импорт», не «импорт был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, пакета, переменной.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд.
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · N тестов passed · build exit 0 · 0 совпадений gstatic · N woff2).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».
