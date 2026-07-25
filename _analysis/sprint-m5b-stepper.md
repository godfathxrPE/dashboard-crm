# Claude Code Prompt — Sprint M5b: Компактный стептер жизненного цикла (D2)

Закрывает высоту стептера на деталке проекта (≈260px, 4 полных трек-ряда).
Вариант 2 (согласован): завершённые и будущие фазы — компактные чипы в одну
строку, активная фаза — полные чевроны. Гейт-логика (клик по сегменту,
onStageClick, locked, расчёт state сегмента) НЕ трогается — только render-слой.

Файл: `src/components/projects/StackedPipeline.tsx` (единственный).
Чекаут: feat/deal-card (после M6-пуша).

> v1.1 — по ревью Grok: B1 — placeholder `s.id === ''` в задаче 1 УБРАН, дана
> точная live-формула trackStateOf с currentStageId+isWon (иначе active-трек
> пропадал); хелпер возвращает и trackHasCurrent (FullTrack его требует для
> pill); useState+ReactNode в импорты (W1); «свернуть» — button+aria (W5);
> FullTrack вырезать байт-в-байт (W6).

---

## РАЗВЕДКА

```bash
git log --oneline -1
grep -n "tracks.map\|trackState\|trackHasCurrent\|function Segment\|onStageClick\|flex h-9" src/components/projects/StackedPipeline.tsx
```

Подтвердить: `tracks.map((track) => …)` рендерит для КАЖДОГО трека заголовок
(dot+label+pill+✓) и чеврон-бар `flex h-9`. `trackState` ('future'|'active'|
'done') считается инлайн в начале map. `Segment` и его onClick — ниже, отдельно.

---

## ЗАДАЧА 1: Вынести расчёт trackState в хелпер (формула 1:1 из live)

Импорты в начало файла: `import { useMemo, useState, type ReactNode } from 'react';`
(сейчас только useMemo).

Инлайн-расчёт `trackState` (внутри текущего `tracks.map`) вынести в чистую
функцию над `return`. КРИТИЧНО: формула — БАЙТ-В-БАЙТ из live (не упрощать
пороги, это a11y-проверенная логика), с параметром `currentStageId` (без него
active-трек не определится). Хелпер возвращает и `trackHasCurrent` — он нужен
FullTrack для pill текущей стадии:

```tsx
function trackStateOf(
  track: TrackGroup,
  stages: PipelineStage[],
  currentIndex: number,
  currentStageId: string,
  isWon: boolean,
): { state: 'future' | 'active' | 'done'; trackHasCurrent: boolean } {
  const trackHasCurrent = track.stages.some((s) => s.id === currentStageId);
  const firstOrder = track.stages[0].order_index;
  const lastOrder = track.stages[track.stages.length - 1].order_index;
  const currentOrder = stages[currentIndex]?.order_index ?? -1;
  let state: 'future' | 'active' | 'done';
  if (isWon || (currentOrder >= 0 && currentOrder > lastOrder)) state = 'done';
  else if (trackHasCurrent) state = 'active';
  else if (currentOrder >= 0 && currentOrder >= firstOrder) state = 'active';
  else state = 'future';
  return { state, trackHasCurrent };
}
```

Вызывать `trackStateOf(track, stages, currentIndex, currentStageId, isWon)`.

## ЗАДАЧА 2: Стейт раскрытия + группировка рендера

```tsx
const [expandedKey, setExpandedKey] = useState<string | null>(null);
```

Вместо `tracks.map(...)` собрать список рендер-узлов: трек показывается ПОЛНЫМ
(заголовок + чеврон-бар, как сейчас) если `state === 'active'` ИЛИ
`expandedKey === track.key`; иначе он — компактный чип. Подряд идущие
компактные треки коалесцируются в ОДНУ строку `flex flex-wrap gap-1.5`:

```tsx
const nodes: React.ReactNode[] = [];
let chips: TrackGroup[] = [];
const flush = (k: string) => {
  if (!chips.length) return;
  nodes.push(
    <div key={`chips-${k}`} className="flex flex-wrap items-center gap-1.5">
      {chips.map((t) => (
        <TrackChip key={t.key} track={t} state={trackStateOf(t, …)} onClick={() => setExpandedKey(t.key)} />
      ))}
    </div>
  );
  chips = [];
};
tracks.forEach((track, i) => {
  const st = trackStateOf(track, …);
  const full = st === 'active' || expandedKey === track.key;
  if (full) { flush(String(i)); nodes.push(<FullTrack key={track.key} … onCollapse={expandedKey === track.key ? () => setExpandedKey(null) : undefined} />); }
  else chips.push(track);
});
flush('end');
```

- `FullTrack` = вырезанный БАЙТ-В-БАЙТ текущий блок трека (заголовок dot+label+
  pill+✓ + `flex h-9` чеврон-бар с `Segment`). Ни `state` сегмента, ни `onClick`,
  ни `locked` не меняются — иначе провал задачи 4. `trackHasCurrent` для pill
  берётся из `trackStateOf`. Если `onCollapse` передан (трек раскрыт вручную) —
  в заголовок добавить кнопку «свернуть»: `<button type="button" aria-expanded
  onClick={onCollapse}>` с шевроном и focus-visible (НЕ `div` onClick — W5).
- Прогресс-бар (`mt-1 flex … {pct}%`) остаётся ПОСЛЕ списка, без изменений.

## ЗАДАЧА 3: Компонент TrackChip

```tsx
function TrackChip({ track, state, onClick }: { track: TrackGroup; state: 'future'|'done'; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} title={`${track.label} — раскрыть`}
      className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-surface2"
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: state === 'done' ? 'var(--text-mute)' : track.color }} />
      <span style={{ color: state === 'done' ? 'var(--text-dim)' : 'var(--text-mute)' }}>{track.label}</span>
      {state === 'done' && <span className="text-text-mute">✓</span>}
    </button>
  );
}
```

Клик по чипу раскрывает трек в чевроны (setExpandedKey) — навигация по стадиям
не теряется, гейт-логика доступна через раскрытие. Заливкой чип НЕ красим
(категория ≠ статус — правило маркеров).

## ЗАДАЧА 4 (проверка): гейты не тронуты

Убедиться, что `Segment`, `onStageClick`, `locked`, расчёт `state` сегмента
('done'|'current'|'future') не изменены ни на строку. Меняется ТОЛЬКО то,
какие треки рендерятся полными vs чипами.

---

## СМОК

Два проекта:
1. Delivery «Аграрная группа — внедрение» (активная фаза «Исполняется /
   Проектирование»): Инициирован + Планируется — чипы с ✓ в одну строку,
   «Исполняется» — полные чевроны, «Завершён» — чип. Высота стептера заметно
   меньше, план ближе к сгибу.
2. Клиентская IIoT-сделка (если есть) — та же логика по фазам воронки.

Проверить: клик по чипу «Инициирован» раскрывает его чевроны + появляется
«свернуть»; клик по сегменту активной фазы по-прежнему двигает стадию
(гейт-баннер, если есть, срабатывает как раньше); прогресс-% не изменился.
Прогон minimal + frost (тёмная): чипы на surface читаются, точка-маркер видна.
tsc 0.

## КОММИТ

```bash
git add src/components/projects/StackedPipeline.tsx
git commit -m "refactor(project): компактный стептер — завершённые/будущие фазы в чипы, активная в чевронах"
```

НЕ пушить без подтверждения. Миграций нет.
