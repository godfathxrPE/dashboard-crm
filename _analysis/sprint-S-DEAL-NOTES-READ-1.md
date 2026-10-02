# Claude Code Prompt — S-DEAL-NOTES-READ-1: заметки и встречи читаются в ленте

> Спринт-файл: `_analysis/sprint-S-DEAL-NOTES-READ-1.md` · ветка `feat/deal-notes-read-1`
> Миграций нет. RLS не трогаем. Мокап — артефакт «Лента сделки: чтение заметок» (апрув Олега).

## Зачем

Сделку ведут по заметкам и записям встреч. Сейчас прочитать их на карточке нельзя:

| Где | Что видно | Причина в коде |
|---|---|---|
| Плитка «Событие» (`DealLastEvent`) | 2066 символов одним абзацем, жирным, без переносов | `anchor.title` в `<p className="text-sm font-semibold">` — CSS схлопывает `\n`; весь текст заметки сидит в `title` (`describeEvent` → `p.text`) |
| Строка ленты (`DealActivityFeed`) | одна строка `truncate`, полный текст — только нативный тултип | `title={text}` + `truncate` |
| Встреча / звонок | текст виден только в модалке редактирования | клик по строке → `openTimelineEvent` → `MeetingModal`/`CallModal`; режима чтения нет |
| Встреча с шагом | заметки встречи в ленте не видны вовсе | `meetingToEvent`: `detail: m.next_step ?? m.notes` — при заполненном шаге `notes` теряется; у звонка то же с `agreements` |
| Композер | 2000 символов в поле высотой 40px | `h-10`, `rows={1}`; Enter отправляет — многострочный текст набрать нельзя, только вставить |

Данные целые: замер 02.10 — у 6 из 79 заметок и 13 из 20 звонков в тексте есть `\n`,
заметка «АНФИШ» хранится 2066 символов с переносами. Чиним **только показ и ввод**.

Эталон — HubSpot / Pipedrive: заметка и встреча раскрываются **в самой ленте** (превью
2–3 строки → «Развернуть»), модалка — только для правки. Salesforce Activity Timeline —
то же через шеврон строки. Ни одна из трёх не прячет текст в тултип.

## Решения (закрыты владельцем, не пересматривать)

- **Rich text (Tiptap/HTML) НЕ вводим.** Храним плоский текст, как сейчас. Структуру
  восстанавливает рендерер: абзацы, списки `- `, подзаголовки. Причины: HTML в БД =
  санитизация на каждом выводе, ломается вход AI-ревью и `deal-review` (читают текст),
  и 79 существующих заметок остались бы «вторым сортом».
- **Модель события — аддитивно.** `TimelineEvent` получает `body?` и `nextStep?`;
  `title`/`detail` не меняются — их читают `EntityTimeline`, org-лента, AI-контекст.
- **Ввод: Enter — перенос строки, ⌘/Ctrl+Enter — отправить.** Так в HubSpot/Pipedrive;
  заметка встречи многострочна по природе. Подсказка под полем при фокусе.
- **Компания / контакт / внедрение (`EntityTimeline`) — вне спринта**, хвост в STATUS.
  Лид получает фикс бесплатно: он уже на `DealActivityFeed` + `DealLastEvent`.

---

## РАЗВЕДКА

```bash
git --no-pager log --oneline -3
git status --short
grep -n "title={text}\|truncate\|rowText" src/components/projects/DealActivityFeed.tsx
grep -n "anchor.title\|anchor.detail\|KIND_TITLE" src/components/projects/DealLastEvent.tsx
grep -n "detail:" src/lib/timeline/adapters.ts
grep -n "notes\|agreements\|next_step\|text(p, 'text')" src/lib/timeline/rpc-adapter.ts
grep -n "comment_added" src/lib/utils/activity-events.ts
grep -n "h-10\|rows=\|onKeyDown" src/components/shared/ActivityComposer.tsx
grep -n "rows=" src/components/meetings/MeetingModal.tsx src/components/calls/CallModal.tsx
grep -rn "DealActivityFeed\|DealLastEvent" src --include=*.tsx | grep import
ls tests/unit | grep -i "timeline\|adapter\|activity-events"
```

