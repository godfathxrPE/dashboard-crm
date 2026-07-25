# Ревью: S31 Cmd+K полиш (sprint-cmdk-polish)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-cmdk-polish.md` — полиш Command Palette (ранжирование, scrollIntoView, Лиды/Календарь, читаемые sub)  
**Контекст:** уже смержен как `3ea96a1` (2026-07-10, message = текст коммита из спринта); после S31 палитра эволюционировала (rename deals, delivery-проекты, stage_id / B1.5). Ветка в шапке спринта (`feat/aura-theme`) **не** текущая.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Идея / scope (один файл, без инфраструктуры) | ✅ Верно *на момент написания* |
| РАЗВЕДКА (есть, команды осмысленные) | ✅ |
| Состояние «пробелов» в live-коде | ❌ Все 4 задачи **уже реализованы** |
| Повторный запуск as-is | ❌ Регрессия (legacy `STAGE_CONFIG` / `p.stage`, локальные label-мапы) |
| Поля `leads` (`title`, `company_name_raw`) | ✅ Совпадают со схемой и `Lead` |
| Готовые label-конфиги (не плодить дубли) | ✅ В репо уже `LANE_CONFIG` / `CALL_STATUS_CONFIG` / `stagesMap` |
| RLS-формулировка «лиды персональные» | 🟡 Устарела: с 024 — командная видимость |
| Границы «не трогать» | ✅ По смыслу верны |
| Line numbers в «не трогать» / разведке | 🟡 Сдвинуты (файл ~402 строк) |
| Трудоёмкость 1–1.5 ч | ⚪ N/A — работа сделана |
| crm-architect checklist (миграции, CSS, implicit flow) | ✅ N/A или соблюдено (UI-only) |

**Оценка: 3/10 как runnable handoff на `main` сейчас; 8/10 как исторический промпт S31 (на момент 2026-07-10 он был хорош).**  
**Рекомендация:** **не запускать в Claude Code.** Спринт выполнен; повторный прогон по тексту спринта **ломает** актуальные stage/deal-паттерны. Закрыть как done или заменить коротким «sync docs only» (architecture.md § Command Palette).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| S31 (этот спринт) | ✅ В `main`: `3ea96a1 feat(cmdk): S31 полиш — …` |
| Post-S31: rename «Сделки» / `/deals` | ✅ `e3839ee`, `4c1f2ad` — палитра обновлена |
| Post-S31: delivery-проекты | ✅ `8706399` — client → «Сделки», delivery/internal → «Проекты» |
| Post-S31: legacy `projects.stage` → `stage_id` | ✅ `f3ec081` — sub сделок через `usePipelineStagesMap()`, **не** `STAGE_CONFIG` |
| Recents на пустом query | ⏸ Deferred (как в спринте) |
| Review-файл | не было (`review-sprint-cmdk-polish.md`) |

---

## С чем согласен полностью (как дизайн S31)

### 1. Проблема ранжирования была реальной
До `3ea96a1` фильтр был `.includes()` + `.slice(0, 15)` в порядке вставки секций — поздние сущности выпадали. `scoreItem` (exact → prefix → word → label → sub → section) + стабильный tie-break по `idx` — правильный минимальный фикс.

### 2. scrollIntoView на `max-h-72`
Паттерн `listRef` + `data-cmd-idx` + `scrollIntoView({ block: 'nearest' })` согласуется с keyboard-nav / DataTable (architecture.md, use-keyboard-nav).

### 3. Покрытие Лиды + Календарь
Роуты `src/app/(dashboard)/leads/page.tsx` и `calendar/page.tsx` есть; `UserPlus` / `CalendarDays` уместны. Поля `Lead.title`, `Lead.company_name_raw` — schema.md § leads + `src/types/database.ts` (~301–308).

### 4. Scope / out-of-scope
Не трогать ui-store, GlobalModals, PCT-1, global hotkey-listener — верно. Recents (storage) — разумно отложены.

### 5. Прятать section headers при непустом query
Опциональный совет спринта реализован в live-коде:

```358:359:src/components/shared/CommandPalette.tsx
const showSection = !query.trim() && item.section !== currentSection;
if (showSection) currentSection = item.section;
```

