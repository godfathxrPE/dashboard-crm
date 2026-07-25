# Claude Code Prompt — S-WF-2B: Workflow UI (Settings → Правила)

> Второй sub-спринт S-WF-2. Движок (2A, миграция 050 applied) поддерживает **3 триггера × 4 действия + conditions**, но текущий UI (`AutomationsSection`) умеет только `stage_entered → create_task` (inline-форма на useState). 2B = редактор под весь движок. **Чистый /code, БД не трогаем.** Стек: Next 15 + TS strict + Tailwind (6 CSS-var-тем) + RHF + Zod.
>
> **Дизайн-принципы (design-system-architect, адаптировано под non-shadcn проект):** переиспользуй примитивы проекта (`shared/Modal`, `Combobox`, `ui/Button`, `ui/Input`, native `<select>`), не плоди новые; редактор — **configuration-форма** с условными секциями (не compound-слоты); токены только CSS-var (никакого хардкода — 6 тем); a11y — `<label>` на полях, focus-visible, Modal даёт Esc/overlay-close + `aria-modal` (focus-trap в Modal НЕТ — не обещать). Форма — **RHF + Zod + useFieldArray** (конвенция проекта; forms-architect — комплементарный референс).
>
> **ВНИМАНИЕ — примитивы (из исходника, не угадывать):**
> - `AssigneeSelect` возвращает **uuid профиля** (useTeamMembers) — **НЕ использовать** для automation-assignee/recipient. Для `deal_owner`/`deal_creator` — native `<select>` + `AUTOMATION_ASSIGNEE_OPTIONS` (как в текущей `AutomationsSection`).
> - `Modal` props: `title, description?, onClose, isDirty?, footer?, children, maxWidth?` — **нет `open`** (монтируй условно: `{isOpen && <RuleEditorModal .../>}`). Форма живёт в `children` как `<form id="rule-form">`, кнопки — в `footer` с `type="submit" form="rule-form"`. `isDirty={formState.isDirty}` (guard от случайного закрытия). `maxWidth="max-w-xl"` (3 секции).
>
> **Красная линия (roadmap):** без visual canvas. UI ровно под возможности движка — 3 триггера, 4 действия, 9 ops conditions. `task_overdue` НЕ добавляем (S-WF-2C).

## РАЗВЕДКА (подтвердить реальные API примитивов — не угадывать)
```bash
sed -n '1,60p' src/components/shared/Modal.tsx          # API уже дан в шапке — свериться (isDirty/footer/maxWidth, нет open)
grep -n "export function TaskModal\|<Modal\|form=\|isDirty" src/components/tasks/TaskModal.tsx  # эталон использования Modal (form id + footer submit + isDirty)
grep -n "export function Combobox\|ComboboxOption\|value" src/components/shared/Combobox.tsx     # value: string|null
grep -n "export function Button\|primary\|secondary\|ghost\|md\|sm" src/components/ui/Button.tsx  # variant primary|secondary|ghost, size md|sm
sed -n '/Automation/,/^}/p' src/types/database.ts | head -80   # текущие Automation* типы (v1)
cat src/lib/constants/automation.ts                     # ASSIGNEE/LANE/PRIORITY options+labels — ПЕРЕИСПОЛЬЗОВАТЬ
grep -n "current_org_id\|usePipelines\|usePipelineStages\|useOrgRole\|useTeamMembers" src/lib/hooks/*.ts | head
```
Классы полей бери из существующей `AutomationsSection` (`rounded-md border border-input bg-surface px-2 py-1.5 text-[12px] text-text-dim`). Использование `Modal` — по образцу `TaskModal` (условный монтаж + `<form id>` + footer submit + `isDirty`).

---

## ЗАДАЧА 1 — Типы (`src/types/database.ts`, аддитивно)

