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
      barrios: {
        Row: {
          city_id: string
          id: string
          name: string
          opened_at: string | null
          ordinal: number
          population: number
          status: Database["public"]["Enums"]["barrio_status_t"]
          streets_state: number
          streets_updated_at: string | null
        }
        Insert: {
          city_id: string
          id?: string
          name: string
          opened_at?: string | null
          ordinal: number
          population?: number
          status?: Database["public"]["Enums"]["barrio_status_t"]
          streets_state: number
          streets_updated_at?: string | null
        }
        Update: {
          city_id?: string
          id?: string
          name?: string
          opened_at?: string | null
          ordinal?: number
          population?: number
          status?: Database["public"]["Enums"]["barrio_status_t"]
          streets_state?: number
          streets_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "barrios_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          config: Json
          id: string
          name: string
          opened_at: string
          timezone: string
        }
        Insert: {
          config: Json
          id?: string
          name: string
          opened_at?: string
          timezone?: string
        }
        Update: {
          config?: Json
          id?: string
          name?: string
          opened_at?: string
          timezone?: string
        }
        Relationships: []
      }
      construction_helps: {
        Row: {
          construction_id: string
          created_at: string
          helper_id: string
        }
        Insert: {
          construction_id: string
          created_at?: string
          helper_id: string
        }
        Update: {
          construction_id?: string
          created_at?: string
          helper_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "construction_helps_construction_id_fkey"
            columns: ["construction_id"]
            isOneToOne: false
            referencedRelation: "constructions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_helps_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      constructions: {
        Row: {
          building_type: Database["public"]["Enums"]["building_t"]
          completed_at: string | null
          ends_at: string
          id: string
          lot_id: string
          started_at: string
          target_level: number
        }
        Insert: {
          building_type: Database["public"]["Enums"]["building_t"]
          completed_at?: string | null
          ends_at: string
          id?: string
          lot_id: string
          started_at?: string
          target_level: number
        }
        Update: {
          building_type?: Database["public"]["Enums"]["building_t"]
          completed_at?: string | null
          ends_at?: string
          id?: string
          lot_id?: string
          started_at?: string
          target_level?: number
        }
        Relationships: [
          {
            foreignKeyName: "constructions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor_id: string | null
          city_id: string
          created_at: string
          id: number
          lot_id: string | null
          payload: Json
          target_player_id: string | null
          type: string
        }
        Insert: {
          actor_id?: string | null
          city_id: string
          created_at?: string
          id?: number
          lot_id?: string | null
          payload?: Json
          target_player_id?: string | null
          type: string
        }
        Update: {
          actor_id?: string | null
          city_id?: string
          created_at?: string
          id?: number
          lot_id?: string | null
          payload?: Json
          target_player_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_target_player_id_fkey"
            columns: ["target_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          amount: number
          city_id: string
          created_at: string
          from_player: string
          id: string
          material: Database["public"]["Enums"]["material_t"]
          to_player: string
        }
        Insert: {
          amount: number
          city_id: string
          created_at?: string
          from_player: string
          id?: string
          material: Database["public"]["Enums"]["material_t"]
          to_player: string
        }
        Update: {
          amount?: number
          city_id?: string
          created_at?: string
          from_player?: string
          id?: string
          material?: Database["public"]["Enums"]["material_t"]
          to_player?: string
        }
        Relationships: [
          {
            foreignKeyName: "gifts_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_from_player_fkey"
            columns: ["from_player"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gifts_to_player_fkey"
            columns: ["to_player"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      inventories: {
        Row: {
          energia: number
          ladrillo: number
          madera: number
          player_id: string
        }
        Insert: {
          energia?: number
          ladrillo?: number
          madera?: number
          player_id: string
        }
        Update: {
          energia?: number
          ladrillo?: number
          madera?: number
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventories_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          city_id: string
          created_at: string
          expires_at: string
          inviter_id: string | null
          lot_hint: string | null
          token: string
          used_by: string | null
        }
        Insert: {
          city_id: string
          created_at?: string
          expires_at?: string
          inviter_id?: string | null
          lot_hint?: string | null
          token?: string
          used_by?: string | null
        }
        Update: {
          city_id?: string
          created_at?: string
          expires_at?: string
          inviter_id?: string | null
          lot_hint?: string | null
          token?: string
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_lot_hint_fkey"
            columns: ["lot_hint"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_cares: {
        Row: {
          carer_id: string
          created_at: string
          id: string
          lot_id: string
        }
        Insert: {
          carer_id: string
          created_at?: string
          id?: string
          lot_id: string
        }
        Update: {
          carer_id?: string
          created_at?: string
          id?: string
          lot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_cares_carer_id_fkey"
            columns: ["carer_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_cares_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_visits: {
        Row: {
          created_at: string
          day: string
          lot_id: string
          visitor_id: string
        }
        Insert: {
          created_at?: string
          day: string
          lot_id: string
          visitor_id: string
        }
        Update: {
          created_at?: string
          day?: string
          lot_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_visits_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_visits_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      lots: {
        Row: {
          barrio_id: string
          building_type: Database["public"]["Enums"]["building_t"] | null
          care_count: number
          care_days: number
          city_id: string
          claimed_at: string | null
          color: string | null
          id: string
          level: number
          name: string | null
          owner_id: string | null
          production_collected_at: string | null
          rent_material: Database["public"]["Enums"]["material_t"] | null
          state: Database["public"]["Enums"]["lot_state_t"]
          status: Database["public"]["Enums"]["lot_status_t"]
          x: number
          y: number
        }
        Insert: {
          barrio_id: string
          building_type?: Database["public"]["Enums"]["building_t"] | null
          care_count?: number
          care_days?: number
          city_id: string
          claimed_at?: string | null
          color?: string | null
          id?: string
          level?: number
          name?: string | null
          owner_id?: string | null
          production_collected_at?: string | null
          rent_material?: Database["public"]["Enums"]["material_t"] | null
          state?: Database["public"]["Enums"]["lot_state_t"]
          status?: Database["public"]["Enums"]["lot_status_t"]
          x: number
          y: number
        }
        Update: {
          barrio_id?: string
          building_type?: Database["public"]["Enums"]["building_t"] | null
          care_count?: number
          care_days?: number
          city_id?: string
          claimed_at?: string | null
          color?: string | null
          id?: string
          level?: number
          name?: string | null
          owner_id?: string | null
          production_collected_at?: string | null
          rent_material?: Database["public"]["Enums"]["material_t"] | null
          state?: Database["public"]["Enums"]["lot_state_t"]
          status?: Database["public"]["Enums"]["lot_status_t"]
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "lots_barrio_id_fkey"
            columns: ["barrio_id"]
            isOneToOne: false
            referencedRelation: "barrios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_outbox: {
        Row: {
          created_at: string
          id: number
          payload: Json
          player_id: string
          sent_at: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: number
          payload?: Json
          player_id: string
          sent_at?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: number
          payload?: Json
          player_id?: string
          sent_at?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_outbox_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          city_id: string
          created_at: string
          display_name: string
          id: string
          invited_by: string | null
          is_admin: boolean
          jornadas: number
          last_seen_at: string
        }
        Insert: {
          city_id: string
          created_at?: string
          display_name: string
          id: string
          invited_by?: string | null
          is_admin?: boolean
          jornadas?: number
          last_seen_at?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          display_name?: string
          id?: string
          invited_by?: string | null
          is_admin?: boolean
          jornadas?: number
          last_seen_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      public_work_contributions: {
        Row: {
          created_at: string
          energia: number
          id: string
          ladrillo: number
          madera: number
          player_id: string
          public_work_id: string
        }
        Insert: {
          created_at?: string
          energia?: number
          id?: string
          ladrillo?: number
          madera?: number
          player_id: string
          public_work_id: string
        }
        Update: {
          created_at?: string
          energia?: number
          id?: string
          ladrillo?: number
          madera?: number
          player_id?: string
          public_work_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_work_contributions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_work_contributions_public_work_id_fkey"
            columns: ["public_work_id"]
            isOneToOne: false
            referencedRelation: "public_works"
            referencedColumns: ["id"]
          },
        ]
      }
      public_works: {
        Row: {
          barrio_id: string
          city_id: string
          completed_at: string | null
          cost: Json
          id: string
          name: string
          progress: Json
          status: Database["public"]["Enums"]["work_status_t"]
          x: number
          y: number
        }
        Insert: {
          barrio_id: string
          city_id: string
          completed_at?: string | null
          cost: Json
          id?: string
          name: string
          progress?: Json
          status?: Database["public"]["Enums"]["work_status_t"]
          x: number
          y: number
        }
        Update: {
          barrio_id?: string
          city_id?: string
          completed_at?: string | null
          cost?: Json
          id?: string
          name?: string
          progress?: Json
          status?: Database["public"]["Enums"]["work_status_t"]
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "public_works_barrio_id_fkey"
            columns: ["barrio_id"]
            isOneToOne: false
            referencedRelation: "barrios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_works_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_city_stats: { Args: never; Returns: Json }
      admin_force_open_barrio: {
        Args: { p_barrio_id: string }
        Returns: undefined
      }
      admin_invitations: { Args: never; Returns: Json }
      admin_mark_notified: { Args: { p_ids: number[] }; Returns: number }
      admin_open_barrio: {
        Args: { p_barrio_id: string; p_reason?: string }
        Returns: undefined
      }
      admin_pending_notifications: { Args: { p_limit?: number }; Returns: Json }
      build: {
        Args: {
          p_building_type: Database["public"]["Enums"]["building_t"]
          p_rent_material?: Database["public"]["Enums"]["material_t"]
        }
        Returns: {
          building_type: Database["public"]["Enums"]["building_t"]
          completed_at: string | null
          ends_at: string
          id: string
          lot_id: string
          started_at: string
          target_level: number
        }
        SetofOptions: {
          from: "*"
          to: "constructions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      care_lot: {
        Args: { p_lot_id: string }
        Returns: {
          barrio_id: string
          building_type: Database["public"]["Enums"]["building_t"] | null
          care_count: number
          care_days: number
          city_id: string
          claimed_at: string | null
          color: string | null
          id: string
          level: number
          name: string | null
          owner_id: string | null
          production_collected_at: string | null
          rent_material: Database["public"]["Enums"]["material_t"] | null
          state: Database["public"]["Enums"]["lot_state_t"]
          status: Database["public"]["Enums"]["lot_status_t"]
          x: number
          y: number
        }
        SetofOptions: {
          from: "*"
          to: "lots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_lot: {
        Args: {
          p_color: string
          p_display_name: string
          p_lot_id: string
          p_lot_name: string
          p_token: string
        }
        Returns: {
          barrio_id: string
          building_type: Database["public"]["Enums"]["building_t"] | null
          care_count: number
          care_days: number
          city_id: string
          claimed_at: string | null
          color: string | null
          id: string
          level: number
          name: string | null
          owner_id: string | null
          production_collected_at: string | null
          rent_material: Database["public"]["Enums"]["material_t"] | null
          state: Database["public"]["Enums"]["lot_state_t"]
          status: Database["public"]["Enums"]["lot_status_t"]
          x: number
          y: number
        }
        SetofOptions: {
          from: "*"
          to: "lots"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      contribute: {
        Args: {
          p_e?: number
          p_l?: number
          p_m?: number
          p_public_work_id: string
        }
        Returns: {
          barrio_id: string
          city_id: string
          completed_at: string | null
          cost: Json
          id: string
          name: string
          progress: Json
          status: Database["public"]["Enums"]["work_status_t"]
          x: number
          y: number
        }
        SetofOptions: {
          from: "*"
          to: "public_works"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_invitation: { Args: never; Returns: string }
      fx_barrio_attractiveness: { Args: { p_barrio_id: string }; Returns: Json }
      fx_barrio_capacity: { Args: { p_barrio_id: string }; Returns: number }
      fx_collect_production: { Args: { p_player: string }; Returns: Json }
      fx_config: { Args: { p_city: string }; Returns: Json }
      fx_effective_rate: {
        Args: { p_lot: Database["public"]["Tables"]["lots"]["Row"] }
        Returns: number
      }
      fx_log_event: {
        Args: {
          p_actor: string
          p_city: string
          p_lot: string
          p_payload?: Json
          p_target: string
          p_type: string
        }
        Returns: undefined
      }
      fx_lot_rate: {
        Args: { p_lot: Database["public"]["Tables"]["lots"]["Row"] }
        Returns: number
      }
      fx_lot_state: {
        Args: { p_lot: Database["public"]["Tables"]["lots"]["Row"] }
        Returns: Database["public"]["Enums"]["lot_state_t"]
      }
      fx_me: {
        Args: never
        Returns: {
          city_id: string
          created_at: string
          display_name: string
          id: string
          invited_by: string | null
          is_admin: boolean
          jornadas: number
          last_seen_at: string
        }
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fx_notify: {
        Args: { p_payload?: Json; p_player: string; p_type: string }
        Returns: undefined
      }
      fx_now_local: { Args: { p_city: string }; Returns: string }
      fx_require_admin: {
        Args: never
        Returns: {
          city_id: string
          created_at: string
          display_name: string
          id: string
          invited_by: string | null
          is_admin: boolean
          jornadas: number
          last_seen_at: string
        }
        SetofOptions: {
          from: "*"
          to: "players"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fx_spend_jornada: { Args: { p_player: string }; Returns: undefined }
      fx_spend_materials: {
        Args: { p_e: number; p_l: number; p_m: number; p_player: string }
        Returns: undefined
      }
      fx_streets_state: { Args: { p_barrio_id: string }; Returns: number }
      get_summary: {
        Args: { p_since: string }
        Returns: {
          actor_id: string | null
          city_id: string
          created_at: string
          id: number
          lot_id: string | null
          payload: Json
          target_player_id: string | null
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      gift: {
        Args: {
          p_amount: number
          p_material: Database["public"]["Enums"]["material_t"]
          p_to_player: string
        }
        Returns: undefined
      }
      heartbeat: { Args: never; Returns: Json }
      help_construction: {
        Args: { p_construction_id: string }
        Returns: {
          building_type: Database["public"]["Enums"]["building_t"]
          completed_at: string | null
          ends_at: string
          id: string
          lot_id: string
          started_at: string
          target_level: number
        }
        SetofOptions: {
          from: "*"
          to: "constructions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      invitation_info: { Args: { p_token: string }; Returns: Json }
      invitation_map: { Args: { p_token: string }; Returns: Json }
      job_check_barrio_opening: { Args: never; Returns: undefined }
      job_complete_constructions: { Args: never; Returns: undefined }
      job_refill_jornadas: { Args: never; Returns: undefined }
      job_update_lot_states: { Args: never; Returns: undefined }
      job_update_population: { Args: never; Returns: undefined }
      maintain_streets: {
        Args: { p_barrio_id: string }
        Returns: {
          city_id: string
          id: string
          name: string
          opened_at: string | null
          ordinal: number
          population: number
          status: Database["public"]["Enums"]["barrio_status_t"]
          streets_state: number
          streets_updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "barrios"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_city_id: { Args: never; Returns: string }
      recolor_lot: { Args: { p_color: string }; Returns: undefined }
      rename_lot: { Args: { p_name: string }; Returns: undefined }
      visit_lot: { Args: { p_lot_id: string }; Returns: undefined }
    }
    Enums: {
      barrio_status_t: "cerrado" | "abierto"
      building_t:
        | "ladrilleria"
        | "aserradero"
        | "generador"
        | "plaza"
        | "residencial"
      lot_state_t: "activo" | "descuidado" | "abandonado"
      lot_status_t: "cerrado" | "libre" | "ocupado"
      material_t: "ladrillo" | "madera" | "energia"
      work_status_t: "en_curso" | "completada"
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
      barrio_status_t: ["cerrado", "abierto"],
      building_t: [
        "ladrilleria",
        "aserradero",
        "generador",
        "plaza",
        "residencial",
      ],
      lot_state_t: ["activo", "descuidado", "abandonado"],
      lot_status_t: ["cerrado", "libre", "ocupado"],
      material_t: ["ladrillo", "madera", "energia"],
      work_status_t: ["en_curso", "completada"],
    },
  },
} as const