### 6. Реализация S31 **лучше** предложенных локальных мап
В коммите S31 (и сейчас) уже переиспользуются `LANE_CONFIG` и `CALL_STATUS_CONFIG`, а не inline `LANE_LABEL` / `CALL_STATUS_LABEL` из текста спринта — это правильнее разведки №2.

---

## Блокеры (критично — не запускать as-is)

### B1. Спринт уже выполнен — повтор = no-op или overwrite
Live `src/components/shared/CommandPalette.tsx` (~402 строки) содержит **все** задачи:

| Задача | Live-доказательство |
|--------|---------------------|
| 1. score + sort | `scoreItem` L62–71; `filtered` L272–285 |
| 2. scrollIntoView | `listRef` L84; effect L290–294; `ref={listRef}` L352; `data-cmd-idx={i}` L367 |
| 3. nav Лиды/Календарь + useLeads | nav L160–163; `ROUTE_LABELS` L52–53; leads loop L256–266; import L19 |
| 4. читаемые sub | `LANE_CONFIG` L175; `CALL_STATUS_CONFIG` L239; internal «Внутренний» L199; client stage via `stagesMap` L190 |

Коммит: `3ea96a1` (message **байт-в-байт** как блок «КОММИТ» в спринте).

### B2. Задача 4 (проекты) **регрессирует** post-legacy-stage код
Спринт предлагает:

```tsx
sub: p.type === 'internal'
  ? 'Внутренний'
  : (p.stage ? STAGE_CONFIG[p.stage]?.shortLabel ?? undefined : undefined),
```

Факты live-кода / crm-architect:

- `STAGE_CONFIG` **нет** в `src/lib/validators/project.ts` (есть `LEGACY_STAGE_LABELS` только для activity_log; живая стадия — `stage_id` → `pipeline_stages`).
- `projects.stage` / enum `deal_stage` сняты (миграции 047, handoff B1–B3); `rg STAGE_CONFIG src` — только комментарии «не читать».
- Live-палитра уже корректна:

```186:204:src/components/shared/CommandPalette.tsx
// client → section «Сделки», sub = stagesMap.get(stage_id)?.name
// work (delivery/internal) → «Проекты», sub = 'Внутренний' | 'Внедрение'
```

Запуск текста Задачи 4 → TypeScript-ошибки и/или откат B1.5.

### B3. Локальные label-мапы в спринте **расходятся** с каноном UI
Если CC всё же вставит мапы из спринта вместо конфигов:

| Сущность | Спринт | Канон в репо |
|----------|--------|--------------|
| lane `next` | «Далее» | `LANE_CONFIG`: **«Следующие»** (`validators/task.ts` L28–31) |
| lane `wait` | «Ожидание» | **«Отложено»** |
| lane `done` | «Готово» | **«Выполнено»** |
| call `done` | «Завершён» | `CALL_STATUS_CONFIG`: **«Выполнен»** (`validators/call.ts` L10–14) |
| call `pending` | «Ожидает» | **«Запланирован»** |

S31-коммит уже взял конфиги — текст спринта **хуже** фактической реализации.

### B4. Контекст ветки / «зрелость с пробелами» — stale
- Спринт: «ветка `feat/aura-theme`», «4 реальных пробела».
- Live: `main`, пробела закрыты 2026-07-10; после — ещё 4 коммита по этому файлу.
- `feat/aura-theme` существует как ветка, но текущая работа — `main`.

---

## Предупреждения (желательно учесть)

### W1. RLS leads: «персональные user_id» — неполная картина
Спринт / комментарий в коде: «персональные, под user_id-RLS».  
**schema.md (S25 / 024):** SELECT/UPDATE/DELETE — owner/admin видят **все** лиды org; иначе ownership по `user_id`. INSERT — own.  
`useLeads()` делает `select('*').neq('status','converted')` без client-side filter по user — поведение = RLS. Палитра не дырявит org, но формулировка «только свои» для admin неверна. Для UI-полиша не блокер; комментарий в коде можно поправить отдельно.

### W2. architecture.md § Command Palette устарел
`architecture.md` ~489–495: секции «задачи/сделки/компании/контакты/звонки/встречи», без score/scroll/leads/calendar/split client|delivery. Спринт это не чинит (и не должен) — но **sync docs** полезнее повторного S31.

