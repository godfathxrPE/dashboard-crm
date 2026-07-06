/**
 * Database types — PLACEHOLDER
 *
 * Замени этот файл автогенерированным:
 * npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.ts
 *
 * Пока что определяем структуру вручную для типобезопасности до подключения Supabase.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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

export type DealStage =
  | 'new_lead' | 'qualification' | 'waiting_materials' | 'preparing_kp'
  | 'kp_sent' | 'kp_review' | 'preparing_docs' | 'cz_approval'
  | 'trilateral_meeting' | 'experiment_setup' | 'contract_review'
  | 'contract_signing' | 'won' | 'lost';

// ═══ Sprint 1: Pipelines & Directions ═══

export type Direction = 'erp' | 'iiot';
export type PipelineEntityType = 'deal' | 'project';
export type DealStatus = 'open' | 'won' | 'lost' | 'on_hold';

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

export type NotificationType = 'task_assigned' | 'project_assigned';

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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          settings?: Json;
        };
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          settings?: Json;
        };
      };
      companies: {
        Row: {
          id: string;
          name: string;
          inn: string | null;
          industry: string | null;
          website: string | null;
          phone: string | null;
          address: string | null;
          notes: string | null;
          owner_id: string | null;
          created_by: string | null;
          org_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          inn?: string | null;
          industry?: string | null;
          website?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['companies']['Insert']>;
      };
      contacts: {
        Row: {
          id: string;
          first_name: string;
          last_name: string | null;
          email: string | null;
          phone: string | null;
          position: string | null;
          notes: string | null;
          owner_id: string | null;
          created_by: string | null;
          org_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          first_name: string;
          last_name?: string | null;
          email?: string | null;
          phone?: string | null;
          position?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };
      projects: {
        Row: {
          id: string;
          name: string;
          company_id: string | null;
          contact_id: string | null;
          stage: DealStage | null;
          budget: number | null;
          deadline: string | null;
          next_step: string | null;
          next_action_date: string | null;
          pinned_note: string | null;
          owner_id: string | null;
          loss_reason: string | null;
          loss_detail: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          // Sprint 1: pipelines & directions
          direction: Direction;
          pipeline_id: string;
          stage_id: string;
          probability: number | null;
          status: DealStatus;
          lost_reason: string | null;
          actual_close_date: string | null;
          org_id: string;
        };
        Insert: {
          name: string;
          company_id?: string | null;
          contact_id?: string | null;
          stage?: DealStage | null;
          budget?: number | null;
          deadline?: string | null;
          next_step?: string | null;
          next_action_date?: string | null;
          pinned_note?: string | null;
          owner_id?: string | null;
          loss_reason?: string | null;
          loss_detail?: string | null;
          // Sprint 1
          direction: Direction;
          pipeline_id: string;
          stage_id: string;
          status?: DealStatus;
          lost_reason?: string | null;
          actual_close_date?: string | null;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      pipelines: {
        Row: Pipeline;
        Insert: Omit<Pipeline, 'id' | 'created_at'> & { id?: string; created_at?: string };
        Update: Partial<Omit<Pipeline, 'id' | 'created_at'>>;
      };
      pipeline_stages: {
        Row: PipelineStage;
        Insert: Omit<PipelineStage, 'id'> & { id?: string };
        Update: Partial<Omit<PipelineStage, 'id'>>;
      };
      tasks: {
        Row: {
          id: string;
          text: string;
          lane: TaskLane;
          priority: TaskPriority;
          project_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          deadline: string | null;
          remind_min: number | null;
          sort_order: number;
          assigned_to: string | null;
          created_by: string | null;
          org_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          text: string;
          lane?: TaskLane;
          priority?: TaskPriority;
          project_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          deadline?: string | null;
          remind_min?: number | null;
          sort_order?: number;
          assigned_to?: string | null;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>;
      };
      calls: {
        Row: {
          id: string;
          company_id: string | null;
          contact_id: string | null;
          project_id: string | null;
          date: string;
          status: CallStatus;
          next_step: string | null;
          agreements: string | null;
          duration_s: number | null;
          ai_summary: AiSummary | null;
          ai_summary_at: string | null;
          created_by: string | null;
          org_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          company_id?: string | null;
          contact_id?: string | null;
          project_id?: string | null;
          date?: string;
          status?: CallStatus;
          next_step?: string | null;
          agreements?: string | null;
          duration_s?: number | null;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['calls']['Insert']>;
      };
      meetings: {
        Row: {
          id: string;
          title: string;
          date: string;
          time: string | null;
          location: string | null;
          project_id: string | null;
          company_id: string | null;
          contact_id: string | null;
          notes: string | null;
          next_step: string | null;
          ai_summary: AiSummary | null;
          ai_summary_at: string | null;
          created_by: string | null;
          org_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          date: string;
          time?: string | null;
          location?: string | null;
          project_id?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          notes?: string | null;
          next_step?: string | null;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['meetings']['Insert']>;
      };
      activities: {
        Row: {
          id: string;
          type: ActivityType;
          title: string;
          description: string | null;
          company_id: string | null;
          contact_id: string | null;
          project_id: string | null;
          metadata: Json;
          created_by: string | null;
          org_id: string | null;
          created_at: string;
        };
        Insert: {
          type: ActivityType;
          title: string;
          description?: string | null;
          company_id?: string | null;
          contact_id?: string | null;
          project_id?: string | null;
          metadata?: Json;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
      };
      activity_log: {
        Row: {
          id: string;
          project_id: string | null;
          user_id: string;
          event_type: string;
          payload: Json;
          org_id: string | null;
          created_at: string;
        };
        Insert: {
          project_id?: string | null;
          user_id: string;
          event_type: string;
          payload?: Json;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          file_name: string;
          file_size: number | null;
          file_type: string | null;
          storage_path: string;
          org_id: string | null;
          created_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          file_name: string;
          file_size?: number | null;
          file_type?: string | null;
          storage_path: string;
          org_id?: string;
        };
        Update: Partial<Database['public']['Tables']['project_files']['Insert']>;
      };
      user_settings: {
        Row: {
          profile_id: string;
          theme: string;
          visible_widgets: Json;
          focus_text: string | null;
          notes_text: string | null;
          funnel_goals: Json;
          plan_targets: Json;
          updated_at: string;
        };
        Insert: {
          profile_id: string;
          theme?: string;
          visible_widgets?: Json;
        };
        Update: {
          theme?: string;
          visible_widgets?: Json;
          focus_text?: string | null;
          notes_text?: string | null;
          funnel_goals?: Json;
          plan_targets?: Json;
        };
      };
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
      };
      memberships: {
        Row: Membership;
        Insert: Omit<Membership, 'id' | 'created_at' | 'role'> & {
          id?: string;
          role?: OrgRole;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>;
      };
      notifications: {
        Row: Notification;
        Insert: Omit<Notification, 'id' | 'created_at' | 'read_at'> & {
          id?: string;
          payload?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Pick<Notification, 'read_at'>>;
      };
      invitations: {
        Row: Invitation;
        Insert: Omit<Invitation, 'id' | 'token' | 'expires_at' | 'accepted_at' | 'created_at'> & {
          id?: string;
          token?: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['invitations']['Insert']>;
      };
      stage_requirements: {
        Row: StageRequirement;
        Insert: Omit<StageRequirement, 'id' | 'created_at'> & {
          id?: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['stage_requirements']['Insert']>;
      };
    };
  };
}
