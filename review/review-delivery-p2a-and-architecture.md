# Ревью: sprint-delivery-p2a + architecture-delivery-p2

**Дата:** 2026-07-11  
**Ревьюер:** Grok (верификация по коду `feat/aura-theme`, миграции 032/034/035, P1 handoff)  
**Объекты:**
- `_analysis/sprint-delivery-p2a.md` — спринт P2a (фазовая доска + шаблоны + spawn v2)
- `_analysis/architecture-delivery-p2.md` — D3-дельта §10–14 поверх architecture-delivery-projects

**Контекст:** P1 закрыт (035 на проде, коммиты 4c1f2ad → 8706399 → 005bf20). На проде 1 delivery-проект с 4 дефолтными PCT-колонками.

---

## Вердикт

| Документ | Оценка | Можно в CC? |
|----------|--------|-------------|
| `architecture-delivery-p2.md` | **8.5/10** | ✅ Да — концепция зрелая, §10–12 закрывают дыры P1 |
| `sprint-delivery-p2a.md` | **7/10** | 🟡 После правок блокеров — см. ниже |

**Сводный вердикт:** архитектура и спринт **согласованы между собой** и с фактическим кодом P1. SQL-ядро (резолвер, seed-guard, шаблоны, spawn v2) — сильное. Frontend-часть спринта **недоспецифицирована** относительно реального `ProjectBoard.tsx`. Миграция A7 **неполная** (IIoT experiment — заглушка). **Не отдавать в Claude Code без доработки A7 + UI-контракта B2.**

---

## С чем согласен полностью

### 1. Архитектура §10 — модель «фаза ≠ статус»

Аналогии Monday / PSA / 1С:ДО корректны. Решение переиспользовать `project_columns` с `category='phase'` и сделать `tasks.lane` истиной для phase-колонок — **правильный минимальный путь** без второй доски.

Диагноз резолвера в §10 подтверждён по `032_project_boards.sql`:

```112:119:supabase/migrations/032_project_boards.sql
  SELECT CASE p
    WHEN 'backlog' THEN 'next'::task_lane
    WHEN 'started' THEN 'now'::task_lane
    WHEN 'paused'  THEN 'wait'::task_lane
    ELSE 'done'::task_lane   -- ← 'phase' попадёт сюда
  END
```

Без патча A3 задачи на фазовой доске получали бы `lane='done'` при любом INSERT/UPDATE — это блокер-класс, спринт закрывает его верно.

### 2. Патч `resolve_task_board` (A3) — хирургический и обратносовместимый

Две точки (`lane`-change не ремапит column при `v_cat='phase'`; финальная деривация пропускает `phase`) **не ломают** ветки для internal (`backlog/started/paused/done`) и личного борда (`project_id IS NULL`). Соответствует комментариям в живой миграции 032.

### 3. Seed-guard + spawn v2 + graceful empty

- `seed_project_columns` early return для `delivery` — обязателен (сейчас сидит 4 колонки **всем** проектам, включая delivery).
- `DROP` старой 2-арг сигнатуры + `DEFAULT NULL` на `p_template_id` — правильно для PostgREST; UI P1 (`ProjectDetail.tsx:243`) продолжит работать с 2 аргументами.
- «Шаблона нет → проект без колонок, не ошибка» — разумно для ERP+experiment и будущих направлений.

### 4. Нормализация шаблонов (§11)

Три таблицы вместо JSON в §2.8 P1 — чище для RLS, сидов и `copy_delivery_template`. `UNIQUE (org_id, direction, kind)` — ключ резолюции при spawn без лишнего параметра.

### 5. Уроки P1 учтены

- `REVOKE ... FROM anon` на новой сигнатуре spawn (035 изначально пропускал anon — гейт-фикс задокументирован).
- `lane='next'` явно при копировании (DEFAULT в БД — `'now'`).
- `database.ts` рукописный — regen запрещён, ручное дополнение.
- `current_org_role()` для RLS шаблонов — функция есть (`023_org_rls.sql`), в отличие от устаревшего мифа про `user_role()`.

### 6. Разбивка P2a / P2b

Честное отсечение: members, прогресс X/Y, «Создать из шаблона» — в P2b. P2a фокусируется на доске и spawn — правильный инкремент.

### 7. РАЗВЕДКА и гейт миграций

Grep-команды релевантны. Отдельные коммиты (миграция / UI) — удобно для гейта Cowork.

---

## Блокеры (исправить до запуска CC)

### B1. Миграция A7: IIoT «Эксперимент» — не SQL, а комментарий

