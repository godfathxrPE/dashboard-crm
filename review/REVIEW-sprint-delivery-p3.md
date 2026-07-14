# Ревью спринта `_analysis/sprint-delivery-p3.md` (delivery P3)

**Дата:** 12 июля 2026  
**Контекст:** P1/P2a/P2b на проде (миграции 035–037 в репо, `main`). Миграция 038 и UI-гейт **ещё не начаты**.  
**Вердикт:** **можно отдавать в Claude Code после 4 правок** — SQL-скелет и S27-паттерн зрелые; разведка в целом точная, но есть неверный путь к модалкам, пробел в инвалидации хука и расхождение с существующим error-паттерном.

---

## Общая оценка: 8.5/10

Спринт хорошо закрывает архитектурный хвост PCT-1 P3: перенос `is_milestone` из шаблона в runtime-задачи, двухуровневый enforcement (RPC + BEFORE-триггер), шаблон-агностичный гейт. Разведка Cowork про потерю флага в `copy_delivery_template` **подтверждена по коду** (`036:218–226` — INSERT без `is_milestone`). Решения Олега (не привязываться к имени фазы, reopen не блокировать) согласованы с сидами ERP/IIoT.

---

## Что verified и согласовано

| Пункт | Статус | Комментарий |
|-------|--------|-------------|
| Точка входа UI | ✅ | `ProjectDetail.tsx:472–483` — `confirm()` + `updateProject.mutate({ status: 'completed' })` без гейта. |
| Потеря `is_milestone` при spawn | ✅ | `copy_delivery_template` копирует `text`, `lane`, `sort_order` — флаг не переносится. |
| `tasks.is_milestone` отсутствует | ✅ | `database.ts:624–659` — колонки нет; в `delivery_template_tasks` есть (`:579`). |
| IIoT launch: 3 вехи фазы 4 | ✅ | Сид `036:402–407` — 4.2/4.3/4.5 с `is_milestone=true`. Текст задачи = `wbs || '. ' || title` — совпадает с INSERT в copy. |
| IIoT experiment: без вех | ✅ | Сиды experiment (`:378–407`) — ни одного `is_milestone=true` → тест 5 (свободное завершение) выполним. |
| ERP: вехи по всем фазам | ✅ | 1.8, 2.7, 3.6, 4.7, 5.7, 6.4 — шаблон-агностичный гейт заблокирует завершение, пока все 6 не `done`. Осознанно. |
| S27 как образец | ✅ | `check_stage_requirements` + `trg_aa_enforce_stage_gate` (`027`) — тот же split UI/backstop. |
| `useStageGate` / `StageReadiness` | ✅ | Готовый паттерн чек-листа (`use-stage-gate.ts`, `StageReadiness.tsx`). |
| Milestone UI на доске | ✅ | `ProjectBoard` рендерит `TaskCard` с `phaseMode` (`ProjectBoard.tsx:161`). Бейдж логичнее в `TaskCard.tsx`, не в board-контейнере. |
| Гранты REVOKE anon | ✅ | Урок P1/036b — явный `REVOKE FROM anon` обязателен. |
| Cowork-гейт миграции | ✅ | Конвенция проекта: CC пишет файл, не применяет. |
| Тест-сценарии | ✅ | 7 кейсов покрывают RPC, бэкфилл ОМК, backstop, experiment, reopen, regression. |

---

## Критические замечания (исправить до старта)

### 1. РАЗВЕДКА §4: `src/components/modals/` не существует

```bash
ls src/components/modals/   # No such file or directory
```

Модалки в проекте — **колокированы** с фичами: `TaskModal.tsx`, `ProjectModal.tsx`, `MeetingModal.tsx` и т.д., паттерн `[data-modal]` + overlay внутри компонента.

**Рекомендация:** заменить в спринте:
```bash
# образец модалки завершения
head -40 src/components/tasks/TaskModal.tsx
# или inline-модалка в ProjectDetail (modalOpen уже есть :279)
```
Модалку завершения можно держать **в `ProjectDetail.tsx`** (как `gateBlock`-баннер) или вынести в `DeliveryCompletionModal.tsx` рядом с `ProjectDetail` — не в несуществующую папку `modals/`.

### 2. Инвалидация `useDeliveryGate` — не специфицирована точка подключения

