# Ревью: S-DEAL-CARD — карточка канбана ≤6 сигналов (F-04)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/typo-scale` @ `268cdb4`; crm-architect `schema.md` / `architecture.md` / `learnings.md`; аудит F-04 в `improvements/CRMs/audit-aura-design.md`)  
**Объект:** `_analysis/sprint-S-DEAL-CARD.md` — client-only рефактор `ProjectCard.tsx`: свернуть 4 сигнала внимания в одну строку, убрать декор/%/HealthDot/контакт  
**Контекст:** после S-TYPO-SCALE (HEAD), S-UI-QUICKWINS, S-AURA-NAV-1; ветка `feat/deal-card` ещё не создана; `268cdb4` уже в `origin/main`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (якоря ProjectCard) | ✅ live совпадает |
| Путь / scope (один файл) | ✅ `src/components/projects/ProjectCard.tsx` |
| Хелперы `deal-health` | ✅ `getDealHealth` / `getStageAging` / `getNextActionOverdueDays` есть |
| «% / health / контакт на детальной» | ✅ `ProjectDetail` + `DealFocusPanel` |
| Claim «ProjectCard на /projects» | 🟡 **нет** — только `/deals` → `PipelineBoard` |
| F-04 vs решение Олега (~6, badge остаётся) | 🟡 partial относительно аудита ≤4; scope согласован с A |
| WHY vs целевая (дедлайн-пилюля) | 🟡 формулировка WHY, целевая карточка яснее |
| SQL / RLS / schema | ✅ N/A (client-only) |
| CSS tokens / learnings | ✅ `var(--red-text|yellow-text)`, без новых цветов |
| Готовность к CC | ✅ GO |

**Оценка: 9/10.** Промпт точный по live-якорям, helpers и границам scope; snippet AttentionLine реализуем as-is. Блокеров нет. Перед CC желательно поправить смок-маршруты (/deals only) и не ждать ProjectCard на /projects.

**Рекомендация:** **запускать в CC as-is** (или с мини-правкой текста смока — W1). Не блокировать.

---

## Live-разведка (сверка claims)

| Claim спринта | Live @ `268cdb4` | |
|---------------|------------------|--|
| Файл `ProjectCard.tsx` ~338 строк | 338 строк | ✅ |
| Corner notch `absolute top-0 right-0` | L113–123 | ✅ |
| Stage-row: phase-dot + label + aging-IIFE + HealthDot + `%` | L138–171 | ✅ |
| `calculateDealHealth` → `health` только для HealthDot | L82, L168 | ✅ |
| Contact-блок `IconContact` | L36–42, L199–205 | ✅ |
| Next-step IIFE + rotting | L243–287 | ✅ |
| `getDealHealth` / `getNextActionOverdueDays` / `getStageAging` | `lib/utils/deal-health.ts` L75–129 | ✅ |
| Импорт helpers L7 + HealthDot L8 | как в grep спринта | ✅ |
| `ProjectCard` usage | **только** `PipelineBoard.tsx:276` (+ re-export `index.ts`) | ✅ |
| Рендер борда | `/deals` → `ProjectsView` → `PipelineBoard` | ✅ |
| `/projects` | `ProjectsSection` → **`DeliveryPipelineBoard` / `DeliveryCard`**, не ProjectCard | 🟡 (спринт «возможно projects» — устарело) |
| `HealthDot` ещё где-то | Detail, DealFocusPanel, Delivery*, Portfolio… — **не удалять компонент** | ✅ |
| % на детальной/шеврон | `StackedPipeline` title с `probability`; StageBoard header | ✅ |
| Health на детальной | `ProjectDetail` L320 + `DealFocusPanel` «Здоровье» | ✅ |
| Контакт на детальной | `ProjectDetail` L711–715 | ✅ |
| Возраст в стадии на детальной | `ProjectDetail` L358–365 `· N дн. в стадии` | ✅ |
| База после S-TYPO-SCALE | HEAD `268cdb4`, commit на main | ✅ |
| Ветка `feat/deal-card` | отсутствует — создать в коммит-блоке | ✅ |

