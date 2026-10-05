# Claude Code Prompt — S-TODAY-FOCUS-4: активность в фокусе

**Основание:** `_analysis/today-focus-spec.md` (§7; решения F-06, F-07, F-08), макет `_analysis/mockup-S-TODAY-FOCUS.html` (кадры 2, 3, 4).
**Эпик:** S-TODAY-FOCUS, спринт 4 из 4. **Зависимость:** `S-TODAY-FOCUS-3` в `main`.
**Схема:** миграций нет, БД не трогаем, типы не меняются. Запись — только заметка через существующий `useCreateNote`.
**Цель:** в фокусе видно и делается то, что меняется каждый день: пульс фильтрует ленту по дню, лента — по виду события, заметка пишется в одну строку без перехода в карточку сделки.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull

# 1. FOCUS-3 в main — ожидание: плитки с кольцом, тело фокуса из FOCUS-1
ls src/components/today/TodayMoveTile.tsx src/components/today/TodayFocusBody.tsx
grep -n "useEntityTimeline\|FOCUS_FEED" src/components/today/TodayFocusBody.tsx

# 2. Лента: ключ запроса, размер страницы, вид события
grep -n "TIMELINE_PAGE_SIZE\s*=" -r src/lib | head -3
grep -n "queryKey\|initialPageParam\|queryFn\|getNextPageParam\|staleTime" src/lib/hooks/use-entity-timeline.ts
grep -n "export interface TimelineEvent" -A 40 src/types/timeline.ts | grep -n "kind\|eventType\|noteKind\|date"

# 3. Как лента карточки сделки отличает смену стадии и комментарий к стадии — тот же признак берём здесь
grep -n "stage_changed\|stage_comment" -r src/components/projects src/lib/utils/activity-events.ts | head -10

# 4. Пульс — общий компонент: кто ещё его использует (поведение у них не меняется)
grep -rn "PulseDayStrip" src --include=*.tsx | grep -v "^src/components/shared/PulseDayStrip.tsx"
grep -n "function dayTitle\|export interface PulseDay" -A 10 src/components/shared/PulseDayStrip.tsx src/lib/domain/deal-pulse.ts | head -30

# 5. Заметка: мутация, вход, инвалидация
grep -n "export function useCreateNote" -A 18 src/lib/hooks/use-notes.ts
grep -n "export interface NoteInput" -A 9 src/lib/notes/build-insert.ts

# 6. Клавиши: onKeys, isActive из FOCUS-1
grep -n "onKeys\|isActive" -A 2 src/components/today/TodayView.tsx | head -20

# 7. Данные ленты тестовой сделки — какие kind/eventType/noteKind реально приходят.
#    Открой тестовую сделку на экране и выведи в консоль браузера `events.map(e => [e.kind, e.eventType, e.noteKind])`
#    из TodayFocusBody (временно, перед коммитом убрать). Таблицу — в отчёт.

# 8. Базовая линия
npx vitest run 2>&1 | tail -4
npm run lint 2>&1 | tail -3
```

---

## ЗАДАЧА 1 — домен: `src/lib/domain/focus-feed.ts`

```ts
export type FeedBucket = 'note' | 'call' | 'stage' | 'other';

/** Вид события для чипа и иконки. */
export function feedBucket(e: Pick<TimelineEvent, 'kind' | 'eventType' | 'noteKind'>): FeedBucket;

export interface FeedFilter {
  bucket: FeedBucket | 'all';
  /** День 'YYYY-MM-DD' по МСК; null — все дни. */
  day: string | null;
}

/** События не позже `now`, под фильтр, по убыванию даты — как пришли. */
export function filterFeed<T extends Pick<TimelineEvent, 'kind' | 'eventType' | 'noteKind' | 'date'>>(
  events: readonly T[],
  filter: FeedFilter,
  now: Date,
): T[];

