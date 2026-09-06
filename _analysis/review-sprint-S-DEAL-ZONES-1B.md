# Ревью: S-DEAL-ZONES-1B — кольцо здоровья и «перенесён N раз»

**Дата:** 2026-09-06
**Ревьюер:** Grok (верификация по коду `main` @ `aa34434`, crm-architect `architecture.md` / `learnings.md` / `schema.md` / `STATUS.md` рев. 33, live `DealContextRail.tsx` / `DealSignals.tsx` / `DealNextStep.tsx` / `use-stage-story.ts` / `use-projects.ts` / `deal-signals.ts` / миграция 087)
**Объект:** `_analysis/sprint-S-DEAL-ZONES-1B.md` — равные сегменты кольца в зоне «Риски» + счётчик переносов текущего шага из аудита 087
**Контекст:** продолжение S-DEAL-ZONES-1A (ревью GO 91, **в `main` не влит**, ветка `feat/deal-zones-1a` не создана). Источник решений — `claude/decisions-lime-theme-2026-09-05.md` Р3/Р8 (файла в репо нет, как и у 1A). STATUS: очередь «S-DEAL-ZONES-1 → S-DEAL-DATA-1 → S-DEAL-CHZ-1».

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды, стоп при отсутствии 1A) | ✅ команды живые; стоп сработает |
| «1A уже в `main`» | ❌ HEAD = S-FORMAT-1; `DealRisksZone` / `HealthDealCard` нет |
| Якоря монтажа после 1A | ❌ 1A не фиксирует эти имена |
| Пути файлов задач 1 и 3 | ✅ `deal-signals.ts`, `use-stage-story.ts`, `DealNextStep.tsx`, `plural.ts` |
| Схема 087 / `payload.changes.next_action_date` | ✅ whitelist класса «Значения», `{from,to}` текстом |
| Отклонение от Р3 (не score) | ✅ совпадает с шапкой `deal-signals.ts` и learnings S-HEALTH-V2-1 |
| Семантические токены, не `--accent` | ✅ `--danger/--warning/--success` в `:root` |
| Инвалидация ключа хука | ❌ переименование `deadline-moves` → `field-moves` без `use-projects.ts:514` |
| SQL / RLS / миграции | ✅ N/A, `postpone_count` честно отложен |
| Секция ТЕСТЫ | ✅ обе чистые функции, кейсы поведением |
| A11Y кольца (`role="img"`, сегменты не focusable) | ✅ |
| Out-of-scope (peek, delivery, лайм-бюджет, Р7) | ✅ |

**Оценка: 81/100 (NO-GO).** Доменные решения и вынос логики в `lib/` — сильные; запускать нельзя: 1A не влита и якоря монтажа с ней не сходятся, плюс переименование queryKey оставит счётчик переносов stale после того самого UPDATE, который его должен включать.
- Порог передачи в Claude Code: **≥ 85**. Ниже 85 — не отдавать в CC.
- Любой открытый B* → максимум 84 (NO-GO).

