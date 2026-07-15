# Спайк: Gantt v1 — либа vs растить кастом

**Дата:** 2026-07-15 · **Автор:** Cowork (гейт) · **Статус:** решение принято
**Контекст:** S-GANTT-V0-1 (кастомный CSS-grid таймлайн, ~150 строк) в main (3f78623). Решаем путь для v1
(zoom неделя/месяц, drag-перепланирование, потенциально зависимости/стрелки).

---

## Вопрос
Брать стороннюю Gantt-либу под v1 или растить кастомный CSS-grid, который уже отрендерил v0?

## Критерии (по убыванию веса для нашего стека)
1. **Темизация под 6 тем через CSS-переменные** (aura/washi/fuji/frost/aurora/tidal; Tailwind-токены, «no hardcoded colors» — H-constraint; frost/aurora/tidal — dark-glass с полупрозрачным `--surface`). **Критично.**
2. **Лицензия** — только permissive (MIT/Apache). GPL/commercial для проприетарной CRM = стоп.
3. **SSR / Next 15 App Router** (RSC, гидрация).
4. **Вес бандла** (Netlify, 6 тем и так грузят CSS).
5. **Drag + zoom** — то, ради чего вообще смотрим либу для v1.
6. **Зависимости/стрелки** — будущее (в модели данных задач предшественников НЕТ → не драйвер сейчас).
7. **Долговечность/поддержка** (H4: избегать сомнительных внешних зависимостей).

## Кандидаты — вердикт

| Опция | Лиц. | Тема под 6 CSS-var | SSR | Вес | Drag/Zoom | Deps-стрелки | Поддержка | Итог |
|-------|------|--------------------|-----|-----|-----------|--------------|-----------|------|
| **Кастом (CSS-grid)** | — | ✅ нативно (токены) | ✅ RSC-friendly | ✅ 0 доп. | 🟡 писать (drag — есть @dnd-kit) | 🟡 писать (SVG overlay) | ✅ наш код | **✅ выбор** |
| frappe-gantt 0.6.1 | MIT | 🔴 своя SVG-таблица стилей, override на каждой теме | 🔴 vanilla → client-only враппер | 🟡 малый | ✅ из коробки | ✅ | 🟡 pre-1.0 | ❌ тема воюет |
| @wamra/gantt-task-react 0.6.17 | MIT | 🔴 цвета через props/inline → пробрасывать per-theme | 🔴 не заявлен | 🔴 тяжелее | ✅ | ✅ | 🔴 576 dl/нед, форк заброшенного | ❌ тема + longevity |
| SVAR React Gantt | MIT | 🟡 своя light/dark, не наши токены | 🟡 client-widget | 🟡 средний | ✅ | ✅ | 🟡 молодой (2025, 14 коммитов) | 🟡 резерв |
| dhtmlx / bryntum / syncfusion | GPL/commercial | — | — | 🔴 тяжёлые | ✅ | ✅ | ✅ | ❌ лицензия+вес |

## Решение: **растить кастом.**

**Почему:**
1. **Тема — доминирующее ограничение.** 6 тем через CSS-переменные — не опция, а H-constraint. Любая либа тащит собственную систему стилей (props-цвета / light-dark / скины); чтобы она уважала наши токены, надо переопределять её CSS на каждой из 6 тем и **переделывать после каждого апдейта либы**. Кастом это делает нативно — он уже на `bg-accent`/`border-border`.
2. **Drag-инфра уже в репо.** Проект использует **@dnd-kit** (доска задач, kanban проектов). Единственная интерактивная фича v1 (drag-перепланирование бара) — инкремент на существующем стеке, не новая зависимость.
3. **Главное, что дают либы — рендер зависимостей/стрелок — сейчас мут:** в модели задач нет предшественников (`tasks` без predecessor-поля). Пока зависимостей нет, преимущество либы не реализуется.
4. **Избегаем:** вес новой зависимости, client-only SSR-враппер, налог на override темы, и (H4) внешнюю либу сомнительной долговечности (@wamra 576 dl/нед; SVAR молодой).
5. **v0 уже доказал подход** — ~150 строк, отрендерил бары/ось/fallback/«без дат» под темы.

