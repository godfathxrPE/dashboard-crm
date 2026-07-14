# Ревью спринта `SPRINT-visual-audit-P1.md` (волна 2)

**Дата:** 12 июля 2026  
**Контекст:** P0 вмержен (`0048afd`), скрипт после волны 1 даёт **41 text/badge FAIL** (без ui-border).  
**Вердикт:** **можно брать в работу с правками** — структура, DoD-scope и разведка в целом точные; есть 1 устаревший пункт, 1 пробел в DoD и несколько уточнений по scope.

---

## Общая оценка: 8/10

Спринт хорошо продолжает P0: учтены правки гейта (text vs ui, Scandi outline false positive), разведка привязана к строкам, коммиты сгруппированы логично. Основной риск — **DoD «0 text FAIL» не закроется** без дополнения по badge-токенам тёмных тем (frost/aurora/tidal).

---

## Что verified и согласовано

| Пункт | Статус | Комментарий |
|-------|--------|-------------|
| 2.1 PipelineBoard | ✅ | `PHASE_HEADER_COLOR` на track-токенах, текст `:282` — баг подтверждён. Точка уже есть. |
| 2.1 LeadsView | ✅ | `KANBAN_COLUMNS.color` = solid, текст `:556` — баг подтверждён. |
| 2.1 DeliveryPipelineBoard | ✅ | `DELIVERY_PHASE_COLOR` → текст `:139` — тот же паттерн, нужен `DELIVERY_PHASE_TEXT`. |
| 2.2 FOUC | ✅ | `ThemeProvider` в `useEffect`, persist key `dashboard-theme`, shape `{ state: { theme } }` — верно. Скрипт в head ещё не добавлен. |
| 2.4 Washi sidebar | ✅ | `nav-active` = accent `#C23B3B` на `#2C2C2C` = 2.65:1; dim `0.35` на `:330` — верно. Класс `nav-active` реально вешается в `Sidebar.tsx:169`. |
| 2.4 Fuji sidebar | ✅ | Только `sidebar-text-dim` 3.35:1 — верно. `nav-active` на gold уже PASS (6.61:1), чинить не надо. |
| 2.5 sand/washi tokens | ✅ | sand без `--accent-text`, washi purple/red на грани — совпадает со скриптом. |
| 2.6 HealthDot | ✅ | Только цвет + `title`, используется в ProjectCard/Detail/DealFocusPanel. |
| 2.7 text-mute | ✅ | aura 4.39, washi/fuji/paper/sand/scandi — совпадает с текущими FAIL. |
| T1/T2 хвосты P0 | ✅ | paper/sand yellow из `:root`, sand button 4.5 — актуальны. |
| DoD text vs ui | ✅ | Согласовано с ревью Grok и фактическим состоянием после P0. |

---

## Критические замечания (исправить до старта)

### 1. Пункт 2.3 `stages.ts` — устарел

`src/lib/constants/stages.ts` **нигде не импортируется** в `src/`. Живой код использует:
- `src/lib/validators/project.ts` → `STAGE_CONFIG`, `PHASE_CONFIG` (уже `text-blue`, `bg-blue-l` и т.д.)
- `FunnelWidget`, `AccordionLane`, `LaneColumn` — уже на семантических классах

**Рекомендация:** переформулировать 2.3:
- либо **удалить** `stages.ts` как мёртвый код (предпочтительно),
- либо пометить как «legacy cleanup, без runtime-эффекта».

Не стоит тратить время на «прогон /deals после stages.ts» как на основной фикс — визуально ничего не изменится.

### 2. DoD не закроется без badge-токенов тёмных тем

После P1 по плану останутся text FAIL (текущие):

| Тема | Остаток (badge/surface) |
|------|---------------------------|
| frost | accent-l badge 4.0, purple/surface 4.49, purple-l badge 3.73 |
| aurora | accent-l 3.82, purple-l 3.98 |
| tidal | red-l 4.27, purple-l 4.07 |

Пункты 2.5/2.7/T1 **не покрывают** frost/aurora/tidal — у них нет отдельных `--accent-text` / `--purple-text` для badge-пар (светлые accent/purple на тёмных тинтах).

**Рекомендация:** добавить **2.8 Badge *-text для тёмных тем**:
```css
/* пример направления — значения подтвердить скриптом */
.t-frost  { --accent-text: #7eb0ff; --purple-text: #c9a0f5; }
.t-aurora { --accent-text: #c9a0ff; --purple-text: #c9a0ff; } /* или развести */
.t-tidal  { --red-text: #e09080; --purple-text: #a898c8; }
```
Либо ослабить DoD: «0 FAIL кроме badge-пар тёмных тем → волна 3» — но тогда честнее не обещать полный ноль.

### 3. `StageBoard` — не в scope 2.1

Разведка просит проверить `StageBoard.tsx` — там заголовок уже **`text-text-main`** (`:214`), track только на точке (`PHASE_DOT_COLOR`). **Чинить не нужно.** Убрать из списка файлов коммита 1 или пометить «verified OK».

`ProjectCard` — `PHASE_COLOR` идёт в `--phase-color` для декора (бордер, glow), **не как цвет текста заголовка**. В scope 2.1 не критичен.

---

## Средние замечания

### 4. `delivery-phases.ts` — добавить текстовый маппинг в константы