**Рекомендация:** не запускать. Сначала 1A в `main` (или в том же worktree), затем патч 1B по B1–B2, короткий re-review.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| S-DEAL-ZONES-1A | спринт + ревью есть, **кода нет**, `main` @ `aa34434` (S-FORMAT-1 #52) |
| S-DEAL-ZONES-1B | спринт есть, ревью — этот файл |
| `DealRisksZone` / `HealthDealCard` | **0 совпадений** в `src/` |
| `useDeadlineMoves` | жив, `src/lib/hooks/use-stage-story.ts:69` |
| `['deadline-moves']` инвалидация | `src/lib/hooks/use-projects.ts:514` |

Разведка спринта п.2 пустая — по собственному правилу («Если п.2 не находит `DealRisksZone` — СТОП») CC не дойдёт до задачи 1. Это правильный предохранитель, но заголовок «зоны уже в `main`» врёт.

---

## Live-разведка (сверка claims)

| Claim спринта | Live @ `aa34434` | |
|---------------|------------------|---|
| 1A в `main`, есть `DealRisksZone` / `HealthDealCard` | grep по `DealContextRail.tsx` пуст; здоровье — инлайн `RailCard` + `DealSignals` (`:66–71`) | ❌ |
| `scrollToSignalAnchor` / `SIGNAL_ANCHORS` | `DealSignals.tsx:282–296` | ✅ |
| `useDeadlineMoves` тянет `activity_log` без лимита, `project_updated`/`stage_changed`, desc | `use-stage-story.ts:69–97` | ✅ |
| Единственные потребители `deadlineMoves` | хук + `useStageStory:121,142` + `DealStageStory.tsx:21,58–62` (4 совпадения `deadlineMoves`) | ✅ |
| `text-warning-text` / `danger`/`success`/`warning` в tailwind | `tailwind.config.ts:69–77`; alias `:root` в `globals.css:2298–2300` | ✅ |
| `pluralRu` | `src/lib/utils/plural.ts:13–21` | ✅ |
| `getDealSignals` сортирует `bad → warn → ok`, фильтрует `'na'` | `deal-signals.ts:81–82, 318, 349–351` | ✅ |
| `showVerdict={false}` — помехи + свёрнутое «N в норме» | `DealSignals.tsx:148–196` | ✅ |
| `next_action_date` в аудите 087 как `{from,to}` | миграция `087_project_field_audit.sql:55–58, 96–99`; `docs/schema.md` класс «Значения» | ✅ |
| `DealNextStep` метаданные: дата → просрочен → «Шаг сделан» | `DealNextStep.tsx:88–117` | ✅ |
| `DealFocusPanel` только в peek | `ProjectPeekContent.tsx:61` | ✅ |
| Инвалидация `['deadline-moves']` при любом `useUpdateProject` | `use-projects.ts:514` | ✅ есть, спринт не упоминает |
| `useDeadlineMoves` монтируется только со вкладкой «История» | `ProjectDetail.tsx:437–438` → `DealStageStory` → `useStageStory` | ✅ |
| `--h-ring` уже в `:root` | `globals.css:45, 48–49` — один цвет на зону, не на сегмент | ✅ спринт правильно берёт `--danger/--warning/--success` |
| `postpone_count` в схеме | нет | ✅ |
| Файл `claude/decisions-lime-theme-2026-09-05.md` | нет в репо (1A это уже сказала) | 🟡 |

Команды разведки воспроизводимы. Расхождение с «Ожиданиями» — пункт 2; CC остановится, как и предписано.

---

## С чем согласен полностью

### 1. Отказ от взвешенного score — правильное отклонение от Р3

Шапка `deal-signals.ts:13–18` прямо запрещает третью формулу: «вместо одного непрозрачного числа — сигналы с вердиктом». `calculateDealHealth` (0–8) снят в S-HEALTH-V2-1 за непрозрачность и чтение несуществующей колонки (learnings). Выдуманные веса 30/12/10 не калибруются — в отличие от `DEFAULT_SIGNAL_THRESHOLDS`, сверенных с живой БД. Равные сегменты + цвет состояния — единственный вариант, который не возвращает тот же балл в новом виджете.

Центр «помехи / из N» несёт пропорцию, которой нет в списке: при `showVerdict={false}` норма спрятана под «N в норме» (`DealSignals.tsx:167–194`). Это честный ответ на критерий Р3 «кольцо обязано нести то, чего нет ниже».

### 2. Геометрия и подсчёт — в `lib/`, не в JSX

`buildHealthRing` и `countStepMoves`/`countDeadlineMoves` тестируемы без DOM и без сети. Это ровно правило architecture.md: «если функция тестируема — её место в `lib/`, не в queryFn хука». Существующий цикл в `useDeadlineMoves` выносится 1-в-1 — поведение вкладки «История» не меняется молча. Асимметрия «дедлайн считает назначение с нуля, шаг — нет» записана в ограничениях, не спрятана.

### 3. Счётчик шага из 087, без `postpone_count`

`next_action_date` в whitelist класса «Значения»; `jsonb_build_object('from', v_old ->> v_field, 'to', v_new ->> v_field)` даёт JSON-null на пустой дате — `countStepMoves` это переживает (`typeof from === 'string'`). Обрыв на `from === null` как граница текущего шага — верная модель «Шаг сделан» / первое назначение. Порог `>= 2` и `DealFocusPanel` не трогать — верный скоуп. Peek остаётся укороченным.

### 4. Цвет, a11y, delivery

`--accent` для «ок» запрещён той же шапкой `DealSignals.tsx` (в `t-washi` акцент === `--red`). Кольцо — `role="img"` с полной подписью, сегменты не табстопы: действие уже есть кнопкой CTA в строке. `withRing` только на клиентской зоне «Риски» — формула внедрения (`DeliveryHealthDot` / `getDeliveryHealth`) не подменяется. Кегли `text-2xl` / `text-meta` из шкалы S-FORMAT-1, не макетные `text-[22px]`.

### 5. ТЕСТЫ, финальная проверка, коммит `-F`

Обе новые функции покрыты граничными кейсами. `audit-tokens.py` уместен (hex в кольце не должно быть). `git commit -F` — zsh не раскроет `!`. Секция «Известные ограничения» честная: нет бэкфилла до 087, нет сброса границы при смене текста шага без снятия даты.

---

## Блокеры (критично — исправить до запуска)

### B1. Якоря монтажа выдуманы: `HealthDealCard` нет ни в `main`, ни в промпте 1A

Спринт:

> Продолжение S-DEAL-ZONES-1A (зоны Работа / Риски / Контекст уже в `main`).
> Если п.2 не находит `DealRisksZone` — СТОП.
> В `DealContextRail.tsx` перепиши `HealthDealCard`.
> Вызов в `DealRisksZone` → `<HealthDealCard signals={signals} withRing />`.

Live `DealContextRail.tsx:66–71` — инлайн `RailCard` + `DealSignals`, функций с такими именами нет.

1A **не обещает** их:

> **3.3** расщепить на `DealRisksZone` и `DealContextZone` **либо** оставить один компонент с пропом `zone: 'risks' | 'context'`. Выбрать то, что даёт меньше дублирования; какой вариант выбран — в отчёт.

Даже после удачного 1A разведка 1B стопнет, если CC выбрал `zone:`-проп и не завёл `HealthDealCard`. Сниппет задачи 2 тогда либо некуда вставлять, либо CC изобретёт обёртку «по обстоятельствам» — то, что разведка запрещает.

**Правка в спринт (два слоя):**

1. Заголовок: «после 1A, не раньше. Если п.2 пуст — СТОП, 1A не влита».
2. Монтаж без фиксированных имён:

> Найди в зоне «Риски» (после 1A) единственное место, где `DealSignals` рендерится с `showVerdict={false}` для `type === 'client'`. Слева от списка — `DealHealthRing`, список в `min-w-0 flex-1`. На пути внедрения / `DealContextRail` для delivery кольца нет. Имена обёрток (`HealthDealCard` / `DealRisksZone` / инлайн) — как получилось в 1A, в отчёт. Verification `grep withRing` — не «ровно 4 в DealContextRail.tsx», а «кольцо есть у client-рисков и нет у delivery».

Не запускать 1B, пока 1A не дала зону «Риски» в коде.

### B2. Переименование ключа `deadline-moves` → `field-moves` без единственной инвалидации

Спринт меняет `queryKey: ['deadline-moves', projectId]` на `['field-moves', projectId]` и велит грепать только `useDeadlineMoves` (ожидание 0) и `deadlineMoves` в `DealStageStory` (ожидание 4).

Live, `use-projects.ts:512–514`:

```ts
// Перенос дедлайна тоже виден на этой вкладке (аудит полей 087) и приезжает
// тем же UPDATE.
qc.invalidateQueries({ queryKey: ['deadline-moves'] });
```

Это **единственное** место свежести: у хука нет realtime (намеренно, комментарий в `use-stage-story.ts:13–24`). После `InlineEdit` даты шага триггер 087 пишет строку, `useUpdateProject.onSettled` сбрасывает кеш. Если ключ переименовать, а эту строку не тронуть:

- счётчик на карточке останется прежним до `staleTime` 60 с или перезагрузки;
- «перенесён N раз» не появится в тот момент, когда продавец только что перенёс дату — ровно AC 4–5;
- вкладка «История» тем же ключом тоже перестанет обновлять «Дедлайн переносился ×N».

Verification спринта это **не поймает**: `useDeadlineMoves` в `use-projects.ts` нет, там строковый литерал ключа.

**Правка:** в задаче 3.2 явно:

```ts
// use-projects.ts, onSettled useUpdateProject
qc.invalidateQueries({ queryKey: ['field-moves'] });
```

Комментарий рядом расширить: «перенос дедлайна и даты шага». Verification:

```bash
grep -rn "deadline-moves" src   # 0
grep -n "field-moves" src/lib/hooks/use-projects.ts src/lib/hooks/use-stage-story.ts
```

Файл `src/lib/hooks/use-projects.ts` — в список изменений (и не полагаться на `git add -A`, см. W2).

---

## Предупреждения (желательно исправить)

### W1. Клик по сегменту: stacked `<circle>` + `stroke-dasharray`

Сниппет рисует N полных окружностей друг на друге, видимая дуга — dash. Hit-testing dash-зазоров в SVG браузерозависим: верхний круг (последний в массиве = `ok`) может перехватить клик по красному сегменту. AC 2 тогда молча врёт.

В смок: «клик по **первому** (bad) сегменту скроллит к **его** якорю, не к последнему». Если нет — `RingSegment` отдаёт `startDeg`/`endDeg` (или `d` дуги), рендер `<path>`, не stacked circles. `pointer-events="stroke"` зазоров не лечит надёжно.

`stage_dwell` в `SIGNAL_ANCHORS` = `null` — клик no-op, как и отсутствие CTA. Это уже так, в смок не путать с поломкой.

### W2. `git add -A`

Сейчас в working tree незакоммичены `_analysis/sprint-S-DEAL-ZONES-1A.md`, ревью 1A и этот 1B. `-A` утащит их в feature-коммит. 1A уже требовала явный список. Перечислить:

`src/lib/domain/health-ring.ts`, `src/components/projects/DealHealthRing.tsx`, `src/components/projects/DealContextRail.tsx` (и/или файл зоны из 1A), `src/lib/domain/field-moves.ts`, `src/lib/hooks/use-stage-story.ts`, `src/lib/hooks/use-projects.ts`, `src/components/projects/DealNextStep.tsx`, `tests/unit/health-ring.test.ts`, `tests/unit/field-moves.test.ts`.

### W3. AC 6 «дополнительных сетевых запросов нет»

`useDeadlineMoves` сейчас живёт только во вкладке «История» (`ProjectDetail.tsx:437`). Вызов `useFieldMoves` из `DealNextStep` (всегда на открытой сделке) **впервые** стреляет выборку всех `project_updated`/`stage_changed` без лимита. Второго queryFn нет — это правда; «запроса как раньше не было» — нет. Сформулировать: «один queryFn на два счётчика, ключ общий с вкладкой История; на карточке запрос появится, даже если вкладку не открывали». `useActivityLog` с `limit(50)` по-прежнему не годится — это в спринте сказано верно.

### W4. «Перенесён N раз» после «Шаг сделан»

`{from: date, to: null}` — `continue`, не `break`. Пока новую дату не назначили, счётчик прошлого шага остаётся на пустой строке метаданных. Либо гейтить `{stepMoves >= 2 && project.next_action_date && (…)}`, либо явно принять «диагноз держится, пока не начат новый шаг» и написать это в ограничения.

### W5. 1A обещала снять чип вердикта в 1B — 1B этого не делает

1A, задача 3.2: «Снятие чипа и перенос слов в зону — это 1B, где в „Рисках“ появится кольцо с вердиктом внутри». 1B кладёт в центр **счёт**, чип под шагом не трогает. Это правильнее (F-01: вердикт один, в рабочей колонке). Одна строка в 1B: «чип под шагом остаётся, в кольцо не переезжает — 1A это обещала, здесь сознательно не делается».

### W6. Порядок «кольцо = легенда к списку» слегка врёт, пока норма свёрнута

Список при `showVerdict={false}` показывает только помехи; зелёные сегменты кольца соответствуют строкам под кнопкой «N в норме». Порядок `bad → warn → ok` совпадёт после раскрытия. Для AC это ок (кольцо как раз и показывает спрятанную пропорцию), но фразу «порядок строк списка под кольцом» смягчить.

### W7. Ветка и px кольца

Имени ветки нет (у 1A было `feat/deal-zones-1a`). `RING_BOX = 80` как HTML `width`/`height` — px; текст в центре в rem. Для SVG это обычная практика, `audit-tokens.py` px не сторожит. По желанию `5rem`, не блокер.

### W8. Тесты `countStepMoves` — форма 087

В кейсы явно: `from: null` (JSON-null, как `->>` + `jsonb_build_object`), не omitted-ключ; смешанный payload `{deadline, next_action_date}` — счётчики независимы.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `src/lib/hooks/use-projects.ts` | 512–514 | `['deadline-moves']` → `['field-moves']` (B2) |
| `src/components/projects/DealContextRail.tsx` | 66–71 | фактическая точка монтажа кольца **до** 1A; после 1A — зона «Риски» |
| `src/components/projects/DealNextStep.tsx` | 103–107 | вставка «перенесён N раз» после `{overdue && …}` — якорь верный |
| `src/components/projects/DealStageStory.tsx` | 21, 58–62 | не менять (спринт прав); сломается только через ключ хука (B2) |
| `src/app/globals.css` | 45, 48–49 | `--h-ring` не использовать как цвет сегмента — спринт это уже понял |
| `src/components/projects/DealFocusPanel.tsx` | — | не трогать — верно |
| `src/lib/hooks/use-activity-log.ts` | 27 `limit(50)` | не переиспользовать — верно |

Новых таблиц/колонок/RPC спринт не вводит. `activity_log.payload.changes.next_action_date` — существующий контракт 087.

---

## Предлагаемые правки в спринт

1. **B1.** Заголовок: 1A — предусловие, не факт `main`. Монтаж — «единственный `DealSignals showVerdict={false}` в зоне Риски», без обязательных имён `HealthDealCard`/`DealRisksZone`. Verification `withRing` — по поведению, не «4 совпадения в одном файле».
2. **B2.** Задача 3.2: правка `use-projects.ts` + grep `deadline-moves` → 0 по всему `src`.
3. **W1.** Смок клика по первому сегменту; запасной путь — дуги `<path>`.
4. **W2.** Явный `git add` список, не `-A`.
5. **W3–W5.** Одна фраза про новый момент запроса; гейт счётчика на текущую дату или явное принятие; чип вердикта остаётся.
6. Имя ветки `feat/deal-zones-1b`.

После правок 1–2 и появления зоны «Риски» в коде — re-review, ожидаемый GO.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА есть (и стоп при пустом п.2)
- [x] Имена таблиц/колонок из schema.md / 087, не угаданы
- [x] `learnings.md`: третья формула здоровья, `--accent` ≠ смысл, семантические токены
- [x] Миграций нет, apply нет
- [x] RLS/DEFINER не затрагиваются
- [x] CSS: `var(--danger|--warning|--success)`, не hex
- [x] Секция ТЕСТЫ на новый `lib/`
- [x] DELETE/CASCADE не релевантны
- [ ] Реальные пути монтажа после 1A (B1)
- [ ] Инвалидация React Query при смене ключа (B2)

---

## Чеклист перед CC

- [ ] 1A влита в `main` (или 1B стартует в worktree поверх 1A)
- [ ] B1 — якоря монтажа переписаны под фактический код 1A
- [ ] B2 — `use-projects.ts` в задаче 3.2 и в verification
- [ ] W2 — `git add` файлами, не `-A`
- [ ] W1 — смок клика по не-последнему сегменту
- [ ] Re-review ≥ 85