Ожидание: `title={text}` и `truncate` в строке ленты; `detail: m.next_step ?? m.notes`
и `detail: c.next_step ?? c.agreements` в адаптерах; композер `h-10`. Расходится — стоп,
отчёт.

Данные (read-only, через Олега/гейт — CC в прод не ходит). Справочно, замер 02.10:

```sql
select 'comment' src, count(*) n,
  count(*) filter (where length(payload->>'text')>200) long_,
  count(*) filter (where position(E'\n' in payload->>'text')>0) nl,
  max(length(payload->>'text')) mx
from activity_log where event_type='comment_added'
union all select 'meeting.notes', count(*), count(*) filter (where length(notes)>200),
  count(*) filter (where position(E'\n' in notes)>0), max(length(notes)) from meetings
union all select 'call.agreements', count(*), count(*) filter (where length(agreements)>200),
  count(*) filter (where position(E'\n' in agreements)>0), max(length(agreements)) from calls;
-- comment 79/8/6/2066 · meeting.notes 4/1/0/2060 · call.agreements 20/10/13/3892
```

⚠️ Единственная длинная встреча (02.10, 2060 симв.) записана **уже без переносов** —
вставлена из сплющенной плитки. Рендерер её не восстановит (эвристику « - » → список
НЕ делаем: дефис внутри фраз «1С - ЧЗ» даст ложные списки). Олег перевставит текст руками.

---

## ЗАДАЧА 1: `lib/text/note-blocks.ts` — плоский текст → блоки

### Context
Одна чистая функция, которую читают и плитка, и лента. Без React, без HTML.

### Steps
Создать `src/lib/text/note-blocks.ts`:

```ts
export type NoteBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

/** Маркер пункта: «- », «– », «— », «• », «* », «1. », «1) » в начале строки. */
export function parseNoteBlocks(raw: string): NoteBlock[];

/** Первая непустая строка — заголовок превью; остальное — тело. */
export function splitNoteHead(raw: string): { head: string; rest: string };

/** Текст без разметки для превью в одну-две строки: переносы → пробел, маркеры сняты. */
export function noteToPlainLine(raw: string): string;
```

Правила `parseNoteBlocks` (детерминированные, без угадывания):
1. `\r\n` и `\r` → `\n`; хвостовые пробелы строк срезать.
2. Пустая строка разделяет блоки.
3. Подряд идущие строки с маркером → один `list`; маркер срезается. Строка без маркера
   сразу после пункта списка — продолжение этого пункта (через пробел).
4. Строка — `heading`, если: без маркера, длина ≤ 48, не кончается на `. , ; ! ?`
   (двоеточие допустимо и сохраняется), и **следующая непустая строка — пункт списка**.
   «Ситуация», «Решение (предварительно)», «Итоги:» — заголовки; «Участники: …» с точкой
   — абзац.
5. Прочие подряд идущие строки → один `paragraph`, переносы внутри сохраняются как `\n`
   (рендер — `whitespace-pre-line`).
6. Пустой / пробельный вход → `[]`.

### Verification
`npx vitest run tests/unit/note-blocks.test.ts`

---

## ЗАДАЧА 2: событие ленты несёт полный текст — `body` и `nextStep`

### Context
`detail` сегодня = «шаг ИЛИ заметки», поэтому заметки встречи с шагом пропадают.

### Steps
1. `src/types/timeline.ts`, в `TimelineEvent` после `detail` (аддитивно):
   ```ts
   /** S-DEAL-NOTES-READ-1: полный текст события — заметка, notes встречи,
    *  agreements звонка. Плоский текст с переносами; рендер — `<NoteBody>`. */
   body?: string;
   /** S-DEAL-NOTES-READ-1: следующий шаг встречи/звонка отдельно от тела. */
   nextStep?: string;
   ```
