# Спринт S-LEAD-V2-LAYOUT-1 — каркас карточки лида: шапка, зоны, стекло шага, сводка

**27.09.2026.** **Вход:** `main` с влитым docs-PR этого эпика (файлы `_analysis/lead-v2-spec.md` и три
`sprint-S-LEAD-V2-*.md`). **Миграций НЕТ.**
**Ветка:** `feat/lead-v2-layout-1`, worktree по `worktree-isolation`.
**Спека:** `_analysis/lead-v2-spec.md` — §1, §2, §4, §7 (W6, W7), §9. При расхождении спека права, этот файл
говорит «что и в каком порядке».
Первый из трёх спринтов эпика; следующие — `S-LEAD-V2-HEALTH-1`, `S-LEAD-V2-WORK-1`. После этого спринта
карточка рабочая: кокпит, квалификация и лента — прежние, но уже стоят в своих зонах.

---

## Решения владельца (зафиксировано до кода)

1. **«Отклонить…» — в шапке, нейтральной вторичной кнопкой** над колонкой «Риски» (R-08). Это пересматривает
   §7 от 10.08 («терминальное только в меню»): у сделки v2 исходы «Выиграна/Проиграна» стоят там же и так же.
   Красной кнопки на экране нет.
2. **Кольца здоровья у лида нет** (R-06) — это HEALTH-1, здесь не трогаем.
3. **Шапка = идентичность.** Источник, температура, «ЧЗ через N мес.» из шапки уходят (F-08).

## Что НЕ делаем в этом спринте

