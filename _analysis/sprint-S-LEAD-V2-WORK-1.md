# Спринт S-LEAD-V2-WORK-1 — квалификация «ответ в строке» и активность лида в виде сделки W5

**27.09.2026.** **Вход:** `main` с влитым `S-LEAD-V2-HEALTH-1`. **Миграций НЕТ.**
**Ветка:** `feat/lead-v2-work-1`, worktree по `worktree-isolation`.
**Спека:** `_analysis/lead-v2-spec.md` — §5 (W3), §6 (W4). Чинит F-04, F-05, F-10, F-14, F-15 аудита.
Последний спринт эпика «Лид v2».

---

## Решения владельца

1. **Кнопка «Заполнить» → общая `LeadModal` из строк квалификации уходит.** Каждый пункт отвечается там, где
   спрошен. Полная форма остаётся на карандаше шапки.
2. **Две зоны §7 («Осталось выяснить» / «Известно») сохраняются** — меняются только контролы и раскладка.
3. **Лента лида = вид сделки W5**, а не третья вариация. Компоненты сделки получают параметр сущности
   аддитивно; сделка визуально и по запросам не меняется.

## Отступления от макета — осознанные

- Блока «Впереди» (открытые задачи отдельной плашкой) **нет**: у сделки его нет, находки под него нет.
- Автоподстановки дедлайна ЧЗ из справочника **нет**: в `CHZ_GROUPS` дата старта — месяц группы (`since`),
  а подгрупп («колбасы 2026-10») там нет, есть только текст `note`. Подставлять по `since` значит подставлять
  неверную дату. Вместо этого у группы тег фазы (`chzStatusLabel`).
- «Роль контакта» — три быстрые кнопки + «ещё…», а не все семь: семь кнопок в строке 300px переносятся в
  три ряда.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
sed -n 30,120p src/components/projects/DealActivityFeed.tsx
sed -n 85,135p src/components/projects/DealLastEvent.tsx
grep -n "DealLastEvent\|DealActivityFeed\|useDealActivity" -r src --include=*.tsx | grep -v "^src/components/projects/Deal"
grep -n "export type TimelineEntityType" -A4 -r src/lib src/components | head
grep -n "export function useEntityTimeline" -A12 -r src/lib/hooks | head -20
sed -n 30,70p src/components/shared/ActivityComposer.tsx
grep -n "function LeadQualificationBlock\|function MissingRow" -A5 src/components/leads/LeadDetail.tsx
sed -n 1,80p src/components/shared/Combobox.tsx                 # мультивыбор есть?
grep -rn "useClickOutside\|useOnClickOutside" src/lib/hooks | head -3
grep -n "export function chzStatusLabel\|export function chzPhase\|export const CHZ_GROUPS" -A6 src/lib/data/chz-groups.ts
grep -n "chzStatusLabel\|className" src/components/projects/DealChzCard.tsx | head -20
grep -n "deal-org-split" -A14 src/app/globals.css
grep -n "CHZ_GROUP_NAMES\|toggleChz\|parseBudgetInput\|setValueInput" src/components/leads/LeadModal.tsx
```

**Разведка БД** (read-only, в отчёт):

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'leads_decision_role_check';
```

Ответить до кода: входят ли `influencer` и `end_user` в CHECK (130 его пересобирал). Не входит — кнопка этой
роли не рисуется, строкой в отчёт. Отдельно: умеет ли `Combobox` мультивыбор; если нет — поповер групп ЧЗ
пишется простым списком с чекбоксами (ЗАДАЧА 4), без новой библиотеки.

---

## ЗАДАЧА 1: Лента сделки W5 — параметр сущности

### Steps
1. `useDealActivity(projectId, filter)` → `useDealActivity(entityId, filter, entityType: TimelineEntityType = 'project')`,
   внутри `useEntityTimeline(entityType, entityId, requestKinds)`.
2. `DealActivityFeed`, `DealLastEvent`: проп `projectId` → `entityId`, новый `entityType?` с дефолтом
   `'project'`; внутренний вызов `useEntityTimeline('project', …)` в `DealLastEvent` → `(entityType, entityId)`.