2. `src/lib/timeline/adapters.ts`:
   - `callToEvent`: `body: c.agreements ?? undefined`, `nextStep: c.next_step ?? undefined`.
   - `meetingToEvent`: `body: m.notes ?? undefined`, `nextStep: m.next_step ?? undefined`.
   - `detail` **не трогать**.
   - Пустую строку / пробелы в `body` и `nextStep` нормализовать в `undefined`.
3. `src/lib/timeline/rpc-adapter.ts`, ветка `activity`: если
   `event_type === 'comment_added'` и `typeof p.text === 'string'` → `body: p.text`.
   `title` оставить как есть (`describeEvent`).
   Проверить, что `notes`/`agreements` уже доносятся до `meetingToEvent`/`callToEvent`
   (по разведке — да: `text(p, 'notes')`, `text(p, 'agreements')`).

### Verification
`grep -n "body\|nextStep" src/lib/timeline/adapters.ts src/lib/timeline/rpc-adapter.ts`
+ `npx vitest run tests/unit/timeline-rpc-adapter.test.ts`

---

## ЗАДАЧА 3: `<NoteBody>` — рендер блоков со свёрткой

### Context
Один компонент на плитку и ленту. Живёт в `src/components/shared/` — классы Tailwind из
`src/lib` в сборку не попадают (грабля 26.09, комментарий в `DealActivityFeed`).

### Steps
Создать `src/components/shared/NoteBody.tsx`:

```tsx
export function NoteBody({
  text,
  collapsedLines = 6,   // 0 — без свёртки
  className,
}: { text: string; collapsedLines?: number; className?: string })
```

- Блоки — из `parseNoteBlocks(text)`. **Только текстовые узлы React**, никакого
  `dangerouslySetInnerHTML` (XSS-контур S28).
- Разметка: `heading` → `<p className="mt-3 first:mt-0 text-meta font-semibold uppercase
  tracking-wide text-text-mute">`; `paragraph` → `<p className="whitespace-pre-line
  text-body leading-relaxed text-text-main">`; `list` → `<ul className="space-y-1">` с
  `<li>` и точкой-маркером `before:` в `--text-mute`. Отступ между блоками — `space-y-2`
  на контейнере. Цвета — только токены; внутри `.glass-sheet` они уже переопределены
  (`--sheet-*`), theme-if в разметке нет.
- Свёртка: контейнер `overflow-hidden` с `style={{ maxHeight: \`${collapsedLines}lh\` }}`
  пока свёрнуто. Нужна ли кнопка — мерить: `ref.scrollHeight > ref.clientHeight + 1`
  в `useLayoutEffect` + `ResizeObserver` (cleanup обязателен). Не переполнено — кнопки
  нет. Переполнено — снизу маска `mask-image: linear-gradient(to bottom, black 70%,
  transparent)` и кнопка «Развернуть» / «Свернуть» (`text-xs font-semibold
  text-text-dim hover:text-text-main`, `aria-expanded`).
- Клик по кнопке **не всплывает** (`e.stopPropagation()`) — строка ленты сама кликабельна.

### Verification
`npx tsc --noEmit`; визуально — задача 6.

---

## ЗАДАЧА 4: плитка «Событие» → читаемая заметка

### Context
Плитка рендерит 2066 символов жирным `title`. Нужно: тип «Заметка», заголовок — первая
строка, тело — `<NoteBody>` со свёрткой.

### Steps
`src/components/projects/DealLastEvent.tsx`:
1. Подпись вида: для `anchor.kind === 'activity' && anchor.eventType === 'comment_added'`
   → **«Заметка»** вместо `KIND_TITLE.activity` («Событие»). Хелпер
   `eventTitle(e: TimelineEvent): string` рядом с `KIND_TITLE`.
