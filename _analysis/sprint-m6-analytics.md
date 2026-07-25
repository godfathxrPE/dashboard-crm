# Claude Code Prompt — Sprint M6: Аналитика — семантика цвета и место утилит (D2)

Скоуп по live-коду (не по старым скриншотам — палитры чартов уже токенизированы):
1. Фазы сделок красятся ДВУМЯ палитрами: /overview → track-токены,
   /analytics → accent/blue/yellow/green. Одна сущность = один цвет везде.
2. ExportPanel (утилита) стоит равным виджетом в аналитической сетке 2×2.
3. Empty-states чартов без действия; донат при нуле задач — пустой SVG.
4. Центр-цифра доната — только в aura, хотя полезна всем темам.

Чекаут: feat/deal-card (после M3–M5 + disabled-fix).

---

## РАЗВЕДКА

```bash
git log --oneline -1
grep -n "PHASE_COLORS\|LANE_COLORS\|isAura && total" src/components/analytics/Charts.tsx
grep -n "track-.*-current" src/components/dashboard/OverviewCharts.tsx
grep -n "ExportPanel\|md:grid-cols-2" src/components/analytics/AnalyticsPage.tsx
grep -n "Нет звонков" src/components/analytics/CallsChart.tsx
grep -n "iconColor" src/components/analytics/ExportPanel.tsx
```

---

## ЗАДАЧА 1: Одна палитра фаз на оба экрана (Charts.tsx)

`PHASE_COLORS` в Charts.tsx заменить на те же track-токены, что использует
воронка /overview (OverviewCharts):

```ts
const PHASE_COLORS: Record<string, string> = {
  attract: 'var(--track-prep-current)',
  develop: 'var(--track-exp-current)',
  negotiate: 'var(--track-nego-current, var(--track-exp-current))',
  close: 'var(--track-proj-current)',
};
```

Aura-градиенты AURA_PHASE не трогать (isAura-ветка — фича темы).
LANE_COLORS (донат задач) не трогать — статусы задач легитимно живут на
семантике accent/blue/yellow/green (тот же язык, что LANE_CONFIG).

## ЗАДАЧА 2: Центр-цифра доната — всем темам

В `TasksDistribution` условие `{isAura && total > 0 && (` → `{total > 0 && (`.
Шрифт центра: Unbounded оставить ТОЛЬКО ауре, остальным — наследование:

```tsx
style={{ fontSize: 28, fontWeight: 600, fill: 'var(--text)',
  fontFamily: isAura ? 'var(--font-unbounded, sans-serif)' : 'inherit' }}
```

(--font-unbounded задан глобально на html — без условия minimal получил бы
display-шрифт в данные, что против его языка).

## ЗАДАЧА 3: Empty-states с действием

- `TasksDistribution`: при `total === 0` вместо пустого SVG — центрированный
  блок: «Задач пока нет» text-xs text-text-mute + ссылка `/tasks`
  «Создать задачу →» text-xs text-accent hover:underline.
- `PipelineChart`: если все `count === 0` — «Нет активных сделок» + ссылка
  `/deals` «Создать сделку →» (вместо осей с нулями).
- `CallsChart`: к «Нет звонков за период» добавить ссылку `/calls`
  «Записать звонок →».

Высоту h-48 сохранить у всех (сетка не прыгает).

## ЗАДАЧА 4: ExportPanel — из сетки вниз, компактной строкой

1. В `AnalyticsPage`: второй грид `md:grid-cols-2` (PipelineChart + ExportPanel)
   распустить — PipelineChart рендерить full-width обычным блоком,
   `<ExportPanel />` перенести последним элементом страницы (после всех чартов).
2. В `ExportPanel`: перевёрстка в горизонтальную компактную полосу:
   - контейнер: `rounded-xl border border-border bg-surface px-4 py-3`
   - заголовок «Экспорт данных» — оставить (12px/600 dim), в одну строку с
     кнопками: `flex flex-wrap items-center gap-2`
   - CSV-кнопки → чипы: `rounded-lg border border-border px-2.5 py-1.5
     text-xs text-text-dim hover:bg-surface2 hover:text-text-main`
     с текстом «{label} · {count}»; цветные иконки (text-accent/green/yellow —
     цвет без роли) → у всех `text-text-mute`;
   - JSON-бэкап: тот же чип, но `font-medium text-accent border-accent/30`
     (единственный акцентный — это главное действие панели).
   Логику exportCSV/exportJSON/downloadFile НЕ трогать.

## СМОК

/analytics в minimal + aura + frost:
- «Сделки по фазам» = цвета воронки /overview (открыть оба экрана рядом);
- донат: центр-цифра во всех темах (в aura — Unbounded, в minimal — Inter);
- пустые чарты (если данных нет — проверить на пустой org либо визуально
  по коду) показывают текст + ссылку;
- экспорт — компактная полоса внизу, ссылки работают, CSV скачивается;
- aura: градиенты доната/баров и glow на месте.
tsc 0.

## КОММИТ

```bash
git add src/components/analytics/Charts.tsx src/components/analytics/CallsChart.tsx \
  src/components/analytics/AnalyticsPage.tsx src/components/analytics/ExportPanel.tsx
git commit -m "refactor(analytics): единая палитра фаз с /overview, донат-итог всем темам, empty-CTA, экспорт — утилитарная полоса"
```

НЕ пушить без подтверждения. Миграций нет.
