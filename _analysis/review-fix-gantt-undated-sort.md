# Ревью: fix-gantt-undated-sort — натуральная сортировка «Без дат»

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `adba329`; `use-project-schedule.ts`, `GanttTimeline.tsx`, types)  
**Объект:** `_analysis/fix-gantt-undated-sort.md` — сортировка бакета undated в Gantt (natural sort по `wbs_code` / `text`)  
**Контекст:** S-WBS-1 / 1.1 (tree + undated-parent rollup); прод-жалоба: «Без дат» вразнобой (4.1, 3.1, 5.1…); **миграций нет**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Root cause: `undated` без sort, порядок БД | ✅ L158–163, return L192 |
| Датированные: `bySpan` / `buildTree` — не трогать | ✅ |
| Ключ: `wbs_code` trim else `text` | ✅ поля есть (`Task.wbs_code`, `text`) |
| `localeCompare(..., 'ru', { numeric: true })` | ✅ natural 1.2 &lt; 1.10 |
| Scope: один файл, pure client | ✅ |
| Gantt `filteredUndated` без своего sort | ✅ L426–430 — наследует порядок hook |
| РАЗВЕДКА | ✅ (мелкий сдвиг L: milestones filter) |
| Смешанный wbs/text | 🟡 **W1** (v1 ok) |
| Null-safety `text` | 🟡 **W2** (minor) |
| UI chips wrap, не «список» | 🟡 **W3** (product, не блокер) |
| Нет unit-теста на comparator | 🟡 **W4** optional |

**Оценка: 9/10.** Диагноз 1:1 с live; фикс минимальный и правильный.  
**Рекомендация:** **запускать в CC as-is** (W1–W2 — одна строка в HOW по желанию).

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| `undated: Task[]` push без sort | ✅ `use-project-schedule.ts` L158–163, 192 |
| `bySpan` только в `buildTree` | ✅ L47–48, L112, L116 |
| `wbs_code` на `tasks` | ✅ 052 / `supabase.gen.ts`; UI TaskModal/Gantt label |
| `filteredUndated` | ✅ filter only, **no re-sort** L426–430 |
| Рендер «Без дат» | ✅ chips `map` L953–967 — порядок = массив |
| Сортировка undated уже есть | ❌ отсутствует (ожидаемо) |

---

## Разведка (факт vs фикс)

| Утверждение | Live |
|-------------|------|
| undated ~L158–163 без sort | ✅ push в порядке `all` (board fetch) |
| Gantt undated L428–430 «тоже без sort» | ⚠️ фильтр L426–430 (milestones → `[]`; open → filter lane); **sort нет** — смысл верный, строки чуть иные |
| `wbs_code` / `text` на Task | ✅; `sort_order` на **tasks** нет (есть у `delivery_template_tasks` — не путать) |
| Нумерация в `text` при пустом wbs | ✅ продуктовый контекст delivery; Gantt показывает `task.text` в chips |

---

## С чем согласен полностью

### 1. Root cause
Датированные задачи после `buildTree` упорядочены `bySpan` (даты). Undated обходит дерево и копятся в порядке итерации `all` = порядок загрузки с борда — «вразнобой» для человека, ищущего 1.x / 2.x.

### 2. Natural sort в одном месте (hook)
Сортировать в `useProjectSchedule` перед return — single source: все потребители `undated` (Gantt chips, `allTaskIds` для deps — порядок ids не критичен) получают стабильный UX. Дублировать sort в `GanttTimeline` не нужно.

### 3. Ключ wbs_code → text
Правильный fallback: когда WBS проставлен — код; иначе текст с ведущим номером этапа. `{ numeric: true }` закрывает 1.2 vs 1.10.

### 4. Не трогать bySpan / buildTree / filters
Критично: хронологический Gantt и tree-order WBS не смешивать с «номером этапа» undated-бакета.

### 5. Нет миграций / schema
Pure client — schema.md не нужен.

---

## Блокеры

Нет.

---

## Предупреждения

### W1. Смешанные ключи wbs_code vs text
Если у части задач заполнен `wbs_code` («1.2»), у других только text («1.2 Обследование…»), `localeCompare` сравнивает разные строки → порядок может «прыгать». Фикс это признаёт; для текущего прода (wbs пуст) — ок.  
Опционально позже: нормализовать ключ (`wbs_code ?? leadingNumber(text) ?? text`).

### W2. `text` null / empty (defensive)
В типах `text` обычно NOT NULL; при `text === null` упадёт `localeCompare`. Дешёвый guard:

```ts
const sortKey = (t: Task) =>
  (t.wbs_code?.trim() || t.text || '');
```

(сейчас `t.wbs_code && t.wbs_code.trim()` ок; `t.text` без `?? ''`.)

### W3. UI — wrap chips, не вертикальный список
После sort порядок в DOM правильный, но `flex-wrap` всё равно «плавает» визуально по ширине. Для смока: проверять **порядок в DOM / tab order / title sequence**, не «слева-направо как таблица». Не блокер фикса.

### W4. Unit-тест comparator (optional)
3–5 кейсов (`1.2` vs `1.10`, wbs vs text, empty) в vitest — дёшево; не обязателен для CC.

### W5. (nit) Deploy copy
Фикс пишет «Vercel» — у проекта primary host **Netlify**. Смоук на прод-URL, не важно имя.

---

## Пропущенные места

| Файл | Факт | Действие |
|------|------|----------|
| `use-project-schedule.ts` | единственная точка sort | ✅ как в фиксе |
| `GanttTimeline.tsx` `filteredUndated` | filter only | не трогать |
| Другие undated UI | grep: undated essentially Gantt | ок |

---

## Предлагаемые правки в промпт (optional)

1. Guard `t.text ?? ''` (W2).  
2. Смоук: «порядок в массиве/DOM», не «сетка chips».  
3. Host: Netlify, не Vercel.

---

## Чеклист перед CC

- [ ] Только `src/lib/hooks/use-project-schedule.ts`
- [ ] Sort **после** цикла наполнения undated, **перед** return (после `buildTree` свимлейнов — порядок undated независим)
- [ ] Не менять `bySpan` / `buildTree` / dated swimlanes
- [ ] `npx tsc --noEmit`
- [ ] Смоук: delivery Gantt → «Без дат» 1.1, 1.2, … 2.1… (filter «Открытые» / «Все»)

---

## Итог

Микрофикс с верным диагнозом и минимальным diff. **GO для Claude Code** без обязательных правок промпта.