### W3. Line anchors «не трогать» сдвинуты
| Спринт | Live |
|--------|------|
| hotkey ~77–88 | `handleKeyDown` window ~105–114 |
| focus ~90 | open-effect ~116–122 |
| route-reset ~62 | pathname-effect ~87–91 |
| filtered ~231 | ~272–285 |
| tasks sub ~143 | ~175 |
| projects ~155 | ~186–204 |
| calls ~192 | ~239 |

РАЗВЕДКА `sed -n '99,235p'` больше не описывает «сборку items» целиком (items ~125–269).

### W4. Lead href только `/leads` (без deep-link)
Как в спринте: `href: '/leads'`, не `/leads/${id}`. Осознанный минимализм; deep-link — отдельный заход, не блокер.

### W5. `CalendarDays` на «Встречи» и «Календарь»
Дубль иконки — косметика, в S31 уже так.

### W6. VERIFICATION Type Safety: WARNING
На момент S31 — ок (поля лида верные). Сейчас tsc/build не нужны для *этого* промпта, т.к. запускать нечего.

### W7. learnings.md
Отдельных gotcha по Cmd+K нет. Релевантный post-factum risk — legacy stage (B1–B3), не упомянут в спринте (написан до DROP).

---

## Пропущенные места

Для **повторной** реализации — N/A (уже в репо).  
Если цель — «добить полиш», в спринте **нет** (и это ok / deferred):

| Тема | Комментарий |
|------|-------------|
| Recents на пустом query | Явно out-of-scope |
| Подсветка match / focus-trap Tab | Deferred в VERIFICATION |
| Deep-link lead / call / task | Не в scope |
| Синхронизация architecture.md | Не в scope, но полезно |

---

## Предлагаемые правки в спринт

1. **В шапку:** статус `DONE 2026-07-10 · 3ea96a1 · не запускать`. Либо архивировать в `_analysis/_to_delete/` / `done/`.
2. **Не** предлагать `STAGE_CONFIG` / `p.stage` — только `stage_id` + `usePipelineStagesMap()` (как live).
3. **Не** вводить локальные `LANE_LABEL` / `CALL_STATUS_LABEL` — только `LANE_CONFIG` / `CALL_STATUS_CONFIG`.
4. Исправить RLS-note leads (командная видимость 024).
5. Обновить line numbers / «ветка: main».
6. Опционально: мини-handoff «docs only» — дописать architecture.md § Command Palette (score, scroll, leads, calendar, client/delivery split).

---

## Чеклист перед CC

- [ ] **Не запускать** этот файл в Claude Code на текущем `main`
- [ ] Подтвердить done: `git show 3ea96a1 --stat` (1 file, CommandPalette)
- [ ] При желании: точечный smoke Cmd+K (ранжирование / scroll / «лид» / lane≠enum) — регресс-check, не implementation
- [ ] Не коммитить повтор с тем же message
- [ ] Не трогать sprint-файл без явной просьбы (этот review — stdout-only)
- [ ] Опционально: PR/chore sync `architecture.md` § Command Palette

---

## crm-architect checklist (condensed)

| Пункт | Результат |
|-------|-----------|
| РАЗВЕДКА first | ✅ |
| Реальные table/column | ✅ leads; ❌ `p.stage` / `STAGE_CONFIG` (устарело) |
| Реальные file paths | ✅ `CommandPalette.tsx`, `use-leads.ts` |
| learnings gotchas | ⚪ нет cmdk-specific; stage-legacy не учтён |
| SQL migrations separate / not applied from CC | ✅ N/A |
| org_id / RLS | 🟡 leads note неполная |
| SECURITY DEFINER + ACL | ✅ N/A |
| No `flowType: 'implicit'` | ✅ N/A |
| DELETE CASCADE | ✅ N/A |
| CSS variables / theme scope | ✅ N/A (классы surface/accent уже в палитре) |
| schema.md after migration | ✅ N/A |

---

## Итог одной строкой

**S31 уже в `main` (`3ea96a1`) и позже улучшен; текст спринта устарел и опасен регрессией stage-labels — в CC не отдавать.**
