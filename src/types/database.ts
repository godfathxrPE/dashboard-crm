/**
 * Custom types + тонкий слой над автогенерацией.
 *
 * `Database`, `Json` и хелперы `Tables`/`Enums`/`Constants` — РЕЭКСПОРТ из
 * `supabase.gen.ts` (единственный источник истины по таблицам/enum/функциям).
 * Всё ниже — КАСТОМНЫЕ типы поверх (union-алиасы, JSONB-схемы AI, RPC-args),
 * которых нет в автогенерации; их импортирует ~59 файлов приложения.
 *
 * Перегенерировать таблицы: см. шапку supabase.gen.ts. Этот файл — рукописный.
 */

import type { Json } from './supabase.gen';
import type { Database as GenDatabase } from './supabase.gen';
export type { Json, Tables, TablesInsert, TablesUpdate, Enums, CompositeTypes } from './supabase.gen';
export { Constants } from './supabase.gen';

/**
 * `org_id` в org-scoped таблицах проставляет BEFORE INSERT триггер `set_org_id`
 * (см. baseline), поэтому в живой схеме колонка NOT NULL без DEFAULT → автогенерация
 * помечает её required в Insert. На уровне приложения org_id НЕ передаётся (его ставит
 * триггер). Ослабляем `org_id` до optional на КАЖДОМ Insert, где он присутствует —
 * единственное отклонение от сгенерированных типов, с явной причиной.
 */
type RelaxOrgId<TInsert> = 'org_id' extends keyof TInsert
  ? Omit<TInsert, 'org_id'> & { org_id?: TInsert extends { org_id: infer O } ? O : never }
  : TInsert;

/** Тонкий слой над автогенерацией: только Insert.org_id → optional, остальное 1:1. */
export type Database = {
  __InternalSupabase: GenDatabase['__InternalSupabase'];
  public: Omit<GenDatabase['public'], 'Tables'> & {
    Tables: {
      [K in keyof GenDatabase['public']['Tables']]: Omit<
        GenDatabase['public']['Tables'][K],
        'Insert'
      > & { Insert: RelaxOrgId<GenDatabase['public']['Tables'][K]['Insert']> };
    };
  };
};

// ═══ Sprint UI-D1: мультителефон (contacts/companies, миграция 041 — на гейте) ═══
// JSONB-массив `phones` на contacts/companies. Старая колонка `phone` остаётся
// primary-зеркалом (backward-compat: дедуп/списки). Зеркало Zod-схемы —
// `phoneEntrySchema` в src/lib/validators/phone.ts (держать синхронно).
export type PhoneType = 'mobile' | 'work' | 'other';
export interface PhoneEntry {
  type: PhoneType;
  value: string;
  is_primary: boolean;
}

// ═══ Sprint 28: AI-саммари звонков/встреч ═══
// Пишется Edge Function `ai-summarize`. Рендерится ТОЛЬКО как текст (см. security-контур).
export interface AiSummary {
  summary: string;
  key_points: string[];
  risks: string[];
  suggested_next_step: string;
  meta: {
    model: string;
    generated_by: string;
    input_chars: number;
  };
}

// ═══ Sprint AI-1: AI Hub — transcripts + ai_runs ═══
// Транскрипт как самостоятельная сущность; ai_runs — журнал прогонов пресетов.
// result рендерится ТОЛЬКО как текст (тот же security-контур, что AiSummary).

export type TranscriptRow = {
  id: string;
  org_id: string;
  entity_type: 'call' | 'meeting';
  entity_id: string;
  source: 'paste' | 'file';
  content: string | null;
  storage_path: string | null;
  char_count: number;
  created_by: string;
  created_at: string;
};
export type TranscriptInsert = Pick<TranscriptRow, 'entity_type' | 'entity_id' | 'content' | 'char_count'> &
  Partial<Pick<TranscriptRow, 'source' | 'org_id' | 'created_by'>>;

export type AiRunStatus = 'pending' | 'running' | 'done' | 'error';

export type AiRunRow = {
  id: string;
  org_id: string;
  preset_key: string;
  entity_type: 'call' | 'meeting';
  entity_id: string;
  transcript_id: string;
  status: AiRunStatus;
  result: AiRunResult | null;
  error: string | null;
  model: string | null;
  prompt_version: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  duration_ms: number | null;
  rating: -1 | 1 | null;
  feedback_note: string | null;
  created_by: string;
  created_at: string;
  finished_at: string | null;
};

