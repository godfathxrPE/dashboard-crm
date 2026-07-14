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
          transcript_id: string
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
          transcript_id: string
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
          transcript_id?: string
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
          project_id: string
          rule_id: string
          stage_id: string
          task_id: string | null
        }
        Insert: {
          fired_at?: string | null
          id?: string
          org_id: string
          project_id: string
          rule_id: string
          stage_id: string
          task_id?: string | null
        }
        Update: {
          fired_at?: string | null
          id?: string
          org_id?: string
          project_id?: string
          rule_id?: string
          stage_id?: string
          task_id?: string | null
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
      companies: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          industry: string | null
          inn: string | null
          name: string
          notes: string | null
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
          name: string
          notes?: string | null
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
          name?: string
          notes?: string | null
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
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
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
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
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
          won_reason: string | null
          won_detail: string | null
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
          stage: Database["public"]["Enums"]["deal_stage"] | null
          stage_entered_at: string | null
          stage_id: string | null
          status: string
          type: string
          updated_at: string | null
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
          stage?: Database["public"]["Enums"]["deal_stage"] | null
          stage_entered_at?: string | null
          stage_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
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
          won_reason?: string | null
          won_detail?: string | null
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
          stage?: Database["public"]["Enums"]["deal_stage"] | null
          stage_entered_at?: string | null
          stage_id?: string | null
          status?: string
          type?: string
          updated_at?: string | null
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
      tasks: {
        Row: {
          assigned_to: string | null
          column_id: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          deadline: string | null
          id: string
          is_milestone: boolean
          lane: Database["public"]["Enums"]["task_lane"]
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          remind_min: number | null
          sort_order: number | null
          text: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          column_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          id?: string
          is_milestone?: boolean
          lane?: Database["public"]["Enums"]["task_lane"]
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          remind_min?: number | null
          sort_order?: number | null
          text: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          column_id?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deadline?: string | null
          id?: string
          is_milestone?: boolean
          lane?: Database["public"]["Enums"]["task_lane"]
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          remind_min?: number | null
          sort_order?: number | null
          text?: string
          updated_at?: string | null
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
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      current_org_id: { Args: never; Returns: string }
      current_org_role: { Args: never; Returns: string }
      delete_project_column: {
        Args: { p_column_id: string; p_target_column_id?: string }
        Returns: undefined
      }
      is_org_member: { Args: { p_org: string }; Returns: boolean }
      lane_to_category: {
        Args: { p: Database["public"]["Enums"]["task_lane"] }
        Returns: string
      }
      recalc_delivery_progress: {
        Args: { p_project_id: string }
        Returns: undefined
      }
      reorder_tasks: { Args: { p_moves: Json }; Returns: undefined }
      shares_org_with: { Args: { p_profile: string }; Returns: boolean }
      spawn_delivery_project: {
        Args: {
          p_deal_id: string
          p_kind: string
          // nullable: явный null на проводе → DEFAULT NULL внутри RPC (v1 резолвит
          // шаблон по direction+kind; owner → COALESCE(p_owner_id, deal.owner_id, auth.uid()))
          p_template_id?: string | null
          p_owner_id?: string | null
        }
        Returns: string
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
      deal_stage:
        | "new_lead"
        | "qualification"
        | "waiting_materials"
        | "preparing_kp"
        | "kp_sent"
        | "kp_review"
        | "preparing_docs"
        | "cz_approval"
        | "trilateral_meeting"
        | "experiment_setup"
        | "contract_review"
        | "contract_signing"
        | "won"
        | "lost"
      direction_t: "erp" | "iiot"
      pipeline_entity_t: "deal" | "project"
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
      deal_stage: [
        "new_lead",
        "qualification",
        "waiting_materials",
        "preparing_kp",
        "kp_sent",
        "kp_review",
        "preparing_docs",
        "cz_approval",
        "trilateral_meeting",
        "experiment_setup",
        "contract_review",
        "contract_signing",
        "won",
        "lost",
      ],
      direction_t: ["erp", "iiot"],
      pipeline_entity_t: ["deal", "project"],
      task_lane: ["now", "next", "wait", "done"],
      task_priority: ["normal", "important", "critical"],
    },
  },
} as const
