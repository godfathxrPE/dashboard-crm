# Спринт S-DEAL-ACTIVITY-VIEW-1 — «Активность» сделки по макету W5

**26.09.2026.** **Вход:** `main` ≥ `fbdff8e` (STATUS ревизия 67). **Миграций НЕТ.**
**Ветка:** `feat/deal-activity-view-1`, worktree по `worktree-isolation`.
**Макет:** `_analysis/deal-v2-spec.html`, комментарий `W5 · АКТИВНОСТЬ` и разметка под ним.
Независим от S-DEAL-STAKE-VIEW-1 (разные файлы) — можно гнать параллельно.

---

## Решения владельца 26.09 (сверка макета с кодом)

1. **Тело последнего события — на стекле** `.glass-sheet` (материал «Следующего шага», `--sheet-*`).
   Решение #97 «без стекла» снято: его причина («Следующий шаг» — светлый лист) исчезла с #108.
2. **Чипы — вид макета, набор прежний:** пилюли в шапке рядом с «Активность»:
   `Все · Звонки · Встречи · Задачи · Заметки · Поля · AI`. «Поля» — это прежняя «Система»
   (`kind='activity'` без заметок). Чипа «Событие» нет: блок последнего события и так всегда сверху.
   Чипа «Сделки» нет, но события `kind='project'` («Сделка создана из лида») в ленте «Все» остаются.
3. **Только сделка.** `EntityTimeline`, `TimelineFilterChips` и `ActivityComposer` общие с лидом,
   компанией и контактом — их текущий вид не меняется. Всё новое — через аддитивные пропсы с
   дефолтом «как было» или в новом компоненте сделки.

## Отступления от макета — осознанные, не «доделать потом»

- **Slash-команд в композере нет** (`/задача`, `/звонок` в плейсхолдере макета). Плейсхолдер,
  обещающий несуществующую команду, — неправда. Плейсхолдер: «Добавить комментарий…».
- **«Вся лента · 14» без числа.** RPC `entity_timeline` отдаёт ленту keyset-страницами, общего
  счёта нет; число загруженных строк выдавалось бы за «всего». Ссылка — «Вся лента», действие —
  раскрыть ленту целиком (см. ЗАДАЧА 4). Счётчик — отдельной задачей, если понадобится.
- **Кнопка у события одна**, как сейчас (`actionLabel`: «Изменить» или «Открыть» по виду). Макет
  рисует обе, но двух разных действий у события нет — вторая кнопка дублировала бы первую.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -1
