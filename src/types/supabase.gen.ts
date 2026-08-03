export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activities: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          metadata: Json | null
          org_id: string
          project_id: string | null
          title: string
          type: Database["public"]["Enums"]["activity_type"]
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          project_id?: string | null
          title: string
          type: Database["public"]["Enums"]["activity_type"]
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          project_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          event_type: string
          id: string
          org_id: string
          payload: Json | null
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          org_id: string
          payload?: Json | null
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_runs: {
        Row: {
          created_at: string
          created_by: string
          duration_ms: number | null
          entity_id: string
          entity_type: string
          error: string | null
          feedback_note: string | null
          finished_at: string | null
          id: string
          input_tokens: number | null
          model: string | null
          org_id: string
          output_tokens: number | null
          preset_key: string
          prompt_version: number | null
          rating: number | null
          result: Json | null
          status: string
          transcript_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          entity_id: string
          entity_type: string
          error?: string | null
          feedback_note?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          org_id: string
          output_tokens?: number | null
          preset_key: string
          prompt_version?: number | null
          rating?: number | null
          result?: Json | null
          status?: string
          transcript_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          entity_id?: string
          entity_type?: string
          error?: string | null
          feedback_note?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          org_id?: string
          output_tokens?: number | null
          preset_key?: string
          prompt_version?: number | null
          rating?: number | null
          result?: Json | null
          status?: string
          transcript_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          conditions: Json
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
          trigger_config: Json
          trigger_type: string
        }
        Insert: {
          action_config: Json
          action_type: string
          conditions?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          trigger_config: Json
          trigger_type: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          conditions?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          trigger_config?: Json
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          fired_at: string | null
          id: string
          org_id: string
          project_id: string | null
          rule_id: string
          stage_id: string | null
          task_id: string | null
          trigger_key: string
        }
        Insert: {
          fired_at?: string | null
          id?: string
          org_id: string
          project_id?: string | null
          rule_id: string
          stage_id?: string | null
          task_id?: string | null
          trigger_key: string
        }
        Update: {
          fired_at?: string | null
          id?: string
          org_id?: string
          project_id?: string | null
          rule_id?: string
          stage_id?: string | null
          task_id?: string | null
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      baseline_tasks: {
        Row: {
          baseline_id: string
          end_date: string
          id: string
          is_milestone: boolean
          org_id: string
          project_id: string
          start_date: string
          task_id: string
        }
        Insert: {
          baseline_id: string
          end_date: string
          id?: string
          is_milestone?: boolean
          org_id: string
          project_id: string
          start_date: string
          task_id: string
        }
        Update: {
          baseline_id?: string
          end_date?: string
          id?: string
          is_milestone?: boolean
          org_id?: string
          project_id?: string
          start_date?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "baseline_tasks_baseline_id_fkey"
            columns: ["baseline_id"]
            isOneToOne: false
            referencedRelation: "project_baselines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      call_tracker_days: {
        Row: {
          date: string
          done: number
          fail: number
          fail_reasons: Json | null
          hourly: Json | null
          id: string
          org_id: string
          plan: number
          profile_id: string
          success: number
        }
        Insert: {
          date?: string
          done?: number
          fail?: number
          fail_reasons?: Json | null
          hourly?: Json | null
          id?: string
          org_id: string
          plan?: number
          profile_id: string
          success?: number
        }
        Update: {
          date?: string
          done?: number
          fail?: number
          fail_reasons?: Json | null
          hourly?: Json | null
          id?: string
          org_id?: string
          plan?: number
          profile_id?: string
          success?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_tracker_days_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_tracker_days_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          agreements: string | null
          ai_summary: Json | null
          ai_summary_at: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          date: string
          duration_s: number | null
          id: string
          next_step: string | null
          org_id: string
          project_id: string | null
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string | null
        }
        Insert: {
          agreements?: string | null
          ai_summary?: Json | null
          ai_summary_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          duration_s?: number | null
          id?: string
          next_step?: string | null
          org_id: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string | null
        }
        Update: {
          agreements?: string | null
          ai_summary?: Json | null
          ai_summary_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          duration_s?: number | null
          id?: string
          next_step?: string | null
          org_id?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          checklist_type: string
          created_at: string
          created_by: string | null
          delivery_kind: string | null
          direction: Database["public"]["Enums"]["direction_t"] | null
          id: string
          is_active: boolean
          items: Json
          org_id: string
          title: string
          updated_at: string
        }
        Insert: {
          checklist_type: string
          created_at?: string
          created_by?: string | null
          delivery_kind?: string | null
          direction?: Database["public"]["Enums"]["direction_t"] | null
          id?: string
          is_active?: boolean
          items?: Json
          org_id: string
          title: string
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          created_at?: string
          created_by?: string | null
          delivery_kind?: string | null
          direction?: Database["public"]["Enums"]["direction_t"] | null
          id?: string
          is_active?: boolean
          items?: Json
          org_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          industry: string | null
          inn: string | null
          inn_status: string | null
          inn_verified_at: string | null
          kpp: string | null
          legal_address: string | null
          legal_name: string | null
          name: string
          notes: string | null
          ogrn: string | null
          okved: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          phones: Json
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          inn?: string | null
          inn_status?: string | null
          inn_verified_at?: string | null
          kpp?: string | null
          legal_address?: string | null
          legal_name?: string | null
          name: string
          notes?: string | null
          ogrn?: string | null
          okved?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          phones?: Json
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          inn?: string | null
          inn_status?: string | null
          inn_verified_at?: string | null
          kpp?: string | null
          legal_address?: string | null
          legal_name?: string | null
          name?: string
          notes?: string | null
          ogrn?: string | null
          okved?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          phones?: Json
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_company: {
        Row: {
          company_id: string
          contact_id: string
          id: string
          is_primary: boolean | null
          org_id: string
          role: string | null
        }
        Insert: {
          company_id: string
          contact_id: string
          id?: string
          is_primary?: boolean | null
          org_id: string
          role?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          id?: string
          is_primary?: boolean | null
          org_id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_company_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_company_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_company_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          phones: Json
          position: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          phones?: Json
          position?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          phones?: Json
          position?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          added_by: string | null
          conversation_id: string
          created_at: string
          org_id: string
          profile_id: string
        }
        Insert: {
          added_by?: string | null
          conversation_id: string
          created_at?: string
          org_id: string
          profile_id: string
        }
        Update: {
          added_by?: string | null
          conversation_id?: string
          created_at?: string
          org_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          org_id: string
          user_id?: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          org_id: string
          project_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          org_id: string
          project_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          org_id?: string
          project_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_sync: {
        Row: {
          data: Json | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          data?: Json | null
          id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          data?: Json | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      deal_stakeholders: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          org_id: string
          project_id: string
          role: string | null
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          org_id: string
          project_id: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          org_id?: string
          project_id?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stakeholders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stakeholders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stakeholders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stakeholders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_template_phases: {
        Row: {
          id: string
          name: string
          org_id: string
          position: number
          template_id: string
        }
        Insert: {
          id?: string
          name: string
          org_id: string
          position?: number
          template_id: string
        }
        Update: {
          id?: string
          name?: string
          org_id?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_template_phases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_template_phases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "delivery_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_template_tasks: {
        Row: {
          default_enabled: boolean
          id: string
          is_milestone: boolean
          org_id: string
          phase_id: string
          sort_order: number
          template_id: string
          title: string
          wbs_code: string | null
        }
        Insert: {
          default_enabled?: boolean
          id?: string
          is_milestone?: boolean
          org_id: string
          phase_id: string
          sort_order?: number
          template_id: string
          title: string
          wbs_code?: string | null
        }
        Update: {
          default_enabled?: boolean
          id?: string
          is_milestone?: boolean
          org_id?: string
          phase_id?: string
          sort_order?: number
          template_id?: string
          title?: string
          wbs_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_template_tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_template_tasks_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "delivery_template_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "delivery_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_templates: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["direction_t"]
          id: string
          is_active: boolean
          kind: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["direction_t"]
          id?: string
          is_active?: boolean
          kind: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["direction_t"]
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_entries: {
        Row: {
          fact: number
          id: string
          metric: string
          org_id: string
          plan: number
          points: number
          profile_id: string
          week_start: string
        }
        Insert: {
          fact?: number
          id?: string
          metric: string
          org_id: string
          plan?: number
          points?: number
          profile_id: string
          week_start: string
        }
        Update: {
          fact?: number
          id?: string
          metric?: string
          org_id?: string
          plan?: number
          points?: number
          profile_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_name_raw: string | null
          contact_name_raw: string | null
          converted_at: string | null
          converted_company_id: string | null
          converted_contact_id: string | null
          converted_deal_id: string | null
          created_at: string | null
          direction: string | null
          disqualify_reason: string | null
          email: string | null
          id: string
          notes: string | null
          org_id: string
          phone: string | null
          source: string | null
          status: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company_name_raw?: string | null
          contact_name_raw?: string | null
          converted_at?: string | null
          converted_company_id?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string | null
          direction?: string | null
          disqualify_reason?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          org_id: string
          phone?: string | null
          source?: string | null
          status?: string
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company_name_raw?: string | null
          contact_name_raw?: string | null
          converted_at?: string | null
          converted_company_id?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string | null
          direction?: string | null
          disqualify_reason?: string | null
          email?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          phone?: string | null
          source?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_company_id_fkey"
            columns: ["converted_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_deal_id_fkey"
            columns: ["converted_deal_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_attendees: {
        Row: {
          contact_id: string | null
          id: string
          meeting_id: string
          profile_id: string | null
        }
        Insert: {
          contact_id?: string | null
          id?: string
          meeting_id: string
          profile_id?: string | null
        }
        Update: {
          contact_id?: string | null
          id?: string
          meeting_id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_attendees_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_attendees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          ai_summary: Json | null
          ai_summary_at: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          date: string
          id: string
          location: string | null
          next_step: string | null
          notes: string | null
          org_id: string
          project_id: string | null
          time: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_summary?: Json | null
          ai_summary_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date: string
          id?: string
          location?: string | null
          next_step?: string | null
          notes?: string | null
          org_id: string
          project_id?: string | null
          time?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_summary?: Json | null
          ai_summary_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          date?: string
          id?: string
          location?: string | null
          next_step?: string | null
          notes?: string | null
          org_id?: string
          project_id?: string | null
          time?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string | null
          id: string
          org_id: string
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          org_id: string
          profile_id: string
          role?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_size: number | null
          id: string
          message_id: string
          mime_type: string | null
          org_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_size?: number | null
          id?: string
          message_id: string
          mime_type?: string | null
          org_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_size?: number | null
          id?: string
          message_id?: string
          mime_type?: string | null
          org_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          org_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          author_id: string | null
          body: string
          conversation_id: string
          created_at: string
          edited_at: string | null
          id: string
          org_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          edited_at?: string | null
          id?: string
          org_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          payload: Json | null
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          payload?: Json | null
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          settings: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          settings?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          settings?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          order_index: number
          phase_group: string | null
          pipeline_id: string
          probability: number | null
        }
        Insert: {
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          order_index: number
          phase_group?: string | null
          pipeline_id: string
          probability?: number | null
        }
        Update: {
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          order_index?: number
          phase_group?: string | null
          pipeline_id?: string
          probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          direction: Database["public"]["Enums"]["direction_t"]
          entity_type: Database["public"]["Enums"]["pipeline_entity_t"]
          id: string
          is_default: boolean
          name: string
        }
        Insert: {
          created_at?: string
          direction: Database["public"]["Enums"]["direction_t"]
          entity_type: Database["public"]["Enums"]["pipeline_entity_t"]
          id?: string
          is_default?: boolean
          name: string
        }
        Update: {
          created_at?: string
          direction?: Database["public"]["Enums"]["direction_t"]
          entity_type?: Database["public"]["Enums"]["pipeline_entity_t"]
          id?: string
          is_default?: boolean
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          id: string
          job_title: string | null
          onboarded_at: string | null
          phone: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id: string
          job_title?: string | null
          onboarded_at?: string | null
          phone?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          job_title?: string | null
          onboarded_at?: string | null
          phone?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      project_baselines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_baselines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_baselines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_baselines_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_checklists: {
        Row: {
          checklist_type: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          items: Json
          org_id: string
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          checklist_type: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          org_id: string
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          checklist_type?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items?: Json
          org_id?: string
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_checklists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checklists_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_checklists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_columns: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          org_id: string
          position: number
          project_id: string
          updated_at: string
          wip_limit: number | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          position?: number
          project_id: string
          updated_at?: string
          wip_limit?: number | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          position?: number
          project_id?: string
          updated_at?: string
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "project_columns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_columns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          comment: string | null
          created_at: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          org_id: string
          project_id: string
          storage_path: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          org_id: string
          project_id: string
          storage_path: string
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          org_id?: string
          project_id?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_files_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          profile_id: string
          project_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          profile_id: string
          project_id: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          project_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_videos: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          project_id: string
          provider: string
          sort_order: number
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          project_id: string
          provider: string
          sort_order?: number
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          project_id?: string
          provider?: string
          sort_order?: number
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_videos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_videos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          actual_close_date: string | null
          budget: number | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          delivery_kind: string | null
          direction: Database["public"]["Enums"]["direction_t"] | null
          do_external_id: string | null
          do_synced_at: string | null
          do_url: string | null
          id: string
          loss_detail: string | null
          loss_reason: string | null
          lost_reason: string | null
          name: string
          next_action_date: string | null
          next_step: string | null
          org_id: string
          owner_id: string | null
          parent_deal_id: string | null
          pinned_note: string | null
          pipeline_id: string | null
          probability: number | null
          progress_done: number
          progress_total: number
          stage_entered_at: string | null
          stage_id: string | null
          status: string
          type: string
          updated_at: string | null
          won_detail: string | null
          won_reason: string | null
        }
        Insert: {
          actual_close_date?: string | null
          budget?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          delivery_kind?: string | null
          direction?: Database["public"]["Enums"]["direction_t"] | null
          do_external_id?: string | null
          do_synced_at?: string | null
          do_url?: string | null
          id?: string
          loss_detail?: string | null
          loss_reason?: string | null
          lost_reason?: string | null
          name: string
          next_action_date?: string | null
          next_step?: string | null
          org_id: string
          owner_id?: string | null
          parent_deal_id?: string | null
          pinned_note?: string | null
          pipeline_id?: string | null
          probability?: number | null
          progress_done?: number
          progress_total?: number
          stage_entered_at?: string | null
          stage_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          won_detail?: string | null
          won_reason?: string | null
        }
        Update: {
          actual_close_date?: string | null
          budget?: number | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          delivery_kind?: string | null
          direction?: Database["public"]["Enums"]["direction_t"] | null
          do_external_id?: string | null
          do_synced_at?: string | null
          do_url?: string | null
          id?: string
          loss_detail?: string | null
          loss_reason?: string | null
          lost_reason?: string | null
          name?: string
          next_action_date?: string | null
          next_step?: string | null
          org_id?: string
          owner_id?: string | null
          parent_deal_id?: string | null
          pinned_note?: string | null
          pipeline_id?: string | null
          probability?: number | null
          progress_done?: number
          progress_total?: number
          stage_entered_at?: string | null
          stage_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
          won_detail?: string | null
          won_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_deal_id_fkey"
            columns: ["parent_deal_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          amount: number | null
          created_at: string
          created_by: string | null
          currency: string
          document_url: string | null
          id: string
          notes: string | null
          org_id: string
          project_id: string
          sent_at: string | null
          status: Database["public"]["Enums"]["quote_status"]
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_url?: string | null
          id?: string
          notes?: string | null
          org_id: string
          project_id: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          document_url?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["quote_status"]
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_task_templates: {
        Row: {
          assigned_to: string | null
          cadence: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          duration_min: number | null
          id: string
          is_active: boolean
          lane: Database["public"]["Enums"]["task_lane"]
          last_spawned_at: string | null
          monthly_dom: number | null
          next_run_date: string
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          start_time: string | null
          text: string
          updated_at: string
          weekly_dow: number | null
        }
        Insert: {
          assigned_to?: string | null
          cadence: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          duration_min?: number | null
          id?: string
          is_active?: boolean
          lane?: Database["public"]["Enums"]["task_lane"]
          last_spawned_at?: string | null
          monthly_dom?: number | null
          next_run_date: string
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          start_time?: string | null
          text: string
          updated_at?: string
          weekly_dow?: number | null
        }
        Update: {
          assigned_to?: string | null
          cadence?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          duration_min?: number | null
          id?: string
          is_active?: boolean
          lane?: Database["public"]["Enums"]["task_lane"]
          last_spawned_at?: string | null
          monthly_dom?: number | null
          next_run_date?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          start_time?: string | null
          text?: string
          updated_at?: string
          weekly_dow?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_task_templates_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_templates_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_templates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_calls: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          date: string
          done: boolean | null
          id: string
          note: string | null
          org_id: string
          phone: string | null
          profile_id: string
          project_id: string | null
          remind_min: number | null
          time: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          date?: string
          done?: boolean | null
          id?: string
          note?: string | null
          org_id: string
          phone?: string | null
          profile_id: string
          project_id?: string | null
          remind_min?: number | null
          time: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          date?: string
          done?: boolean | null
          id?: string
          note?: string | null
          org_id?: string
          phone?: string | null
          profile_id?: string
          project_id?: string | null
          remind_min?: number | null
          time?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_calls_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_calls_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_calls_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_calls_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          entity: string
          id: string
          is_shared: boolean
          name: string
          org_id: string
          owner_id: string | null
          predicate: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity: string
          id?: string
          is_shared?: boolean
          name: string
          org_id: string
          owner_id?: string | null
          predicate?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity?: string
          id?: string
          is_shared?: boolean
          name?: string
          org_id?: string
          owner_id?: string | null
          predicate?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_requirements: {
        Row: {
          config: Json
          created_at: string | null
          error_hint: string
          id: string
          is_active: boolean
          org_id: string
          pipeline_id: string
          requirement_type: string
          stage_id: string
        }
        Insert: {
          config: Json
          created_at?: string | null
          error_hint: string
          id?: string
          is_active?: boolean
          org_id: string
          pipeline_id: string
          requirement_type: string
          stage_id: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          error_hint?: string
          id?: string
          is_active?: boolean
          org_id?: string
          pipeline_id?: string
          requirement_type?: string
          stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_requirements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_requirements_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_requirements_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_transitions: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_stage_id: string | null
          id: string
          org_id: string
          project_id: string
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          org_id: string
          project_id: string
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          org_id?: string
          project_id?: string
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_transitions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_transitions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_dependencies: {
        Row: {
          created_at: string
          created_by: string | null
          dep_type: string
          id: string
          lag_days: number
          org_id: string
          predecessor_id: string
          successor_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dep_type?: string
          id?: string
          lag_days?: number
          org_id: string
          predecessor_id: string
          successor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dep_type?: string
          id?: string
          lag_days?: number
          org_id?: string
          predecessor_id?: string
          successor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_dependencies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_predecessor_id_fkey"
            columns: ["predecessor_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_dependencies_successor_id_fkey"
            columns: ["successor_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          column_id: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          end_date: string | null
          id: string
          is_milestone: boolean
          lane: Database["public"]["Enums"]["task_lane"]
          org_id: string
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          recurrence_template_id: string | null
          remind_min: number | null
          scheduled_end: string | null
          scheduled_start: string | null
          sort_order: number | null
          source_message_id: string | null
          start_date: string | null
          text: string
          updated_at: string | null
          wbs_code: string | null
        }
        Insert: {
          assigned_to?: string | null
          column_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          end_date?: string | null
          id?: string
          is_milestone?: boolean
          lane?: Database["public"]["Enums"]["task_lane"]
          org_id: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence_template_id?: string | null
          remind_min?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          sort_order?: number | null
          source_message_id?: string | null
          start_date?: string | null
          text: string
          updated_at?: string | null
          wbs_code?: string | null
        }
        Update: {
          assigned_to?: string | null
          column_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          end_date?: string | null
          id?: string
          is_milestone?: boolean
          lane?: Database["public"]["Enums"]["task_lane"]
          org_id?: string
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          recurrence_template_id?: string | null
          remind_min?: number | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          sort_order?: number | null
          source_message_id?: string | null
          start_date?: string | null
          text?: string
          updated_at?: string | null
          wbs_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "project_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recurrence_template_id_fkey"
            columns: ["recurrence_template_id"]
            isOneToOne: false
            referencedRelation: "recurring_task_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          char_count: number
          content: string | null
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          source: string
          storage_path: string | null
        }
        Insert: {
          char_count: number
          content?: string | null
          created_at?: string
          created_by?: string
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          source?: string
          storage_path?: string | null
        }
        Update: {
          char_count?: number
          content?: string | null
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          source?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          focus_text: string | null
          funnel_goals: Json | null
          notes_text: string | null
          plan_targets: Json | null
          profile_id: string
          theme: string | null
          updated_at: string | null
          visible_widgets: Json | null
        }
        Insert: {
          focus_text?: string | null
          funnel_goals?: Json | null
          notes_text?: string | null
          plan_targets?: Json | null
          profile_id: string
          theme?: string | null
          updated_at?: string | null
          visible_widgets?: Json | null
        }
        Update: {
          focus_text?: string | null
          funnel_goals?: Json | null
          notes_text?: string | null
          plan_targets?: Json | null
          profile_id?: string
          theme?: string | null
          updated_at?: string | null
          visible_widgets?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          error: string | null
          event: string
          id: string
          next_retry_at: string | null
          org_id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          rule_id: string | null
          status: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          error?: string | null
          event: string
          id?: string
          next_retry_at?: string | null
          org_id: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          rule_id?: string | null
          status?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          error?: string | null
          event?: string
          id?: string
          next_retry_at?: string | null
          org_id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          rule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          consecutive_failures: number
          created_at: string
          created_by: string | null
          description: string | null
          disabled_reason: string | null
          id: string
          is_active: boolean
          last_delivery_at: string | null
          last_status_code: number | null
          name: string
          org_id: string
          secret_id: string
          updated_at: string
          url: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled_reason?: string | null
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_status_code?: number | null
          name: string
          org_id: string
          secret_id: string
          updated_at?: string
          url: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled_reason?: string | null
          id?: string
          is_active?: boolean
          last_delivery_at?: string | null
          last_status_code?: number | null
          name?: string
          org_id?: string
          secret_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_endpoints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: Json }
      apply_delivery_template: {
        Args: { p_project_id: string; p_template_id?: string }
        Returns: undefined
      }
      apply_pending_invites: {
        Args: {
          p_email: string
          p_email_confirmed?: boolean
          p_profile_id: string
        }
        Returns: number
      }
      build_deal_webhook_payload: {
        Args: {
          p_changes: Json
          p_delivery_id: string
          p_event: string
          p_project_id: string
          p_rule_id: string
          p_rule_name: string
        }
        Returns: Json
      }
      can_access_chat_file: { Args: { p_name: string }; Returns: boolean }
      category_to_lane: {
        Args: { p: string }
        Returns: Database["public"]["Enums"]["task_lane"]
      }
      check_delivery_completion: {
        Args: { p_project_id: string }
        Returns: Json
      }
      check_stage_requirements: {
        Args: { p_project_id: string; p_target_stage_id: string }
        Returns: Json
      }
      check_stage_requirements_row: {
        Args: { p_project_id: string; p_row: Json; p_target_stage_id: string }
        Returns: Json
      }
      claim_webhook_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          allowed_hosts: Json
          attempt: number
          delivery_id: string
          endpoint_active: boolean
          endpoint_id: string
          event: string
          failure_threshold: number
          org_id: string
          payload: Json
          url: string
        }[]
      }
      cleanup_webhook_deliveries: { Args: never; Returns: number }
      complete_onboarding: {
        Args: { p_full_name: string; p_job_title: string; p_phone: string }
        Returns: undefined
      }
      convert_lead: {
        Args: {
          p_company_id?: string
          p_company_name?: string
          p_contact_email?: string
          p_contact_first_name?: string
          p_contact_id?: string
          p_contact_last_name?: string
          p_contact_phone?: string
          p_deal_amount?: number
          p_deal_title?: string
          p_direction?: string
          p_lead_id: string
        }
        Returns: Json
      }
      copy_delivery_template: {
        Args: { p_project_id: string; p_template_id: string }
        Returns: undefined
      }
      create_group_conversation: {
        Args: { p_member_ids?: string[]; p_title: string }
        Returns: string
      }
      create_project_baseline: {
        Args: { p_name: string; p_project_id: string }
        Returns: string
      }
      create_webhook_endpoint: {
        Args: { p_description?: string; p_name: string; p_url: string }
        Returns: {
          endpoint_id: string
          secret: string
        }[]
      }
      current_org_id: { Args: never; Returns: string }
      current_org_role: { Args: never; Returns: string }
      delete_project_column: {
        Args: { p_column_id: string; p_target_column_id?: string }
        Returns: undefined
      }
      delete_webhook_endpoint: {
        Args: { p_endpoint_id: string }
        Returns: undefined
      }
      dispatch_webhooks_tick: { Args: never; Returns: undefined }
      get_webhook_secrets: {
        Args: { p_endpoint_ids: string[] }
        Returns: {
          endpoint_id: string
          secret: string
        }[]
      }
      instantiate_project_checklists: {
        Args: {
          p_direction: Database["public"]["Enums"]["direction_t"]
          p_kind: string
          p_project_id: string
        }
        Returns: number
      }
      is_conversation_member: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      is_meeting_attendee: { Args: { p_meeting_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      is_project_member: { Args: { p_project_id: string }; Returns: boolean }
      lane_to_category: {
        Args: { p: Database["public"]["Enums"]["task_lane"] }
        Returns: string
      }
      recalc_delivery_progress: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      record_webhook_result: {
        Args: {
          p_delivery_id: string
          p_error?: string
          p_next_retry_at?: string
          p_response_body?: string
          p_response_status?: number
          p_status: string
        }
        Returns: undefined
      }
      reorder_tasks: { Args: { p_moves: Json }; Returns: undefined }
      retry_webhook_delivery: {
        Args: { p_delivery_id: string }
        Returns: string
      }
      rotate_webhook_secret: {
        Args: { p_endpoint_id: string }
        Returns: string
      }
      rtt_next_occurrence: {
        Args: {
          p_cadence: string
          p_dom: number
          p_dow: number
          p_from: string
        }
        Returns: string
      }
      run_dwell_automations: { Args: never; Returns: undefined }
      run_overdue_automations: { Args: never; Returns: undefined }
      send_test_webhook: { Args: { p_endpoint_id: string }; Returns: string }
      session_gate: { Args: never; Returns: Json }
      shares_org_with: { Args: { p_profile: string }; Returns: boolean }
      spawn_delivery_project: {
        Args: {
          p_deal_id: string
          p_kind: string
          p_owner_id?: string
          p_template_id?: string
        }
        Returns: string
      }
      spawn_recurring_tasks: { Args: never; Returns: undefined }
      task_aging_buckets: {
        Args: never
        Returns: {
          bucket: string
          cnt: number
          sort_key: number
        }[]
      }
      task_analytics_summary: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      task_throughput_series: {
        Args: { p_from: string; p_to: string }
        Returns: {
          completed: number
          created: number
          week_start: string
        }[]
      }
      toggle_checklist_item: {
        Args: { p_checked: boolean; p_checklist_id: string; p_item_key: string }
        Returns: Json
      }
      webhook_event_name: { Args: { p_trigger_type: string }; Returns: string }
      wf_apply_project_action: {
        Args: {
          p_changes?: Json
          p_project_id: string
          p_rule_id: string
          p_run_id: string
          p_trigger_key: string
        }
        Returns: undefined
      }
      wf_eval_conditions: {
        Args: { p_conds: Json; p_row: Json }
        Returns: boolean
      }
    }
    Enums: {
      activity_type:
        | "call"
        | "meeting"
        | "email"
        | "note"
        | "task_completed"
        | "stage_change"
        | "kp_sent"
      call_status: "done" | "pending" | "cancelled"
      direction_t: "erp" | "iiot"
      pipeline_entity_t: "deal" | "project"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      task_lane: "now" | "next" | "wait" | "done"
      task_priority: "normal" | "important" | "critical"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: [
        "call",
        "meeting",
        "email",
        "note",
        "task_completed",
        "stage_change",
        "kp_sent",
      ],
      call_status: ["done", "pending", "cancelled"],
      direction_t: ["erp", "iiot"],
      pipeline_entity_t: ["deal", "project"],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      task_lane: ["now", "next", "wait", "done"],
      task_priority: ["normal", "important", "critical"],
    },
  },
} as const
