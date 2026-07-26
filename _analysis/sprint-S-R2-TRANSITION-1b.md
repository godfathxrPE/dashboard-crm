# S-R2-TRANSITION-1b — модалка перехода стадии (Blueprint v2 UX)

**Ветка:** `feat/r2-transition-modal` от `main` (строго после мержа
`feat/r2-transition-core`). **Миграций нет** — вся серверная часть в 078.
Один коммит.

Флагманский эпик R2-P0 (A1 в продуктовом роадмапе, §3.1 в архитектуре). Гейты в БД у нас
сильнее рынка, но пользователь видит только тост об отказе; здесь появляется **момент
решения** с During-полями — паттерн Zoho Blueprint / Accelo Progressions.

**Трудоёмкость: ~10–13 ч. Риск средний** (UI на горячем пути, но сервер не трогаем).

---

## Предусловия (проверить, не предполагать)

```bash
git branch --show-current                        # feat/r2-transition-modal
git status --short
git --no-pager log --oneline -3                  # 078 в истории, core влит

grep -n "export function commitTransition\|export type TransitionInput" src/lib/domain/stage-transition.ts
grep -n "check_stage_requirements_row" supabase/migrations/078_*.sql
ls src/lib/domain/wf-conditions.ts tests/unit/wf-conditions.test.ts
grep -rn "stage_id:" src/components --include=*.tsx | grep -v "read-only"   # прямых записей быть не должно
grep -n "useStageGate" src/lib/hooks/use-stage-gate.ts
grep -n "lossReasons\|wonReasons" src/lib/validators/project.ts
sed -n '1,40p' src/components/shared/Modal.tsx
grep -n "useAutomationRules" src/lib/hooks/use-automation-rules.ts
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия:**

1. `stage-transition.ts` / `wf-conditions.ts` отсутствуют → спринт 1a не влит, остановиться.
2. Миграция 078 **не применена в проде** (проверить через MCP `list_migrations`) → модалка с
   During-полями будет падать на гейте; остановиться и сказать.
3. Найден компонент, пишущий `stage_id` напрямую → 1a неполон, доложить.

---

## Что строим

### 1. `previewTransition` в существующем сервисе

`src/lib/domain/stage-transition.ts` дополняется (файл создан в 1a):

```ts
export type TransitionPreview = {
  unmet: UnmetRequirement[];            // из useStageGate
  requiredDuringFields: GateFieldColumn[]; // unmet type='field' → колонки для формы
  targetIsWon: boolean;
  targetIsLost: boolean;
  automationPreview: { ruleId: string; name: string; actionSummary: string }[];
};
```

- `unmet` — существующий `useStageGate(projectId, toStageId)`, ничего нового.
- `requiredDuringFields` — из unmet отбираются `type='field'` и мапятся на колонки формы.
  **Поддерживаемый список берётся из гейта, а не выдумывается:** `budget`, `company_id`,
  `contact_id`, `next_step`, `deadline`, `probability`, `direction`, `next_action_date`.
  Незнакомая колонка (unmet с суффиксом «неподдерживаемая колонка») рендерится как
  **нередактируемая строка чек-листа с хинтом** — не как пустое поле, которое пользователь
  не сможет закрыть.
- `automationPreview` — клиентский матч по `useAutomationRules()`:
  `trigger_type === 'stage_entered' && trigger_config.stage_id === toStageId && is_active`
  и `evalConditions(rule.conditions, snapshotWithPatches)` из `wf-conditions.ts` (порт 050).
  **Никакого dry-run RPC.** Ограничение записать прямо в UI-подписи: «сработают, если условия
  выполнятся на момент сохранения» — превью может расходиться с реальностью.

### 2. Компоненты

| Компонент | Ответственность |
|-----------|-----------------|
| `components/projects/StageTransitionModal.tsx` | Оболочка на существующем `shared/Modal.tsx`: заголовок «Стадия A → B», список готовности, During-поля, причина won/lost, комментарий, кнопка подтверждения |
| `components/projects/StageTransitionFields.tsx` | Рендерит **только незакрытые** field-требования + causa won/lost, когда цель `is_won`/`is_lost`. Реюз существующих контролов (`Combobox`, `AssigneeSelect`, инпуты бюджета через `parseBudgetInput`) |
| `components/projects/AutomationPreviewList.tsx` | Read-only список правил: имя + краткое действие |

Формы — RHF + Zod (`src/lib/validators/stage-transition.ts`), как везде в проекте.
На date-инпутах обязателен `setValueAs: v => v === '' ? null : v` (`''::date` невалиден в
Postgres — известные грабли).

Готовность отображать в стиле существующего `StageReadiness` (он остаётся на детальной
странице как диагностика; модалка — момент решения, дублирования логики нет: оба берут
`useStageGate`).

### 3. Won / Lost

- Цель `is_won` → обязательный `won_reason` (значения — `wonReasons` из
  `validators/project.ts`, не хардкод), `won_detail` опционально.
- Цель `is_lost` → обязательный `loss_reason` (`lossReasons`), `loss_detail` опционально.
- **`status` в модалке не писать.** Он дерайвится существующими триггерами из флагов стадии
  (это причина, по которой 045 сделан как plain `AFTER UPDATE`, а не `AFTER UPDATE OF status`).
  Двойная запись сломает инвариант.
- Двухшаговые кнопки «Выиграна»/«Проиграна» в `ProjectDetail` заменяются вызовом модалки —
  причина собирается там же, разрозненный UX уходит (A5 роадмапа).

### 4. Единая точка открытия

Один zustand-стор `useTransitionStore` (`{ project, toStageId, open() , close() }`) —
иначе чеврон и доска откроют две модалки одновременно (риск из §3.1.9). Все пути из таблицы
спринта 1a вызывают `open()`, а не `commitTransition` напрямую.

Исключения, где модалка **не** нужна (записать в код комментарием, чтобы не «дочинили»):
- delivery/internal проекты (`DeliveryPipelineBoard`, `StageBoard`) — фазы, не воронка;
- автоматизации (`set_field` для `stage_id` запрещён инвариантом I7);
- «Вернуть в работу» — модалка **нужна** (это тоже переход + сброс причин), но с
  предзаполненным сбросом `loss_*`/`won_*` и без требования причины.

### 5. Гонка и повторная проверка

- Перед `commitTransition` — **refetch unmet** (`useStageGate.refetch()`): между открытием и
  подтверждением другой пользователь мог изменить сделку. БД остаётся SoT; если после
  refetch остались незакрытые требования, показать их в модалке и не отправлять.
- Кнопку подтверждения дизейблить на время мутации (двойной клик = два UPDATE = два прохода
  автоматизаций).
- Если `commitTransition` всё равно упал на гейте — `parseStageGateError` и показ unmet
  **внутри модалки**, а не тостом (это и есть acceptance-критерий P0).

### 6. Комментарий и метрика

Комментарий пишется в `activity_log` через существующий `logActivity` **тем же
пользовательским действием**. Это же событие — знаменатель метрики «% переходов через
модалку» (контракт описан в 1a): доля = события модалки / строки `stage_transitions`.
Событие писать **всегда**, даже с пустым комментарием, иначе метрика недосчитает.

---

## Чего в спринте нет

- Playbook-задач при переходе (`createTasksFromPlaybook`) — P1, `stage_playbooks` ещё нет.
  Место под шаг предусмотреть, но не рендерить.
- RPC `transition_project_stage` — P4.
- Подсказок стадии от AI — запрещено до конца P2.
- Approval-требований — P3 go/no-go.

---

## VERIFY / коммит

```bash
npx tsc --noEmit                                    # 0
npx eslint src/components/projects src/lib/domain src/lib/validators   # 0 (scoped)
npx vitest run tests/unit                           # включая wf-conditions
npm test
grep -rn ": any" src/components/projects/StageTransition*.tsx src/lib/domain   # пусто
grep -rn "status:" src/components/projects/StageTransitionModal.tsx            # пусто (status не пишем)
git --no-pager diff --stat
```

Смоук — матрицей, темы `aura` + `fuji`:

1. Драг карточки на стадию с незакрытым `budget` → модалка показывает требование, поле
   бюджета в форме, подтверждение **проходит** одним запросом.
2. Тот же переход с пустым бюджетом → кнопка не даёт отправить (клиентская Zod), а при
   обходе — unmet показан внутри модалки.
3. Переход на `is_won` без причины → блокируется; с причиной → сделка выиграна, `status`
   выставлен триггером (проверить в БД, что модалка его не писала).
4. `is_lost` — то же.
5. «Вернуть в работу» из проигранных — причины сброшены, стадия первая.
6. Чеврон/полоса и доска: открывается **одна** модалка, не две.
7. Автоматизация `stage_entered` на целевой стадии: превью показало правило → после
   подтверждения оно сработало (notification/задача создались).
8. `file`-требование: модалка показывает его как чек-лист (файл в модалке не грузим).
9. Двойной клик по «Подтвердить» → один UPDATE (проверить `stage_transitions`: одна строка).

Коммит один:

```
feat(r2): модалка перехода стадии — гейты, During-поля, причины won/lost, превью автоматизаций
```

**Не пушить.** В отчёте: результат каждого из 9 пунктов смоука, сколько строк добавилось в
`stage_transitions` за смоук и совпало ли это с числом событий модалки в `activity_log`
(первая проверка метрики).