sed -n '405,445p' src/components/projects/ProjectDetail.tsx
grep -n "export function\|function actionLabel\|className=" src/components/projects/DealLastEvent.tsx
grep -n "glass-sheet\|sheet-mark\|--sheet-" src/components/projects/DealNextStep.tsx | head -20
grep -n "\.glass-sheet" src/app/globals.css | head
grep -n "export function TimelineFilterChips" -A60 src/components/shared/EntityTimeline.tsx | head -80
grep -n "function relativeTime" -B2 -A14 src/components/shared/EntityTimeline.tsx
cat src/components/shared/ActivityComposer.tsx
grep -n "project_updated" -A16 src/lib/utils/activity-events.ts | head -24
grep -n "FIELD_LABELS" -A40 src/lib/utils/activity-events.ts | head -45
grep -rn "quote" src/lib/utils/activity-events.ts | head
grep -rn "export function getInitials\|export function formatPersonShort\|export function shortName" src/lib | head
```

Ответить до кода:
- как `DealNextStep` переопределяет токены на стекле (какие `--sheet-*` читать для текста, акцента, иконки);
- какие `event_type` в `activity_log` относятся к КП/деньгам (для цвета точки, ЗАДАЧА 3) —
  `select distinct event_type from activity_log` через отчёт, **в БД ничего не писать**;
- есть ли в `src/lib` форматтер «Имя Ф.» — если нет, заводится в ЗАДАЧЕ 1.

---

## ЗАДАЧА 1: Данные — подписи полей, «и ещё N» для старых записей, бриф звонка

### Context
На живой сделке строка ленты «Обновлено: type, название, направление, … parent_deal_id, шаблон
внедрения, ссылка 1С:ДО» — это записи до миграции 087 (без `payload.changes`). Для них ветка
`project_updated` печатает ВСЕ поля списком, а у `type` и `parent_deal_id` нет подписи. Макет:
«изменения полей группируются „и ещё N“» — так уже делает ветка с `changes`.

Мета последнего события в макете — «Звонок · 5 сентября, 10:42 · 12 мин · Наталья Н. · Олег».
Длительности и контакта в ленте нет: RPC отдаёт у звонка только `status/next_step/agreements`.
Расширять RPC ради одного блока не нужно — один запрос на ОДИН звонок, только для якоря.

### Steps
1. `src/lib/utils/activity-events.ts`: в `FIELD_LABELS` добавить `type` → «тип», `parent_deal_id`
   → «родительская сделка» (сверить, нет ли уже близких ключей). Легаси-ветка `project_updated`
   (без `changes`): «Обновлено: {первая подпись} и ещё N» вместо `labels.join(', ')` — значений у
   таких записей нет, и префикс «Обновлено:» остаётся единственным указанием, что это правка полей.
   Дедуп подписей через `Set` и отсев `stage` при `stage_id` — сохранить, N считается после них.
2. `src/lib/utils/call-brief.ts` (новый, чистый): `formatCallDuration(seconds: number | null): string | null`
   — `null`/`≤0` → `null`; `< 60` → «<1 мин»; иначе «N мин» (округление вниз); `≥ 3600` → «1 ч 05 мин».
   И «Имя Ф.» — если РАЗВЕДКА не нашла готового: `formatPersonShort(first, last)` → «Наталья Н.»,
   без фамилии → «Наталья».
3. `src/lib/hooks/use-call-brief.ts` (новый): `useCallBrief(callId: string | null)` →
   `select('id, duration_s, contact:contacts(first_name, last_name)')`, `.eq('id', …)`,
   `maybeSingle`, `enabled: !!callId`, `staleTime` 5 мин, ключ `['call-brief', callId]`.
   Инвалидировать его там же, где мутации звонка инвалидируют ленту (найти grep'ом `invalidateQueries`
   в `use-calls.ts`).

### Verification
```bash
npx tsc --noEmit
grep -n "parent_deal_id\|\btype:" src/lib/utils/activity-events.ts | head
```

---

## ЗАДАЧА 2: Последнее событие по макету

Файл `src/components/projects/DealLastEvent.tsx`. Логика якоря, `resolveEventEffects`,
`actionLabel` — **не трогать**, меняется только разметка.

1. Раскладка `grid-cols-[auto_1fr_auto] gap-3.5`, сверху и снизу hairline (`border-y border-border`),
   `py-3.5`. Контейнер больше не `.sheet` — стекло теперь у тела.
2. Иконка вида — плитка `size-10 rounded-xl` на тёмном (`bg-text-main`) с иконкой акцента
   (`text-accent`), иконка 18. Сверить в 8 темах: в `t-aura` акцент не цветной (theme-system.md) —
   если иконка там теряется, взять `--sheet-mark` так, как это делает `DealNextStep`.
3. Мета одной строкой `text-meta`: **тип** (600) · **дата, время** (600) · длительность · контакт ·
   автор. Длительность и контакт — из `useCallBrief(anchor.kind === 'call' ? anchor.sourceId : null)`;
   нет данных — сегмент не рисуется (без «—»).
4. Тело — `.glass-sheet` (`rounded-[0.875rem] rounded-bl-sm`, `px-4 py-3`): заголовок `anchor.title`
   (`text-sm font-semibold`), под ним `anchor.detail`, если есть (`text-body`, приглушённый токен
   стекла, `leading-relaxed`). Цвета текста — только через `--sheet-*`, как в `DealNextStep`.
   Пятно блика макета — только если у `.glass-sheet` оно уже есть; нового не рисовать.
5. Следствия — под телом ОДНОЙ строкой с переносом (`flex flex-wrap gap-x-4 gap-y-1`), `text-meta
   font-semibold text-success-text`, «→ текст». «и ещё N» — последним элементом, `text-text-mute`.
6. Кнопка справа: «Изменить» — `h-[1.875rem] rounded-[0.625rem] border border-border px-3`;
   «Открыть» — ghost (без рамки). Действие прежнее (`onOpenEvent`).

### Verification
```bash
grep -n "glass-sheet\|useCallBrief" src/components/projects/DealLastEvent.tsx
grep -n "#[0-9a-fA-F]\{3,6\}\b\|rgba(" src/components/projects/DealLastEvent.tsx | wc -l   # 0
```

---

## ЗАДАЧА 3: Строка ленты сделки — одна линия, точка по смыслу

### Context
Лента сделки в макете — одна строка на событие: точка 8 px + вертикальная линия 1 px, текст
12.5, справа мета «10ч назад · Олег» без переноса, табличные цифры. Цвет точки несёт смысл:
green — деньги/КП, amber — касания, серый — поля и прочее. Групп «Просрочено / Этот месяц /
Ранее» и шеврона нет.

### Steps
1. `src/lib/timeline/dot-tone.ts` (новый, чистый): `timelineDotTone(e: TimelineEvent): 'money' | 'touch' | 'neutral'`.
   `call`/`meeting` → `touch`; `activity` с изменением `budget` в `e.changes` → `money`; `activity`
   с `eventType` из списка КП (по РАЗВЕДКЕ; если таких типов нет — список пустой и это строка в отчёте)
   → `money`; остальное → `neutral`. Токены: `money` → `bg-success`, `touch` → `bg-warning`,
   `neutral` → `bg-border2` — семантика, **не** `--accent`.
2. `relativeTime` из `EntityTimeline.tsx` вынести в `src/lib/utils/relative-time.ts` (с `now`
   аргументом по конвенции) и импортировать обратно — поведение `EntityTimeline` не меняется.
3. `src/components/projects/DealActivityFeed.tsx` (новый) на `useEntityTimeline('project', id, requestKinds)`
   — той же механике чипа, что в `EntityTimeline` (фильтр → `p_kinds`, `emptyEntity`, ветки
   loading / error / пусто — перенести дословно, это купленные дефекты S-TL-1…3 и S-HEALTH-V2-1).
   Строка — `button` на всю ширину: `grid grid-cols-[auto_1fr_auto] items-baseline gap-3 py-1.5`,
   точка `size-2 rounded-full` на линии `border-l border-border` (линия обрывается на последней
   строке), текст `text-body truncate` (`title` + ` — detail`, полный текст — в `title=`), мета
   `text-meta text-text-mute whitespace-nowrap tabular-nums`. Просроченная задача — вместо цвета
   точки метка «просрочено» `text-danger-text` в мете (статус не теряется). Клик — `onOpenEvent`.

### Verification
```bash
npx vitest run tests/unit/timeline-dot-tone.test.ts tests/unit/relative-time.test.ts 2>&1 | tail -4
grep -rn "relativeTime" src --include=*.tsx | head
```

---

## ЗАДАЧА 4: Шапка, чипы, композер, «показать ещё»

1. `TimelineFilterChips` — аддитивные пропсы `variant?: 'default' | 'pill'` (дефолт `default`
   = нынешний вид), `labels?: Partial<Record<TimelineFilterValue, string>>`. `pill`: `rounded-full
   px-3 py-1 text-xs`, активная — `bg-text-main text-surface font-semibold`, неактивная —
   `text-text-dim hover:text-text-main`. Проверить контраст активной в 8 темах (`audit-contrast.py`).
2. Шапка блока `#deal-activity` в `ProjectDetail.tsx`: одна строка `flex flex-wrap items-center gap-2`
   — «Активность» (`text-xs font-bold`, иконку `Clock` убрать) · чипы `pill` с `labels={{ activity: 'Поля' }}`,
   набор `['call','meeting','task','note','activity','ai_run']` (порядок: Все · Звонки · Встречи ·
   Задачи · Заметки · Поля · AI) · справа `ml-auto` «Вся лента» (`text-xs font-semibold text-success-text`).
   ⚠️ Набор чипов — ОТДЕЛЬНО от `kindFilter`: `project` остаётся в данных (см. комментарий
   `kindFilter` в `EntityTimeline` — сужение набора возвращает дефект S-TL-2). Фильтр живёт у
   `ProjectDetail` и передаётся в `DealActivityFeed` (управляемый режим).
