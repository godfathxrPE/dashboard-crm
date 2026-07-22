import type { Database } from './database';
import type { ColumnCategory, ProjectType } from './database';
// `org_id` уже ослаблен до optional в ./database (RelaxOrgId) — здесь прямые ссылки.

// Удобные алиасы для Row-типов из Supabase
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Company = Database['public']['Tables']['companies']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
export type Task = Database['public']['Tables']['tasks']['Row'] & {
  // S-TASKS-RESTRUCTURE-1: projects.type прилетает из join → классификатор источника
  // (client=сделка, internal/delivery=проект внедрения). Тип-опционален: борды/Гант
  // селектят тот же join, но старый кэш мог не нести type — читатели гейтят по null.
  project?: { id: string; name: string; type?: ProjectType | null } | null;
  company?: { id: string; name: string } | null;
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

// ═══ S-QUOTE-1: quotes (КП на сделке) ═══
// WARNING: таблица `quotes` — РУЧНОЙ стаб в supabase.gen.ts (миграция 053 на гейте
// Cowork, типы не сгенерированы). После apply 053 → `npx supabase gen types` регенерит
// gen-файл целиком (стаб уйдёт), а эти алиасы продолжат работать 1:1 без правок.
export type Quote = Database['public']['Tables']['quotes']['Row'];
export type QuoteInsert = Database['public']['Tables']['quotes']['Insert'];
export type QuoteUpdate = Database['public']['Tables']['quotes']['Update'];

// ═══ S-VIDEO-EMBED-1: project_videos (видео-материалы проекта) ═══
// WARNING: таблица `project_videos` — РУЧНОЙ стаб в supabase.gen.ts (миграция 066 на
// гейте Cowork). После apply 066 → regen снимет стаб, алиасы продолжат работать 1:1.
export type ProjectVideo = Database['public']['Tables']['project_videos']['Row'];
export type ProjectVideoInsert = Database['public']['Tables']['project_videos']['Insert'];

// ═══ S-CHAT-1: project_messages (чат проекта — отдельный модуль, НЕ activity_log) ═══
// WARNING: таблица `project_messages` — РУЧНОЙ стаб в supabase.gen.ts (миграция 067 на
// гейте Cowork). После apply 067 → regen снимет стаб, алиасы продолжат работать 1:1.
export type ProjectMessage = Database['public']['Tables']['project_messages']['Row'];
export type ProjectMessageInsert = Database['public']['Tables']['project_messages']['Insert'];
/** Сообщение с автором (embed profiles!author_id в select хука). */
export type ProjectMessageWithAuthor = ProjectMessage & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
};

// ═══ S-CHAT-2: message_reactions (реакции на сообщения — junction) ═══
// WARNING: таблица `message_reactions` — РУЧНОЙ стаб в supabase.gen.ts (миграция 068 на
// гейте Cowork). После apply 068 → regen снимет стаб, алиасы продолжат работать 1:1.
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row'];
export type MessageReactionInsert = Database['public']['Tables']['message_reactions']['Insert'];
/** Реакция с реактором (embed profiles!user_id в select хука). */
export type MessageReactionWithUser = MessageReaction & {
  user: Pick<Profile, 'full_name' | 'avatar_url'> | null;
};
