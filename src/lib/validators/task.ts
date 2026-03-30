import { z } from 'zod';

export const taskLanes = ['now', 'next', 'wait', 'done'] as const;
export const taskPriorities = ['normal', 'important', 'critical'] as const;

export const taskFormSchema = z.object({
  text: z.string().min(1, 'Введи текст задачи'),
  lane: z.enum(taskLanes).default('now'),
  priority: z.enum(taskPriorities).default('normal'),
  project_id: z.string().nullable().default(null),
  deadline: z.string().nullable().default(null),
  remind_min: z.number().nullable().default(null),
});

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
