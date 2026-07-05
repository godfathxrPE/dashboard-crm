# Claude Code Prompt — Sprint: Aura Design Fixes

Контекст: тема `t-aura` (Torii CRM, Next.js 15 + Tailwind + Supabase). Аудит — `AURA-DESIGN-AUDIT-2026-06-14.md`. Все правки скоупить в `.t-aura` или в Aura-ветки компонентов (`isAura`), НЕ ломать другие 9 тем. Цвета — только CSS-переменные. Проверять минимум в Aura + одной тёмной теме.

Дефекты подтверждены runtime-изоляцией в браузере (не догадки). Прошлый фикс `isAnimationActive` НЕ решил проблему Аналитики — там другой корень.

---

## РАЗВЕДКА (выполнить первыми, до правок)

```bash
cd ~/Downloads/dashboard-crm

# 1. Подтвердить дефекты графиков
grep -n "isAnimationActive\|url(#phase-shadow)\|url(#calls-shadow)\|donutIn\|transformOrigin" src/components/analytics/Charts.tsx src/components/analytics/CallsChart.tsx
grep -n "isAnimationActive\|<Bar" src/components/dashboard/DashboardHome.tsx

# 2. Pipeline токены
sed -n '23,66p' src/components/projects/StackedPipeline.tsx

# 3. Заголовки страниц (разнобой size/weight)
grep -rn "<h1" src/components src/app --include=*.tsx

# 4. Шапка таблицы
grep -n "thead\|<th\|text-transform\|uppercase" src/components/shared/DataTable.tsx

# 5. Шрифт Unbounded
grep -n "Unbounded\|font-unbounded" src/app/layout.tsx
grep -n "kpi-value\|aura-display\|data-kpi-value\|\.t-aura h1" src/app/globals.css
grep -rn "kpi-value\|aura-display\|data-kpi-value" src/components --include=*.tsx   # ожидается ПУСТО

# build baseline
npx tsc --noEmit 2>&1 | tail -5
```

---

## ЗАДАЧА 1 (P0): Графики Аналитики — невидимы из-за SVG-фильтра и застрявшей анимации

**Корень (доказан изоляцией в браузере):**
- Бары рендерятся 154×18 с валидным градиентом, но `filter: url(#phase-shadow)` (`feDropShadow`) гасит отрисовку gradient-filled путей в Chromium. Снятие фильтра → бары видны.
- Донат: 4 сегмента с `opacity:0`, застряли на 0%-кадре `donutIn` (`animation-fill-mode: both` + `transform-origin` на SVG-`<path>` внутри `<g filter>` не резолвится). Снятие анимации → донат виден.

### 1.1 — `src/components/analytics/Charts.tsx`

Убрать `feDropShadow`-фильтр с баров фаз. Найти `<Bar dataKey="count"` (~стр.218) и удалить `style`-фильтр:

```
// БЫЛО:
            <Bar dataKey="count" name="Проектов" radius={[0, 6, 6, 0]} isAnimationActive={false} animationDuration={700} animationEasing="ease-out"
              style={isAura ? { filter: 'url(#phase-shadow)' } : undefined}
              activeBar={isScandi ? { fill: '#333', opacity: 1 } : undefined}>

// СТАЛО (style убран):
            <Bar dataKey="count" name="Проектов" radius={[0, 6, 6, 0]} isAnimationActive={false} animationDuration={700} animationEasing="ease-out"
              activeBar={isScandi ? { fill: '#333', opacity: 1 } : undefined}>
```

`<defs>` с `<filter id="phase-shadow">` можно оставить (он больше не референсится) или удалить. Тень при желании вернуть позже через CSS `filter: drop-shadow(...)` на контейнере графика — она не ломает заливку.

Донат — снять `opacity:0`-старт. Найти inline-стиль сегмента (~стр.126-128):

```
// БЫЛО:
                  style={{
                    transition: 'fill 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    ...(isAura ? { animation: 'donutIn 0.7s cubic-bezier(0.16,1,0.3,1) both', transformOrigin: '100px 100px' } : {}),
                  }}

// СТАЛО (анимация без both-фиксации на opacity:0; гарантируем видимость):
                  style={{
                    transition: 'fill 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    ...(isAura ? { animation: 'donutIn 0.7s cubic-bezier(0.16,1,0.3,1)', opacity: 1, transformOrigin: '100px 100px' } : {}),
                  }}
```