3. Все вызовы в `ProjectDetail.tsx` (по РАЗВЕДКЕ — три) обновить на `entityId={projectId}`; `entityType` не
   передавать.
4. Ключи React Query у сделки обязаны остаться прежними — проверить глазами по `useEntityTimeline`.

### Verification
```bash
npx tsc --noEmit
grep -n "projectId=" src/components/projects/ProjectDetail.tsx | grep -i "DealLastEvent\|DealActivityFeed" | wc -l   # 0
```

---

## ЗАДАЧА 2: Активность лида

Спека §6.

### Steps
1. В `LeadDetail` блок «Активность» (`.sheet`) собрать по образцу `isDeal`-ветки `ProjectDetail`
   (~стр. 428–468): шапка — «Активность» `text-xs font-bold`, `TimelineFilterChips variant="pill"`
   с `kinds={LEAD_CHIP_KINDS}` (`['call','task','activity']`, константа рядом с компонентом) и
   `labels={{ activity: 'Поля' }}`, «Вся лента»; справа `ml-auto` — «+ Звонок» / «+ Задача» (как сейчас).
   Чипы и «Вся лента» скрыты при `emptyEntity` (как у сделки).
2. Ниже: `DealLastEvent entityType="lead"` → `ActivityComposer entityType="lead" variant="deal"` →
   `DealActivityFeed entityType="lead"`. `onOpenEvent` — прежний `handleOpenEvent` лида.
3. `converted` / `disqualified`: композера и кнопок «+» нет; `converted` — под лентой `text-meta text-text-mute`
   «Дальше лента продолжается в сделке».
4. Прежний `EntityTimeline` из `LeadDetail` удалить.

### Verification
```bash
npx tsc --noEmit
grep -n "EntityTimeline\b" src/components/leads/LeadDetail.tsx | wc -l     # 0
```

---

## ЗАДАЧА 3: Квалификация — раскладка и зона «Известно»

Спека §5. Логику `qualifyLead` не трогать.

### Steps
1. Обёртка — `.sheet px-[1.125rem] py-4`, `id="lead-qualification"` (если HEALTH-1 уже поставил — оставить).
   Шапка: «Квалификация» `text-xs font-bold` + «N из 6» `text-xs tabular-nums text-text-dim`; read-only —
   подпись справа по спеке.
2. Раскладка по ширине блока: класс `.lead-qual` в `globals.css` рядом с `.deal-org-split`, тем же приёмом
   (`container-type: inline-size`, `@container (min-width: 44rem)`). Три случая — таблица спеки §5.
   Без поддержки `@container` — одна колонка (рабочее состояние, как у орг-блока).
3. «Известно»: ключ `text-meta text-text-mute`, значение `text-body text-text-main` (оба 400), `min-h` строки
   сохранить. `ZoneTitle` зон заменить на `text-[0.65625rem] font-bold uppercase tracking-wider text-text-dim`
   (кегль eyebrow кокпита).
4. «Группы ЧЗ» в «Известно»: для каждой группы — запись `CHZ_GROUPS.find(g => g.group === name)`; есть →
   тег `chzStatusLabel(g, now)` стилем тега из `DealChzCard`; нет → только имя.

### Verification
```bash
npx tsc --noEmit
grep -n "lead-qual" src/app/globals.css src/components/leads/LeadDetail.tsx
```

---

## ЗАДАЧА 4: Строки «Осталось выяснить» — контрол под лейблом, ответ в строке

Спека §5, таблица контролов. Перенести `MissingRow` в `src/components/leads/LeadQualRow.tsx`.

### Steps
1. Раскладка строки — вертикальная: лейбл `text-body font-semibold` → замок/следствие → `mt-2` контрол.
   Ни одного `justify-between` между лейблом и контролом (F-05).
2. Контролы — по таблице спеки. Запись — `useUpdateLead().mutate({ id, <поле> })`, одна мутация на клик,
   оптимистичный апдейт уже есть в хуке. После записи пункт сам уезжает в «Известно» (`qualifyLead`
   пересчитывается от данных) — ничего не делать руками.