/** Счёт по видам среди событий не позже `now`. */
export function countBuckets(
  events: readonly Pick<TimelineEvent, 'kind' | 'eventType' | 'noteKind' | 'date'>[],
  now: Date,
): Record<FeedBucket | 'all', number>;
```

`feedBucket` — проверки сверху вниз:

| Условие | Вид |
|---|---|
| `eventType === 'stage_changed'` или `noteKind === 'stage_comment'` | `stage` |
| `kind === 'note'` | `note` |
| `kind === 'call'` | `call` |
| иначе (встреча, задача, правка полей, AI) | `other` |

Признаки стадии сверь с лентой карточки сделки (разведка 3) и с данными тестовой сделки (разведка 7). Если смена стадии приходит иначе — правило бери из ленты карточки и запиши в «Отклонения».

День события — `mskDateKey(e.date)`: та же ось, что у пульса (`buildPulseDays`).

**Проверка:** `npx vitest run tests/unit/focus-feed.test.ts`.

---

## ЗАДАЧА 2 — интерактивный пульс: `PulseDayStrip.tsx`

Общий компонент: карточка сделки и другие потребители из разведки 4 не меняются.

- Новые необязательные пропсы: `selectedDay?: string | null`, `onSelectDay?: (day: string) => void`.
- Без `onSelectDay` — разметка и поведение прежние, байт в байт по DOM.
- С `onSelectDay`: обёртка — `role="group"` с тем же `aria-label`; каждый день — `<button type="button" aria-pressed={d.day === selectedDay} aria-label={dayTitle(d)} title={dayTitle(d)}>`, курсор `pointer`; выбранный день — `outline: 2px solid var(--text); outline-offset: 1px`; `focus-visible` — тот же контур. Клик — `onSelectDay(d.day)`.
- Высота и сетка полосы не меняются: кнопка без своих отступов и границ (`appearance: none`, фон прозрачный).

**В фокусе** (`TodayFocusBody`): заголовок секции «Было · 30 дней», справа подсказка 11/400 `text-text-mute` «день — события, клик — лента за день». Клик по дню → фильтр ленты `day`; клик по выбранному дню → снять.

**Проверка:** `npx tsc --noEmit`; карточка сделки — визуально без изменений (смок 8).

---

## ЗАДАЧА 3 — лента с фильтром и иконками

**3.1. Данные.** Лента фокуса грузит страницу `TIMELINE_PAGE_SIZE` (размер ленты карточки сделки) вместо 10: фильтру нужен материал, а ключ кеша совпадает с лентой карточки — переход в карточку открывает её из кеша. Показ — `filterFeed(...)` и первые 8 (`FOCUS_FEED_EVENTS`); день выбран — все события дня.

**3.2. Чипы** в заголовке секции «Лента», справа: «Все {n}» · «Заметки {n}» · «Звонки {n}» · «Стадии {n}» (`countBuckets`). Чип — кнопка `aria-pressed`, высота 1.375rem, `padding: 0 0.5rem`, радиус 999px, граница `--border`, 11/400 `text-text-dim`; активный — граница `--border2`, фон `--surface2`, `text-text-main` 500; нулевой — пунктир, `text-text-mute`, `disabled`. Выбран день — вместо четырёх чипов один активный «{dayText(day)} ✕» (клик снимает день) и «Все {n}». Смена сделки в фокусе — фильтр сбрасывается.

**3.3. Событие** — сетка `3.25rem 1rem minmax(0, 1fr)`, `gap: 0.375rem`, 12/400, `line-height 1.4`: дата `text-text-mute` tabular → иконка 0.875rem → текст `line-clamp-2`, `title` — полный текст.

| Вид | Иконка lucide | Цвет |
|---|---|---|
| `note` | `StickyNote` | `text-text-dim` |
| `call` | `Phone` | `text-text-dim` |
| `stage` | `Flag` | `text-info` |
| `other`, встреча | `Users` | `text-text-dim` |
| `other`, задача | `ListChecks` | `text-text-dim` |
| `other`, прочее | `Dot` | `text-text-dim` |

Один цвет — один смысл (F-08): цвет только у смены стадии, тем же `--info`, что капсула стадии в пульсе. Лента карточки сделки остаётся как есть — расхождение её цвета звонка с пульсом записано отдельной находкой.

**3.4. Пусто:** событий нет — «Событий пока нет»; под фильтр — «Нет событий этого вида»; день — «{dayText(day)}: событий нет». Внизу всегда — «Вся лента сделки» (карточка сделки).

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 4 — строка заметки: `src/components/today/TodayFocusNote.tsx`

- Секция тела между пульсом и лентой. `<label class="sr-only">Заметка в ленту сделки</label>` + `<input type="text">` высотой 2rem, `placeholder` «Заметка в ленту сделки», справа внутри — `<kbd>↵</kbd>`. Граница — `--border2`, радиус `--radius-m`.
- Enter (не во время IME-набора: `e.nativeEvent.isComposing`) → `useCreateNote().mutateAsync({ project_id, body: text.trim() })`. Пустой текст — ничего. Во время записи поле `disabled`.
- Успех: поле очищается; новое событие ленты (`kind === 'note'`, дата не раньше момента отправки минус 60 с) выделено — дата 12/600 `text-text-main` — до смены сделки в фокусе.
- Ошибка: тост — его уже даёт хук (`onError`), текст в поле остаётся.
- Пока поле в фокусе или в нём есть текст — подсказка под полем 11/400 `text-text-mute`: «Заметка не закрывает ход — для этого «Сделано» (D)». Заметка пишет касание, но шаг и счётчик дня не меняет — без подсказки её примут за «Сделано» (цена F-07).
- Esc в поле — прежний обработчик фокуса из FOCUS-1 (DOM-фокус на строку); текст остаётся.
- **Клавиша N** (`onKeys.KeyN` в `TodayView`): узкий режим — открыть панель; затем курсор в поле заметки (ref через `TodayFocusPane`). Строка подсказки клавиш: добавить «N — заметка».

**Проверка:** `npx tsc --noEmit`.

---

## ЗАДАЧА 5 — префетч ленты соседних сделок

Быстрый J/K грузит ленту на каждую сделку по очереди (спека, §7, «что доски не проверяют»).

- `use-entity-timeline.ts`: вынести опции запроса в экспортируемую `entityTimelineQueryOptions(entityType, entityId, kinds, limit)` — `queryKey`, `initialPageParam`, `queryFn`, `getNextPageParam`, `staleTime`. Хук использует её же. Поведение хука не меняется: ключ и функции — те же значения.
- `TodayView`: смена сделки в фокусе → через 300 мс без новых смен — `queryClient.prefetchInfiniteQuery(entityTimelineQueryOptions('project', id, undefined, TIMELINE_PAGE_SIZE))` для предыдущей и следующей сделки очереди (только элементы-сделки). Таймер сбрасывается при каждой смене и в cleanup.

**Проверка:** `npx vitest run` — тесты ленты, если есть, зелёные; во вкладке Network при J по трём строкам подряд с паузой — запрос ленты следующей сделки уходит до её выбора.

---

Попутно (гейт FOCUS-3): `moveWhy` и тип `MoveWhy` в `src/lib/utils/today-text.ts` остались без потребителей после удаления `TodayMoveCard` — удалить вместе с их тестами (`grep -rn "moveWhy" src tests`).

## ТЕСТЫ

**`tests/unit/focus-feed.test.ts`** — новый. `now` — 04.10.2026 12:00 МСК.

- `feedBucket`: `stage_changed` → `stage`; заметка с `noteKind: 'stage_comment'` → `stage`; обычная заметка → `note`; `call` → `call`; `meeting`, `task`, `project_updated` → `other`.
- `filterFeed`: событие завтра — исключено при любом фильтре; `bucket: 'note'` → только заметки, порядок исходный; `day: '2026-09-29'` → события этого дня по МСК; событие `2026-10-03T22:30:00Z` попадает в день '2026-10-04' (МСК), не '2026-10-03'; `bucket` и `day` вместе — пересечение.
- `countBuckets`: сумма по видам = `all`; будущие события не считаются.

Пульс, чипы, поле заметки — тестов нет: разметка; правила видов и фильтра вынесены в домен и покрыты.

```bash
npx vitest run tests/unit/focus-feed.test.ts 2>&1 | tail -10
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run lint 2>&1 | tail -3
npx vitest run 2>&1 | tail -6
python3 scripts/audit-tokens.py 2>&1 | tail -3
npm run build 2>&1 | tail -6
grep -rn "console.log" src/components/today | head
git diff --stat main -- src/lib/domain/today-deals.ts src/lib/domain/today-model.ts src/lib/domain/step-flow.ts
```

Критерии приёмки:

1. `tsc` — 0 ошибок; `lint` — 0 errors, warnings не больше базовой линии; `vitest` зелёный; `build` проходит; `audit-tokens` без новых находок.
2. `console.log` из разведки 7 удалён; домен V3 не тронут (последний `git diff` пуст).
3. `PulseDayStrip` без `onSelectDay` рендерит прежний DOM.

## СМОКИ

Заметки пишутся — только на **тестовой сделке**. Темы: `t-minimal`, `t-aura`, `t-frost`. Ширины 1440 и 1280.

| # | Что | Ожидание |
|---|---|---|
| 1 | Навести на день пульса | Подсказка: дата и события дня |
| 2 | Клик по дню с касанием | Лента — события этого дня; чип «{день} ✕»; повторный клик — фильтр снят |
| 3 | Чип «Заметки», затем «Стадии» | Лента под вид; у смены стадии иконка `--info`, у остальных нейтральная |
| 4 | Нулевой вид | Чип пунктиром и не нажимается |
| 5 | N на тестовой сделке → текст → Enter | Поле очистилось; заметка первой в ленте, дата выделена; ход не отмечен сделанным, счётчик дня прежний |
| 6 | Enter при отключённой сети | Тост ошибки; текст в поле остался |
| 7 | J по трём сделкам с паузой ≥ 0.5 с | Лента каждой следующей сделки показывается без скелетона |
| 8 | Карточка сделки, блок «Пульс» | Без изменений: дни не кнопки, контура нет |
| 9 | Смена сделки при активном фильтре | Фильтр сброшен на «Все» |

## ЧЕГО В ЭТОМ СПРИНТЕ НЕТ

- AI-сводки сделки (F-10).
- Правки цвета звонка в ленте карточки сделки (F-08, отдельная находка).
- Подгрузки ленты дальше первой страницы в фокусе: «Вся лента сделки» ведёт в карточку.
- Редактирования и удаления заметок из фокуса.
- «Поставить задачу» из фокуса.

## STATUS

`crm-architect/STATUS.md` не правь. После мержа гейт пишет строку `| #<PR> | S-TODAY-FOCUS-4 | … |` и поднимает ревизию — протокол закрытия спринта в `crm-architect/SKILL.md`. Без этой строки `scripts/status-check.sh` краснеет после мержа (урок эпика S-TODAY-V3). В «Дополнительно» отчёта предложи текст строки: что изменилось для пользователя, число тестов, «Миграций нет».

