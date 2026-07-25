# Claude Code Prompt — Sprint P1: Полиш (чекбокс minimal + мета шапки) (D1)

Две мелкие безопасные правки. Track-токены тёмных тем и current-чеврон стептера
в этот спринт НЕ входят (первое — отдельный цветовой пасс, второе — намеренно).

ВАЖНО про дерево: работать в чекауте, где HEAD = feat/deal-card и есть M3–M8
(проверить `git log`). Все правки — через РАЗВЕДКУ на ЖИВОМ дереве, не по
номерам строк.

---

## РАЗВЕДКА

```bash
git log --oneline -1
grep -n 'input\[type="checkbox"\]:checked' src/app/globals.css
grep -n "t-minimal" src/app/globals.css | tail -5   # где заканчивается блок minimal-оверрайдов
grep -n "aura-page-title\|Перетаскивай\|активных\|неделя\|text-\[13px\]\|text-sm" src/components/tasks/KanbanBoard.tsx
```

---

## ЗАДАЧА 1: Чекбокс minimal — чёрный, не терракота

Глобальное правило (`input[type="checkbox"]:checked` / `:indeterminate`) красит
чек в `var(--accent)` — в minimal это терракота, а primary там чёрный. Добавить
scoped-override РЯДОМ с блоком A11Y-оверрайдов `.t-minimal` (unlayered, как
`.t-minimal .bg-accent`):

```css
.t-minimal input[type="checkbox"]:checked,
.t-minimal input[type="checkbox"]:indeterminate {
  background-color: var(--text);
  border-color: var(--text);
}
.t-minimal input[type="checkbox"]:hover { border-color: var(--text); }
```

(галочка-иконка внутри — белая через background-image, на чёрном фоне читается;
не трогать.) Остальные темы не задевать.

## ЗАДАЧА 2: Мета шапки /tasks — по типо-шкале

По РАЗВЕДКЕ: в `TasksPageHeader` (KanbanBoard.tsx) найти мету под заголовком
«Задачи» (строка «N активных · неделя W», добавлена в M3). Если её класс —
`text-[13px]`, заменить на `text-sm` (14px по шкале; S-TYPO-SCALE изгоняло
произвольный 13px). Цвет `text-text-mute` не трогать.

Мета присутствует (M3 внедрён, подтверждено по live-диску: шапка берёт
`activeCount`/`weekNum`). Греп нужен только чтобы взять её точный текущий класс:
`text-[13px]` → `text-sm`; если уже по шкале (`text-sm`/`text-xs`) — пропустить.

---

## СМОК

- minimal: где есть нативный чекбокс (Настройки → гейты/автоматизации, или
  фильтры) — отмеченный чек ЧЁРНЫЙ, не терракотовый; галочка читается. Остальные
  темы — чек прежний (свой accent).
- /tasks minimal: мета шапки не изменилась визуально по размеру заметно (13→14),
  осталась тихой.
tsc 0.

## КОММИТ

```bash
git add src/app/globals.css src/components/tasks/KanbanBoard.tsx
git commit -m "polish: minimal checkbox → чёрный (не accent); мета шапки задач → text-sm"
```

НЕ пушить без подтверждения. Миграций нет.