// Union результата по пресетам — renderer выбирается по preset_key прогона.
export interface ProtocolResult {
  participants: string[];
  agenda: string[];
  discussed: string[];
  decisions: string[];
  action_items: { what: string; who: string | null; due: string | null }[];
  open_questions: string[];
  meta?: { truncated?: boolean };
}
export interface AnalyticNoteResult {
  client_situation: string;
  needs: { claim: string; quote: string }[];        // анти-галлюцинация: каждая «боль» с цитатой-основанием
  stakeholders: { name: string; role: string }[];
  deal_risks: { claim: string; quote: string }[];   // то же для рисков
  recommendations: string[];
  kp_arguments: string[];
  meta?: { truncated?: boolean };
}
export interface SpinReviewResult {
  counts: { situation: number; problem: number; implication: number; need_payoff: number };
  examples: { type: 'S' | 'P' | 'I' | 'N'; quote: string }[];
  missed: string[];
  next_questions: string[]; // ровно 3
  score: { value: number; rationale: string };
  meta?: { truncated?: boolean };
}
export type AiRunResult = ProtocolResult | AnalyticNoteResult | SpinReviewResult;

// ═══ Sprint 1: Pipelines & Directions ═══

export type Direction = 'erp' | 'iiot';
export type PipelineEntityType = 'deal' | 'project';
// PCT-1: 'completed' — терминал для internal-проектов (маппится в UI как «Завершён»)
export type DealStatus = 'open' | 'won' | 'lost' | 'on_hold' | 'completed';

// ═══ Sprint PCT-1: Project-centric Tasks ═══

/**
 * Тип проекта: client — сделка в воронке; internal — внутренний проект вне
 * воронки; delivery — проект внедрения (спавнится из won-сделки, миграция 035).
 */
export type ProjectType = 'client' | 'internal' | 'delivery';
/** Шаблон проекта внедрения (миграция 035) */
export type DeliveryKind = 'launch' | 'experiment';
/**
 * Нормализующий класс колонки канбана задач (биективен к TaskLane).
 * P2a: 'phase' — фаза delivery-доски (миграция 036); lane из неё НЕ деривится
 * (lane = статус задачи, истина).
 */
export type ColumnCategory = 'backlog' | 'started' | 'paused' | 'done' | 'phase';

export interface Pipeline {
  id: string;
  name: string;
  direction: Direction;
  entity_type: PipelineEntityType;
  is_default: boolean;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  order_index: number;
  probability: number | null;
  phase_group: string | null;
  is_won: boolean;
  is_lost: boolean;
}

// ═══ Sprint 27: Stage gates (Blueprint v1) ═══

export type RequirementType = 'field' | 'file';

/**
 * Whitelisted deal columns for field-requirements.
 * MUST stay in sync with the CASE whitelist in `check_stage_requirements()`
 * (migration 027) and `GATE_FIELD_COLUMNS` (lib/constants/stage-gates.ts).
 */
export type GateFieldColumn =
  | 'budget'
  | 'company_id'
  | 'contact_id'
  | 'next_step'
  | 'deadline'
  | 'probability'
  | 'direction'
  | 'next_action_date';

export interface StageRequirementFieldConfig {
  column: GateFieldColumn;
}

export interface StageRequirementFileConfig {
  min_count?: number;
  label?: string;
}

export type StageRequirementConfig = StageRequirementFieldConfig | StageRequirementFileConfig;

export interface StageRequirement {
  id: string;
  org_id: string;
  pipeline_id: string;
  stage_id: string;
  requirement_type: RequirementType;
  config: StageRequirementConfig;
  error_hint: string;
  is_active: boolean;
  created_at: string;
}

/** Один незакрытый пункт — элемент массива, который отдаёт check_stage_requirements(). */
export interface UnmetRequirement {
  type: RequirementType;
  config: StageRequirementConfig;
  hint: string;
}

// ═══ Sprint 29: Automation v1 (триггер → действие) ═══