В `sprint-delivery-p2a.md` блок IIoT experiment (строки ~372–375) — **заглушка** «скопировать блок Запуск». В применяемой миграции этого не будет → spawn `iiot`+`experiment` всегда попадёт в graceful empty, хотя архитектура §11 обещает шаблон.

**Рекомендация:** либо дописать полный INSERT (копия launch с `kind='experiment'`), либо явно зафиксировать в VERIFICATION «ERP/IIoT experiment без шаблона до уточнения Олега» и убрать обещание из architecture §11.

### B2. Frontend: `ProjectBoard.tsx` — нет режима phase, но это единственная точка рендера

Факт из кода:

```840:843:src/components/projects/ProjectDetail.tsx
      {tab === 'board' && (
        <div className="mb-4">
          <ProjectBoard projectId={projectId} />
```

`ProjectBoard` сейчас:
- `CATEGORY_LABEL` / `ColumnCategory` — только 4 значения (`database.ts:121`, `ProjectBoard.tsx:37–42`);
- UI «Добавить колонку» + смена `category` в rename — **опасно** для phase-доски;
- `TaskQuickAdd` передаёт `columnId`, но **не** `lane: 'next'` (`ProjectBoard.tsx:149`);
- `TaskCard` — toggle done/now чекбоксом, **не** цикл next→now→done и без badge «Просрочена».

Спринт B2 пишет «по РАЗВЕДКЕ найти компонент» — компонент найден (`ProjectBoard`), но **конкретных задач нет**:

| Нужно в спринте | Сейчас в промпте |
|-----------------|------------------|
| `isPhaseBoard` prop или ветка по `project.type==='delivery'` | 🟡 упомянуто размыто |
| Расширить `ColumnCategory` + типы | ✅ B1 |
| Скрыть add/rename/delete column для phase | ❌ нет |
| Отдельный `PhaseTaskCard` или режим `TaskCard` | ❌ нет |
| `TaskQuickAdd lane='next'` для phase | ✅ B3, но без привязки к файлу |
| Запретить смену category на phase-колонках в UI | ❌ нет |

**Без этого CC импровизирует** и сломает internal-доски или delivery UX.

### B3. INSERT задачи без `lane: 'next'` → статус «В работе» даже после патча A3

При INSERT с `column_id` = phase-колонка и DEFAULT `lane='now'`:
- патч A3 **не перезаписывает** lane (категория `phase`);
- lane остаётся `'now'` = «В работе», а не «Не начата».

Спринт B3 это формулирует верно, но **обязательность** должна быть в B2 (`TaskQuickAdd` + `TaskModal` + кнопка «+ Задача» в ProjectDetail). Добавить в ПРОВЕРКУ SQL-смоук: `INSERT task с column_id phase AND lane next`.

---

## Важные замечания (не блокеры, но закрыть до гейта)

### W1. `sync_lane_on_category_change` не упомянут

`032_project_boards.sql:220–227` — при смене `category` колонки каскадно ставит `lane = category_to_lane(new.category)`. Для `category='phase'` → `lane='done'`.

На phase-доске смена category через UI должна быть **запрещена** (см. B2). Если админ всё же сменит через SQL — задачи станут «Готово». Достаточно guard в UI; опционально — патч триггера: `IF NEW.category = 'phase' THEN skip cascade`.

### W2. `copy_delivery_template` — нет проверки org

Хелпер проверяет `type='delivery'`, но не сверяет `template.org_id = project.org_id`. Вызов только из `spawn` (после org-гарда) и бэкфилла — риск низкий. Для hardening:

```sql
IF NOT EXISTS (SELECT 1 FROM delivery_templates WHERE id = p_template_id AND org_id = v_project.org_id) THEN
  RAISE EXCEPTION 'template org mismatch';
END IF;
```

### W3. Повторный spawn с той же сделки

P1 разрешает 1..N delivery на won-сделку. `copy_delivery_template` **не проверяет** наличие колонок → второй spawn добавит **второй набор фаз**. Либо документировать как known limitation P2a, либо guard `IF EXISTS (project_columns) THEN skip copy`.

### W4. Имена переменных в spawn v2

Живой 035 использует `v_new_id`, спринт A6 пишет `v_project_id`. Мелочь, но для CC — **явно**: «использовать `v_new_id` из тела 035».

### W5. Бэкфилл A8: условие `category <> 'phase'`

Корректно для единственного прогонного проекта (4 дефолтные колонки, 0 задач). Если бы были задачи в дефолтных колонках — DELETE не сработал бы (ветка `IF NOT EXISTS tasks`). На проде ок; зафиксировать в смоуке гейта.