(Убран `both` → элемент не фиксируется на 0%-кадре; добавлен `opacity:1` как гарантия конечного состояния. Если визуально важна анимация появления — оставить, но финальный кадр теперь не пропадёт.)

### 1.2 — `src/components/analytics/CallsChart.tsx`

Снять `url(#calls-shadow)` с обоих баров (~стр.88-89):

```
// БЫЛО (оба <Bar>):
 ... style={isAura ? { filter: 'url(#calls-shadow)' } : undefined} />

// СТАЛО: удалить style-проп целиком у обоих <Bar dataKey="done"> и <Bar dataKey="pending">
```

### Проверка 1
```bash
npx tsc --noEmit 2>&1 | tail -3
```
Открыть `/analytics` в Aura → все 3 панели рисуют контент (бары фаз, фиолетовый донат с цифрой, легенда). Проверить тёмную тему (Aurora) — графики не должны сломаться.

---

## ЗАДАЧА 2 (P0): Графики дашборда — другой корень (нет `isAnimationActive={false}`)

**Корень:** в `DashboardHome.tsx` бары воронки и звонков НЕ имеют `isAnimationActive={false}` → анимируются с нуля; при `layout="vertical"` и данных после маунта Recharts оставляет бары несмонтированными (`barCount: 0` в DOM — подтверждено). Это НЕ фильтр (его тут нет).

### 2.1 — `src/components/dashboard/DashboardHome.tsx`

Воронка (~стр.481) — добавить `isAnimationActive={false}`:
```
// БЫЛО:
          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            barSize={16}
            className="cursor-pointer"

// СТАЛО:
          <Bar
            dataKey="count"
            isAnimationActive={false}
            radius={[0, 4, 4, 0]}
            barSize={16}
            className="cursor-pointer"
```

Звонки (~стр.603-605) — добавить `isAnimationActive={false}` ко всем трём `<Bar stackId="calls">`:
```
<Bar dataKey="done" stackId="calls" isAnimationActive={false} ... />
<Bar dataKey="pending" stackId="calls" isAnimationActive={false} ... />
<Bar dataKey="cancelled" stackId="calls" isAnimationActive={false} ... />
```

### Проверка 2
Открыть `/` (дашборд) в Aura → «Воронка по стадиям» рисует бары, «Звонки за 14 дней» рисует столбцы (или корректный empty-state, если данных нет).

---

## ЗАДАЧА 3 (P1): Chevron-pipeline — контраст + рассогласование тона

**Корень:** done-текст красится в `track.dot` (raw `--green`/`--accent`) на пастели чужого тона → 2.74:1 (FAIL) на «Проект», 3.46:1 на «Подготовка».

### 3.1 — `src/components/projects/StackedPipeline.tsx`

В интерфейс `Track` добавить поле `doneText` (цвет текста на пастели, тон трека, `*-text`-токен):

```
interface Track {
  id: string;
  label: string;
  stages: TrackStage[];
  dot: string;
  doneText: string;     // НОВОЕ: цвет текста done-этапов (AA на doneBg)
  doneBg: string;
  currentBg: string;
}
```

В `TRACKS` — привести тон и задать `doneText`:

```
// prep: dot был --green (чужой тон). Тон трека = амбер.
  { id:'prep', label:'Подготовка',
    dot:'var(--accent)', doneText:'var(--accent-text)',
    doneBg:'var(--track-prep-done)', currentBg:'var(--track-prep-current)', stages:[...] },

// exp: уже фиолет, ок.
  { id:'exp', label:'Эксперимент',
    dot:'var(--purple)', doneText:'var(--purple-text)',
    doneBg:'var(--track-exp-done)', currentBg:'var(--track-exp-current)', stages:[...] },

// proj: dot был --accent (амбер) на голубой пастели. Тон трека = blue.
  { id:'proj', label:'Проект',
    dot:'var(--blue)', doneText:'var(--blue-text)',
    doneBg:'var(--track-proj-done)', currentBg:'var(--track-proj-current)', stages:[...] },
```

Везде, где done-ячейка/пилюля красит ТЕКСТ через `color: track.dot` — заменить на `color: track.doneText`. (Точка-индикатор и заголовок трека могут остаться `track.dot` — они насыщенные, не на пастели.) Проверить активную пилюлю (`trackState === 'active'`): `style={{ background: track.doneBg, color: track.doneText }}`.

### Проверка 3
Контраст после фикса (целевые): amber-text/amber-pastel 4.85, blue-text/blue-pastel 4.54, purple-text/lavender 4.76 — все ≥4.5 AA. Открыть проект `/projects/[id]` → лейблы done-этапов читаются, тон трека единый (нет зелёного на амбере).