/** v1: единственный триггер — вход в стадию. */
export type AutomationTriggerType = 'stage_entered';
/** v1: единственное действие — создать задачу. */
export type AutomationActionType = 'create_task';
/** Кому назначить создаваемую задачу. */
export type AutomationAssignee = 'deal_owner' | 'deal_creator';

export interface AutomationTriggerConfig {
  pipeline_id: string;
  stage_id: string;
}

/**
 * Конфиг действия create_task. lane/priority/assignee — с whitelist на стороне
 * SQL-функции run_stage_automations() (см. миграцию 029); значения вне списка
 * там заменяются на дефолты 'now'/'normal'/deal_owner.
 */
export interface AutomationCreateTaskConfig {
  task_text: string;           // поддерживает подстановку {deal} → имя сделки
  assignee: AutomationAssignee;
  lane: TaskLane;
  priority: TaskPriority;
  due_in_days: number;
}

export interface AutomationRule {
  id: string;
  org_id: string;
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: AutomationTriggerConfig;
  action_type: AutomationActionType;
  action_config: AutomationCreateTaskConfig;
  is_active: boolean;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  rule_id: string;
  org_id: string;
  project_id: string;
  stage_id: string;
  task_id: string | null;
  fired_at: string;
}

// ═══ Sprint S-DEPS-1: Gantt-зависимости (task_dependencies, миграция 048 — на гейте) ═══
// Рёбра DAG между задачами одного проекта. v1 — только FS (finish-to-start).
// dep_type/lag_days — задел под будущие типы связей и critical path (без DDL).
export type DepType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskDependency {
  id: string;
  org_id: string;
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
  created_by: string | null;
  created_at: string;
}

// ═══ Sprint 2: Leads ═══

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'disqualified' | 'converted';
export type LeadSource = 'call' | 'website' | 'referral' | 'cold' | 'inbound' | 'event';

export interface Lead {
  id: string;
  user_id: string;
  org_id: string;
  title: string;
  source: LeadSource | null;
  status: LeadStatus;
  direction: Direction | null;
  company_name_raw: string | null;
  contact_name_raw: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  disqualify_reason: string | null;
  converted_deal_id: string | null;
  converted_company_id: string | null;
  converted_contact_id: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadInsert {
  title: string;
  org_id?: string;
  source?: LeadSource | null;
  status?: LeadStatus;
  direction?: Direction | null;
  company_name_raw?: string | null;
  contact_name_raw?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  disqualify_reason?: string | null;
}

export interface LeadConversionResult {
  company_id: string;
  contact_id: string;
  deal_id: string;
}

export type TaskLane = 'now' | 'next' | 'wait' | 'done';
export type TaskPriority = 'normal' | 'important' | 'critical';
export type CallStatus = 'done' | 'pending' | 'cancelled';
export type ActivityType = 'call' | 'meeting' | 'email' | 'note' | 'task_completed' | 'stage_change' | 'kp_sent';

// ═══ Delivery P2b (миграция 037): команда проекта ═══

export type ProjectMemberRole = 'manager' | 'implementer' | 'installer';

/** Args RPC apply_delivery_template (037): фазы из шаблона для пустой доски delivery */
export interface ApplyDeliveryTemplateArgs {
  p_project_id: string;
  p_template_id?: string | null;
}

// ═══ Sprint 23: Multitenancy ═══

export type OrgRole = 'owner' | 'admin' | 'manager' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  org_id: string;
  profile_id: string;
  role: OrgRole;
  created_at: string;
}

// ═══ Sprint 26: Notifications & Invitations ═══

// S-WON-AUTO-1: deal_won — сервер-триггер уведомляет владельца выигранной сделки
export type NotificationType = 'task_assigned' | 'project_assigned' | 'deal_won';

/** Роль, которую можно пригласить — owner назначается только внутри org, не по инвайту. */
export type InvitableRole = Exclude<OrgRole, 'owner'>;

export interface Notification {
  id: string;
  org_id: string;
  recipient_id: string;
  actor_id: string | null;
  type: NotificationType;
  entity_type: string;
  entity_id: string;
  payload: Json;
  read_at: string | null;
  created_at: string;
}

export interface Invitation {
  id: string;
  org_id: string;
  email: string;
  role: InvitableRole;
  token: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}
