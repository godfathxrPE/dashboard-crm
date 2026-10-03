# Claude Code Prompt — S-NOTES-2.1: лента сделки на notes — зоны, шпиль, действия с заметками

Эпик S-NOTES, спринт 2.1 из 2. Следом — S-NOTES-2.2 (редактор с панелью markdown, вставка из буфера).

**Мокап (апрувлен владельцем 03.10, вариант Б «пилюля типа»):** `_analysis/mockup-S-NOTES-2.html`.
Открой его в браузере, прежде чем писать разметку: компоновка, состояния и тексты — оттуда, не из
этого файла. Решения и объём: Claude Project `claude/decisions-S-NOTES-2-2026-10-03.md` (выжимка ниже).

Ветка: `feat/notes-2-1`, worktree `.claude/worktrees/feat+notes-2-1` от свежего `origin/main`.
Этот файл лежит untracked в основном чекауте — перенеси его в worktree **через `mv`**, не `cp`.
Мокап `_analysis/mockup-S-NOTES-2.html` — тоже `mv`.

## Что решено (не пересматривать)

1. `projects.pinned_note` остаётся полем сделки. В UI оно называется **«Суть сделки»** и стоит первым
   блоком зоны «Закреплено» в ленте, правка на месте. Карточка «Закреплено» в правой колонке сделки
   и строка про закреплённую заметку в «Материалах» уходят. Переноса значений в `notes` нет: поле
   пишут AI-прогрессия, автоматизации (`set_field`, SQL 050), `convert_lead`, модалка перехода
   стадии; гейт стадии умеет его требовать.
2. Зоны ленты сверху вниз: **Закреплено** (суть сделки + до 3 закреплённых заметок) →
   **Запланировано** (открытые задачи и будущие встречи) → **история по дням**.
3. История — вертикальная ось с узлами по типу касания. Узел: заметка `yellow`, встреча `purple`,
   звонок `blue`; системные строки (поля, AI, закрытые задачи) — мелкая точка. Линия — отдельные
   отрезки между узлами с зазором, через кружки не проходит. Тип внутри карточки — **пилюля** в шапке
   (`yellow-l`/`purple-l`/`blue-l`), карточка нейтральная; у заметки — бумажный тон, как сейчас.
4. **Боковых маркеров нет нигде:** ни `border-left`, ни inset-полосы слева у карточек и блоков.
   Правило владельца.
5. Смена стадии — карточка «было → стало» с узлом-флагом; комментарий перехода (`notes.kind =
   'stage_comment'`) стоит внутри неё. ⚠️ Отступление от мокапа: в мокапе узел стадии на `--accent`.
   В коде `--accent` для смысла запрещён (в `t-washi` акцент = красный, в `t-aura` не цветной), а
   `--info` синий и спорит со звонком. Узел стадии — инверсный нейтральный: фон `text-main`, иконка
   `bg`; карточка — `surface2` + `border`.
6. Статус встречи и звонка — нейтральный текст с галочкой, не зелёная пилюля.
7. Права в UI: свою заметку manager правит и удаляет; чужую — только закрепить и скопировать
   (кнопок правки нет, а не «нет доступа» после клика). owner/admin — всё. viewer — только
   «Скопировать текст», композера нет, «Суть сделки» без кнопки правки.
8. Плитка «Последнее событие» (`DealLastEvent`) уходит из вкладки сделки.

## РАЗВЕДКА

```bash
git fetch origin && git log --oneline -1 origin/main
grep -n "DealLastEvent\|DealActivityFeed\|ActivityComposer" src/components/projects/ProjectDetail.tsx
grep -n "PinnedNoteCard\|Закреплено" src/components/projects/DealContextRail.tsx
grep -n "pinned_note" src/components/projects/DealMaterialsCard.tsx src/components/projects/ProjectMaterialsModal.tsx
grep -rn "DealActivityFeed\|useDealActivity" src --include=*.tsx -l
grep -n "export" src/lib/hooks/use-notes.ts src/lib/hooks/use-org-role.ts src/lib/hooks/use-auth.ts
grep -n "case 'note'" -A 20 src/lib/timeline/rpc-adapter.ts
grep -n "useRealtimeSync" src/lib/hooks/use-entity-timeline.ts
grep -n "purple\|yellow\|blue\|info" tailwind.config.ts
grep -n "label: 'Закреплённая заметка'\|label: 'Закреплено'" -r src/lib/constants
```