Кокпит (остаётся `LegacyRow`, только теряет `extraActions`), квалификация (переезжает в зону как есть),
лента активности (переезжает в зону как есть), сигналы — переезжают в зону «Риски» **без изменения логики**
(временная карточка, её заменит HEALTH-1).

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
ls _analysis/lead-v2-spec.md _analysis/sprint-S-LEAD-V2-*.md      # обязаны быть в main
wc -l src/components/leads/LeadDetail.tsx
sed -n 555,630p src/components/projects/ProjectDetail.tsx          # разметка зон сделки — образец
sed -n 295,456p src/components/projects/DealHeader.tsx             # шапка сделки — образец
grep -n "Выиграна\|Проиграна" -B3 -A8 src/components/projects/DealHeader.tsx | head -40
sed -n 52,126p src/components/projects/DealNextStep.tsx            # formatActionDate + PrimaryContactChip
grep -rn "function formatActionDate" src | head
grep -rn "PrimaryContactChip" src | head
cat src/components/shared/RailCard.tsx
grep -n "\.zone\b\|\.zone {\|zone-eyebrow\|\.h-ok\|\.h-attention\|\.h-rotting\|--h-zone" src/app/globals.css | head
grep -n "glass-sheet\|glass-plate\|data-empty" src/app/globals.css | head
grep -n "export function formatBudgetFull" -A10 src/lib/validators/project.ts
grep -n "export function useTeamMembers" -r src/lib/hooks | head -2
```

Ответить в отчёте до кода:
- какие классы у «Выиграна/Проиграна» (их возьмёт «Отклонить…»);
- сколько копий `formatActionDate` в `src/` (ожидание — 2: `DealNextStep`, `LeadDetail`);
- есть ли у `.h-ok` отдельный класс или ok — дефолт `:root` (в `globals.css` дефолт = ok; тогда класс для ok
  не навешивать, как в `ProjectDetail`).

---

## ЗАДАЧА 1: Общие куски сделки — вынести, не копировать

### Context
Лид берёт у сделки дату шага и чип контакта. Третья копия `formatActionDate` и вторая копия чипа —
ровно то, что потом расходится.

### Steps
1. `src/lib/utils/action-date.ts` (новый): `formatActionDate(value: string, now: Date = new Date()): string` —
   тело из `DealNextStep` («сегодня/завтра/вчера», иначе «7 июля»), `now` аргументом. Импортировать в
   `DealNextStep`; локальную функцию удалить.
2. `src/components/shared/ContactCallChip.tsx` (новый): перенести `PrimaryContactChip` из `DealNextStep`,
   пропсы `{ name: string; position?: string | null; initialsFrom: string; phone: string | null; email: string | null }`.
   Разметку, `glass-call`, `focusRing`, `CopyButton` — дословно. `DealNextStep` собирает пропсы из
   `ContactBrief` (`formatContactName`, `first_name`) и рендерит новый компонент. Визуально сделка не меняется.

### Verification
```bash
npx tsc --noEmit
grep -rn "function formatActionDate\|function PrimaryContactChip" src | wc -l   # 1 (только action-date.ts)
```

---

## ЗАДАЧА 2: `LeadHeader`

Спека §2. Файл `src/components/leads/LeadHeader.tsx`.

### Steps
1. Пропсы: `{ lead: Lead; onEdit: () => void; onReject: (reason: DisqualifyReason) => void }`.
   Внутри — `useTeamMembers` (имя ответственного) и `useRouter` («Открыть сделку»).
2. Сетка `header.mb-5.grid.gap-5.lg:grid-cols-[minmax(0,1fr)_356px].lg:items-start` — как `DealHeader`.
3. Левая карточка — по спеке §2 (аватар, h1 22px, один тег направления, подстрока `metaParts`,
   оценка суммы справа только при `estimated_value != null`, `formatBudgetFull`, подпись «оценка лида»).
4. Правая группа — по таблице спеки §2. «Отклонить…» раскрывает строку причин **под шапкой во всю ширину**
   (перенести разметку `rejecting` из `LeadDetail`: подпись «Причина отказа:», кнопки
   `disqualifyReasons`, «Отмена»). Кнопки причин — нейтральные, `hover:border-red hover:bg-red-l hover:text-red`
   оставить (это наведение на деструктив, а не покой).
5. Никаких `window.confirm` (eslint держит).

### Verification
```bash
npx tsc --noEmit && npx eslint src/components/leads/LeadHeader.tsx
grep -n "#[0-9a-fA-F]\{3,6\}\b\|rgba(" src/components/leads/LeadHeader.tsx | wc -l   # 0
```

---

## ЗАДАЧА 3: `LeadNextStep` — стекло шага

Спека §4. Файл `src/components/leads/LeadNextStep.tsx`.

### Steps
1. Разметка — копия `DealNextStep` без `useFieldMoves`, `useContactBrief`, `touchGapDays` и строки «без
   касания» (у лида молчание — сигнал «Рисков», HEALTH-1). Якорь `id="lead-next-step"`, `data-empty` при
   пустом `next_step`.
2. Мутации — `useUpdateLead`: текст шага, дата, «Шаг сделан» (`next_step: null, next_action_date: null`).
3. Просрочка — `getLeadActionOverdueDays` (не функция сделки: см. шапку `lead-health.ts`, off-by-one в MSK).
4. Справа в футере — `ContactCallChip` из ЗАДАЧИ 1: `name = contact_name_raw`, `initialsFrom =
   contact_name_raw`, `phone`, `email`. Нет имени — чип не рисуется.
5. Подсказка про авто-переход (`status==='new' && !first_contacted_at`) — спека §4, последняя строка.
6. `readOnly` не нужен: компонент монтируется только у `new/contacted/qualified`.

### Verification
```bash
npx tsc --noEmit
grep -n "glass-sheet\|glass-plate\|lead-next-step\|getLeadActionOverdueDays" src/components/leads/LeadNextStep.tsx
```

---

## ЗАДАЧА 4: Зоны в `LeadDetail`

Спека §1, §7 (W6, W7), §9.

### Steps
1. Шапка: прежний блок `{/* ═══ Шапка ═══ */}` → `<LeadHeader lead onEdit onReject>`. Крошка «← Лиды» остаётся
   над ней.
2. Тело — сетка `grid gap-5 lg:grid-cols-[minmax(0,1fr)_356px]`, разметка зон **дословно** с
   `ProjectDetail` (`.zone`, `--zone-surface`, `--zone-gap: .875rem` у «Работы», sticky-обёртка правой колонки
   с `lg:self-start`).
3. «Работа», сверху вниз:
   - кокпит — в `.sheet` (как у сделки), `extraActions` **удалить**, `currentExtra={<LeadHealthMark>}` пока
     оставить (уйдёт в HEALTH-1); плашка «Дисквалифицирован» — вместо кокпита, стиль по спеке W1-D;
   - `LeadNextStep` у `new/contacted/qualified`; у `converted` — `ConvertedDealCard` на `.sheet`
     (спека W2-C); у `disqualified` — ничего;
   - `LeadQualificationBlock` — как есть, только обёртка `rounded-xl border` → `.sheet`;
   - «Активность» — как есть, обёртка → `.sheet`.
4. «Риски» — только у `new/contacted/qualified` **и** если есть хоть один сигнал из прежних
   (`showRegWarning || showColdSignal`): eyebrow по спеке §1, внутри прежняя карточка «Сигналы» на
   `data-card rounded-lg border border-border bg-surface p-4`, без `ZoneTitle`. Класс зоны: `showColdSignal`
   → `h-rotting`, иначе `h-attention`. Временная версия, в HEALTH-1 заменяется целиком.
5. «Контекст»: «Сводка» (спека W6, `RailCard`/`RailRow`) и «Заметки» (W7). Прежняя карточка «Заметки» в
   основной колонке удаляется.
6. Удалить из `LeadDetail`: прежнюю фокус-панель, локальный `formatActionDate`, `ZoneTitle`, бейджи шапки.
   `regulatoryMonths` пока остаётся (нужен временным «Рискам»).

### Verification
```bash
npx tsc --noEmit && npx eslint src/components/leads
grep -n "rounded-xl border border-border bg-surface" src/components/leads/LeadDetail.tsx | wc -l   # 0
grep -n "extraActions\|ZoneTitle\|function formatActionDate" src/components/leads/LeadDetail.tsx | wc -l  # 0
```

---

## ТЕСТЫ

`tests/unit/action-date.test.ts` (новый, `now` фиксирован):
- дата = сегодня → «сегодня»; +1 день → «завтра»; −1 → «вчера»;
- +5 дней → «2 октября» (для `now` = 27.09.2026);
- невалидная строка → возвращается как есть.

Остальное — разметка и перенос; тестов нет: `LeadHeader`, `LeadNextStep`, `ContactCallChip` — только
вёрстка поверх существующих мутаций. Регрессия сделки проверяется смоком ниже.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm run lint
npx vitest run
npm run build            # последним: убивает живой next dev
```

Смок в браузере (`t-cobalt`, затем `t-minimal` и одна тёмная), 1440 и 1280:
1. Лид в `contacted` без шага: стекло пустое с жёлтым кантом, «Отклонить…» → строка причин → «Не ответил» →
   лид `disqualified`, на месте кокпита плашка, «Восстановить» возвращает `new`.
2. Лид `new`: подсказка про авто-переход видна; телефон в чипе — `tel:`.
3. Лид `converted`: карточка «Сделка создана», в шапке «Открыть сделку →», «Рисков» нет.
4. **Регрессия сделки:** `/deals/[id]` — чип контакта в стекле выглядит и работает как до спринта.

## КОММИТ

```bash
git add -A
git commit -m "feat(leads): карточка лида v2 — шапка, зоны Работа/Риски/Контекст, стекло шага, сводка

S-LEAD-V2-LAYOUT-1. formatActionDate и чип контакта вынесены из DealNextStep в общие.
Отклонить — в шапке (R-08), источник/температура — в Сводку (F-08). Миграций нет."
```

В отчёте: ответы РАЗВЕДКИ, список удалённого из `LeadDetail`, скриншоты трёх состояний из смока.
