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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      children: {
        Row: {
          active: boolean
          avoidances: string[] | null
          created_at: string
          current_year: number
          date_of_birth: string
          default_archetype: string | null
          deleted_at: string | null
          family_id: string
          family_notes: string | null
          favorites: Json | null
          id: string
          interests: string[] | null
          is_one_time: boolean
          name: string
          preferred_name: string | null
          pronouns: Database["public"]["Enums"]["pronouns_enum"]
          pronouns_other: string | null
          reading_level: Database["public"]["Enums"]["reading_level_enum"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          avoidances?: string[] | null
          created_at?: string
          current_year?: number
          date_of_birth: string
          default_archetype?: string | null
          deleted_at?: string | null
          family_id: string
          family_notes?: string | null
          favorites?: Json | null
          id?: string
          interests?: string[] | null
          is_one_time?: boolean
          name: string
          preferred_name?: string | null
          pronouns?: Database["public"]["Enums"]["pronouns_enum"]
          pronouns_other?: string | null
          reading_level?: Database["public"]["Enums"]["reading_level_enum"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          avoidances?: string[] | null
          created_at?: string
          current_year?: number
          date_of_birth?: string
          default_archetype?: string | null
          deleted_at?: string | null
          family_id?: string
          family_notes?: string | null
          favorites?: Json | null
          id?: string
          interests?: string[] | null
          is_one_time?: boolean
          name?: string
          preferred_name?: string | null
          pronouns?: Database["public"]["Enums"]["pronouns_enum"]
          pronouns_other?: string | null
          reading_level?: Database["public"]["Enums"]["reading_level_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_calendar: {
        Row: {
          created_at: string
          delivery_target: string
          harvest_closes: string
          harvest_opens: string
          id: string
          production_start: string
          quarter: number
          season: Database["public"]["Enums"]["season_enum"]
          ship_by_date: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          delivery_target: string
          harvest_closes: string
          harvest_opens: string
          id?: string
          production_start: string
          quarter: number
          season: Database["public"]["Enums"]["season_enum"]
          ship_by_date: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          delivery_target?: string
          harvest_closes?: string
          harvest_opens?: string
          id?: string
          production_start?: string
          quarter?: number
          season?: Database["public"]["Enums"]["season_enum"]
          ship_by_date?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      episodes: {
        Row: {
          child_id: string
          created_at: string
          dedication: string | null
          delivered_at: string | null
          episode_number: number
          final_page: string | null
          harvest_id: string
          id: string
          illustration_paths: string[] | null
          illustration_status: Database["public"]["Enums"]["illustration_status_enum"]
          parent_flag_message: string | null
          parent_note: string | null
          preview_deadline: string | null
          print_approved_at: string | null
          print_file_path: string | null
          print_status: Database["public"]["Enums"]["print_status_enum"]
          quarter: number
          scenes: Json[] | null
          shipped_at: string | null
          status: Database["public"]["Enums"]["episode_status_enum"]
          story_approved_at: string | null
          story_approved_by: string | null
          story_bible_id: string | null
          target_delivery_date: string | null
          title: string | null
          tracking_number: string | null
          updated_at: string
          year: number
        }
        Insert: {
          child_id: string
          created_at?: string
          dedication?: string | null
          delivered_at?: string | null
          episode_number: number
          final_page?: string | null
          harvest_id: string
          id?: string
          illustration_paths?: string[] | null
          illustration_status?: Database["public"]["Enums"]["illustration_status_enum"]
          parent_flag_message?: string | null
          parent_note?: string | null
          preview_deadline?: string | null
          print_approved_at?: string | null
          print_file_path?: string | null
          print_status?: Database["public"]["Enums"]["print_status_enum"]
          quarter: number
          scenes?: Json[] | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["episode_status_enum"]
          story_approved_at?: string | null
          story_approved_by?: string | null
          story_bible_id?: string | null
          target_delivery_date?: string | null
          title?: string | null
          tracking_number?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          child_id?: string
          created_at?: string
          dedication?: string | null
          delivered_at?: string | null
          episode_number?: number
          final_page?: string | null
          harvest_id?: string
          id?: string
          illustration_paths?: string[] | null
          illustration_status?: Database["public"]["Enums"]["illustration_status_enum"]
          parent_flag_message?: string | null
          parent_note?: string | null
          preview_deadline?: string | null
          print_approved_at?: string | null
          print_file_path?: string | null
          print_status?: Database["public"]["Enums"]["print_status_enum"]
          quarter?: number
          scenes?: Json[] | null
          shipped_at?: string | null
          status?: Database["public"]["Enums"]["episode_status_enum"]
          story_approved_at?: string | null
          story_approved_by?: string | null
          story_bible_id?: string | null
          target_delivery_date?: string | null
          title?: string | null
          tracking_number?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "episodes_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_harvest_id_fkey"
            columns: ["harvest_id"]
            isOneToOne: false
            referencedRelation: "harvests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_story_bible_id_fkey"
            columns: ["story_bible_id"]
            isOneToOne: false
            referencedRelation: "story_bibles"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          billing_cycle_start: string | null
          city: string | null
          country: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_founding_member: boolean
          referral_code: string | null
          referred_by: string | null
          shipping_name: string | null
          state: string | null
          stripe_customer_id: string | null
          subscription_plan: string | null
          subscription_price: number | null
          subscription_status: Database["public"]["Enums"]["subscription_status_enum"]
          subscription_tier: Database["public"]["Enums"]["subscription_tier_enum"]
          subscription_type: string
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          billing_cycle_start?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_founding_member?: boolean
          referral_code?: string | null
          referred_by?: string | null
          shipping_name?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          subscription_plan?: string | null
          subscription_price?: number | null
          subscription_status?: Database["public"]["Enums"]["subscription_status_enum"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier_enum"]
          subscription_type?: string
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          billing_cycle_start?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_founding_member?: boolean
          referral_code?: string | null
          referred_by?: string | null
          shipping_name?: string | null
          state?: string | null
          stripe_customer_id?: string | null
          subscription_plan?: string | null
          subscription_price?: number | null
          subscription_status?: Database["public"]["Enums"]["subscription_status_enum"]
          subscription_tier?: Database["public"]["Enums"]["subscription_tier_enum"]
          subscription_type?: string
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "families_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_claims: {
        Row: {
          claim_token: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          expires_at: string
          family_id: string
          id: string
          recipient_email: string | null
          status: Database["public"]["Enums"]["gift_claim_status_enum"]
          updated_at: string
        }
        Insert: {
          claim_token?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string
          family_id: string
          id?: string
          recipient_email?: string | null
          status?: Database["public"]["Enums"]["gift_claim_status_enum"]
          updated_at?: string
        }
        Update: {
          claim_token?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          expires_at?: string
          family_id?: string
          id?: string
          recipient_email?: string | null
          status?: Database["public"]["Enums"]["gift_claim_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_claims_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      harvests: {
        Row: {
          character_archetype: string | null
          child_id: string
          created_at: string
          current_interests: string[] | null
          face_ref_generated: boolean
          face_ref_path: string | null
          id: string
          memory_1: string | null
          memory_2: string | null
          milestone_description: string | null
          notable_notes: string | null
          photo_captions: string[] | null
          photo_count: number | null
          photo_paths: string[] | null
          photos_deleted_at: string | null
          quarter: number
          season: Database["public"]["Enums"]["season_enum"]
          status: Database["public"]["Enums"]["harvest_status_enum"]
          submitted_at: string | null
          updated_at: string
          window_closes_at: string | null
          window_opens_at: string | null
          year: number
        }
        Insert: {
          character_archetype?: string | null
          child_id: string
          created_at?: string
          current_interests?: string[] | null
          face_ref_generated?: boolean
          face_ref_path?: string | null
          id?: string
          memory_1?: string | null
          memory_2?: string | null
          milestone_description?: string | null
          notable_notes?: string | null
          photo_captions?: string[] | null
          photo_count?: number | null
          photo_paths?: string[] | null
          photos_deleted_at?: string | null
          quarter: number
          season: Database["public"]["Enums"]["season_enum"]
          status?: Database["public"]["Enums"]["harvest_status_enum"]
          submitted_at?: string | null
          updated_at?: string
          window_closes_at?: string | null
          window_opens_at?: string | null
          year: number
        }
        Update: {
          character_archetype?: string | null
          child_id?: string
          created_at?: string
          current_interests?: string[] | null
          face_ref_generated?: boolean
          face_ref_path?: string | null
          id?: string
          memory_1?: string | null
          memory_2?: string | null
          milestone_description?: string | null
          notable_notes?: string | null
          photo_captions?: string[] | null
          photo_count?: number | null
          photo_paths?: string[] | null
          photos_deleted_at?: string | null
          quarter?: number
          season?: Database["public"]["Enums"]["season_enum"]
          status?: Database["public"]["Enums"]["harvest_status_enum"]
          submitted_at?: string | null
          updated_at?: string
          window_closes_at?: string | null
          window_opens_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "harvests_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          created_at: string
          email: string
          family_id: string
          first_name: string | null
          id: string
          last_name: string | null
          notification_preferences: Json | null
          phone: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          family_id: string
          first_name?: string | null
          id: string
          last_name?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          family_id?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          notification_preferences?: Json | null
          phone?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      story_bibles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          child_id: string
          companion: Json | null
          created_at: string
          episode_outlines: Json[] | null
          hero_profile: Json | null
          id: string
          season_arc: Json | null
          season_title: string | null
          status: Database["public"]["Enums"]["story_bible_status_enum"]
          updated_at: string
          world_profile: Json | null
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          child_id: string
          companion?: Json | null
          created_at?: string
          episode_outlines?: Json[] | null
          hero_profile?: Json | null
          id?: string
          season_arc?: Json | null
          season_title?: string | null
          status?: Database["public"]["Enums"]["story_bible_status_enum"]
          updated_at?: string
          world_profile?: Json | null
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          child_id?: string
          companion?: Json | null
          created_at?: string
          episode_outlines?: Json[] | null
          hero_profile?: Json | null
          id?: string
          season_arc?: Json | null
          season_title?: string | null
          status?: Database["public"]["Enums"]["story_bible_status_enum"]
          updated_at?: string
          world_profile?: Json | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_bibles_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_family_id: { Args: never; Returns: string }
    }
    Enums: {
      episode_status_enum:
        | "draft"
        | "story_review"
        | "illustration_review"
        | "book_ready"
        | "parent_approved"
        | "parent_flagged"
        | "approved"
        | "printing"
        | "shipped"
        | "delivered"
      gift_claim_status_enum: "pending" | "claimed" | "expired"
      harvest_status_enum:
        | "pending"
        | "submitted"
        | "processing"
        | "complete"
        | "missed"
      illustration_status_enum:
        | "pending"
        | "generating"
        | "review"
        | "approved"
        | "rejected"
      print_status_enum:
        | "pending"
        | "submitted"
        | "printing"
        | "shipped"
        | "delivered"
      pronouns_enum: "boy" | "girl"
      reading_level_enum:
        | "pre_reader"
        | "early_reader"
        | "independent"
        | "chapter_book"
      season_enum: "spring" | "summer" | "autumn" | "birthday"
      story_bible_status_enum: "draft" | "approved" | "in_use"
      subscription_status_enum:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "paused"
      subscription_tier_enum: "physical_digital"
      subscription_type_enum: "none" | "digital_only" | "physical_digital"
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
      episode_status_enum: [
        "draft",
        "story_review",
        "illustration_review",
        "book_ready",
        "parent_approved",
        "parent_flagged",
        "approved",
        "printing",
        "shipped",
        "delivered",
      ],
      gift_claim_status_enum: ["pending", "claimed", "expired"],
      harvest_status_enum: [
        "pending",
        "submitted",
        "processing",
        "complete",
        "missed",
      ],
      illustration_status_enum: [
        "pending",
        "generating",
        "review",
        "approved",
        "rejected",
      ],
      print_status_enum: [
        "pending",
        "submitted",
        "printing",
        "shipped",
        "delivered",
      ],
      pronouns_enum: ["boy", "girl"],
      reading_level_enum: [
        "pre_reader",
        "early_reader",
        "independent",
        "chapter_book",
      ],
      season_enum: ["spring", "summer", "autumn", "birthday"],
      story_bible_status_enum: ["draft", "approved", "in_use"],
      subscription_status_enum: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "paused",
      ],
      subscription_tier_enum: ["physical_digital"],
      subscription_type_enum: ["none", "digital_only", "physical_digital"],
    },
  },
} as const