2. Тело стекла:
   - заметка (`body` есть, `kind==='activity'`): `splitNoteHead(body)` → `head` в
     `<p className="text-sm font-semibold …">` (как сейчас `anchor.title`), `rest` →
     `<NoteBody text={rest} collapsedLines={8} className="mt-2" />` если не пусто;
   - встреча/звонок с `body`: `anchor.title` как сейчас, затем `<NoteBody text={body}
     collapsedLines={8} className="mt-2" />`, затем `nextStep` строкой
     `→ Следующий шаг: …` (`text-meta font-semibold`);
   - прочие события — как сейчас (`title` + `detail`).
3. Кнопка действия справа не меняется.

### Verification
Сделка «АНФИШ» (лид/сделка с заметкой 02.10): плитка «Заметка · 2 окт, 16:56 · Олег»,
заголовок «02.10.2026 · Zoom · ООО «АНФИШ» (ИНН 5056005909)», ниже абзац участников,
подзаголовки СИТУАЦИЯ / ПРОИЗВОДСТВО / …, списки по пунктам, свёрнуто до 8 строк,
«Развернуть» раскрывает всё.

---

## ЗАДАЧА 5: строка ленты раскрывается на месте

### Context
Главная жалоба: прошлую длинную заметку видно только тултипом. Паттерн HubSpot/Pipedrive:
превью в строке, раскрытие на месте, модалка — только «Изменить».

### Steps
`src/components/projects/DealActivityFeed.tsx`:
1. `hasBody = Boolean(event.body)`.
2. **Строка без `body`** — как сейчас, но **убрать `title={text}`** (тултип с 2000
   символами — дефект, а не фича; короткому тексту он не нужен — строка его вмещает).
3. **Строка с `body`** (заметка, встреча/звонок с текстом):
   - Первая строка грида: для заметки — `splitNoteHead(body).head`; для встречи/звонка
     — `event.title`. `truncate` остаётся.
   - Под ней, во второй колонке грида: превью `noteToPlainLine(rest или body)` в
     `line-clamp-2 text-meta text-text-dim`. Пустое — не рисовать.
   - Клик по строке **переключает раскрытие** (не `onOpenEvent`). Состояние —
     `useState<Set<string>>` по `event.id`, несколько раскрытых одновременно — можно.
     Кнопка строки получает `aria-expanded` и `aria-controls`.
   - Раскрыто: под строкой (та же колонка, `pl` по линии точек) — `<NoteBody
     text={…} collapsedLines={0} />` (полностью, без второй свёртки), для встречи/звонка
     ниже `nextStep` строкой, и ряд действий: для `call`/`meeting` — «Изменить»
     (→ `onOpenEvent(event)`), для заметки действий нет (правки заметок нет в продукте —
     кнопку не рисуем, см. правило «кнопка без действия» в `DealLastEvent`).
   - Вертикальная линия таймлайна тянется через раскрытый блок (`h-full` уже от `li`
     — проверить глазом; если рвётся, перенести линию на `li` с `relative`).
4. События без `body` по клику — прежнее поведение (`onOpenEvent`).
5. Сброс раскрытия при смене чипа не нужен — id стабильны.

### Verification
Чип «Заметки»: три длинные заметки 02.10 — у каждой заголовок + 2 строки превью, клик
раскрывает полностью, повторный — сворачивает. Чип «Встречи»: встреча 02.10 раскрывается,
«Изменить» открывает `MeetingModal`. Клавиатура: Tab до строки, Enter/Space раскрывает.

---

## ЗАДАЧА 6: ввод длинного текста — композер и модалки

### Steps
1. `src/components/shared/ActivityComposer.tsx`, оба варианта:
   - Автовысота textarea: на `onChange`/`onInput` — `el.style.height = 'auto';
     el.style.height = \`${Math.min(el.scrollHeight, maxPx)}px\``, где `maxPx` = 12 строк
     (считать из `getComputedStyle(el).lineHeight`); выше — `overflow-y-auto`.
     После отправки высота сбрасывается.
   - Вариант `deal`: контейнер `h-10` → `min-h-10`, `items-center` → `items-end`, кнопка
     прижата к низу (`mb-1.5`).
   - Клавиши: **Enter — перенос строки; ⌘+Enter / Ctrl+Enter — отправить.** Подсказка
     под полем при `focus-within`: «⌘↵ — отправить» (на не-Mac — «Ctrl+↵»; определить по
     `navigator.platform`/`userAgentData` один раз, SSR-безопасно — в `useEffect`).
     Текст подсказки `text-meta text-text-mute`.
