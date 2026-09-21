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
      collaborateurs: {
        Row: {
          actif: boolean
          created_at: string
          departement_id: string | null
          departements_geres_ids: string[]
          fonction: string | null
          id: string
          matricule: string
          nom: string
          prenom: string
          rayon_id: string | null
          rayons_geres_ids: string[]
          telephone: string | null
        }
        Insert: {
          actif?: boolean
          created_at?: string
          departement_id?: string | null
          departements_geres_ids?: string[]
          fonction?: string | null
          id?: string
          matricule: string
          nom: string
          prenom: string
          rayon_id?: string | null
          rayons_geres_ids?: string[]
          telephone?: string | null
        }
        Update: {
          actif?: boolean
          created_at?: string
          departement_id?: string | null
          departements_geres_ids?: string[]
          fonction?: string | null
          id?: string
          matricule?: string
          nom?: string
          prenom?: string
          rayon_id?: string | null
          rayons_geres_ids?: string[]
          telephone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborateurs_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborateurs_rayon_id_fkey"
            columns: ["rayon_id"]
            isOneToOne: false
            referencedRelation: "rayons"
            referencedColumns: ["id"]
          },
        ]
      }
      departements: {
        Row: {
          code: string
          created_at: string
          id: string
          nom: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          nom: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          nom?: string
        }
        Relationships: []
      }
      permanence_horaires: {
        Row: {
          heure_debut: string
          heure_fin: string
          poste: string
          updated_at: string | null
        }
        Insert: {
          heure_debut: string
          heure_fin: string
          poste: string
          updated_at?: string | null
        }
        Update: {
          heure_debut?: string
          heure_fin?: string
          poste?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      permanence_lignes: {
        Row: {
          collaborateur_id: string
          id: string
          jour: string
          planning_id: string
          poste: string
        }
        Insert: {
          collaborateur_id: string
          id?: string
          jour: string
          planning_id: string
          poste?: string
        }
        Update: {
          collaborateur_id?: string
          id?: string
          jour?: string
          planning_id?: string
          poste?: string
        }
        Relationships: [
          {
            foreignKeyName: "permanence_lignes_collaborateur_id_fkey"
            columns: ["collaborateur_id"]
            isOneToOne: false
            referencedRelation: "collaborateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permanence_lignes_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "plannings_permanence"
            referencedColumns: ["id"]
          },
        ]
      }
      permanence_membres: {
        Row: {
          collaborateur_id: string
          id: string
          planning_id: string
        }
        Insert: {
          collaborateur_id: string
          id?: string
          planning_id: string
        }
        Update: {
          collaborateur_id?: string
          id?: string
          planning_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permanence_membres_collaborateur_id_fkey"
            columns: ["collaborateur_id"]
            isOneToOne: false
            referencedRelation: "collaborateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permanence_membres_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "plannings_permanence"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_encadrement_lignes: {
        Row: {
          collaborateur_id: string
          id: string
          jour: string
          planning_id: string
          poste: string
        }
        Insert: {
          collaborateur_id: string
          id?: string
          jour: string
          planning_id: string
          poste?: string
        }
        Update: {
          collaborateur_id?: string
          id?: string
          jour?: string
          planning_id?: string
          poste?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_encadrement_lignes_collaborateur_id_fkey"
            columns: ["collaborateur_id"]
            isOneToOne: false
            referencedRelation: "collaborateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_encadrement_lignes_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "plannings_encadrement"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_lignes: {
        Row: {
          collaborateur_id: string
          id: string
          jour: string
          planning_id: string
          poste: string
        }
        Insert: {
          collaborateur_id: string
          id?: string
          jour: string
          planning_id: string
          poste?: string
        }
        Update: {
          collaborateur_id?: string
          id?: string
          jour?: string
          planning_id?: string
          poste?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_lignes_collaborateur_id_fkey"
            columns: ["collaborateur_id"]
            isOneToOne: false
            referencedRelation: "collaborateurs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_lignes_planning_id_fkey"
            columns: ["planning_id"]
            isOneToOne: false
            referencedRelation: "plannings"
            referencedColumns: ["id"]
          },
        ]
      }
      plannings: {
        Row: {
          commentaire: string | null
          created_at: string
          created_by: string | null
          id: string
          rayon_id: string
          semaine_debut: string
          statut: string
          valide_at: string | null
          valide_par: string | null
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rayon_id: string
          semaine_debut: string
          statut?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          rayon_id?: string
          semaine_debut?: string
          statut?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plannings_rayon_id_fkey"
            columns: ["rayon_id"]
            isOneToOne: false
            referencedRelation: "rayons"
            referencedColumns: ["id"]
          },
        ]
      }
      plannings_encadrement: {
        Row: {
          commentaire: string | null
          created_at: string
          created_by: string | null
          departement_id: string
          id: string
          semaine_debut: string
          statut: string
          valide_at: string | null
          valide_par: string | null
        }
        Insert: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          departement_id: string
          id?: string
          semaine_debut: string
          statut?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Update: {
          commentaire?: string | null
          created_at?: string
          created_by?: string | null
          departement_id?: string
          id?: string
          semaine_debut?: string
          statut?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plannings_encadrement_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
        ]
      }
      plannings_permanence: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          semaine_debut: string
          statut: string
          type: string
          valide_at: string | null
          valide_par: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          semaine_debut: string
          statut?: string
          type?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          semaine_debut?: string
          statut?: string
          type?: string
          valide_at?: string | null
          valide_par?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          actif: boolean
          created_at: string
          departement_id: string | null
          departement_ids: string[]
          id: string
          nom: string
          prenom: string
          rayon_id: string | null
          rayon_ids: string[]
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          actif?: boolean
          created_at?: string
          departement_id?: string | null
          departement_ids?: string[]
          id: string
          nom: string
          prenom: string
          rayon_id?: string | null
          rayon_ids?: string[]
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          actif?: boolean
          created_at?: string
          departement_id?: string | null
          departement_ids?: string[]
          id?: string
          nom?: string
          prenom?: string
          rayon_id?: string | null
          rayon_ids?: string[]
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_rayon_id_fkey"
            columns: ["rayon_id"]
            isOneToOne: false
            referencedRelation: "rayons"
            referencedColumns: ["id"]
          },
        ]
      }
      rayons: {
        Row: {
          actif: boolean
          created_at: string
          departement_id: string
          id: string
          nom: string
          numero: string | null
        }
        Insert: {
          actif?: boolean
          created_at?: string
          departement_id: string
          id?: string
          nom: string
          numero?: string | null
        }
        Update: {
          actif?: boolean
          created_at?: string
          departement_id?: string
          id?: string
          nom?: string
          numero?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rayons_departement_id_fkey"
            columns: ["departement_id"]
            isOneToOne: false
            referencedRelation: "departements"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_departement_id: { Args: never; Returns: string }
      current_departement_ids: { Args: never; Returns: string[] }
      current_rayon_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      user_role: "administrateur" | "chef_departement" | "chef_rayon" | "accueil"
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
      user_role: ["administrateur", "chef_departement", "chef_rayon", "accueil"],
    },
  },
} as const