Спринт упоминает DeliveryPipelineBoard, но фикс только концептуальный. Лучше явно:
```ts
export const DELIVERY_PHASE_TEXT: Record<string, string> = {
  initiated: 'var(--accent-text, var(--track-prep-current))',
  planning:  'var(--purple-text, var(--track-exp-current))',
  // ...
};
```
И использовать в `DeliveryPipelineBoard.tsx:139` — один источник, как `DELIVERY_PHASE_COLOR`.

### 5. FOUC-скрипт — способ вставки в Next.js 15

Сейчас в `layout.tsx` нет `<head>`. Inline `<script dangerouslySetInnerHTML>` нужно обернуть в `<head>` внутри `<html>`, либо использовать:
```tsx
import Script from 'next/script';
// <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{...}} />
```
`strategy="beforeInteractive"` — каноничный путь в App Router. Проверить, что скрипт не дублируется при Fast Refresh.

Логика скрипта корректна: `t` уже с префиксом `t-`, `remove('t-scandi')` + `add(t)` — ок.

### 6. `StackedPipeline` — активные лейблы всё ещё track-цветом

P0 убрал `opacity-50`, future → `text-mute`. Но **active/done** лейблы (`:134`) всё ещё `track.color` как текст — потенциально 3–4:1 на светлом фоне (не в токен-скрипте, но live из аудита).

P1 это не покрывает. **Рекомендация:** в 2.1 или отдельным T3 — active-лейблы на `*-text` по phase_group, track только на точке (как в PipelineBoard).

### 7. `theme-system.md` — путь не в репо

Файл живёт в `crm-architect` skill (`references/theme-system.md`), не в `dashboard-crm/`. DoD «обновить theme-system.md» — указать **куда** писать: skill reference или новый `docs/theme-system.md` в репо.

### 8. HealthDot — деталь реализации

Глиф `● ◐ ▲` с `text-green/yellow/red` вместо `bg-*` — правильное направление. Уточнить в спринте:
- убрать `rounded-full bg-*` у span, иначе двойной сигнал;
- `h-2 w-2` может резать `◐`/`▲` — лучше `text-[10px] leading-none w-3 text-center`;
- `role="img"` + `aria-label` — да; `title` оставить опционально.

### 9. 2.4 Washi — порядок CSS

Новые правила `nav-active → #E8E2D8` должны идти **после** блока `:347–354` в `globals.css` (или с тем же `!important`). Спринт предупреждает «не плодить дубли» — лучше **заменить** строки 353–354 (`color: var(--accent)`) на светлый текст, а торий оставить только на `::before/::after` скобках.

---

## Мелочи

- **Коммит 1** — убрать `StageBoard.tsx` (не меняется) и `stages.ts` (или отдельный `chore: remove dead stages.ts`).
- **2.7 scandi** — `--text-mute rgba(0,0,0,0.56)` → 0.62: проверить, что на **light** surface3 не станет слишком тёмным относительно text-dim (иерархия mute < dim).
- **T2 sand button** — «тёмный текст на кнопке» ломает терракотовый CTA; предпочтительнее `#b04e20` для `--accent` fill, не менять color на `#080f0d`.
- **Проверка grep** в DoD: `bg-blue-100` может остаться в других файлах — grep по всему `src/`, не только stages.ts.

---

## Прогноз закрытия FAIL после P1 (as-is)

| Тема | Сейчас (text) | После P1 (оценка) |
|------|---------------|-------------------|
| aura | 1 | 0 (2.7) |
| scandi | 1 | 0 (2.7) |
| scandi-dark | 0 | 0 |
| washi | 9 | 0–2 (2.4+2.5+2.7; badge 4.45 может остаться) |
| fuji | 3 | 0 (2.4+2.7) |
| paper | 4 | 0 (T1+2.7) |
| sand | 8 | 0–1 (2.5+T1+T2+2.7) |
| frost | 3 | **3** без 2.8 |
| aurora | 2 | **2** без 2.8 |
| tidal | 2 | **2** без 2.8 |

**Итого:** ~7–10 text FAIL останутся без пункта 2.8.

---

## Рекомендуемые правки в `SPRINT-visual-audit-P1.md`

1. **2.3** → «Удалить/обновить мёртвый `stages.ts`; runtime уже на `project.ts`».
2. **Добавить 2.8** — `*-text` для badge-пар frost/aurora/tidal.
3. **2.1** — убрать StageBoard из scope; добавить `delivery-phases.ts` + StackedPipeline active labels (T3).
4. **2.2** — `next/script` `beforeInteractive` вместо сырого head (или явный `<head>`).
5. **DoD** — указать путь к `theme-system.md`; grep `bg-*-100` по всему `src/`.
6. **2.4** — «заменить», не дублировать правила washi nav-active.

---

## Порядок выполнения (если правки приняты)

1. **2.1 + delivery-phases** — самый заметный UX-фикс (канбан).
2. **globals.css блок** — 2.4, 2.5, 2.7, T1, T2, **2.8**.
3. **FOUC + HealthDot** — независимо, можно параллельно.
4. **chore** — удаление `stages.ts`.
5. Пересчёт скрипта → live скриншоты → обновление theme-system.

---

## Заключение

Спринт P1 **готов к исполнению на ~85%**. Перед стартом обязательно: убрать мёртвый `stages.ts` из критического пути и дописать **2.8 для тёмных badge**, иначе DoD «0 text FAIL» не выполним. Остальное — уточнения scope и Next.js-паттерн для FOUC.