Read-only разведка живой БД через Supabase MCP (писать запрещено, CLAUDE.md правило 1):

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 3;
select tgname from pg_trigger where tgrelid = 'public.activity_log'::regclass and not tgisinternal;
select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%comment_added%';
select kind, count(*) from public.notes where deleted_at is null group by 1;
select count(*) filter (where pinned_at is not null) as pinned from public.notes;
```

Ожидается: последняя версия журнала — `20261002200000 notes_2_timeline` ⇒ номер новой миграции
**135**; в `activity_log` есть `trg_zz_notes_bridge`; `comment_added` упоминает только
`entity_timeline` (фильтр) и `notes_from_comment_added` (мост). Иначе — стоп, отчёт.

`DealActivityFeed` использует и `LeadDetail` (лента лида, S-LEAD-V2-WORK-1). Новая лента обязана
работать для `entityType = 'lead'`: зона «Закреплено» у лида — только закреплённые заметки, без
«Сути сделки».

## ЗАДАЧА 1: миграция 135 — снять мост `comment_added → notes`

### Context
Мост `trg_zz_notes_bridge` (134) копировал заметки, которые старый клиент писал в `activity_log`.
С S-NOTES-1 клиент пишет в `notes` напрямую, писателей `comment_added` нет (проверено 03.10).

### Steps
Файл `supabase/migrations/135_notes_drop_bridge.sql`:

```sql
-- 135 — S-NOTES-2.1: снять мост comment_added → notes (134, секция 9).
-- СТАТУС: НАПИСАНА, НЕ ПРИМЕНЕНА. Применяет гейт Cowork.
-- Писателей comment_added в клиенте и БД нет (разведка 03.10); строки журнала НЕ трогаем —
-- это аудит. entity_timeline уже исключает comment_added (134), её не меняем.
drop trigger if exists trg_zz_notes_bridge on public.activity_log;
drop function if exists public.notes_from_comment_added();
```

`docs/schema.md`: в ledger — запись 135 «НАПИСАНА, НЕ ПРИМЕНЕНА»; в разделе `### notes` — строка
про мост: снят в 135.

### Verification
```bash
cat supabase/migrations/135_notes_drop_bridge.sql
grep -n "135" docs/schema.md | head
```

## ЗАДАЧА 2: хуки действий с заметкой

### Context
Правка, закрепление, удаление и возврат. Закрепление/удаление/возврат — только RPC 134
(`set_note_pinned(p_note_id, p_pinned)`, `soft_delete_note(p_note_id)`, `restore_note(p_note_id)`),
правка — `update notes set body` (column-grant разрешает клиенту только `body`).

### Steps
В `src/lib/hooks/use-notes.ts` добавить:
- `useUpdateNote()` — `supabase.from('notes').update({ body }).eq('id', id)`; optimistic: тело в кэше
  ленты меняется сразу, при ошибке откат + `toast.error`. `edited_at` ставит триггер — в кэш его не
  писать руками, после успеха — invalidate.
- `useSetNotePinned()` — RPC `set_note_pinned`. Ошибка с `code = 'P0001'` и `hint = 'notes_pin_limit'`
  → тост «Закреплено уже три заметки. Открепите одну — и эта встанет на её место.» Остальные ошибки —
  `noteErrorMessage`.
- `useSoftDeleteNote()` — RPC `soft_delete_note`, optimistic: карточка пропадает сразу. После успеха —
  тост «Заметка удалена» с действием «Вернуть», длительность 8 с; «Вернуть» → `restore_note` →
  invalidate.
- `usePinnedNotes(entityType, entityId)` — отдельный запрос закреплённых заметок сущности:
  `select('id, body, kind, created_by, created_at, pinned_at, edited_at')`, фильтр по
  `project_id`/`lead_id` (по `entityType`), `pinned_at not null`, `deleted_at is null`,
  `order('pinned_at')`, лимит 3. Лента пагинирована keyset'ом — закреплённая заметка может лежать
  на любой странице, поэтому из ленты её не выбираем.

Все мутации инвалидируют префикс `['timeline']` и ключ `usePinnedNotes`. Realtime: в ленте
сущности подписка `useRealtimeSync('notes', …)` на её ключи (сейчас подписана только org-лента).

Тип ошибки Supabase — `PostgrestError`; разбор `code`/`hint` — функцией в `src/lib/notes/`
(`isPinLimitError(err: unknown): boolean`), не в хуке — её тестируем.

### Verification
```bash
grep -n "export function use" src/lib/hooks/use-notes.ts
npx tsc --noEmit
```

## ЗАДАЧА 3: модель ленты — чистые функции в `src/lib/timeline/feed-model.ts`

### Context
Раскладка событий по зонам и дням, склейка изменений полей, привязка комментария к смене стадии —
логика, её место в `lib/` с тестами, не в компоненте.

### Steps
Функции (время — аргументом `now`, не `Date.now()` внутри; таймзона — та же, что у
`relativeTime`):
- `splitPlanned(events, now)` → `{ planned, history }`. В `planned`: задачи не в статусе `done`
  (любая дата, просроченные тоже) и встречи с датой `>= now`. Порядок planned — по дате по
  возрастанию, просроченные первыми. Всё остальное — `history`.