### W6. ERP experiment — осознанный gap

Architecture §11 и sprint согласны: шаблон не сидим, empty state. UI-хинт «для направления нет шаблона» покрывает. ✅

### W7. Тесты не упомянуты в спринте

После P1 есть `tests/unit/delivery-phases.test.ts`, `project-href.test.ts`, e2e `deals.spec.ts` / `projects.spec.ts`. P2a стоит добавить:
- unit: `ColumnCategory` + phase, статус-цикл констант;
- unit: мок логики «просрочена»;
- e2e (условно): spawn → доска с фазами (нужен auth + данные).

### W8. Вкладка «Доска задач» vs «План»

Architecture §13 допускает «План»/«Задачи» — в коде сейчас **«Доска задач»** для всех типов. Для delivery можно переименовать в «План» (косметика) — не блокер, но стоит решение зафиксировать.

---

## Сверка architecture ↔ sprint

| Тема | Architecture | Sprint | Статус |
|------|--------------|--------|--------|
| category='phase' | §10 | A1 | ✅ |
| resolve_task_board патч | §10 | A3 | ✅ |
| Таблицы шаблонов + RLS | §11 | A4 | ✅ |
| copy_delivery_template | §12 | A5 | ✅ (+ W2) |
| spawn v2 DROP+CREATE | §12 | A6 | ✅ |
| seed guard delivery | §12 | A2 | ✅ |
| Бэкфилл 1 проекта | §12 | A8 | ✅ |
| UI фазовая доска | §13 | B2 | 🟡 тонко |
| P2b scope | §14 | «НЕ делаем» | ✅ |
| IIoT experiment seed | §11 обещает | A7 заглушка | ❌ B1 |

---

## Рекомендуемые правки в sprint-delivery-p2a.md

### 1. Дописать A7 — IIoT experiment (или явный waiver)

Минимум: `INSERT ... kind='experiment', name='IIoT: эксперимент (пилот)'` + те же 4 фазы/18 задач, что launch (с комментарием про `default_enabled`).

### 2. Расширить B2 — явный чеклист по `ProjectBoard.tsx`

```
B2.1  ProjectBoard: prop mode='phase' | 'default' (default = internal/PCT-1)
B2.2  mode='phase': скрыть «Добавить колонку», rename category, delete column
B2.3  PhaseTaskCard: badge статуса (клик → цикл), badge «Просрочена»
B2.4  DnD — только column_id (уже так в useMoveTask) — без lane
B2.5  TaskQuickAdd: lane='next' обязателен при mode='phase'
B2.6  ProjectDetail: для delivery tab label опционально «План»
```

### 3. Добавить смоуки гейта (SQL)

```sql
-- после copy: задачи lane='next', не 'done'
-- UPDATE lane now → column_id не меняется
-- UPDATE column_id (другая фаза) → lane не меняется
-- INSERT internal project → 4 дефолтные колонки (регресс seed)
-- spawn 2-arg → колонки phase появились
```

### 4. Упомянуть `sync_lane_on_category_change` (W1)

Запрет в UI или патч триггера.

### 5. Блок тестов в ПРОВЕРКА

```bash
npm run test && npx playwright test tests/e2e/projects.spec.ts tests/e2e/deals.spec.ts
```

---

## Оценка трудоёмкости и риска

| | Sprint заявляет | Ревьюер |
|--|---------------|---------|
| Трудоёмкость | 6–8 ч CC | **8–12 ч** (UI phase-режим в ProjectBoard — основной объём) |
| Риск | средний | **средний-высокий** на резолвере (митигация — смоуки); **средний** на UI |

Миграцию можно ревьюить и применять **отдельным коммитом до UI** — разумная стратегия из спринта.

---

## Итог

**architecture-delivery-p2.md** — готов как D3-дельта, закрывает UI-контракт §2.5 P1 и блокер seed-guard §3. Брать за основу без пересмотра модели.

**sprint-delivery-p2a.md** — SQL-часть (A1–A6, A8) готова к реализации; **A7 требует дописывания**; **B2–B4 требуют конкретизации под `ProjectBoard.tsx`**. После правок B1 + B2-чеклиста — **можно отдавать в Claude Code**.

```
Architecture:  8.5/10 — концепция зрелая
Sprint SQL:    8/10   — после A7
Sprint UI:     5.5/10 — нужен детальный B2
Готовность:    🟡 ПРАВКИ → затем GO
```