### Диагностика (как в спринте)

```
grep anchors ProjectCard → Corner notch, HealthDot, stageProbability,
  getStageAging, IconContact, next_step, calculateDealHealth, getDealHealth — все есть
grep ProjectCard src/components → только PipelineBoard.tsx (+ index re-export)
grep HealthDot → 8 файлов (shared + projects); компонент остаётся
```

---

## С чем согласен полностью

### 1. Client-only, один файл, без миграции

Нет DDL, RLS, hooks, helpers. `schema.md` / org_id / SECURITY DEFINER — N/A. `learnings.md` (flowType, CASCADE, migrations from CC) не затронуты.

### 2. Якоря удаления — точные

| Убрать | Live |
|--------|------|
| Corner notch | L113–123 |
| Aging IIFE в stage-row | L147–166 |
| HealthDot + `%` | L167–170 |
| Contact | L199–205 |
| `calculateDealHealth` / `health` / `stageProbability` / импорт HealthDot / `IconContact` | только для удаляемого UI |

### 3. Логика AttentionLine (worst→best)

`getDealHealth` **взаимоисключающий** (`no-action` | `overdue-action` | `ok`):

- нет `next_step` / `next_action_date` → `no-action`
- дата в прошлом → `overdue-action`
- иначе → `ok`

Порядок overdue vs no-action в snippet **функционально безразличен** (косметика worst→best). Ветка `aging?.isStale` корректно только при `dh === 'ok'`. Визуальный язык точек (fill red / outline yellow) уже в текущем next-step блоке (L252–268) — AttentionLine не изобретает новый паттерн.

Токены: `var(--red-text, var(--red))` / `var(--yellow-text, var(--yellow))` — в `globals.css` и уже используются в карточке.

### 4. «Ничего не теряется из системы»

| Сигнал | Куда |
|--------|------|
| HealthDot / score | `ProjectDetail` + `DealFocusPanel` |
| % стадии | chevron / StageBoard header / title стадий |
| Контакт | карточка на детальной |
| Возраст (в т.ч. non-stale) | meta `· N дн. в стадии` на детальной |
| Stale | attention line «залипла…» |

### 5. Scope / «не трогать»

Budget, deadline+пилюля, progress bar, hover actions/drag, name+direction, company — вне правок. Helpers `deal-health` не менять. Delivery / Leads / TaskCard / StageBoard `BoardCard` — out of scope. Верно: delivery-канбан **другая** карточка.

### 6. crm-architect checklist

- [x] РАЗВЕДКА  
- [x] Реальные поля (`next_step`, `next_action_date`, `stage_entered_at`, `phase_group`) из schema  
- [x] Реальный путь `components/projects/ProjectCard.tsx`  
- [x] learnings: CSS vars, без client-DELETE / без flowType  
- [x] SQL/migrations N/A  
- [x] schema.md не требует апдейта  

---

## Блокеры (критично — исправить до запуска)

**Нет.** Можно отдавать в CC.

---

## Предупреждения (желательно исправить)

### W1. Смоук «/projects если ProjectCard там же» — ложный

Live:

| Route | Компонент |
|-------|-----------|
| `/deals` | `ProjectsView` → `PipelineBoard` → **`ProjectCard`** |
| `/projects` | `ProjectsSection` → **`DeliveryPipelineBoard` / `DeliveryCard`** |

Правка ProjectCard **не** меняет delivery-канбан. В смоке: только `/deals` (pipeline + при желании `?view=board` у StageBoard — **другая** `BoardCard`, OOS).

### W2. F-04 (аудит) vs вариант A

Аудит F-04: ≤4 сигнала, badge направления → в детальную.  
Олег A: ~6 + badge IIoT/ERP/Внутр. остаётся.  
Это **не ошибка промпта**, но DoD F-04 «полностью» не закрывается — partial by design. На гейте не требовать ≤4.

### W3. WHY vs целевая карточка (дедлайн)

WHY: «4 сигнала… (… **дедлайн-пилюля-как-тревога**, статус-шага) → одна строка».  
Целевая: дедлайн **оставить как есть** с пилюлей срочности; attention line **не** включает overdue deadline.

