# Claude Code Prompt — Sprint M7: Донат «Задачи по статусу» — интерактивность (D1)

Донат — рукописный SVG (не recharts), поэтому без hover/tooltip: при наведении
не видно, что за сегмент и сколько. Остальные чарты (recharts) это показывают.
Добавляем hover-состояние в тон остальным — без новых зависимостей.

Файл: `src/components/analytics/Charts.tsx`, компонент `TasksDistribution`.
Чекаут: feat/deal-card (после M6).

> v1.1 — по ревью Grok (9/10, блокеров нет): W2 — точный порядок style, чтобы
> isAura-spread НЕ затирал hover-opacity через свой `opacity:1`; W3 — имя
> сегмента 11px, не 10px (правило F-01 моего же аудита); W1 — useState в импорт.

---

## РАЗВЕДКА

```bash
grep -n "TasksDistribution\|arcPath\|arcs.map\|isAura && total\|dominantBaseline" src/components/analytics/Charts.tsx
```

Подтвердить: сегменты рендерятся `arcs.map((arc) => <path … fill=… />)`,
в центре — `<text>` с `total` (после M6 — для всех тем). Легенда снизу.

---

## ЗАДАЧА 1: Hover-стейт сегмента

Импорт: `import { useMemo, useState } from 'react';` (сейчас только useMemo).

```tsx
const [hovered, setHovered] = useState<{ lane: string; name: string; value: number } | null>(null);
```

(матч по `lane`, не `name` — надёжнее, N1 ревью.)

На каждый `<path>` сегмента — `onMouseEnter/Leave` + style в ТОЧНОМ порядке
(критично: hover-opacity ПОСЛЕ transition, а isAura-spread БЕЗ своего `opacity:1`,
иначе он всегда затрёт приглушение — W2 ревью):

```tsx
onMouseEnter={() => setHovered({ lane: arc.lane, name: arc.name, value: arc.value })}
onMouseLeave={() => setHovered(null)}
style={{
  cursor: 'default',
  transition: 'opacity 0.15s ease, fill 0.5s cubic-bezier(0.16,1,0.3,1)',
  opacity: hovered && hovered.lane !== arc.lane ? 0.45 : 1,
  ...(isAura
    ? { animation: 'donutIn 0.7s cubic-bezier(0.16,1,0.3,1)', transformOrigin: '100px 100px' }
    : {}),
  // в isAura-spread НЕ класть opacity — иначе hover-приглушение ломается
}}
```

(наведённый сегмент — полная непрозрачность, остальные приглушаются opacity —
декор-эмфаза на НЕтекстовом элементе, P0 не нарушается.)

## ЗАДАЧА 2: Центр реагирует на hover

Центр-`<text>` вместо статичного `total`:
- нет hover → `total` (крупно, как сейчас);
- есть hover → две строки: значение сегмента (крупно) + его имя (мелко, muted).

```tsx
{total > 0 && (hovered ? (
  <>
    <text x="100" y="92" textAnchor="middle" style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text)', fontFamily: isAura ? 'var(--font-unbounded, sans-serif)' : 'inherit' }}>{hovered.value}</text>
    <text x="100" y="114" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text-mute)' }}>{hovered.name}</text>
  </>
) : (
  <text x="100" y="100" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 28, fontWeight: 600, fill: 'var(--text)', fontFamily: isAura ? 'var(--font-unbounded, sans-serif)' : 'inherit' }}>{total}</text>
))}
```

## ЗАДАЧА 3: Легенда — подсветка синхронно

Элементы легенды снизу — тоже реагируют (по желанию, но дёшево): при hover
сегмента соответствующий пункт легенды становится ярче, остальные — muted;
и hover по пункту легенды подсвечивает сегмент (тот же setHovered). Минимум —
hover по сегменту достаточно; легенду можно сделать `cursor-default` и
onMouseEnter/Leave на `<div>` пункта с той же логикой.

## СМОК

/analytics, донат:
- наведение на сегмент → он ярче, остальные приглушены, в центре его значение
  + имя; увод → снова общий total;
- работает во всех темах (aura: Unbounded в центре сохраняется);
- pipeline/calls-чарты (recharts) не задеты.
tsc 0.

## КОММИТ

```bash
git add src/components/analytics/Charts.tsx
git commit -m "feat(analytics): донат по статусу — hover-эмфаза сегмента + значение в центре (паритет с recharts-чартами)"
```

НЕ пушить без подтверждения. Миграций нет.