Спринт: «invalidate по изменению tasks — повторить схему». Фактически:
- `useUpdateTask` при смене `lane` инвалидирует `['tasks']` и `['projects']` (`use-tasks.ts:263–268`);
- ключа `['delivery-gate', projectId]` **нигде нет**.

Без явного шага чеклист в модалке устареет после закрытия вехи на доске (до refetch по staleTime 30s в `useStageGate` — аналогично).

**Рекомендация:** добавить в ЗАДАЧУ 3:
```ts
// use-tasks.ts → useUpdateTask onSettled, если менялся lane:
queryClient.invalidateQueries({ queryKey: ['delivery-gate'] });
```
Либо `refetchOnMount: 'always'` в `useDeliveryGate` — хуже, предпочтительнее invalidate в мутации lane.

### 3. Формат ошибки триггера vs S27 — унифицировать парсинг

S27: `message = 'stage_gate_failed'`, детали в `DETAIL` (JSON-массив), парсер `parseStageGateError` (`use-projects.ts:20–29`).

P3 в спринте: `RAISE EXCEPTION 'DELIVERY_GATE: незакрытых milestone-задач: %'` + toast.

В проекте **нет toast-библиотеки** на `ProjectDetail` — ошибки стадийного гейта показываются через `gateBlock` alert-баннер (`:710–734`).

**Рекомендация:**
- Триггер: `RAISE EXCEPTION 'delivery_gate_failed' USING DETAIL = v_open_milestones::text` (симметрия S27);
- Добавить `parseDeliveryGateError(err)` рядом с `parseStageGateError`;
- Backstop UI: **alert внутри модалки** или переиспользовать `role="alert"` баннер — не «toast».

### 4. Бэкфилл: добавить `tt.org_id = p.org_id`

Текущий SQL матчит `delivery_template_tasks` **без org**:

```sql
... FROM projects p, project_columns pc, delivery_template_tasks tt
WHERE ... AND tt.is_milestone AND t.text = ...
```

При совпадении `wbs + title` между шаблонами разных org (маловероятно, но возможно в тестовых данных) — ложный milestone.

**Рекомендация:** `AND tt.org_id = p.org_id`.

---

## Средние замечания

### 5. Org-гард RPC: `is_org_member`, не только `current_org_id()`

S27 в `check_stage_requirements` (`027:111–114`):
- `auth.uid() IS NOT NULL` → `is_org_member(v_project.org_id)`;
- service-контекст (`auth.uid() IS NULL`) — гард пропускается (триггер/backfill).

Спринт упоминает `current_org_id()` — в 037 для RPC используется похожий паттерн, но для **read-check по project_id** безопаснее зеркалировать S27: membership по `project.org_id`, не по активной org сессии (edge: пользователь в двух org).

### 6. `GRANT EXECUTE` — добавить `service_role`

`check_stage_requirements` грантит `authenticated, service_role` (`027:171`). Для симметрии и smoke-тестов гейта — то же для `check_delivery_completion`.

### 7. ЗАДАЧА 5: файл — `TaskCard.tsx`, условие — `phaseMode && task.is_milestone`

Ромб `Diamond` слева от `{task.text}` (`TaskCard.tsx:118–125`), не в `ProjectBoard`. CVD-урок из visual-audit — форма + `title`, согласовано.

После миграции `useProjectBoard` уже тянет `*` — `is_milestone` придёт автоматически; тип `Task` подтянется из `database.ts`.

### 8. Reopen `completed → open` — UI отсутствует, тест 6 всё равно валиден

Сейчас для delivery только бейдж «Завершён» (`:485–488`), кнопки reopen нет. Триггер не должен блокировать — спринт верен. Если reopen появится позже — гейт не помеха.

### 9. `updateProject` без `onError` на кнопке завершения

Строка `:477` — мутация без `{ onError }`. Для backstop-сценария (веха переоткрыта между RPC и кликом) нужен обработчик по аналогии с `moveToStageId` + `onGateError`.

**Рекомендация:** в ЗАДАЧЕ 4 явно: `updateProject.mutate(..., { onError: onDeliveryGateError })`.

### 10. ERP-проект: UX-ожидание 6 вех, не только «Передача на поддержку»