2. `src/components/meetings/MeetingModal.tsx` — `textarea notes`: `rows={3}` → `rows={8}`,
   добавить `resize-y max-h-[60vh]`.
3. `src/components/calls/CallModal.tsx` — `textarea agreements`: `rows={5}` → `rows={8}`,
   `resize-y max-h-[60vh]`.

### Verification
Вставить текст «АНФИШ» в композер — поле растёт до 12 строк, дальше скролл; Enter даёт
перенос, ⌘↵ отправляет, поле схлопывается. В ленте — заметка с сохранённой структурой.

---

## ТЕСТЫ

`tests/unit/note-blocks.test.ts` (новый):
1. Текст «АНФИШ» (фикстура в тесте, сокращённая до 3 разделов): первая строка → `paragraph`
   (дата·Zoom — не заголовок: за ней не список), «Ситуация» → `heading`, следующие
   `- …` → один `list` из N пунктов с срезанным маркером.
2. `\r\n` → то же, что `\n`.
3. «Участники: Олег, Сергей.» перед списком → `paragraph` (кончается точкой).
4. «Итоги:» перед списком → `heading` «Итоги:».
5. Строка длиной 49 без пунктуации перед списком → `paragraph`.
6. Строка без маркера сразу после пункта → склеивается с пунктом.
7. Маркеры `•`, `–`, `—`, `*`, `1.`, `1)` → пункты.
8. Пустой и пробельный вход → `[]`.
9. Сплющенный текст «Ситуация - Считают … - В ЧЗ …» → **один** `paragraph`
   (эвристики « - » нет — фиксируем намеренно).
10. `splitNoteHead`: ведущие пустые строки пропускаются; однострочный текст → `rest: ''`.
11. `noteToPlainLine`: переносы → пробел, маркеры сняты, двойные пробелы схлопнуты.

`tests/unit/timeline-rpc-adapter.test.ts` (дополнить):
12. `comment_added` с `payload.text` → `body === text`, `title` прежний.
13. Встреча с `notes` и `next_step` → `body = notes`, `nextStep = next_step`,
    `detail = next_step` (обратная совместимость).
14. Звонок с `agreements = '   '` → `body === undefined`.

Красным на дефектном коде: тест 13 обязан падать на текущем `meetingToEvent` (нет `body`).

---

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit
npm test
npm run lint        # не хуже baseline main
npm run build       # при остановленном dev — .next общий
```

Смок руками в теме **minimal**, затем aura и одной тёмной (fuji/tidal): плитка-стекло
читается, подзаголовки не теряются на стекле, маска свёртки не даёт серого пятна.

## КОММИТ

```bash
git add src/lib/text/note-blocks.ts src/components/shared/NoteBody.tsx \
  src/types/timeline.ts src/lib/timeline/adapters.ts src/lib/timeline/rpc-adapter.ts \
  src/components/projects/DealLastEvent.tsx src/components/projects/DealActivityFeed.tsx \
  src/components/shared/ActivityComposer.tsx src/components/meetings/MeetingModal.tsx \
  src/components/calls/CallModal.tsx tests/unit/note-blocks.test.ts \
  tests/unit/timeline-rpc-adapter.test.ts
git commit -m "feat(deal): заметки и встречи читаются в ленте — структура, раскрытие на месте, многострочный ввод (S-DEAL-NOTES-READ-1)"
```

STATUS: закрывающий PR вносит свой номер вторым коммитом после `gh pr create`.
Хвост в «Очередь»: **NOTES-READ-2** — `<NoteBody>` в `EntityTimeline` (компания,
контакт, внедрение) + `org`-лента.
