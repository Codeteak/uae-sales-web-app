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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          contact_id: string | null
          created_at: string
          details: string | null
          id: string
          lead_id: string
          occurred_at: string
          outcome: string | null
          performed_by: string | null
          related_task_id: string | null
          summary: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          contact_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          lead_id: string
          occurred_at?: string
          outcome?: string | null
          performed_by?: string | null
          related_task_id?: string | null
          summary: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          contact_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          lead_id?: string
          occurred_at?: string
          outcome?: string | null
          performed_by?: string | null
          related_task_id?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          auto_approve_registrations: boolean
          default_currency: string
          default_timezone: string
          id: number
          overdue_reminder_hours: number
          updated_at: string
        }
        Insert: {
          auto_approve_registrations?: boolean
          default_currency?: string
          default_timezone?: string
          id?: number
          overdue_reminder_hours?: number
          updated_at?: string
        }
        Update: {
          auto_approve_registrations?: boolean
          default_currency?: string
          default_timezone?: string
          id?: number
          overdue_reminder_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action_type: string
          actor_user_id: string | null
          changed_fields: string[] | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          new_values: Json | null
          previous_values: Json | null
        }
        Insert: {
          action_type: string
          actor_user_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          new_values?: Json | null
          previous_values?: Json | null
        }
        Update: {
          action_type?: string
          actor_user_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          new_values?: Json | null
          previous_values?: Json | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          archived_at: string | null
          company_name: string
          created_at: string
          created_by: string
          email: string | null
          id: string
          industry: string | null
          name_norm: string | null
          notes: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          archived_at?: string | null
          company_name: string
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          industry?: string | null
          name_norm?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          archived_at?: string | null
          company_name?: string
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          industry?: string | null
          name_norm?: string | null
          notes?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          archived_at: string | null
          company_id: string
          contact_role: Database["public"]["Enums"]["contact_role"]
          created_at: string
          created_by: string
          department: string | null
          email: string | null
          email_norm: string | null
          full_name: string
          id: string
          is_primary: boolean
          job_title: string | null
          name_norm: string | null
          notes: string | null
          phone_norm: string | null
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          contact_role?: Database["public"]["Enums"]["contact_role"]
          created_at?: string
          created_by?: string
          department?: string | null
          email?: string | null
          email_norm?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          name_norm?: string | null
          notes?: string | null
          phone_norm?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          contact_role?: Database["public"]["Enums"]["contact_role"]
          created_at?: string
          created_by?: string
          department?: string | null
          email?: string | null
          email_norm?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          name_norm?: string | null
          notes?: string | null
          phone_norm?: string | null
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          contact_id: string
          created_at: string
          is_primary: boolean
          lead_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          is_primary?: boolean
          lead_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          is_primary?: boolean
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          assigned_user_id: string
          company_id: string
          created_at: string
          created_by: string
          currency: string | null
          current_stage_id: string
          estimated_value: number | null
          expected_close_date: string | null
          id: string
          last_activity_at: string | null
          last_customer_contact_at: string | null
          lead_source: string | null
          lead_title: string
          next_action: string | null
          next_follow_up_at: string | null
          outcome: Database["public"]["Enums"]["lead_outcome"]
          outcome_reason: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          reference: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_user_id: string
          company_id: string
          created_at?: string
          created_by?: string
          currency?: string | null
          current_stage_id: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          last_activity_at?: string | null
          last_customer_contact_at?: string | null
          lead_source?: string | null
          lead_title: string
          next_action?: string | null
          next_follow_up_at?: string | null
          outcome?: Database["public"]["Enums"]["lead_outcome"]
          outcome_reason?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          reference?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_user_id?: string
          company_id?: string
          created_at?: string
          created_by?: string
          currency?: string | null
          current_stage_id?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          id?: string
          last_activity_at?: string | null
          last_customer_contact_at?: string | null
          lead_source?: string | null
          lead_title?: string
          next_action?: string | null
          next_follow_up_at?: string | null
          outcome?: Database["public"]["Enums"]["lead_outcome"]
          outcome_reason?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          reference?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_reasons: {
        Row: {
          id: string
          is_active: boolean
          label: string
          position: number
        }
        Insert: {
          id?: string
          is_active?: boolean
          label: string
          position?: number
        }
        Update: {
          id?: string
          is_active?: boolean
          label?: string
          position?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          created_at: string
          deduplication_key: string | null
          id: string
          lead_id: string | null
          message: string | null
          notification_type: string
          read_at: string | null
          recipient_user_id: string
          task_id: string | null
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          deduplication_key?: string | null
          id?: string
          lead_id?: string | null
          message?: string | null
          notification_type: string
          read_at?: string | null
          recipient_user_id: string
          task_id?: string | null
          title: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          deduplication_key?: string | null
          id?: string
          lead_id?: string | null
          message?: string | null
          notification_type?: string
          read_at?: string | null
          recipient_user_id?: string
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          category: Database["public"]["Enums"]["stage_category"]
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          position: number
          stage_name: string
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["stage_category"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position?: number
          stage_name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["stage_category"]
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          position?: number
          stage_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          created_at: string
          email: string
          full_name: string
          id: string
          last_login_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          email?: string
          full_name?: string
          id: string
          last_login_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          last_login_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string
          id: string
          is_internal_reminder: boolean
          lead_id: string
          overdue_reminder_sent_at: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          reminder_sent_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at: string
          id?: string
          is_internal_reminder?: boolean
          lead_id: string
          overdue_reminder_sent_at?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string
          id?: string
          is_internal_reminder?: boolean
          lead_id?: string
          overdue_reminder_sent_at?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          reminder_sent_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
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
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_crm_lead: { Args: { payload: Json }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      log_crm_activity: {
        Args: { mentioned_users?: string[]; payload: Json }
        Returns: string
      }
      manage_crm_user: {
        Args: {
          new_role: Database["public"]["Enums"]["app_role"]
          new_status: Database["public"]["Enums"]["account_status"]
          target: string
          transfer_to?: string
        }
        Returns: undefined
      }
      norm_phone: { Args: { t: string }; Returns: string }
      norm_text: { Args: { t: string }; Returns: string }
      process_due_reminders: { Args: never; Returns: number }
      reassign_user_work: {
        Args: { _from: string; _to: string }
        Returns: undefined
      }
      sync_lead_follow_up: { Args: { _lead: string }; Returns: undefined }
      touch_last_login: { Args: never; Returns: undefined }
    }
    Enums: {
      account_status: "pending" | "active" | "rejected" | "deactivated"
      activity_type:
        | "call"
        | "meeting"
        | "email"
        | "message"
        | "note"
        | "stage_change"
        | "assignment"
        | "follow_up"
        | "created"
        | "updated"
        | "archived"
        | "restored"
        | "outcome"
        | "contact"
        | "other"
      app_role: "admin" | "member"
      contact_role:
        | "decision_maker"
        | "purchasing_manager"
        | "buyer"
        | "influencer"
        | "assistant"
        | "other"
      lead_outcome: "open" | "won" | "lost" | "disqualified"
      lead_priority: "low" | "medium" | "high" | "urgent"
      stage_category: "open" | "won" | "lost"
      task_status: "pending" | "completed" | "cancelled"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      account_status: ["pending", "active", "rejected", "deactivated"],
      activity_type: [
        "call",
        "meeting",
        "email",
        "message",
        "note",
        "stage_change",
        "assignment",
        "follow_up",
        "created",
        "updated",
        "archived",
        "restored",
        "outcome",
        "contact",
        "other",
      ],
      app_role: ["admin", "member"],
      contact_role: [
        "decision_maker",
        "purchasing_manager",
        "buyer",
        "influencer",
        "assistant",
        "other",
      ],
      lead_outcome: ["open", "won", "lost", "disqualified"],
      lead_priority: ["low", "medium", "high", "urgent"],
      stage_category: ["open", "won", "lost"],
      task_status: ["pending", "completed", "cancelled"],
    },
  },
} as const