## КОММИТ

Перед коммитом сохрани отчёт (формат — секция ОТЧЁТ ниже) в `_analysis/sprint-S-TODAY-FOCUS-4-report.md`: спринт-файл уже в `main`, а страж `sprint-file` требует файл `_analysis/` в диффе ветки (урок FOCUS-1). `git add` и `git commit` — отдельными вызовами.

```bash
git checkout -b feat/today-focus-4
git add src/ tests/ _analysis/sprint-S-TODAY-FOCUS-4-report.md
git commit -m "feat(today): активность в фокусе — пульс по дням, фильтр ленты, заметка в одну строку

- focus-feed: вид события (заметка, звонок, стадия, прочее), фильтр по виду и дню МСК
- PulseDayStrip: необязательный выбор дня; без него поведение прежнее
- лента фокуса: чипы с числами, нейтральные иконки, стадия — --info
- TodayFocusNote: Enter пишет заметку, N ставит курсор, подсказка «заметка ≠ Сделано»
- префетч ленты соседних сделок; опции запроса ленты вынесены из хука

Миграций нет.
Основание: _analysis/today-focus-spec.md"
```

Без `git push`.

## ОТЧЁТ

Финальный ответ в чат — строго в этом формате. Стиль STE-lite:
- Предложение ≤ 20 слов. Одно предложение — один факт или одно действие.
- Активный залог, прошедшее время: «добавил индекс», не «индекс был добавлен».
- Один термин = одно значение. Сущности называй как в коде: имя файла, таблицы, функции.
- Без оценок: «отлично», «полностью», «успешно», «готово к проду» — запрещены.
  Вместо оценки — артефакт: число, вывод команды, exit code.
- Не больше 3 существительных подряд. Без цепочек «осуществление проведения проверки».
- Списки вертикальные, вложенность ≤ 1 уровня.

Сделано
- `путь/к/файлу` — что изменено. Одна строка на файл или на одно изменение.

Проверки
- `команда` → результат (0 ошибок tsc · 42 теста passed · build exit 0).

Не сделано
- Что пропущено и почему. Пусто → «—».

Отклонения от спринта
- Где сделал иначе, чем в файле спринта, и почему. Пусто → «—».

Вопросы и риски
- Не больше 3 пунктов. Пусто → «—».

Дополнительно приложи: таблицу из разведки 7 (`kind`, `eventType`, `noteKind` и сколько событий каждого вида у тестовой сделки); результат смоков 5 и 7.
