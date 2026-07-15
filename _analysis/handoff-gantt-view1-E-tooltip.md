# Claude Code — S-GANTT-VIEW-1 · Фаза E (фикс тултипа): fixed-позиционирование

**Зачем:** тултип §9.2 сейчас нефункционален — per-bar поповер `absolute top-full` внутри `overflow-x-auto`
таймлайна клиппится по вертикали (overflow-x:auto ⇒ overflow-y тоже не visible). Это дыра в требовании v1, не долг.
**Что:** заменить per-bar поповер на ОДИН общий поповер с `position: fixed`, следующий за курсором — `fixed`
считается от вьюпорта, overflow контейнера его не режет. Без либы (Radix в стеке нет). Read-only, ничего больше не трогаем.

## РАЗВЕДКА
```bash
cd ~/Downloads/dashboard-crm/src
grep -n "group relative\|group-hover:block\|top-full\|assignee\|status = laneLabel\|onEditTask(gt.task)\|nameById" components/tasks/GanttTimeline.tsx
```
Найти: (1) per-row вычисление `assignee`/`status` (~203–204); (2) `<div className="group relative" ...>` обёртку бара/ромба (~207); (3) вложенный `<div ... group-hover:block>` поповер (~226–230); (4) обе `<button>` (бар и milestone).

## ЗАДАЧА (`components/tasks/GanttTimeline.tsx`)

### 1. Состояние тултипа (в компоненте, рядом с `zoom`/`filter`)
```ts
const [tip, setTip] = useState<{ x: number; y: number; text: string; assignee: string; status: string } | null>(null);
```

### 2. Хендлеры на обе кнопки (бар и milestone)
На каждый `<button>` (бар и ромб) добавить:
```tsx
onMouseEnter={(ev) => setTip({ x: ev.clientX, y: ev.clientY, text: gt.task.text, assignee, status })}
onMouseMove={(ev) => setTip((t) => (t ? { ...t, x: ev.clientX, y: ev.clientY } : t))}
onMouseLeave={() => setTip(null)}
```
(`assignee`/`status` уже посчитаны в скоупе строки — переиспользовать, не дублировать.)

### 3. Удалить старый поповер
Убрать вложенный `<div className="pointer-events-none absolute left-0 top-full ... group-hover:block">…</div>`.
Класс `group` на обёртке `<div className="group relative">` больше не нужен для тултипа — оставить `relative` (нужен барам/гриду) можно, `group` убрать (если больше нигде не используется — проверить grep).

### 4. Один общий fixed-поповер в корне компонента
В самом конце JSX (внутри внешнего контейнера, но ВНЕ `overflow-x-auto`-body — например сразу перед закрывающим тегом корня):
```tsx
{tip && (
  <div
    className="pointer-events-none fixed z-50 w-max max-w-[240px] rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs shadow-lg"
    style={{ left: tip.x + 12, top: tip.y + 12 }}
  >
    <div className="font-medium text-text-main">{tip.text}</div>
    <div className="mt-0.5 text-text-dim">Исполнитель: {tip.assignee}</div>
    <div className="text-text-dim">Статус: {tip.status}</div>
  </div>
)}
```
`+12` — отступ от курсора. (Опц. долг: клэмп к правому/нижнему краю вьюпорта — для v1 не обязательно.)

## ПРОВЕРКА
```bash
npx tsc --noEmit
# build — нативно на Маке, dev остановить
```
Смок: hover по бару → тултип у курсора (название/исполнитель/статус), движется за курсором, **НЕ обрезается** при любом положении/скролле; ромб-веха → тот же тултип; mouseleave → исчезает. Клик по бару/ромбу по-прежнему открывает TaskModal (хендлеры кликов не трогали).

## КОММИТ
```bash
git add -A && git commit -m "fix(gantt): тултип через fixed-позиционирование (не клиппится overflow)"
# только src/, доки не тащить. НЕ пушить. index.lock снять rm -f при необходимости.
```

## Заметка гейта (Cowork)
- `fixed` эскейпит `overflow` — единственный способ без портала/либы. Курсор-follow проще anchored-варианта (не пересчитывать rect при скролле). Для read-only v1 достаточно.
- Один общий поповер, не N per-bar — меньше DOM, нет группового клиппинга.
- Клик-хендлеры (`onClick→onEditTask`) на кнопках НЕ трогаем — только добавляем mouse-хендлеры. VIEW-1 после E = §9.2 закрыт полностью.