3. Кнопки-варианты: `type="button"`, `aria-pressed` не нужен (выбор сразу пишет и строка исчезает).
   Классы — спека §5. Цвета — только токены.
4. «ещё…» у роли — `<select>` с `STAKEHOLDER_ROLE_ORDER` → `STAKEHOLDER_ROLE_CONFIG[r].full`, только роли,
   разрешённые CHECK (РАЗВЕДКА); первым `option` — «ещё…» с пустым значением.
5. Группы ЧЗ: кнопка «+ Группа из справочника» (`border-dashed`) → поповер `CHZ_GROUP_NAMES` (вынести
   константу из `LeadModal` в `src/lib/constants/chz.ts` или рядом с `CHZ_GROUPS`, импортировать в оба места).
   Мультивыбор, запись — по закрытию поповера (не на каждый чекбокс): пустой выбор → `null` (правило
   `toggleChz`: «не выяснено» и «групп нет» — разные вещи). Закрытие — клик вне, `Escape`.
6. Оценка суммы: `<input inputMode="decimal">` + «Сохранить»; `parseBudgetInput` → копейки (как
   `LeadModal`); пустое/невалидное — кнопка `disabled` настоящим `disabled` (CLAUDE.md, «Disabled-состояние»).
7. Боль — прежний `InlineEdit as="textarea"`, триггер — кнопка «Записать» (`border-accent text-accent`, как
   сейчас у обязательных).
8. `onFill` и проп `onFill` у блока — удалить.

### Verification
```bash
npx tsc --noEmit && npx eslint src/components/leads
grep -n "onFill\|setEditOpen(true)" src/components/leads/LeadQualRow.tsx | wc -l      # 0
grep -n "#[0-9a-fA-F]\{3,6\}\b\|rgba(" src/components/leads/LeadQualRow.tsx | wc -l   # 0
```

---

## ТЕСТЫ

Новой логики в `src/lib/` нет: квалификацию считает прежний `qualifyLead` (`tests/unit/lead-qualification.test.ts`),
фазу группы — прежний `chzStatusLabel` (`tests/unit/chz-groups.test.ts`), сумму — прежний `parseBudgetInput`.
Перенос `CHZ_GROUP_NAMES` — проверить, что `lead-qualification.test.ts` и `chz-groups.test.ts` зелёные.
Тестов нет: разметка, параметр сущности у ленты и существующие мутации.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build            # последним
```

Смок в браузере, `t-cobalt` + `t-minimal` + одна тёмная, 1440 и 1280 (при 1280 рабочая колонка узкая —
квалификация обязана уйти в одну колонку, а не сжаться):
1. Пустой лид `new`: 6 пунктов в двух колонках внутри подложки; «Оценён» у бюджета — пункт уезжает в
   «Известно», счётчик 1 из 6, замок на «Конвертировать» остаётся (боль пуста).
2. Роль «ЛПР» одной кнопкой; «ещё…» → «Чемпион» — пишется.
3. Группы ЧЗ: выбрать две, закрыть — в «Известно» обе с тегами фазы.
4. Сумма «1 800 000» → в шапке появляется «1 800 000 ₽ · оценка лида».
5. Лента: чипы Все · Звонки · Задачи · Поля (нет «Встреч» и «Сделок»); последнее событие — на стекле;
   «+ Звонок» создаёт звонок с `lead_id`.
6. **Регрессия сделки:** лента, последнее событие, «Вся лента» на `/deals/[id]` — как до спринта.

## КОММИТ

```bash
git add -A
git commit -m "feat(leads): квалификация «ответ в строке» и лента лида в виде W5

S-LEAD-V2-WORK-1. Бюджет/роль — кнопками, группы ЧЗ — поповером, сумма — полем;
«Заполнить» → LeadModal из строк убран (F-04/F-05). DealActivityFeed/DealLastEvent
получили entityType (дефолт project). Миграций нет."
```
