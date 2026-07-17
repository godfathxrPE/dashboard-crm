import type { Database } from './database';
import type { ColumnCategory } from './database';
// `org_id` уже ослаблен до optional в ./database (RelaxOrgId) — здесь прямые ссылки.

// Удобные алиасы для Row-типов из Supabase
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Company = Database['public']['Tables']['companies']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'] & {
  project?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
} & {
  // S-WBS-1 (миграция 052 — на гейте Cowork): иерархия задач.
  // WARNING: `supabase.gen.ts` не несёт эти колонки до `npx supabase gen types`
  // (после apply). Расширяем intersection руками; снять overrides после regen.
  parent_task_id: string | null;
  wbs_code: string | null;
};
// `category` — text-колонка с CHECK (не PG-enum) → автогенерация даёт `string`.
// Сужаем до ColumnCategory (значения гарантированы CHECK-инвариантом в БД).
export type ProjectColumn = Omit<Database['public']['Tables']['project_columns']['Row'], 'category'> & {
  category: ColumnCategory;
};
export type Call = Database['public']['Tables']['calls']['Row'];
export type Meeting = Database['public']['Tables']['meetings']['Row'];
export type Activity = Database['public']['Tables']['activities']['Row'];
export type UserSettings = Database['public']['Tables']['user_settings']['Row'];

// Insert/Update алиасы
// S-WBS-1: parent_task_id/wbs_code добавляем руками до regen типов (миграция 052 на
// гейте). После `npx supabase gen types` снять эти overrides — колонки придут из gen.
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'] & {
  parent_task_id?: string | null;
  wbs_code?: string | null;
};
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'] & {
  parent_task_id?: string | null;
  wbs_code?: string | null;
};
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];
export type ProjectColumnInsert = Database['public']['Tables']['project_columns']['Insert'];
export type ProjectColumnUpdate = Database['public']['Tables']['project_columns']['Update'];
export type CallInsert = Database['public']['Tables']['calls']['Insert'];
export type CompanyInsert = Database['public']['Tables']['companies']['Insert'];
export type ContactInsert = Database['public']['Tables']['contacts']['Insert'];
export type MeetingInsert = Database['public']['Tables']['meetings']['Insert'];
export type ActivityLog = Database['public']['Tables']['activity_log']['Row'];
export type ActivityLogInsert = Database['public']['Tables']['activity_log']['Insert'];
