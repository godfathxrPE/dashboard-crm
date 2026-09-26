# Спринт S-DEAL-STAKE-VIEW-1 — «Стейкхолдеры» по макету W10

**26.09.2026.** **Вход:** `main` ≥ `fbdff8e` (STATUS ревизия 67). **Миграций НЕТ.**
**Ветка:** `feat/deal-stake-view-1`, worktree по `worktree-isolation`.
**Макет:** `_analysis/deal-v2-spec.html`, комментарий `W10 · СТЕЙКХОЛДЕРЫ` и разметка под ним.
Независим от S-DEAL-ACTIVITY-VIEW-1. Попутно закрывает хвосты **P-1** и **G-3** (оба в этом файле).

---

## Решения владельца 26.09

1. **Пустые слоты — как в макете.** Решение П1 от 13.09 (S-DEAL-CONTACT-1: слот тихой строкой,
   подсказка в `title`) **отменено.** Пустой слот — карточка в пунктирной рамке, подсказка текстом.
   Инвариант П1 остаётся: карточка человека визуально тяжелее любого слота (у слота нет аватара,
   контактов, сплошной рамки).
2. **Тег роли — фактическая роль, без «?».** «чемпион?» в макете — гипотеза роли, а таких данных нет:
   роль у человека записана или нет. Тег — записанная роль тем же `RoleBadge`. Роли нет —
   прежний `RoleCell` («указать роль»).

## Что НЕ меняется