- `groupByDay(history, now)` → `[{ key, label, items }]`; метки «Сегодня, 3 октября»,
  «Вчера, 2 октября», дальше «30 сентября» (год — только если не текущий).
- `collapseFieldChanges(items)` — подряд идущие события журнала (`kind = 'activity'`, правки полей,
  не смена стадии и не удаление) одного автора в окне 10 минут → одна группа
  `{ type: 'fields', count, labels, items }`. Одиночная правка остаётся строкой.
- `attachStageComments(items)` — заметка `noteKind = 'stage_comment'` прикрепляется к ближайшему
  событию смены стадии того же автора в окне ±2 минуты; прикреплённая из списка уходит. Не нашлось
  пары — остаётся отдельной карточкой заметки.

⚠️ `splitPlanned` работает по загруженным страницам ленты. Открытая задача с датой старше первой
страницы в «Запланировано» не попадёт. Отдельный запрос задач в этом спринте не заводим — посчитай
по живой БД, у скольких сделок есть открытые задачи старше первой страницы ленты, и напиши число в
отчёте (решение — на гейте).

Для `attachStageComments` нужна `meta` заметки (`to_stage_id`): добавь в `TimelineEvent` поле
`noteMeta?: { fromStageId?: string; toStageId?: string }`, адаптер `rpc-adapter.ts` (case `note`)
читает его из `payload.meta`. Если `to_stage_id` есть и у события стадии, сравнивать по нему, а
окно времени — запасной вариант.

### Verification
```bash
npx vitest run tests/unit/feed-model.test.ts
```

## ЗАДАЧА 4: зона «Закреплено» и уход старых мест

### Steps
1. Компонент `src/components/projects/DealPinnedZone.tsx`:
   - «Суть сделки» (только `entityType = 'project'`): пилюля `Суть сделки` с иконкой булавки,
     подпись «поле сделки · читает AI», текст `pinned_note`. Правка на месте по кнопке-карандашу
     (появляется на hover/focus): поле до 500 символов со счётчиком, ⌘↵ — сохранить, Esc — отмена,
     сохранение — существующий `useUpdateProject({ id, pinned_note })`. Пусто — строка-приглашение
     «Две строки: что продаём и что мешает закрыть» по клику открывает правку. viewer — без кнопки.
   - Закреплённые заметки из `usePinnedNotes`: та же карточка заметки, что в истории, тело свёрнуто
     до 3 строк, «Показать полностью». Счётчик в заголовке зоны — «N из 3».
   - Зоны нет совсем, если суть пуста и закреплённых нет и пользователь — viewer.
2. `DealContextRail.tsx`: убрать `PinnedNoteCard` и её вызов (блок «4. Закреплено»).
3. `DealMaterialsCard.tsx`: убрать строку `pinned_note`. `ProjectMaterialsModal.tsx` — проверить
   комментарий про рельсу и поправить текст.
4. `ProjectDetail.tsx`: убрать `<DealLastEvent>` в ветке сделки. В ветке внедрения/внутреннего
   проекта (`EntityTimeline`) — не трогать.
5. Подписи «Закреплённая заметка» → «Суть сделки» в `src/lib/constants/ai-progression.ts` и
   `src/lib/constants/automation.ts` (только `label`, ключ `pinned_note` не менять). `DealFocusPanel`
   (вид «Сегодня», peek) — поле остаётся, заголовок «Закреплено» → «Суть сделки».
6. Если после шага 4 у `DealLastEvent` не осталось потребителей — файл удалить; если остались —
   перечислить в отчёте.

### Verification
```bash
grep -rn "PinnedNoteCard\|Закреплённая заметка" src ; echo "exit=$?"
grep -rn "DealLastEvent" src
```

## ЗАДАЧА 5: лента — ось, карточки, действия

### Context
`src/components/projects/DealActivityFeed.tsx` переписывается по мокапу. Публичный API
(`DealActivityFeed`, `useDealActivity`, `DEAL_CHIP_KINDS`, `DEAL_CHIP_LABELS`) сохраняется —
`ProjectDetail` и `LeadDetail` не должны меняться сверх задачи 4.

### Steps
1. Структура: `DealPinnedZone` → «Запланировано» (из `splitPlanned`; строка задачи с чекбоксом-видом
   и датой, просроченная — «просрочено · 2 окт» `danger-text`; встреча — иконка людей, дата, автор;
   клик — `onOpenEvent`) → история по дням (`groupByDay`).
