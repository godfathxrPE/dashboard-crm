/**
 * Database types — PLACEHOLDER
 *
 * Замени этот файл автогенерированным:
 * npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/types/database.ts
 *
 * Пока что определяем структуру вручную для типобезопасности до подключения Supabase.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type DealStage =
  | 'new_lead' | 'qualification' | 'waiting_materials' | 'preparing_kp'
  | 'kp_sent' | 'kp_review' | 'preparing_docs' | 'cz_approval'
  | 'trilateral_meeting' | 'experiment_setup' | 'contract_review'
  | 'contract_signing' | 'won' | 'lost';

export type TaskLane = 'now' | 'next' | 'wait' | 'done';
export type TaskPriority = 'normal' | 'important' | 'critical';
export type CallStatus = 'done' | 'pending' | 'cancelled';
export type ActivityType = 'call' | 'meeting' | 'email' | 'note' | 'task_completed' | 'stage_change' | 'kp_sent';
export type UserRole = 'admin' | 'pm' | 'member' | 'viewer';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          avatar_url: string | null;
          role: UserRole;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string;
          avatar_url?: string | null;
          role?: UserRole;
          settings?: Json;
        };
        Update: {
          full_name?: string;
          avatar_url?: string | null;
          role?: UserRole;
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
        };
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };
      projects: {
        Row: {
          id: string;
          name: string;
          company_id: string | null;
          contact_id: string | null;
          stage: DealStage;
          budget: number | null;
          deadline: string | null;
          next_step: string | null;
          owner_id: string | null;
          loss_reason: string | null;
          loss_detail: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          name: string;
          company_id?: string | null;
          contact_id?: string | null;
          stage?: DealStage;
          budget?: number | null;
          deadline?: string | null;
          next_step?: string | null;
          owner_id?: string | null;
          loss_reason?: string | null;
          loss_detail?: string | null;
        };
        Update: Partial<Database['public']['Tables']['projects']['Insert']>;
      };
      tasks: {
        Row: {
          id: string;
          text: string;
          lane: TaskLane;
          priority: TaskPriority;
          project_id: string | null;
          deadline: string | null;
          remind_min: number | null;
          sort_order: number;
          assigned_to: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          text: string;
          lane?: TaskLane;
          priority?: TaskPriority;
          project_id?: string | null;
          deadline?: string | null;
          remind_min?: number | null;
          sort_order?: number;
          assigned_to?: string | null;
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
          created_by: string | null;
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
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          title: string;
          date: string;
          time?: string | null;
          location?: string | null;
          project_id?: string | null;
          notes?: string | null;
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
        };
        Update: Partial<Database['public']['Tables']['activities']['Insert']>;
      };
      activity_log: {
        Row: {
          id: string;
          project_id: string;
          user_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          project_id: string;
          user_id: string;
          event_type: string;
          payload?: Json;
        };
        Update: Partial<Database['public']['Tables']['activity_log']['Insert']>;
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
    };
  };
}
