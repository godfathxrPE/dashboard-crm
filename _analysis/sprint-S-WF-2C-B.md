# Claude Code Prompt — S-WF-2C-B: task_overdue в UI + NotificationBell route

> Финал Workflow-эпика D1. Backend task_overdue (051) в проде: pg_cron daily → notify исполнителю / create_activity. 2B-редактор поддерживает 3 триггера × 4 действия, но **task_overdue туда не выведен** и **NotificationBell роутит task-уведомления в /deals (404)**. 2C-B закрывает оба. **Чистый /code, БД не трогаем.** Стек: Next 15 + TS strict + Tailwind (6 тем) + RHF + Zod.
>
> **Разведка выполнена (Cowork), реальные факты кода (58c2515):**
> - `types/database.ts:236` — `AutomationTriggerType = 'stage_entered'|'status_changed'|'field_changed'` (task_overdue НЕТ); `AutomationTriggerConfig` union L253.
> - `validators/automation-rule.ts:20` — trigger_type enum (3), superRefine по типу.
> - `constants/automation.ts` — `AUTOMATION_TRIGGER_OPTIONS`(3)/`_LABEL`(derived), `AUTOMATION_ACTION_OPTIONS`(4), `AUTOMATION_FIELD_OPTIONS`(проектные поля), `AUTOMATION_STATUS_OPTIONS`, `AUTOMATION_OP_OPTIONS`, `AUTOMATION_NULLARY_OPS`.
> - `RuleEditorModal.tsx` — `triggerType=watch('trigger_type')`(175); trigger-секции по типу (269/308/319); action select AUTOMATION_ACTION_OPTIONS(366); action-секции (372/416/440/466); toInput trigger_config: `stage_entered → {pipeline,stage}; status_changed → t_status_to?{to}:{}; else → {field}`.
> - `ConditionRow.tsx` — field-select **хардкодит `AUTOMATION_FIELD_OPTIONS`** (проектные поля).
> - `AutomationsSection.tsx` — `describeRule` switch по trigger(3)/action(4); badge/chip через `AUTOMATION_TRIGGER_LABEL`.
> - `NotificationBell.tsx:21` — `project_assigned|deal_won|automation → /deals/${entity_id}` (task-уведомление уходит в 404).
>
> **Скоуп task_overdue (051):** действия только **notify / create_activity**; notify → исполнителю (assignee) — recipient в config движок игнорирует; условия — на **полях задачи**; напоминает **один раз** на задачу.

## ЗАДАЧА 1 — types (`types/database.ts`)
```ts
export type AutomationTriggerType = 'stage_entered' | 'status_changed' | 'field_changed' | 'task_overdue';
export interface TaskOverdueConfig {}   // пустой — триггер без конфигурации
// в union AutomationTriggerConfig добавить | TaskOverdueConfig  (или просто допускать {})
```

## ЗАДАЧА 2 — validator (`validators/automation-rule.ts`)
- L20: `trigger_type: z.enum(['stage_entered','status_changed','field_changed','task_overdue'])`.
- superRefine: **ограничить действия для task_overdue** (движок 051 умеет только notify/create_activity):
```ts
if (v.trigger_type === 'task_overdue' && !['notify','create_activity'].includes(v.action_type))
  ctx.addIssue({ code:'custom', path:['action_type'], message:'Для просрочки — уведомление или заметка' });
```
(trigger-полей task_overdue не требует — существующие require-проверки его не трогают.)

## ЗАДАЧА 3 — constants (`constants/automation.ts`)
- `AUTOMATION_TRIGGER_OPTIONS` += `{ value: 'task_overdue', label: 'Просрочка задачи' }` (LABEL derived — подхватится авто).
- Новый курируемый набор **полей задачи** для условий task_overdue:
```ts
export const AUTOMATION_TASK_FIELD_OPTIONS: { value: string; label: string; numeric?: boolean }[] = [
  { value: 'priority', label: 'Приоритет' },   // normal|important|critical
  { value: 'lane', label: 'Колонка' },         // now|next|wait|done
  { value: 'text', label: 'Текст задачи' },
];
```

## ЗАДАЧА 4 — ConditionRow (`ConditionRow.tsx`) — принять field-опции пропом
Сейчас хардкодит `AUTOMATION_FIELD_OPTIONS`. Сделать trigger-aware:
```ts
export function ConditionRow({ index, onRemove, fieldOptions }: {
  index: number; onRemove: () => void;
  fieldOptions: { value: string; label: string }[];
}) { … {fieldOptions.map(...)} … }
```
Дефолт не нужен — модалка всегда прокинет (проектные или task-поля).

## ЗАДАЧА 5 — RuleEditorModal (`RuleEditorModal.tsx`)
- **fieldOptions по триггеру:** `const fieldOptions = triggerType === 'task_overdue' ? AUTOMATION_TASK_FIELD_OPTIONS : AUTOMATION_FIELD_OPTIONS;` — прокинуть в `<ConditionRow fieldOptions={fieldOptions} />` и в `append({ field: fieldOptions[0].value, op:'eq', value:'' })`.
- **TriggerSection:** ветка `triggerType === 'task_overdue'` — БЕЗ полей конфигурации, только подсказка:
  «Срабатывает, когда дедлайн задачи прошёл, а она не выполнена. Проверяется ежедневно, напоминаем **один раз** на задачу.» (W6)