2. Ось: у каждого события слева колонка — узел + отрезок под ним (flex/grid, отрезок `flex-1`,
   отступ ~0.4rem от узла сверху и до следующего узла снизу). После последнего события дня и перед
   меткой дня отрезка нет. Метка дня — пилюля на оси. Узлы: см. «Что решено» п. 3 и 5. Цвет узла
   и пилюли — токены `yellow`/`purple`/`blue` + `-l`; для текста пилюли нужен контрастный тон:
   если `--*-text` определён во всех 7 темах — добавить алиасы в `tailwind.config.ts`, иначе
   `text-[var(--purple-text,var(--purple))]`. Проверить контраст на `t-minimal`, `t-aura`, `t-frost`.
3. Карточки касаний (заметка, встреча, звонок): шапка — пилюля типа · статус (встреча/звонок) ·
   автор с аватаром · время справа; заголовок; тело `NoteBody`, свёрнуто до 6 строк с «Показать
   полностью»; у встречи — участники и блок «Дальше» со сроком; у заметки — «изменено» с тултипом
   даты правки, если `editedAt`. Ширина текста — `max-w-[72ch]`.
4. Действия на hover/focus (плашка сверху справа, фон `--popover` — на стеклянной теме `--surface`
   полупрозрачен): у заметки — Закрепить/Открепить, Изменить, Скопировать текст, «⋯» → Скопировать
   ссылку, Удалить. Видимость — по «Что решено» п. 7 (`useOrgRole` + `useAuth().user.id ===
   actorId`). У встречи и звонка — Изменить (`onOpenEvent`, существующие окна) и Скопировать текст.
   Удаление — без confirm-диалога: отмена через тост (задача 2). `window.confirm` запрещён.
5. Правка заметки на месте: карточка переходит в режим правки — поле (многострочное, как в
   `ActivityComposer`), «Отмена» / «Сохранить», ⌘↵ / Esc. Ошибка сохранения — текст остаётся в поле,
   строка «Не получилось сохранить — нет связи. Текст остался в поле.» и кнопка «Повторить».
   Панель форматирования — НЕ в этом спринте (2.2).
6. Системные строки: группа изменений полей — «3 изменения · Бюджет, Следующий шаг, Менеджер»
   с раскрытием «показать/скрыть»; AI, закрытые задачи — одной строкой с точкой.
7. Состояния — по мокапу: загрузка (скелет 2–3 карточки), ошибка («Ленту не удалось загрузить.» +
   «Повторить»), пусто у сделки («Здесь появятся заметки, звонки и встречи по сделке. Начните с
   заметки по первому разговору.»), пусто под чипом — прежний текст. «Показать ещё» — существующая
   пагинация.
8. Цвета — только токены, без hex; rem/em; иконки Lucide; без эмодзи. Боковых маркеров нет.

### Verification
```bash
grep -n "border-l\b\|border-l-\[\|border-l-2\|border-l-4\|inset_3px\|shadow-\[inset" src/components/projects/DealActivityFeed.tsx src/components/projects/DealPinnedZone.tsx ; echo "exit=$?"
grep -n "#[0-9a-fA-F]\{3,6\}" src/components/projects/DealActivityFeed.tsx src/components/projects/DealPinnedZone.tsx ; echo "exit=$?"
npx tsc --noEmit
```
Оба grep — `exit=1`.

## ТЕСТЫ

`tests/unit/feed-model.test.ts`:
- `splitPlanned`: задача `pending` в будущем → planned; задача `overdue` в прошлом → planned и первая;
  задача `done` → history; встреча вчера → history; встреча завтра → planned; звонок завтра → history.
- `groupByDay`: события сегодня/вчера/30 сентября/прошлого года → четыре группы с правильными метками;
  граница суток по локальному времени (событие в 00:10 сегодня — «Сегодня»).
- `collapseFieldChanges`: 3 правки одного автора за 4 минуты → одна группа count=3; правка другого
  автора между ними рвёт группу; одиночная правка не группируется; смена стадии не входит в группу.
- `attachStageComments`: комментарий с `toStageId` = стадии события → прикреплён; без пары →
  остаётся заметкой; два перехода подряд — каждый получает свой комментарий.

`tests/unit/notes-errors.test.ts`: `isPinLimitError` — `{ code: 'P0001', hint: 'notes_pin_limit' }` →
true; `P0001` с другим hint → false; не-объект / `null` → false.

`tests/unit/timeline-rpc-adapter.test.ts`: строка `note` с `meta.to_stage_id` → `noteMeta.toStageId`.

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit && npm run lint && npx vitest run && npm run build
```

## КОММИТ

```bash
git add supabase/migrations/135_notes_drop_bridge.sql docs/schema.md src tests \
  _analysis/sprint-S-NOTES-2.1.md _analysis/mockup-S-NOTES-2.html
git commit -m "feat(notes): лента сделки по зонам и на оси, правка/закрепление/удаление заметок, суть сделки вместо рельсы, миграция 135 (S-NOTES-2.1)"
```
Без push. Миграцию не применять.

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
