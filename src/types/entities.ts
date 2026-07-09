import type { Database } from './database';

// Удобные алиасы для Row-типов из Supabase
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Company = Database['public']['Tables']['companies']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'] & {
  project?: { id: string; name: string } | null;
  company?: { id: string; name: string } | null;
};
export type ProjectColumn = Database['public']['Tables']['project_columns']['Row'];
export type Call = Database['public']['Tables']['calls']['Row'];
export type Meeting = Database['public']['Tables']['meetings']['Row'];
export type Activity = Database['public']['Tables']['activities']['Row'];
export type UserSettings = Database['public']['Tables']['user_settings']['Row'];

// Insert/Update алиасы
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
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