Расширь automation-типы под движок 050. Держи discriminated-осмысленность через отдельные config-типы:
```ts
// Триггеры
export type AutomationTriggerType = 'stage_entered' | 'status_changed' | 'field_changed';
export interface StageEnteredConfig  { pipeline_id: string; stage_id: string }
export interface StatusChangedConfig { to?: string }          // опц. целевой статус
export interface FieldChangedConfig  { field: string }        // имя поля projects
export type AutomationTriggerConfig = StageEnteredConfig | StatusChangedConfig | FieldChangedConfig;

// Условия (AND-предикаты; совпадает с wf_eval_conditions 050)
export type AutomationConditionOp =
  | 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'is_null' | 'not_null';
export interface AutomationCondition { field: string; op: AutomationConditionOp; value: string }

// Действия
export type AutomationActionType = 'create_task' | 'notify' | 'create_activity' | 'set_field';
export interface AutomationCreateTaskConfig { task_text: string; assignee: AutomationAssignee; lane: 'now'; priority: TaskPriority; due_in_days: number }
export interface AutomationNotifyConfig     { recipient: AutomationAssignee; text: string }   // recipient: deal_owner|deal_creator
export interface AutomationActivityConfig   { title: string; description?: string }
export interface AutomationSetFieldConfig   { field: AutomationSetFieldName; value: string }
export type AutomationSetFieldName = 'next_step' | 'pinned_note' | 'next_action_date' | 'probability';  // whitelist = SQL 050
export type AutomationActionConfig = AutomationCreateTaskConfig | AutomationNotifyConfig | AutomationActivityConfig | AutomationSetFieldConfig;

// AutomationRule — расширь union полей + добавь conditions
export interface AutomationRule {
  id: string; org_id: string; name: string;
  trigger_type: AutomationTriggerType; trigger_config: AutomationTriggerConfig;
  action_type: AutomationActionType;   action_config: AutomationActionConfig;
  conditions: AutomationCondition[];   // 050, DEFAULT '[]'
  is_active: boolean; created_at: string;
}
```
`AutomationAssignee` (`deal_owner`/`deal_creator`) — оставь как есть. Внешний payload из Supabase типизируй через `unknown` + приведение (как сейчас в хуке).

## ЗАДАЧА 2 — Хук (`src/lib/hooks/use-automation-rules.ts`)
`AutomationRuleInput` расширь под новые union + `conditions`:
```ts
export interface AutomationRuleInput {
  name: string;
  trigger_type: AutomationTriggerType;  trigger_config: AutomationTriggerConfig;
  action_type: AutomationActionType;    action_config: AutomationActionConfig;
  conditions?: AutomationCondition[];   // дефолт [] на стороне БД
  is_active?: boolean;
}
```
CRUD-логику (create с явным `current_org_id`, update, delete, invalidate) НЕ меняем — она generic. `useUpdateAutomationRule` уже принимает `Partial<...> & {id}` — годится и для edit из редактора.

## ЗАДАЧА 3 — NotificationBell (`src/components/layout/NotificationBell.tsx`)
Тип `automation` (действие notify пишет его):
- `NotificationType` (в database.ts) += `'automation'`.
- `TYPE_LABEL` += `automation: 'Автоматизация'`.
- `TypeIcon`: `type === 'automation'` → иконка `Zap` (lucide, уже используется в AutomationsSection).
- `entityRoute`: `automation` (entity_type='projects') → `/deals/${n.entity_id}` (как project_assigned; серверный бэкстоп deals→projects уже есть).
- `payloadTitle`: для `automation` показывай `payload.text || payload.title || TYPE_LABEL`.

## ЗАДАЧА 4 — Редактор правила (`src/components/settings/automation/RuleEditorModal.tsx`)

**Anatomy (configuration-форма, RHF+Zod):** один `<Modal>` с формой из 3 секций, условные поля через `watch`.

### Zod-схема (`src/lib/validators/automation-rule.ts`)
Плоские form-values + `superRefine` (RHF-дружелюбнее вложенных discriminated union):
```ts
const opEnum = z.enum(['eq','neq','gt','lt','gte','lte','contains','is_null','not_null']);
export const ruleSchema = z.object({
  name: z.string().min(1, 'Название'),
  trigger_type: z.enum(['stage_entered','status_changed','field_changed']),
  // trigger config — плоские поля, валидируем по типу в superRefine
  t_pipeline_id: z.string().optional(), t_stage_id: z.string().optional(),
  t_status_to: z.string().optional(), t_field: z.string().optional(),
  conditions: z.array(z.object({ field: z.string().min(1), op: opEnum, value: z.string() })).default([]),
  action_type: z.enum(['create_task','notify','create_activity','set_field']),
  // action config — плоские
  a_task_text: z.string().optional(), a_assignee: z.enum(['deal_owner','deal_creator']).optional(),
  a_priority: z.enum(['normal','important','critical']).optional(), a_due: z.coerce.number().min(0).optional(),
  a_notify_text: z.string().optional(),
  a_title: z.string().optional(), a_description: z.string().optional(),
  a_set_field: z.enum(['next_step','pinned_note','next_action_date','probability']).optional(),
  a_set_value: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.trigger_type === 'stage_entered' && !v.t_stage_id) ctx.addIssue({ code:'custom', path:['t_stage_id'], message:'Выберите стадию' });
  if (v.trigger_type === 'field_changed' && !v.t_field)   ctx.addIssue({ code:'custom', path:['t_field'], message:'Выберите поле' });
  if (v.action_type === 'create_task' && !v.a_task_text)  ctx.addIssue({ code:'custom', path:['a_task_text'], message:'Текст задачи' });
  if (v.action_type === 'notify' && !v.a_notify_text)     ctx.addIssue({ code:'custom', path:['a_notify_text'], message:'Текст уведомления' });
  if (v.action_type === 'create_activity' && !v.a_title)  ctx.addIssue({ code:'custom', path:['a_title'], message:'Заголовок' });
  if (v.action_type === 'set_field' && (!v.a_set_field || v.a_set_value===undefined)) ctx.addIssue({ code:'custom', path:['a_set_value'], message:'Поле и значение' });
});
export type RuleFormValues = z.infer<typeof ruleSchema>;
```
При submit — маппинг плоских values → `AutomationRuleInput` (собери `trigger_config`/`action_config` по type). При edit — обратный маппинг rule → form defaults.