- **ActionSection:** опции действия для task_overdue — только notify/create_activity:
  `const actionOptions = triggerType === 'task_overdue' ? AUTOMATION_ACTION_OPTIONS.filter(o => ['notify','create_activity'].includes(o.value)) : AUTOMATION_ACTION_OPTIONS;`
  При переключении триггера на task_overdue, если текущий action ∈ {create_task,set_field} → `setValue('action_type','notify')` (useEffect на triggerType).
  Для **notify при task_overdue — скрыть select получателя** (recipient=assignee подразумевается движком), оставить только текст. Подпись: «Уведомление уйдёт исполнителю задачи». `{task}` вместо `{deal}` в placeholder текста для task_overdue.
- **toInput trigger_config** — добавить ветку task_overdue → `{}` (сейчас `else` поймал бы его как `{field:''}`):
```ts
if (v.trigger_type === 'stage_entered') { … }
else if (v.trigger_type === 'status_changed') { trigger_config = v.t_status_to ? { to: v.t_status_to } : {}; }
else if (v.trigger_type === 'field_changed') { trigger_config = { field: v.t_field ?? '' }; }
else { trigger_config = {}; }   // task_overdue
```
- **fromRule:** task_overdue — trigger-поля не заполняем (t_* пустые).

## ЗАДАЧА 6 — describeRule (`AutomationsSection.tsx`)
Добавить `case 'task_overdue':` в trigger-switch → «Просрочка задачи». Action-часть переиспользуется; для task_overdue+notify формулировка «уведомить исполнителя» (не «владельца сделки»). badge/chip подхватят task_overdue из `AUTOMATION_TRIGGER_LABEL` авто.

## ЗАДАЧА 7 — NotificationBell (`NotificationBell.tsx`) — W1, БЛОКЕР
`entityRoute` (L18-22) — ветка по `entity_type` для automation:
```ts
if (n.type === 'automation' && n.entity_type === 'tasks') return '/tasks';
if (n.type === 'project_assigned' || n.type === 'deal_won' || n.type === 'automation')
  return `/deals/${n.entity_id}`;
return '/tasks';
```
Убедись, что тип `Notification` содержит `entity_type` (из notifications). `payloadTitle` для automation уже читает `payload.text` — ок и для task-уведомления.

## ЗАДАЧА 8 — docs/schema дельта 051 (отдельный docs-коммит)
`docs/schema.md` + skill `references/schema.md`: 051 (task_overdue в trigger CHECK; `automation_runs.project_id` nullable + partial-unique `automation_runs_rule_key_null_project_uniq`; `run_overdue_automations()` DEFINER; pg_cron job `wf-overdue-daily`; `idx_tasks_overdue`; migration history 051, applied). (050 уже покрыт S-DOCS-SYNC.)

## ГЕЙТЫ CC
```bash
npx tsc --noEmit && npm run build   # без any; build при живом dev → изолированный distDir
git diff --stat                     # types/database, validators/automation-rule, constants/automation, ConditionRow, RuleEditorModal, AutomationsSection, NotificationBell (+docs/schema.md отдельным коммитом)
```
Локально: Settings→Автоматизации → «+ Правило» → триггер «Просрочка задачи» → секция без конфигурации + подсказка «один раз»; действия только Уведомить/Заметка; notify без селекта получателя; условие на поле задачи (Приоритет); сохранить → в списке «Просрочка задачи → уведомить исполнителя»; edit подтянул; консоль чистая.

## КОММИТ (два)
```bash
git add src/types/database.ts src/lib/validators/automation-rule.ts src/lib/constants/automation.ts \
        src/components/settings/automation/ConditionRow.tsx src/components/settings/automation/RuleEditorModal.tsx \
        src/components/settings/AutomationsSection.tsx src/components/layout/NotificationBell.tsx
git commit -m "feat(workflow): S-WF-2C-B — task_overdue в UI + NotificationBell route по entity_type"
git add docs/schema.md
git commit -m "docs(schema): дельта 051 task_overdue (pg_cron + run_overdue_automations)"
```
(skill `~/.claude/skills/...` — вне репо, правится на месте.)

## ЖЁСТКО НЕ ТРОГАТЬ
- БД/миграции (051 в проде).
- Whitelist действий task_overdue = ровно движок 051 (notify/create_activity) — create_task/set_field не давать.
- Не менять маппинг/валидацию остальных 3 триггеров.
- Не хардкодить цвета; переиспользовать классы полей секции.

## ПОСЛЕ ТЕБЯ — Cowork
Chrome-смок: создать task_overdue→notify через UI → проверить сохранённый config (`trigger_config={}`, action notify), клик по task-уведомлению ведёт на /tasks (не 404), edit/toggle/delete, 6 тем.

## VERIFICATION
```
Type Safety:            NOT_VERIFIED (union+Zod; подтвердить tsc, без any)
Backward Compatibility: WARNING (3 старых триггера/маппинг не тронуты — проверить edit legacy-правил)
NotificationBell route:  NOT_VERIFIED (W1 — смок клика по task-уведомлению)
Design tokens:          PASS (CSS-var, примитивы проекта)
```
