import type { Database } from './database';
import type { ColumnCategory, ConversationKind, ProjectType, RecurringCadence } from './database';
// `org_id` уже ослаблен до optional в ./database (RelaxOrgId) — здесь прямые ссылки.

// Удобные алиасы для Row-типов из Supabase
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Company = Database['public']['Tables']['companies']['Row'];
export type Contact = Database['public']['Tables']['contacts']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
// S-TIMEBLOCK-A1: tasks.scheduled_start/scheduled_end (070 применена, типы регенерированы).
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

// ═══ S-RECUR-1: recurring_task_templates (069 применена) ═══
// `cadence` — text-колонка с CHECK (не PG-enum) → автогенерация даёт `string`.
// Сужаем до RecurringCadence тем же приёмом, что ProjectColumn/category выше.
// S-TIMEBLOCK-A1: start_time/duration_min (070 применена, типы регенерированы).
export type RecurringTaskTemplate = Omit<Database['public']['Tables']['recurring_task_templates']['Row'], 'cadence'> & {
  cadence: RecurringCadence;
};
export type RecurringTaskTemplateInsert = Database['public']['Tables']['recurring_task_templates']['Insert'];
export type RecurringTaskTemplateUpdate = Database['public']['Tables']['recurring_task_templates']['Update'];

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

// ═══ S-CHAT-HUB-1a: conversations / messages / conversation_reads ═══
// WARNING: три таблицы — РУЧНОЙ стаб в src/types/database.ts (миграция 094 на гейте
// Cowork). После apply 094 → `scripts/gen-types.sh` снимет стаб, алиасы продолжат
// работать 1:1. Сообщение висит на КАНАЛЕ, а не на проекте: чат проекта — это
// conversation с kind='project' (legacy `project_messages` сносит 095).
export type Conversation = Omit<Database['public']['Tables']['conversations']['Row'], 'kind'> & {
  // `kind` — text + CHECK (не PG-enum) → автогенерация даст `string`. Сужаем тем же
  // приёмом, что ProjectColumn/category (значение гарантировано CHECK-инвариантом).
  kind: ConversationKind;
};
export type Message = Database['public']['Tables']['messages']['Row'];
export type MessageInsert = Database['public']['Tables']['messages']['Insert'];
/** Сообщение с автором (embed profiles!author_id в select хука). */
export type MessageWithAuthor = Message & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
};
export type ConversationRead = Database['public']['Tables']['conversation_reads']['Row'];

// ═══ S-CHAT-HUB-1c: conversation_members (состав ГРУППЫ) ═══
// WARNING: таблица — РУЧНОЙ стаб в src/types/database.ts (миграция 096 на гейте Cowork).
// Заполняется только для kind='group': у general/project членство вычисляется
// в is_conversation_member() и таблицы не имеет.
export type ConversationMember = Database['public']['Tables']['conversation_members']['Row'];
/** Участник с профилем (embed profiles!profile_id в select хука). */
export type ConversationMemberWithProfile = ConversationMember & {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
};

// ═══ S-CHAT-HUB-1d: message_attachments (вложения сообщения) ═══
// WARNING: таблица — РУЧНОЙ стаб в src/types/database.ts (миграция 097 на гейте Cowork).
// Байты живут в бакете `chat-files`, здесь — имя, размер, mime и связь с сообщением.
export type MessageAttachment = Database['public']['Tables']['message_attachments']['Row'];
export type MessageAttachmentInsert =
  Database['public']['Tables']['message_attachments']['Insert'];

// ═══ S-CHAT-2: message_reactions (реакции на сообщения — junction) ═══
// WARNING: таблица `message_reactions` — РУЧНОЙ стаб в supabase.gen.ts (миграция 068 на
// гейте Cowork). После apply 068 → regen снимет стаб, алиасы продолжат работать 1:1.
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row'];
export type MessageReactionInsert = Database['public']['Tables']['message_reactions']['Insert'];
/** Реакция с реактором (embed profiles!user_id в select хука). */
export type MessageReactionWithUser = MessageReaction & {
  user: Pick<Profile, 'full_name' | 'avatar_url'> | null;
};
