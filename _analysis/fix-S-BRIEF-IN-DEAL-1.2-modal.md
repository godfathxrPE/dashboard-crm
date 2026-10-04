# Фикс S-BRIEF-IN-DEAL-1.2 (приёмка) — модалка «Весь бриф» через портал, Esc и фокус, дата новости в полном брифе

**04.10.2026.** **Ветка:** `feat/brief-in-deal-1` (worktree `.claude/worktrees/feat+brief-in-deal-1`), поверх `11602d4`. PR #170; пушит владелец — **без push**. **Миграций нет.** Файл лежит в основном чекауте (`~/Downloads/dashboard-crm/_analysis/fix-S-BRIEF-IN-DEAL-1.2-modal.md`, untracked) — скопировать в `_analysis/` worktree и закоммитить вместе с правками.
**Откуда находки:** визуальная приёмка гейта 04.10 в Chrome на dev-сервере ветки (`localhost:3001`, сделка «Тест · смок ACT-1»). Этот dev-сервер владелец держит запущенным из worktree — **не запускать и не останавливать**, правки он подхватит сам.

## Что НЕ меняется

- `DealBriefPanel`, `DealBriefButton`, домен `company-brief.ts`, хук, стили стекла. Приёмка по ним пройдена: восемь состояний, темы minimal / aura / frost, ширина 1280, фокус-кольцо, Enter / Space.
- Остальная разметка и тексты `AiRunResultModal`.

---

## ЗАДАЧА 1 — модалка прогона рендерится в `document.body` (🔴)

**Почему.** `AiRunResultModal` рисует оверлей `fixed inset-0` там, где её вызвали. `DealBriefPanel` вызывает её внутри `.glass-sheet`. У стекла `backdrop-filter`, а он для `position: fixed` потомков становится containing block: оверлей растягивается по стеклу, не по окну. Правила стекла перекрашивают `text-text-main` в светлый — на `bg-surface` светлой темы заголовок, сводка, значения и зацепки выходят белым по белому. На приёмке видны были только подписи разделов и ссылки; затемнено только стекло, окно вылезает за его края. Другие вызовы (`ProjectDetail`, `ContactDetailHub`, `CompanyAiDigest`, `CompanyDetail`) живут вне стекла — там дефект не проявлялся.

**Что сделать.** В `src/components/ai/AiRunResultModal.tsx` вернуть разметку через `createPortal(…, document.body)` из `react-dom` — как в `PlanImport.tsx` и `ExcelImport.tsx`. Чинить в самой модалке, а не в панели: тогда любая будущая точка вызова не зависит от предков.

Проверить четыре вызова: `run` приходит из состояния, которое ставит клик, при серверном рендере он `null`. Если хоть один вызов может отдать `run` на сервере — гард `mounted`, как в `PeekPanel.tsx`.

## ЗАДАЧА 2 — клавиатура и скринридер (🟡, было до 1.2)

**Почему.** В модалку теперь входят с клавиатуры: «AI-бриф» → Enter → «Весь бриф». Сейчас фокус остаётся под оверлеем, Esc не закрывает, а `aria-hidden="true"` на оверлее прячет от скринридера весь `role="dialog"` — диалог лежит внутри оверлея.

**Что сделать.**
- Снять `aria-hidden="true"` с оверлея.
- Esc закрывает: `keydown` на `window` в фазе capture; на `Escape` — `e.stopPropagation()` и `onClose()`. Модалка — верхний слой, Esc не должен долететь до слушателей `document` под ней.
- Фокус: при открытии — на «Закрыть» (`ref`); при закрытии — обратно на элемент, который был в фокусе до открытия, если он ещё в документе (`isConnected`).
- Зависимость эффектов — `run?.id`, не объект `run`: React Query при рефетче отдаёт новый объект, и фокус прыгал бы.
- Хуки — до `if (!run) return null`.
- Кнопке «Закрыть» — `type="button"`.
- Ловушку фокуса (Tab по кругу) не делаем.

## ЗАДАЧА 3 — дата новости в полном брифе (🟢)

**Почему.** `CompanyBriefRenderer` в «Свежих событиях» выводит `n.date` как есть: в модалке «2026-09-20», в панели того же брифа — «20.09.2026».

**Что сделать.** Выводить через `formatBriefNewsDate(n.date)` из `@/lib/domain/company-brief`; условие `n.date &&` оставить.

---

## ТЕСТЫ

Новый `tests/unit/ai-run-result-modal.test.tsx`. Приём — `tests/unit/company-brief-chz.test.tsx` (`render`, `screen`, `cleanup`, фикстура `brief()`). Фикстура прогона — полный `AiRunRow` (`status: 'done'`, `preset_key: 'company_brief'`, `result` — бриф), без `as any`.
- Рендер внутри `<div className="glass-sheet">`: `screen.getByRole('dialog')` находит диалог, а `container.querySelector('[role="dialog"]')` → `null` (портал). `getByRole` заодно ловит возврат `aria-hidden`: скрытый диалог по роли не находится.
- Сразу после открытия `document.activeElement` — кнопка «Закрыть».
- `fireEvent.keyDown(document, { key: 'Escape' })` → `onClose` вызван один раз.
- Возврат фокуса: тестовая обёртка с `useState` и кнопкой «Открыть»; фокус на кнопке → открыть → Esc → диалога нет, фокус на «Открыть».

В `tests/unit/company-brief-chz.test.tsx` — новый `describe` для «Свежих событий»: `recent_news: [{ title: 'Новость', url: 'https://example.com/n', date: '2026-09-20' }]` → есть «20.09.2026», нет «2026-09-20».

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -6
grep -n "aria-hidden" src/components/ai/AiRunResultModal.tsx
grep -n "createPortal" src/components/ai/AiRunResultModal.tsx
```
Первый `grep` — пусто, второй — импорт и вызов.

## КОММИТ

Явным списком. `git add` и `git commit` — двумя отдельными вызовами Bash (страж oleg-guard, правило C2). Без push.

```
git add _analysis/fix-S-BRIEF-IN-DEAL-1.2-modal.md src/components/ai/AiRunResultModal.tsx src/components/ai/renderers/CompanyBriefRenderer.tsx tests/unit/ai-run-result-modal.test.tsx tests/unit/company-brief-chz.test.tsx
```

```
git commit -m "fix(ai): модалка прогона через портал, Esc и фокус, дата новости в полном брифе (S-BRIEF-IN-DEAL-1.2)"
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
