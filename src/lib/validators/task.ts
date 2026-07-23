import { z } from 'zod';

export const taskLanes = ['now', 'next', 'wait', 'done'] as const;
export const taskPriorities = ['normal', 'important', 'critical'] as const;

export const taskFormSchema = z.object({
  text: z.string().min(1, 'Введи текст задачи'),
  lane: z.enum(taskLanes).default('now'),
  priority: z.enum(taskPriorities).default('normal'),
  project_id: z.string().nullable().default(null),
  company_id: z.string().nullable().default(null),
  contact_id: z.string().nullable().default(null),
  deadline: z.string().nullable().default(null),
  start_date: z.string().nullable().default(null),
  end_date: z.string().nullable().default(null),
  // S-TIMEBLOCK-A1: тайм-блок «когда делаю» (datetime-local в форме → ISO на сабмите).
  // Отдельная ось от deadline «сделать к» и start_date/end_date (даты Ганта).
  scheduled_start: z.string().nullable().default(null),
  scheduled_end: z.string().nullable().default(null),
  remind_min: z.number().nullable().default(null),
  assigned_to: z.string().uuid().nullable().optional(),
  // PCT-1: колонка проектной доски (для задач с project_id)
  column_id: z.string().uuid().nullable().optional(),
  // S-WBS-1: иерархия — родитель того же проекта; wbs_code (напр. «1.3.11»)
  parent_task_id: z.string().uuid().nullable().optional(),
  wbs_code: z.string().max(40).nullable().optional(),
}).refine(
  (d) => !d.start_date || !d.end_date || d.end_date >= d.start_date,
  { message: 'Конец не раньше начала', path: ['end_date'] },
).refine(
  // Зеркалит CHECK tasks_scheduled_order_chk (строго >). Значения — datetime-local
  // 'YYYY-MM-DDTHH:mm', лексикографическое сравнение эквивалентно хронологическому.
  (d) => !d.scheduled_start || !d.scheduled_end || d.scheduled_end > d.scheduled_start,
  { message: 'Конец позже начала', path: ['scheduled_end'] },
);

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const LANE_CONFIG = {
  now:  { label: 'Сейчас',    color: 'text-accent',  bg: 'bg-accent-l',  dotColor: 'bg-accent' },
  next: { label: 'Следующие', color: 'text-blue',    bg: 'bg-blue-l',    dotColor: 'bg-blue' },
  wait: { label: 'Отложено',  color: 'text-yellow',  bg: 'bg-yellow-l',  dotColor: 'bg-yellow' },
  done: { label: 'Выполнено', color: 'text-green',   bg: 'bg-green-l',   dotColor: 'bg-green' },
} as const;

export const PRIORITY_CONFIG = {
  normal:    { label: 'Обычный',   color: '', badge: '' },
  important: { label: 'Важный',    color: 'text-yellow', badge: 'border-l-2 border-yellow' },
  critical:  { label: 'Критичный', color: 'text-red',    badge: 'border-l-2 border-red' },
} as const;