DoD/live QA должен проверять не только ОМК (3 вехи), но и ERP launch (6 вех по фазам 1–6). Спринт это подразумевает в решении Олега, но в скриншотах/смоках стоит явно указать.

### 11. Один коммит vs конвенция P2b (два коммита)

P2b рекомендовал: миграция / UI отдельно. P3 — один коммит. Для гейта с необязательным UI до apply миграции **лучше два**:

```bash
# 1. 038 + schema.md + database.ts (типы)
# 2. hooks + ProjectDetail + TaskCard
```

Не блокер, но удобнее откатить UI без SQL.

---

## Мелочи

- **Триггер `BEFORE UPDATE OF status`** — корректно; не конфликтует с `trg_aa_enforce_stage_gate` (реагирует на `stage_id`).
- **Порядок `trg_zz_*`** — AFTER `trg_sync_project_stage` среди BEFORE (алфавит) — логика спринта верна; разведка через `pg_trigger` обязательна на гейте.
- **`lane <> 'done'`** — enum `task_lane`: next/now/wait/done; для phase-доски цикл идёт next→now→done (`TaskCard` / `cycleDeliveryTaskStatus`) — условие гейта корректно.
- **Переименованные задачи** — бэкфилл пропустит; для ОМК на проде тексты должны совпасть с сидом. Зафиксировать в смоке гейта.
- **`schema.md`** — секции Delivery-P2b есть; P3 Pending 038 — добавить по образцу P2b в `docs/schema.md`.
- **Verification Labels** — адекватны; после apply Cowork → `Runtime Tested: PASS`.

---

## Прогноз закрытия scope

| Компонент | После P3 (as-is спринт) | Риск |
|-----------|-------------------------|------|
| Spawn новых delivery | `is_milestone` копируется | Низкий |
| ОМК бэкфилл | 3 milestone | Средний (если тексты расходятся) |
| ERP бэкфилл | 6 milestone | Низкий |
| Experiment | 0 milestone, free complete | Низкий |
| UI чеклист | Модалка + список open_milestones | Средний без invalidate |
| Backstop SQL | EXCEPTION на прямой UPDATE | Низкий |
| Regression deals | Не затронуты (type≠delivery) | Низкий |

---

## Рекомендуемые правки в `sprint-delivery-p3.md`

1. **РАЗВЕДКА §4** — убрать `src/components/modals/`; указать `TaskModal.tsx` / inline в `ProjectDetail`.
2. **ЗАДАЧА 1.3** — `AND tt.org_id = p.org_id` в бэкфилле.
3. **ЗАДАЧА 1.4–1.5** — org-гард как S27 (`is_org_member`); exception `delivery_gate_failed` + DETAIL JSON.
4. **ЗАДАЧА 3** — явный `invalidateQueries(['delivery-gate'])` в `useUpdateTask` onSettled при `lane`.
5. **ЗАДАЧА 4** — `parseDeliveryGateError` + alert в модалке (не toast); `onError` на mutate.
6. **ЗАДАЧА 5** — переименовать файл на `TaskCard.tsx`, условие `phaseMode && task.is_milestone`.
7. **КОММИТ** — опционально разбить на SQL / UI (как P2b).

---

## Порядок выполнения (если правки приняты)

1. **038 SQL** — колонка, патч copy, бэкфилл, RPC, триггер, grants.
2. **`database.ts`** — `tasks.is_milestone` + `DeliveryGateResult` type.
3. **`use-delivery-gate.ts`** + invalidate в `use-tasks.ts`.
4. **`parseDeliveryGateError`** в `use-projects.ts`.
5. **Модалка завершения** в `ProjectDetail.tsx` (state + RPC prefetch).
6. **Diamond-бейдж** в `TaskCard.tsx`.
7. **`docs/schema.md`** Pending 038 → Cowork apply + смоки 1–7.

---

## Заключение

Спринт delivery-P3 **готов к исполнению на ~85%**. Архитектурно это правильное завершение линии P1→P2→P3: флаг вехи наконец живёт в runtime, гейт не привязан к одной фазе «Передача на поддержку». Перед передачей в CC обязательно: исправить путь к модалкам, зафиксировать инвалидацию `delivery-gate`, унифицировать error contract с S27. После apply миграции гейтом — смок ОМК (3 вехи) и отдельно ERP (6 вех) на prod/staging.