3. Порядок внутри блока: шапка → `DealLastEvent` → композер → `DealActivityFeed`. `EntityTimeline`
   из блока сделки уходит (у лида/компании/контакта остаётся).
4. `ActivityComposer` — аддитивный проп `variant?: 'default' | 'deal'`: `deal` — поле `h-10
   rounded-xl border-border2`, кнопка `size-7 rounded-[0.5625rem] bg-text-main text-accent`
   (как иконка события). Лид — без изменений.
5. Лента: первые 10 событий, под ними «Показать ещё» (ещё 10 из загруженных; кончились загруженные
   и `hasMore` — `loadMore()`). «Вся лента» в шапке — снять лимит (показать все загруженные +
   кнопка `loadMore` при `hasMore`). Смена чипа сбрасывает лимит на 10.

### Verification
```bash
grep -n "EntityTimeline\|DealActivityFeed\|variant=\"pill\"\|variant=\"deal\"" src/components/projects/ProjectDetail.tsx
grep -rn "<TimelineFilterChips\|<ActivityComposer" src --include=*.tsx
```
Второй grep: у лида и компании пропсов `variant` нет — их вид прежний.

---

## ТЕСТЫ

- `tests/unit/activity-events.test.ts` (дополнить): легаси `project_updated` с полями
  `['type','name','stage','stage_id']` → «Обновлено: тип и ещё 2» (`stage` отсеян при `stage_id`);
  с одним полем — «Обновлено: тип», без «и ещё»; `won_reason` + `won_detail` — одна подпись, «и ещё»
  нет; `fieldLabel('parent_deal_id')` → «родительская сделка».
