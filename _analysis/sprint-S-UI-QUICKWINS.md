# Claude Code Prompt — Sprint S-UI-QUICKWINS: три быстрых фикса из аудита aura (F-05, F-07, F-11)

> **Тип:** client-only, БЕЗ миграции. Пайплайн: промпт → ревью Grok → CC пишет+коммитит+пушит → гейт Cowork (визуальный смок). База: `main` (после мёржа S-AURA-NAV-1) — или `feat/aura-nav`, если ещё не смёржен (эти три файла aura-nav не трогал, конфликта нет). Ветка: `feat/ui-quickwins`.
> Источник: аудит aura 2026-07-19 (`_analysis/audit-aura-design.md`). Три независимых quick-win'а, склеены в один спринт. Правки семантические/строковые, blast radius минимальный.
> Стек неизменен. Цвета — только `var(--token)`/семантические утилиты. Правила «цвет в зоне данных = только исключениям и дельтам», «красный = ошибки/деструктив».

---

## WHY

- **F-05 (Medium):** кнопки «Выиграна»/«Проиграна» (и «Завершить проект») в шапке детальной сделки постоянно горят зелёным/красным. Красный, который горит всегда, девальвирует ошибки; зелёная всегда-кнопка тратит success-канал. Цвет должен появляться на намерении (hover), не в покое. **Статус-бейдж** результата (won/lost после закрытия) — остаётся цветным (это статус, не действие).
- **F-07 (Medium):** на Сделках KPI-значения PIPELINE и КОНВЕРСИЯ покрашены зелёным без статусной семантики («деньги = зелёное» — декор). Значения KPI → нейтральный `--text`; зелёный оставляем дельтам/статусам. (На Обзоре значения уже нейтральны — не трогаем.)
- **F-11 (Medium):** телефоны в таблице контактов переносятся на 2 строки при узкой колонке → высоты строк пляшут. `whitespace-nowrap` + `tabular-nums`.

## РАЗВЕДКА

```bash
git status -sb && git log --oneline -1

# F-05: три always-on кнопки (ждём ProjectDetail ~L378–397 Выиграна/Проиграна, ~L400 Завершить проект)
grep -n "Выиграна\|Проиграна\|Завершить проект\|border-green/40\|border-red/40\|text-green\|text-red" src/components/projects/ProjectDetail.tsx | head
# ⚠️ Отличить действия (border-*/40 + text-*) от РЕЗУЛЬТАТ-бейджа (~L418: bg-green-l text-green / bg-red-l text-red) — бейдж НЕ трогать

# F-07: color-строки метрик (ждём PipelineBoard ~L137 Pipeline, ~L140 Конверсия — 'text-green')
grep -n "color: 'text-green'\|color: 'text-accent'\|label: 'Pipeline'\|label: 'Конверсия'" src/components/projects/PipelineBoard.tsx

# F-11: ячейка телефона (ждём ContactsTable ~L118 EditableCell type="tel" className="text-text-dim")
grep -n "key: 'phone'\|type=\"tel\"\|EditableCell" src/components/contacts/ContactsTable.tsx
# Проверить: EditableCell прокидывает className на отображаемый span/элемент (иначе whitespace-nowrap не сработает — тогда вешать на td-обёртку)
grep -n "className" src/components/shared/EditableCell.tsx | head
```

**⚠️ Расхождение — доложи, не правь вслепую.**

---

## ЗАДАЧА 1 — F-05: нейтральные action-кнопки win/loss (ProjectDetail.tsx ~L378–410)

Три always-on кнопки: покой — нейтральный outline, цвет — на hover.

```
// «Выиграна» — было:
className="rounded-lg border border-green/40 px-2.5 py-1.5 text-xs font-medium text-green transition-colors hover:bg-green-l"
// стало:
className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"

// «Проиграна» — было:
className="rounded-lg border border-red/40 px-2.5 py-1.5 text-xs font-medium text-red transition-colors hover:bg-red-l"
// стало:
className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim transition-colors hover:border-red/40 hover:text-red hover:bg-red-l"

// «Завершить проект» (delivery, тот же зелёный always-on) — тот же нейтральный→hover паттерн, что «Выиграна».
```

**⚠️ НЕ трогать:** РЕЗУЛЬТАТ-бейджи `won`/`lost` (~L418: `bg-green-l text-green`/`bg-red-l text-red`) и «Завершён» (`bg-green-l text-green`) — это статусы, не действия, цвет уместен.

## ЗАДАЧА 2 — F-07: нейтральные KPI-значения на Сделках (PipelineBoard.tsx ~L137, L140)

```
{ label: 'Pipeline',   ... color: 'text-green', ... }   → color: 'text-text-main'
{ label: 'Конверсия',  ... color: 'text-green' }         → color: 'text-text-main'
```

`Активные` (`text-accent`) и `Avg цикл` (`text-text-main`) — оставить как есть (accent = графит в aura, приглушён; не крикливый success-канал). Зелёный на дельтах/статусах в других местах — не трогать.

## ЗАДАЧА 3 — F-11: телефон в одну строку (ContactsTable.tsx ~L118–121)

```
// было:
<EditableCell value={c.phone} type="tel" className="text-text-dim" onSave={...} />
// стало:
<EditableCell value={c.phone} type="tel" className="text-text-dim whitespace-nowrap tabular-nums" onSave={...} />
```

**⚠️** Если РАЗВЕДКА покажет, что `EditableCell` НЕ прокидывает `className` на отображаемый элемент (перенос не уйдёт) — вешать `whitespace-nowrap` на `<td>` колонки телефона в DataTable-рендере или на обёртку `render`. Цель: телефон никогда не переносится, высоты строк ровные.

---

## ГРАНИЦЫ SCOPE

Только эти три файла и эти правки. **НЕ** карточки канбана (F-04), **НЕ** типо-шкала/микротекст (F-01/F-02 — отдельный системный S-TYPO-SCALE), **НЕ** тени/радиусы (F-08/F-09 — консистентность-пасс). Не рефакторить компоненты, только точечные классы/строки.

## ПРОВЕРКА

```bash
rm -rf .next
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -8        # не при живом dev на :3000
```

**Визуальный смок:** детальная сделки (aura + тёмная тема) — Выиграна/Проиграна/Завершить нейтральны в покое, красят на hover; результат-бейдж won/lost по-прежнему цветной. /deals — KPI Pipeline и Конверсия нейтральные (не зелёные), Активные/Avg цикл как были. /contacts — телефоны в одну строку, высоты строк ровные, узкая ширина не ломает.

## КОММИТ

```bash
git switch -c feat/ui-quickwins
git add src/components/projects/ProjectDetail.tsx \
        src/components/projects/PipelineBoard.tsx \
        src/components/contacts/ContactsTable.tsx
git commit -m "fix(ui): нейтральные win/loss-кнопки + KPI без зелени + телефон в строку (S-UI-QUICKWINS, аудит F-05/F-07/F-11)"
```

## VERIFICATION (сборка промпта, Cowork)

```
Live-code sync:  PASS — ProjectDetail L378–420 (действия vs бейдж), PipelineBoard L137/L140, ContactsTable L118 сверены по мосту
Дизайн:          соответствует аудиту (цвет=намерение/статус, не декор; данные нейтральны)
Type Safety:     NOT_VERIFIED (правки строковые/классы)
RLS/DB:          NOT_APPLICABLE
Backward Compat: PASS — только визуал, поведение (onClick/onSave) не тронуто
Runtime Tested:  NOT_VERIFIED — смок на гейте
```