### Секции (условный рендер по `watch`)
- **TriggerSection:** select `trigger_type`. `stage_entered` → pipeline `Combobox` + stage `Combobox` (как в текущей секции; **сохраняй `pipeline_id` в config** — SQL матчит по stage_id, но UI/future-фильтр использует pipeline). `status_changed` → select статуса (`open/won/lost/on_hold/completed`) в `t_status_to`, **первая опция «Любой статус» = пустое** (маппинг — см. B2 ниже). `field_changed` → select поля из **курируемого `AUTOMATION_FIELD_OPTIONS`** (Задача 6).
- **ConditionsSection:** `useFieldArray({name:'conditions'})`. Каждая строка — `<ConditionRow>`: field (select из того же `AUTOMATION_FIELD_OPTIONS`), op (select 9 ops), value (input; **скрыть для `is_null`/`not_null`**). Кнопки «+ условие» / удалить. Пусто = всегда. Подпись: «Все условия должны выполняться (И)». Подсказка: `gt/lt/gte/lte` — для числовых полей.
- **ActionSection:** select `action_type`.
  - `create_task` → task_text + **native `<select>` + `AUTOMATION_ASSIGNEE_OPTIONS`** (НЕ AssigneeSelect) + priority (`AUTOMATION_PRIORITY_OPTIONS`) + due. `lane` в форме нет — на submit всегда `'now'` (как текущий AddForm).
  - `notify` → recipient (**тот же `<select>` + `AUTOMATION_ASSIGNEE_OPTIONS`**) + text.
  - `create_activity` → title + description.
  - `set_field` → select whitelist-поля (`next_step/pinned_note/next_action_date/probability`) + value (тип input по полю: date/number/text).
  Плейсхолдер `{deal}` — подпись как в текущей секции.

### Маппинг form ↔ AutomationRuleInput (явно — чтобы не было silent-fail)
**submit (form → input):**
- `trigger_config`: stage_entered → `{pipeline_id, stage_id}`; **status_changed → `t_status_to` пусто ⇒ `{}` (НЕ `{to:''}` — SQL `->>'to' IS NULL` иначе false → правило молчит, B2)**, иначе `{to}`; field_changed → `{field: t_field}`.
- `action_config`: create_task → `{task_text, assignee: a_assignee ?? 'deal_owner', lane:'now', priority: a_priority ?? 'normal', due_in_days: a_due ?? 3}`; notify → `{recipient: a_assignee ?? 'deal_owner', text: a_notify_text}`; create_activity → `{title: a_title, description: a_description || undefined}`; set_field → `{field: a_set_field, value: a_set_value ?? ''}`.
- `conditions`: `conditions ?? []`; для `is_null`/`not_null` — `value: ''`.
**edit (rule → form defaults):** обратный маппинг; `status_changed` без `to` (или null) ⇒ пустой select; conditions ⇒ field array.

### ConditionRow (`src/components/settings/automation/ConditionRow.tsx`)
Выдели (правило DS «3+ повторов» — строки условий повторяются): props `{index, onRemove}` + RHF-регистрация по `conditions.${index}.field|op|value`. Токены — CSS-var-классы. `value`-input скрыт при op ∈ {is_null, not_null}.