**Честный контраргумент (зафиксирован):** кастом = мы владеем zoom, виртуализацией, a11y, edge-cases. Если Gantt пойдёт в сторону полноценного PM-Gantt (зависимости, critical path, baselines, resource-lanes) — это много кода, и либа окупится.

## Scope v1 при кастоме — сведён с roadmap §9.2 (ВЕРИФИЦИРОВАН по живому файлу 2026-07-15)
> Продуктовый контракт v1 = **roadmap §9.2** (`improvements/CRM-ROADMAP-projects-deals.md`); техника — из спайка. Прочитан целиком; сводка Grok совпала. Drag — v2 (§9.3).

**S-GANTT-VIEW-1 — read-only, строго §9.2 (~2–3 спринта):**
- **Swimlane — 4 полосы по фазе СДР** (`phase_group` delivery-пайплайна: initiated/planning/execution/completed). Client/internal фаз нет → плоско/«Без колонки». **Отдельная модель строк, не только zoom.**
- **Bar = task с датами**; **milestone = ромб** (`is_milestone` УЖЕ в схеме `tasks`; `rotate-45`/SVG + токен — дешевле либы).
- **Today line**; **zoom week/month** (day = v0; бакеты — дисциплина `mskDateKey`/UTC-полдень, иначе бар выпадет из бакета на границе месяца).
- **Tooltip** (название, исполнитель, lane); **фильтр** (открытые / все / только milestones); липкая колонка названий.
- **Исключено v1 (§9.2):** drag, critical path, resource histogram, baseline, export PDF.
- **Виртуализация** (§10 «perf на 200+ задач»): **>180 дн day-zoom → предупреждение; >365 дн / >200 задач → виртуализировать / load by phase.** Не молчаливый кап.

**Нюансы из §9.4/§9.5 (не было у Grok — учесть в промпте):**
- **Таб — «Гант»** (не «Таймлайн» как в v0), по §9.4 на **delivery** ProjectDetail; internal — опционально (P3). Решить: переименовать v0-таб и/или гейтить по `type` (сейчас показан на всех типах).
- **Хук `useProjectSchedule(projectId)`** (§9.5): join tasks + columns(phase) → `GanttTask[]`. Отдельный селектор над `useProjectBoard` (фаза + span + milestone), не размазывать по компоненту.
- **Fallback конца:** §9.5 наивно `end_date ?? deadline` — **наш `end_date ?? mskDateKey(deadline)` перекрывает** (TZ-корректный; roadmap-формула дала бы off-by-one). Держим наш.

**S-GANTT-VIEW-2 — drag (v2 по §9.3):**
- move (start+end) + resize (только end) через @dnd-kit **+ custom pointer-sensors** (НЕ `useSortable` — там list-reorder, не ось дат; полдня-spike внутри задачи). Дельта → даты → optimistic-мутация (как `use-tasks`). CHECK `end≥start` клэмп; a11y keyboard. (§9.3 дальше: FS-зависимости, critical path.)

## Триггер пересмотра (когда всё же брать либу)
Если в roadmap входят **зависимости задач + critical path** (или baselines/resource-lanes) — переоценить **SVAR React Gantt** (MIT, самый способный из free) как кандидата на adopt. До этого момента — кастом.

## Риски
- Drag через @dnd-kit на absolute/grid-барах — проверить хит-тест resize-хендлов vs move (спайк в самом спринте drag, не сейчас).
- Zoom-бакеты: неделя/месяц требуют агрегации span — off-by-one на границах бакета (та же дисциплина, что `buildDays` на UTC-полдне).
- a11y при drag — клавиатурная альтернатива (dnd-kit даёт keyboard sensor; не забыть).

---

**Next:** перед промптом **S-GANTT-VIEW-1** — свести scope с roadmap §9.2 по живому файлу (мост), затем оформить read-only PM-вью (zoom неделя/месяц + swimlane по фазе + milestone-ромб + tooltip + фильтры + today + sticky). Drag → **VIEW-2** отдельно (v2 по roadmap). Grok-ревью (`review-spike-gantt-lib-vs-custom.md`): 9/10, решение «растить кастом» подтверждено — не пересматривать.

Sources (state-of-libs, 2026-07):
- https://www.npmjs.com/package/frappe-gantt
- https://www.npmjs.com/package/@wamra/gantt-task-react
- https://github.com/svar-widgets/react-gantt
- https://svar.dev/blog/top-react-gantt-charts/
