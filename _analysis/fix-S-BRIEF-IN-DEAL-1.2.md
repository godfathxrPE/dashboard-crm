# Фикс S-BRIEF-IN-DEAL-1.2 — ссылка новости, текст очереди у устаревшего брифа, дата новости

**04.10.2026.** **Ветка:** `feat/brief-in-deal-1` (worktree `.claude/worktrees/feat+brief-in-deal-1`), поверх `326589b`. PR #170 открыт; пушит владелец — **без push**. **Миграций нет.** Этот файл лежит в `_analysis/` worktree — закоммитить вместе с правками.
**Откуда находки:** гейт (`claude/gate-S-BRIEF-IN-DEAL-1.2.md` в проекте Claude) и Grok cold review — `_analysis/cold-review-feat-brief-in-deal-1.md` в основном чекауте (78/100, FIX). Сборка уже подтверждена превью Vercel (`326589b`, READY).

## Что НЕ меняется

- Всё остальное в 1.2: кнопка, панель, восемь состояний, хранилище, хук, место в `DealNextStep`.
- `CompanyBriefRenderer`, `safeHref`, `dates.ts` — без правок, только переиспользуются.

---

## ЗАДАЧА 1 — ссылкой становится только безопасный адрес (F1)

**Почему.** В `DealBriefPanel.tsx` новость рендерится как `<a href={news.url}>` — адрес из ответа модели как есть. React 19 гасит только `javascript:`; `data:`, `ftp:` и прочее станут кликабельной ссылкой. В проекте для этого есть `safeHref` (`src/lib/utils/safe-href.ts`), им же фильтрует ссылки `CompanyBriefRenderer`.

**Что сделать.**
- В `src/lib/domain/company-brief.ts`:
  ```ts
  /** Ссылка новости: только схемы safeHref; host — для подписи. Нет безопасного адреса — null. */
  export function newsLink(url: string | null | undefined): { href: string; host: string | null } | null;
  ```
  `safeHref(url)` → `undefined` — `null`; иначе `{ href, host: newsHost(href) }`.
- `DealBriefPanel.tsx`: есть `newsLink` — разметка как сейчас (`target="_blank" rel="noopener noreferrer"`, заголовок `truncate`, хост, `ExternalLink` 11); нет — заголовок обычным текстом (`truncate`), без хоста и иконки. Строка «Новость · дата» остаётся.

**Тесты** (`tests/unit/company-brief.test.ts`):
- `https://www.forbes.ru/x` → `href` тот же, `host` — `forbes.ru`;
- `javascript:alert(1)`, `data:text/html,x`, `ftp://files.example/x` → `null`;
- `example.com/n` → `href` `https://example.com/n` (правило `safeHref` для голого домена);
- пустая строка, `null` → `null`.

## ЗАДАЧА 2 — «стоит в очереди автосбора» только при включённом автосборе (F2)

**Почему.** `briefNote` для `stale` добавляет «Обновление стоит в очереди автосбора.» при `auto.reason === 'stale'`. Но кандидаты лимит не фильтруют: при `daily_limit = 0` RPC всё равно отдаёт `reason = 'stale'`, а тик ничего не соберёт — текст врёт. Для `queued` этот случай уже разобран («выключен»).

**Что сделать.** Условие фразы: `auto?.reason === 'stale' && auto.daily_limit > 0`. При исчерпанном за сутки лимите фраза остаётся: обновление стоит в очереди и соберётся на следующий день.

**Тесты:** `stale` + `reason: 'stale'` + `daily_limit: 0` → без фразы про очередь; то же с `daily_limit: 10` → с фразой.

## ЗАДАЧА 3 — дата новости календарная (F3)

**Почему.** `newsDate` в панели делает `new Date('2026-09-20').toLocaleDateString('ru-RU')`: строка без времени парсится как UTC-полночь, и западнее UTC выходит «19.09.2026». Грабля из `learnings.md` («Календарная дата ВЫВОДИТСЯ через `formatCalendarDate`»).

**Что сделать.** Перенести в домен и звать из панели:
```ts
/** «20.09.2026». YYYY-MM-DD — календарная дата; иная разбираемая строка — момент времени. */
export function formatBriefNewsDate(date: string | null | undefined): string;
```
- `/^\d{4}-\d{2}-\d{2}$/` → `formatCalendarDate` (`src/lib/utils/dates.ts`);
- иная строка, которую понимает `Date.parse` → `formatDateNumeric`;
- пусто, `null`, мусор → «без даты».

**Тесты:** `'2026-09-20'` → `'20.09.2026'`, в том числе при `process.env.TZ = 'America/Los_Angeles'` — приём из `tests/unit/formatDate.test.ts`, с восстановлением в `finally`; `null` → «без даты»; `'вчера'` → «без даты».

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -6
grep -n "href={news.url}" src/components/projects/DealBriefPanel.tsx
grep -n "toLocaleDateString" src/components/projects/DealBriefPanel.tsx
```
Оба `grep` — пусто.

## КОММИТ

Явным списком. `git add` и `git commit` — двумя отдельными вызовами Bash (страж oleg-guard, правило C2). Без push.

```
git add _analysis/fix-S-BRIEF-IN-DEAL-1.2.md src/lib/domain/company-brief.ts src/components/projects/DealBriefPanel.tsx tests/unit/company-brief.test.ts
```

```
git commit -m "fix(deals): бриф в шаге сделки — ссылка новости через safeHref, очередь устаревшего при лимите 0, календарная дата новости (S-BRIEF-IN-DEAL-1.2)"
```

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Сущности называй как в коде: имя файла, функции.
- Без оценок: «отлично», «полностью», «успешно» — запрещены. Вместо оценки — артефакт: число, вывод команды, exit code.
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат.

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от фикса
- Где сделал иначе и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».