---

## ЗАДАЧА 4 (P1): Единая шкала заголовков

### 4.1 — `src/app/globals.css` (внутри `.t-aura`-блока или общий util)

Добавить класс:
```css
.aura-page-title {
  font-size: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);
  font-weight: 600;
  line-height: 1.2;
}
```
(Unbounded уже подхватывается через `.t-aura h1` — оставить, либо добавить `.t-aura .aura-page-title` в тот же селектор шрифта.)

### 4.2 — Привести ВСЕ `<h1>` заголовки разделов к `className="aura-page-title text-text-main"`:
`dashboard-content.tsx`, `KanbanBoard.tsx`, `LeadsView.tsx`, `PipelineBoard.tsx`, `ProjectsTable.tsx`, `StageBoard.tsx`, `AnalyticsPage.tsx`, `SettingsContent.tsx`, `PageHeader.tsx`, `ContactDetailHub.tsx`, `MigrationTool.tsx`.

Детальные страницы (`ProjectDetail.tsx`, `CompanyDetail.tsx`, `ContactDetail.tsx`) — либо тот же класс, либо `aura-page-title` + один шаг крупнее (зафиксировать как правило). Убрать вразнобой `text-lg/xl/2xl` и `font-bold/semibold`.

### Проверка 4
Пройти по разделам — заголовок верхнего уровня одного размера/веса везунду.

---

## ЗАДАЧА 5 (P2): Регистр шапок таблиц

### 5.1 — `src/components/shared/DataTable.tsx`

В `<th>` (колоночные, не чекбокс) добавить единый стиль капс-лейбла:
```
// БЫЛО:
                <th
                  key={col.key}
                  className="px-3 py-2 text-left"

// СТАЛО:
                <th
                  key={col.key}
                  className="px-3 py-2 text-left text-[11px] uppercase tracking-wide text-text-mute font-medium"
```
Label-строки в компонентах оставить Title Case — CSS приведёт к капсу единообразно (совпадёт с конвенцией лейнов задач / KPI-подписей / фильтр-чипов).

### Проверка 5
`/contacts` и `/companies` → вся шапка в одном регистре (UPPER), нет смеси Title/UPPER.

---

## ЗАДАЧА 6 (P2): Unbounded — лёгкий вес адаптивно ✔ РЕШЕНО (Олег: «лёгкий, но адаптивно»)

Концепт Аура задумывался на тонком Unbounded; в проде форсится 700. **Решение: лёгкий, но с защитой читаемости на мелких заголовках.** Крупное (KPI-цифры 24-32px, заголовки деталки) → 300. Заголовки разделов уровня 18px (`text-lg`) → 400, НЕ 300 (тонкий вес на 18px слабоват). Мёртвые селекторы удалить.

ВАЖНО: KPI-цифры рендерятся как `<span>`/AnimatedNumber внутри `[data-kpi]`-карточек (DashboardHome.tsx:176 `text-[24px]`, :349 `text-[32px]`, :401 `text-2xl`), а НЕ как `<h1>`. Чтобы лёгкий Unbounded дошёл до цифр — таргетить значение внутри `[data-kpi]`, не только `h1`.

### 6.1 — `src/app/layout.tsx`: добавить веса `300` и `400`:
```
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  weight: ['300', '400', '600', '700'],
  variable: '--font-unbounded',
  display: 'swap',
});
```

### 6.2 — `src/app/globals.css`: адаптивная шкала весов.

Заголовки разделов (18px+) — Unbounded 400 (через уже добавленный `.aura-page-title` из Задачи 4 + `.t-aura h1`):
```css
.t-aura h1,
.t-aura .aura-page-title,
.t-aura .aura-display {
  font-family: var(--font-unbounded, 'Unbounded'), var(--font-onest, 'Onest'), system-ui, sans-serif;
  letter-spacing: -0.02em;
  font-weight: 400;   /* было 700 — лёгкий, но не «нитяной» на 18px */
}

/* Крупный дисплей (KPI-цифры, заголовки деталки ≥24px) — самый тонкий 300 */
.t-aura [data-kpi] .text-\[24px\],
.t-aura [data-kpi] .text-\[32px\],
.t-aura [data-kpi] .text-2xl,
.t-aura h1.text-2xl {
  font-family: var(--font-unbounded, 'Unbounded'), var(--font-onest, 'Onest'), system-ui, sans-serif !important;
  font-weight: 300 !important;   /* перебивает font-bold/extrabold/medium из className */
  letter-spacing: -0.02em;
}
```
> `!important` тут оправдан: KPI-цифры в JSX имеют `font-bold`/`font-extrabold`/`font-medium` инлайн в className (DashboardHome.tsx:176/349/401), которые иначе перебьют вес. Альтернатива без `!important` — убрать `font-*` из тех className и оставить вес только в CSS (предпочтительнее, если не громоздко).