## ЗАДАЧА 5 — Список правил (`AutomationsSection.tsx` rebuild)
- **`describeRule` обобщи** на все 3 триггера × 4 действия — через `switch (rule.trigger_type)` / `switch (rule.action_type)` (type guards, **без `any`**; `rule.conditions ?? []`; stage-имя только при `stage_entered` + `stage_id`). Примеры: «Стадия „X" → задача „…"», «Статус → won → уведомить владельца», «Изменение budget (если budget ≥ 1 000 000) → создать заметку». Trigger-часть + action-часть + «если …» при непустых conditions.
- Список — **один org-wide список** (не dual-режим): текущая фильтрация по `trigger_config.pipeline_id` валидна ТОЛЬКО для stage_entered и «теряет» status/field-правила → **убрать pipeline-фильтр как единственный**. Плоский список всех правил org с **бейджем `trigger_type`**; опционально chip-фильтр по типу поверх полного списка (не вместо). Сортировка — по created_at или trigger_type.
- Строка правила: описание + бейдж триггера + toggle `is_active` (как сейчас) + **кнопка «Изменить»** (открывает `RuleEditorModal` с загруженным правилом) + delete. Кнопка «+ Правило» открывает пустой редактор.
- Убери inline `<AddForm>` (заменён редактором в модалке). Owner/admin-гейт (`useOrgRole`) сохрани.

## ЗАДАЧА 6 — Курируемые поля (`src/lib/constants/automation.ts`, дополнить)
Для `field_changed` и `condition.field` — курируемый список колонок `projects` (SQL принимает любую через dynamic `->>`, но UI не должен давать выбрать мусор/инвариантные поля):
```ts
export const AUTOMATION_FIELD_OPTIONS: { value: string; label: string; numeric?: boolean }[] = [
  { value: 'budget', label: 'Бюджет', numeric: true },
  { value: 'probability', label: 'Вероятность, %', numeric: true },
  { value: 'next_step', label: 'Следующий шаг' },
  { value: 'pinned_note', label: 'Закреплённая заметка' },
  { value: 'next_action_date', label: 'Дата следующего действия' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'direction', label: 'Направление' },
];
// НЕ включать: org_id / type / stage_id / status (status — отдельный триггер status_changed).
```
Обнови комментарий шапки файла с «Sprint 29 / 029» на «S-WF-2 / 050» (whitelist assignee/lane/priority — прежний). Опц. добавь labels для trigger_type / action_type / condition ops (для describeRule и select'ов).

---

## ГЕЙТЫ CC
```bash
npx tsc --noEmit && npm run build   # build при живом dev → изолированный distDir (как S-CRIT-PATH)
git diff --stat                     # database.ts, use-automation-rules.ts, NotificationBell.tsx, validators/automation-rule.ts, settings/automation/*, AutomationsSection.tsx
```
Без `any` (union+unknown+narrowing). Локально: Settings → Автоматизации → создать правило каждого типа триггера/действия, добавить условие, сохранить, изменить, toggle, удалить; консоль чистая.

## КОММИТ
```bash
git add src/types/database.ts src/lib/hooks/use-automation-rules.ts src/components/layout/NotificationBell.tsx \
        src/lib/constants/automation.ts src/lib/validators/automation-rule.ts \
        src/components/settings/automation/ src/components/settings/AutomationsSection.tsx
git commit -m "feat(workflow): S-WF-2B — UI редактора правил (3 триггера × 4 действия + conditions)"
```

## ЖЁСТКО НЕ ТРОГАТЬ
- БД/миграции (2A уже в проде).
- Whitelist set_field-полей в UI = ровно SQL 050 (next_step/pinned_note/next_action_date/probability) — не шире.
- `task_overdue` в UI не добавлять (S-WF-2C).
- Не плодить новые ui-примитивы — переиспользуй `shared/Modal`/`Combobox`/`AssigneeSelect`/`ui/Button`.
- Не хардкодить цвета — CSS-var-классы (6 тем).
- Не трогать CRUD-логику хука (generic).

## ПОСЛЕ ТЕБЯ — Cowork
Chrome-смок: создать правило status_changed→notify и field_changed→create_activity с условием через UI → сменить статус/поле сделки → уведомление/заметка появились; edit/toggle/delete работают; 6 тем не ломают редактор; консоль чистая.

## VERIFICATION
```
Type Safety:            NOT_VERIFIED (union+Zod; подтвердить tsc, без any)
Backward Compatibility: WARNING (старые stage_entered/create_task правила должны рендериться в новом describeRule + edit)
A11y:                   NOT_VERIFIED (label на полях, focus-visible, Modal Esc/overlay/aria-modal — focus-trap в Modal НЕТ)
Design tokens:          PASS (CSS-var-классы, примитивы проекта; без хардкода/новых примитивов)
```
