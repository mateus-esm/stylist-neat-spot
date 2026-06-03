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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string
          client_id: string | null
          client_name: string
          created_at: string
          duration_min: number | null
          evolution_notes: string | null
          id: string
          media_url: string | null
          observations: string | null
          package_id: string | null
          package_session_index: number | null
          package_total: number | null
          pain_scale: number | null
          patient_notes: string | null
          payment_status: string
          photo_url: string | null
          price: number
          satisfaction: number | null
          service: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_date: string
          appointment_time: string
          client_id?: string | null
          client_name: string
          created_at?: string
          duration_min?: number | null
          evolution_notes?: string | null
          id?: string
          media_url?: string | null
          observations?: string | null
          package_id?: string | null
          package_session_index?: number | null
          package_total?: number | null
          pain_scale?: number | null
          patient_notes?: string | null
          payment_status?: string
          photo_url?: string | null
          price?: number
          satisfaction?: number | null
          service: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string
          client_id?: string | null
          client_name?: string
          created_at?: string
          duration_min?: number | null
          evolution_notes?: string | null
          id?: string
          media_url?: string | null
          observations?: string | null
          package_id?: string | null
          package_session_index?: number | null
          package_total?: number | null
          pain_scale?: number | null
          patient_notes?: string | null
          payment_status?: string
          photo_url?: string | null
          price?: number
          satisfaction?: number | null
          service?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "patient_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_slots: {
        Row: {
          appointment_id: string | null
          created_at: string
          end_time: string
          id: string
          reason: string | null
          slot_date: string
          start_time: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          created_at?: string
          end_time: string
          id?: string
          reason?: string | null
          slot_date: string
          start_time: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          created_at?: string
          end_time?: string
          id?: string
          reason?: string | null
          slot_date?: string
          start_time?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          auth_user_id: string | null
          created_at: string
          health_history: string | null
          id: string
          instagram: string | null
          name: string
          notes: string | null
          past_surgeries: string | null
          phone: string | null
          primary_complaints: string | null
          return_days: number | null
          underlying_conditions: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          health_history?: string | null
          id?: string
          instagram?: string | null
          name: string
          notes?: string | null
          past_surgeries?: string | null
          phone?: string | null
          primary_complaints?: string | null
          return_days?: number | null
          underlying_conditions?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          health_history?: string | null
          id?: string
          instagram?: string | null
          name?: string
          notes?: string | null
          past_surgeries?: string | null
          phone?: string | null
          primary_complaints?: string | null
          return_days?: number | null
          underlying_conditions?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      patient_packages: {
        Row: {
          client_id: string
          completed_sessions: number
          created_at: string
          finished_at: string | null
          id: string
          name: string
          paid_at: string | null
          payment_status: string
          price: number
          service: string | null
          started_at: string | null
          status: string
          total_sessions: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          completed_sessions?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          name: string
          paid_at?: string | null
          payment_status?: string
          price?: number
          service?: string | null
          started_at?: string | null
          status?: string
          total_sessions?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          completed_sessions?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          name?: string
          paid_at?: string | null
          payment_status?: string
          price?: number
          service?: string | null
          started_at?: string | null
          status?: string
          total_sessions?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_packages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          default_duration_min: number
          default_price: number
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_duration_min?: number
          default_price?: number
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_duration_min?: number
          default_price?: number
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      session_exercises: {
        Row: {
          appointment_id: string
          completed_at: string | null
          created_at: string
          id: string
          load: string | null
          name: string
          notes: string | null
          order_index: number
          performance: string | null
          reps: string | null
          rest_seconds: number | null
          sets: number | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          appointment_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          load?: string | null
          name: string
          notes?: string | null
          order_index?: number
          performance?: string | null
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          appointment_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          load?: string | null
          name?: string
          notes?: string | null
          order_index?: number
          performance?: string | null
          reps?: string | null
          rest_seconds?: number | null
          sets?: number | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      session_media: {
        Row: {
          appointment_id: string
          caption: string | null
          created_at: string
          id: string
          media_type: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          appointment_id: string
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          appointment_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      current_patient_client_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "patient"
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
      app_role: ["admin", "patient"],
    },
  },
} as const