### 6.3 — Удалить селекторы-сироты `.kpi-value`, `.aura-display`(если не задействован), `[data-kpi-value]` из globals.css (0 использований в TSX — проверено grep'ом в РАЗВЕДКЕ). Не оставлять мёртвый CSS, вводящий в заблуждение.

### Проверка 6
- KPI-цифры (дашборд, шапки воронок) и заголовки деталки (ProjectDetail/CompanyDetail) — тонкий Unbounded 300, «дорогой» вид.
- Заголовки разделов 18px (`/settings`, `/projects` таблица) — Unbounded 400, читаются уверенно, НЕ слабые.
- Сверить характер с `aura_light_orbs_theme_concept.html`.
- Проверить, что на самом мелком заголовке (`text-lg` 18px) вес 400 не выглядит хлипко; если да — поднять до 500.

---

## ЗАДАЧА 7 (P2): Нулевые метрики — приглушить ✔ РЕШЕНО (Олег: «только нули»)

**Скоуп сужен:** делаем ТОЛЬКО приглушение нулей. Empty-state панелей (Контакт-360, Календарь) — отложено, это polish, не баг. Эта правка чисто визуальная, лейауты не трогает.

### 7.1 — Нулевые KPI приглушать
В KPI-карточках, когда значение `0` / `—` / `0%`, давать `text-text-mute` и тоньше вес, чтобы реальные значения доминировали (принцип Restraint & Reward — пустое не должно кричать наравне с наполненным).

Места:
- `DashboardHome.tsx` — KPI-строка (значения `kpi.activeProjects`, `kpi.pipeline`, `kpi.urgentTasks`, `kpi.weekCalls`, `kpi.conversion`; value-спаны :176/:349/:401).
- `PipelineBoard.tsx` / `StageBoard.tsx` — KPI-строка шапки (Pipeline/Конверсия/AVG цикл; «—» и «0%»).
- `ActivityDrawer.tsx` — stats grid (Проектов/Звонков/Задач/Встреч).

Реализация: вычислять «пустоту» значения (`value === 0 || value == null || value === '—' || value === '0%'`) и условно добавлять класс. Пример:
```tsx
const isEmpty = c.num === 0 || c.num == null;
// на value-спане:
className={`... ${isEmpty ? 'text-text-mute font-normal' : 'text-text-main'}`}
```
Не менять размер (чтобы сетка не прыгала) — только цвет (`text-mute`) и вес (на ступень легче).

### Проверка 7
Дашборд/воронка/drawer с нулевыми метриками — нули визуально отступают, реальные значения доминируют. Сетка не смещается (размер тот же). Лейауты не тронуты.

> Отложено (не в этом спринте): empty-state и сужение зоны в `ContactDetailHub.tsx` и `CalendarView.tsx`. При желании — отдельной задачей.

---

## ЗАДАЧА 8 (P3): Empty-state «Звонки по неделям»

### 8.1 — `src/components/analytics/CallsChart.tsx` (и аналог в `DashboardHome.tsx`)
Если в окне нет звонков — рендерить по центру области «Нет звонков за период» вместо пустых осей.

### Проверка 8
`/analytics` с пустым окном звонков → явный empty-state, неотличимости от бага нет.

---

## КОММИТ

```bash
npx tsc --noEmit 2>&1 | tail -3   # должно быть чисто
git add -A
git commit -m "fix(aura): графики (feDropShadow/анимация/isAnimationActive), контраст pipeline, типошкала заголовков, регистр таблиц, empty-states"
```

Порядок применения: 1 → 2 → 3 (P0/P1, проверяемо визуально сразу) → 4 → 5 → 8 (быстрые) → 6 → 7.

Задачи 6 и 7 — решения приняты:
- **Задача 6:** лёгкий Unbounded адаптивно (300 крупное, 400 заголовки 18px), мёртвые селекторы удалить.
- **Задача 7:** только приглушение нулей; empty-state панелей отложено.