Фактически сворачиваются: HealthDot + возраст/stale + next-step status (+ композит health). Дедлайн остаётся вторым «тревожным» каналом рядом с attention — осознанный trade-off A; в WHY слегка завышено.

### W4. Non-stale «N дн. в стадии» с карточки уходит

Сейчас stage-row показывает и OK-возраст, и stale. После спринта OK-возраст только на детальной; на канбане — только stale в attention (или mute next-step). Это цель «ёлка», не баг.

### W5. Header «пушит» vs блок КОММИТ

Шапка: «коммитит+**пушит**». КОММИТ: только `switch -c` + commit, push нет. Для watcher/CC — зафиксировать: push по политике репо, не обязательно в промпте.

### W6. StageBoard `BoardCard` остаётся плотным

`?view=board` на `/deals` — отдельная карточка, не ProjectCard. После S-DEAL-CARD pipeline-вид разгрузится, board-вид — нет. OOS ок; не ждать единого F-04 на оба вида.

### W7. Условие `aging?.isStale && aging.daysInStage`

При `isStale` всегда `daysInStage > threshold ≥ 14`, truthy. Формально надёжнее `aging.daysInStage != null`, но live-баг не воспроизводится. Можно оставить as-is.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `PipelineBoard.tsx` | 276–283 | только consumer — **не трогать** |
| `StageBoard.tsx` `BoardCard` | ~84+ | OOS; не путать с ProjectCard |
| `DeliveryPipelineBoard.tsx` `DeliveryCard` | ~50+ | OOS |
| `shared/HealthDot.tsx` | — | **не удалять** |
| `lib/utils/deal-health.ts` | — | **не менять** API |
| `ProjectDetail.tsx` / `DealFocusPanel.tsx` | health/contact/age | бэкап сигналов — не трогать |
| `projects/index.ts` | export ProjectCard | без изменений |

Пропущенных **обязательных** правок вне `ProjectCard.tsx` нет.

---

## Предлагаемые правки в спринт (косметика, не блокеры)

1. **РАЗВЕДКА / ПРОВЕРКА:** явно «ProjectCard только `/deals` → PipelineBoard; `/projects` = DeliveryCard — смок не нужен».  
2. **WHY:** убрать «дедлайн-пилюля» из списка сворачиваемых **или** одной фразой: «дедлайн остаётся отдельным каналом (решение A)».  
3. **DoD F-04:** «partial: ~6 сигналов + badge; не ≤4 аудита».  
4. **КОММИТ:** убрать/уточнить «пушит» в шапке.  
5. Опционально: `AttentionLine` + `title`/`aria-label` (как у старого aging span) — a11y polish, не must.

---

## Чеклист перед CC

- [x] РАЗВЕДКА совпадает с live  
- [x] Один файл: `src/components/projects/ProjectCard.tsx`  
- [x] Helpers: `getDealHealth` / `getStageAging` / `getNextActionOverdueDays` — reuse only  
- [x] Не удалять `HealthDot.tsx` / `deal-health.ts`  
- [x] После правок: снести `calculateDealHealth`, `HealthDot` import, `IconContact`, `stageProbability` если unused  
- [x] `AlertTriangle` **оставить** (бюджет ⚠)  
- [x] tsc + build  
- [x] Смок: `/deals` aura + тёмная; 4 ветки attention (overdue / no-action / stale / ok next-step)  
- [x] Нет corner / % / HealthDot / contact; hover drag+actions; terminal без progress  
- [x] Ветка `feat/deal-card` от актуального main/typo-scale  
- [ ] (желательно) поправить текст смока W1 в промпте — не обязательно для GO  

---

## Итог

Спринт **готов к Claude Code**. Live-code sync PASS; Type Safety — tsc после cleanup imports; RLS/DB N/A; Backward Compat — WARNING как в VERIFICATION (инфо уходит с карточки на детальную, urgency читается одной attention-строкой + дедлайн-пилюля). Гейт Cowork: визуальный смок **только канбан `/deals`**, обе темы, четыре ветки attention.