- `tests/unit/call-brief.test.ts`: `formatCallDuration` — `null`, `0`, `-5` → `null`; `30` → «<1 мин»;
  `720` → «12 мин»; `3900` → «1 ч 05 мин». `formatPersonShort` (если заведён): «Наталья», «Н.» из
  «Нечаева»; пустая фамилия; пробелы по краям.
- `tests/unit/timeline-dot-tone.test.ts`: звонок и встреча → `touch`; `activity` с `changes.budget` →
  `money`; `activity` с `changes.next_step` → `neutral`; задача → `neutral`; AI → `neutral`.
- `tests/unit/relative-time.test.ts`: `now` фиксирован — 5 мин, 10 ч, 4 д, 11 дней (дата),
  будущее (задача со сроком) — формат как до выноса.
- `entity-timeline-kinds.test.tsx` — зелёный без правок: вид лида/компании не менялся.

UI (`DealLastEvent`, `DealActivityFeed`, шапка) — без юнит-тестов: разметка; логика вынесена в `lib/`.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run 2>&1 | tail -8
python3 scripts/audit-contrast.py 2>&1 | tail -5
npm run build 2>&1 | tail -5
```
Визуально (`npm run dev`): сделка со звонком последним событием (длительность и контакт в мете),
сделка с заметкой последним событием, сделка без событий. Тема **minimal** первой, затем семь
остальных — стекло «противоположно странице» в светлых и тёмных. Регрессия: лента лида и
компании — прежний вид. Сделка со старыми записями до 087 — строка «Обновлено: тип и ещё N».

## КОММИТ

```
feat(deals): «Активность» по макету W5 — стекло события, пилюли, лента в одну строку

Последнее событие: плитка вида, мета с длительностью и контактом звонка
(отдельный запрос на якорь, без правки RPC), тело на .glass-sheet, следствия
строкой. Лента сделки — DealActivityFeed: точка по смыслу (деньги / касание /
поля), мета справа, 10 + «Показать ещё». Чипы-пилюли в шапке, «Система» → «Поля».
Старые записи project_updated — «Обновлено: поле и ещё N». Лид, компания, контакт —
прежний вид.
```