Логика: `sortStakeholders`, `resolveRoleSlots`, счётчик «N из M ролей» (П2), заголовок
«Стейкхолдеры» (П3), `formatPhone` + `telHref` (П6), удаление через `InlineConfirm` и запрет
удалять primary, форма добавления, заметка, `VirtualPrimaryLine` как источник строки primary.
Меняется только вид — и сценарии на таче (G-3).

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
grep -n "^function\|^export function\|^const [A-Z_]* =" src/components/projects/DealStakeholders.tsx
sed -n '298,420p' src/components/projects/DealStakeholders.tsx
sed -n '636,700p' src/components/projects/DealStakeholders.tsx
sed -n '820,900p' src/components/projects/DealStakeholders.tsx
cat src/lib/utils/avatar.ts
grep -n "export function roleCoverageSignal" -A30 src/lib/domain/deal-signals.ts
grep -n "missingRequired\|isRequired" src/lib/domain/role-slots.ts
grep -n "function RoleBadge" -A18 src/components/projects/DealStakeholders.tsx
grep -n "\-\-purple\(-l\)\?:" src/app/globals.css | head -10
grep -rn "DealStakeholders" src/components --include=*.tsx | grep -v "^src/components/projects/DealStakeholders.tsx"
```

Ответить до кода:
- текст сигнала `single_threaded` из `roleCoverageSignal` — дословно (он пойдёт в подсказку
  обязательного слота, ЗАДАЧА 2);
- есть ли в `avatar.ts` детерминированный цвет по имени — если есть, аватар берёт его, а не фиолетовый;
- на каком фоне стоит карточка (рельса / зона) — от этого фон карточки человека.

---

## ЗАДАЧА 1: Карточка человека

Один компонент `StakeholderCard` вместо `ROW_GRID` + `PrimaryStar` + `PersonBody` — для строк
слотов, «Ещё в контуре» и `VirtualPrimaryLine`. Разметка по макету:

1. Обёртка: `group rounded-[0.875rem] border border-border px-2.5 py-2`, `grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2.5`.
   Hover/focus-within — `bg-surface2` (как сейчас у строки).
2. Аватар `size-[2.125rem] rounded-full` с инициалами (`getInitials`), фон/текст — цвет из
   `avatar.ts`, если он там есть; иначе `bg-purple-l text-purple-text`. **Primary** — кольцо:
   `ring-2 ring-surface` + внешнее `outline outline-[1.5px] outline-accent` (или `box-shadow` двумя
   слоями — как надёжнее во всех темах). Звезда `PrimaryStar` и тег «основной» уходят: признак
   primary — кольцо + подстрока.
3. Центр: имя `text-body font-semibold` (ссылка на контакт, как сейчас); подстрока `text-meta
   text-text-mute` — «основной контакт» у primary и должность, через « · »; нет ни того, ни
   другого — подстроки нет. Ниже — телефон и почта ОБЕ, каждая своей строкой `text-meta`,
   иконки `Phone`/`Mail` 11: телефон — `a href={telHref(...)}` с `formatPhone`, `tabular-nums`;
   почта — `a href="mailto:…"` + `CopyButton` иконкой рядом. Кнопку-чип телефона (#111) снять —
   макет рисует строку; `title="Позвонить: …"` сохранить.
4. Справа сверху: тег роли (`RoleBadge`) или `RoleCell` «указать роль», как сейчас.
5. Действия на наведении (`RowActions`: заметка · удалить) — справа снизу, прежний порядок и отступ
   перед удалением (П4). Копирование почты из `RowActions` убрать — оно теперь у строки почты.
6. **G-3:** на таче hover нет, и невидимые кнопки нажимаются вслепую. Группа действий:
   `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100`.
7. Заметка и `InlineConfirm` — внутри карточки под контактами, как сейчас под телом.

### Verification
```bash
grep -n "PrimaryStar\|ROW_GRID\|PrimaryTag" src/components/projects/DealStakeholders.tsx | wc -l   # 0
grep -n "hover:none" src/components/projects/DealStakeholders.tsx
```

---

## ЗАДАЧА 2: Пустой слот — пунктирная карточка

`EmptySlotLine` → разметка макета, поведение прежнее (кнопка → `openAdd(role)` / `onEditContact`
для primary; без прав — `div`).

1. Обёртка: `rounded-[0.875rem] border-[1.5px] border-dashed border-border2 px-2.5 py-2`,
   та же сетка, что у карточки человека (аватар-колонка той же ширины — края совпадают).
2. Аватар-плюс: `size-[2.125rem] rounded-full border-[1.5px] border-dashed border-border2`,
   `Plus` 14, `text-text-mute`.
3. Название роли `text-body font-semibold text-text-dim` (`slot.label`). Под ним подсказка
   `text-meta` **текстом** (из `title` уходит):
   - обязательная роль (`slot.isRequired`) — `text-danger-text`, текст сигнала `single_threaded`
     из `roleCoverageSignal` (тот же критерий, что точка «влияет на здоровье» в «Сводке» —
     SUMMARY-1; два виджета одного экрана не спорят). Готового поля с текстом нет — вынести
     формулировку в константу рядом с `roleCoverageSignal` и импортировать в оба места;
   - иначе — `slot.hint`; у primary — `PRIMARY_SLOT_HINT`; подсказки нет — строки нет.
4. Тег роли справа у слота **снимается** (макет его не рисует, роль названа заголовком).

### Verification
```bash
grep -n "border-dashed" src/components/projects/DealStakeholders.tsx
grep -n "title={hint" src/components/projects/DealStakeholders.tsx | wc -l   # 0
```

---

## ЗАДАЧА 3: Список и шапка

1. **P-1:** `divide-y divide-border2` у списков снять — карточки идут стопкой `flex flex-col gap-2`
   (разделитель дугой по скруглённым углам исчезает вместе с разделителями).
2. «Ещё в контуре» — подзаголовок `text-meta text-text-mute` над той же стопкой карточек.
3. Шапка: `mb-2.5 flex items-center justify-between`; слева «Стейкхолдеры» `text-body font-bold
   text-text-main` + « · N из M ролей» `text-text-mute` (иконку `Network` убрать — в макете её нет);
   справа «+ Добавить» — `h-[1.625rem] rounded-lg border border-border px-2.5 text-meta font-semibold`.
4. Контейнер: `rounded-xl border border-border bg-surface px-4 py-3.5` (макет: padding 14 16);
   `mb-6` сохранить.

### Verification
```bash
grep -n "divide-y" src/components/projects/DealStakeholders.tsx | wc -l   # 0
```

---

## ТЕСТЫ

Логика не меняется, кроме вынесенной константы подсказки.
- `tests/unit/deal-signals*.test.ts` (найти grep'ом `roleCoverageSignal`): текст сигнала равен
  экспортированной константе — страж от расхождения «Сводки» и «Стейкхолдеров».
- `tests/unit/deal-stakeholders.test.ts`, `role-slots.test.ts` — зелёные без правок.

UI — без юнит-тестов: разметка и токены.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -8
python3 scripts/audit-contrast.py 2>&1 | tail -5
grep -n "#[0-9a-fA-F]\{3,6\}\b\|rgba(" src/components/projects/DealStakeholders.tsx | wc -l   # 0
npm run build 2>&1 | tail -5
```
Визуально (`npm run dev`), тема **minimal** первой, затем семь остальных:
- сделка «1 человек + 2 пустых слота» (как в макете) — карточка человека тяжелее слотов,
  обязательный слот с красной подсказкой;
- сделка с людьми без роли («Ещё в контуре», как на прод-скрине с Русланом и Михаилом) —
  те же карточки, телефон и почта строками;
- primary без записи в карте (`VirtualPrimaryLine`) — кольцо, «основной контакт»;
- viewer — слоты не кликабельны, действий нет;
- ширина рельсы 320 px — длинная почта переносится, тег роли не падает на новую строку;
- тач (DevTools, `hover: none`) — заметка и удаление видны.

## КОММИТ

```
feat(deals): «Стейкхолдеры» по макету W10 — карточки людей, пунктирные слоты

Человек — карточка с аватаром (кольцо у основного контакта), подстрокой,
телефоном и почтой строками, тегом записанной роли. Пустой слот — пунктирная
карточка с подсказкой текстом; у обязательной роли — текст сигнала single_threaded
(одна константа со «Сводкой»). П1 от 13.09 отменён решением владельца 26.09.
Закрыты P-1 (разделители дугой) и G-3 (действия на таче).
```
