export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// These DB helpers intentionally permit unknown additional columns from RPC/view expansion.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableRow<T> = T & { [key: string]: any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableInsert<T> = Partial<T> & { [key: string]: any }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TableUpdate<T> = Partial<T> & { [key: string]: any }

type WorkoutStatus = 'in_progress' | 'completed'

export type Database = {
  public: {
    Tables: {
      exercise_definitions: {
        Row: TableRow<{
          id: string
          name: string
          name_norm?: string | null
          slug: string
          aliases: string[]
          muscle_group?: string | null
          equipment?: string | null
          scope: string
          owner_user_id?: string | null
          category: string
          tracking_mode: string
          exercise_type: string
          primary_targets: string[]
          secondary_targets: string[]
          updated_at?: string | null
          deleted_at?: string | null
          client_id?: string | null
          created_at?: string | null
        }>
        Insert: TableInsert<{
          id?: string
          name: string
          slug: string
          aliases?: string[]
          muscle_group?: string | null
          equipment?: string | null
          scope?: string
          owner_user_id?: string | null
          category?: string
          tracking_mode?: string
          exercise_type?: string
          primary_targets?: string[]
          secondary_targets?: string[]
          updated_at?: string | null
          deleted_at?: string | null
          client_id?: string | null
          created_at?: string | null
        }>
        Update: TableUpdate<{
          name?: string
          slug?: string
          aliases?: string[]
          muscle_group?: string | null
          equipment?: string | null
          scope?: string
          owner_user_id?: string | null
          category?: string
          tracking_mode?: string
          exercise_type?: string
          primary_targets?: string[]
          secondary_targets?: string[]
          updated_at?: string | null
          deleted_at?: string | null
          client_id?: string | null
          created_at?: string | null
        }>
        Relationships: []
      }
      exercise_favorites: {
        Row: TableRow<{
          user_id: string
          exercise_definition_id: string
          created_at?: string | null
        }>
        Insert: TableInsert<{
          user_id: string
          exercise_definition_id: string
          created_at?: string | null
        }>
        Update: TableUpdate<{
          user_id?: string
          exercise_definition_id?: string
          created_at?: string | null
        }>
        Relationships: []
      }
      workouts: {
        Row: TableRow<{
          id: string
          user_id: string
          client_uuid: string
          started_at?: string | null
          ended_at?: string | null
          status?: WorkoutStatus | null
          notes?: string | null
          effort_rating?: number | null
          session_note?: string | null
          created_at?: string | null
        }>
        Insert: TableInsert<{
          id?: string
          user_id: string
          client_uuid?: string
          started_at?: string | null
          ended_at?: string | null
          status?: WorkoutStatus | null
          notes?: string | null
          effort_rating?: number | null
          session_note?: string | null
          created_at?: string | null
        }>
        Update: TableUpdate<{
          user_id?: string
          client_uuid?: string
          started_at?: string | null
          ended_at?: string | null
          status?: WorkoutStatus | null
          notes?: string | null
          effort_rating?: number | null
          session_note?: string | null
          created_at?: string | null
        }>
        Relationships: []
      }
      workout_exercises: {
        Row: TableRow<{
          id: string
          workout_id: string
          client_uuid: string
          exercise_definition_id: string
          order_index: number
          notes?: string | null
          created_at?: string | null
          /** Optional: from projection/local only; DB does not store */
          superset_group_id?: string | null
          superset_order?: number | null
        }>
        Insert: TableInsert<{
          id?: string
          workout_id: string
          client_uuid?: string
          exercise_definition_id: string
          order_index: number
          notes?: string | null
          created_at?: string | null
        }>
        Update: TableUpdate<{
          workout_id?: string
          client_uuid?: string
          exercise_definition_id?: string
          order_index?: number
          notes?: string | null
          created_at?: string | null
        }>
        Relationships: []
      }
      workout_sets: {
        Row: TableRow<{
          id: string
          workout_exercise_id: string
          client_uuid: string
          set_index: number
          reps?: number | null
          weight?: number | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_m?: number | null
          is_weight_canonical?: boolean | null
          is_completed?: boolean | null
          created_at?: string | null
          /** Optional: from projection/local only; DB does not store */
          set_type?: string | null
          rir?: number | null
        }>
        Insert: TableInsert<{
          id?: string
          workout_exercise_id: string
          client_uuid?: string
          set_index: number
          reps?: number | null
          weight?: number | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_m?: number | null
          is_weight_canonical?: boolean | null
          is_completed?: boolean | null
          created_at?: string | null
        }>
        Update: TableUpdate<{
          workout_exercise_id?: string
          client_uuid?: string
          set_index?: number
          reps?: number | null
          weight?: number | null
          weight_kg?: number | null
          duration_seconds?: number | null
          distance_m?: number | null
          is_weight_canonical?: boolean | null
          is_completed?: boolean | null
          created_at?: string | null
        }>
        Relationships: []
      }
      routines: {
        Row: TableRow<{
          id: string
          user_id: string
          client_uuid: string
          name: string
          description?: string | null
          color?: string | null
          pinned?: boolean | null
          deleted_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Insert: TableInsert<{
          id?: string
          user_id: string
          client_uuid?: string
          name: string
          description?: string | null
          color?: string | null
          pinned?: boolean | null
          deleted_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Update: TableUpdate<{
          user_id?: string
          client_uuid?: string
          name?: string
          description?: string | null
          color?: string | null
          pinned?: boolean | null
          deleted_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Relationships: []
      }
      routine_items: {
        Row: TableRow<{
          id: string
          routine_id: string
          client_uuid: string
          order: number
          exercise_id: string
          sets?: number | null
          reps?: number | null
          rest?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Insert: TableInsert<{
          id?: string
          routine_id: string
          client_uuid?: string
          order: number
          exercise_id: string
          sets?: number | null
          reps?: number | null
          rest?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Update: TableUpdate<{
          routine_id?: string
          client_uuid?: string
          order?: number
          exercise_id?: string
          sets?: number | null
          reps?: number | null
          rest?: number | null
          notes?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Relationships: []
      }
      scheduled_routines: {
        Row: TableRow<{
          id: string
          user_id: string
          date: string
          routine_id: string
          status: string
          workout_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Insert: TableInsert<{
          id?: string
          user_id: string
          date: string
          routine_id: string
          status?: string
          workout_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Update: TableUpdate<{
          user_id?: string
          date?: string
          routine_id?: string
          status?: string
          workout_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Relationships: []
      }
      user_settings: {
        Row: TableRow<{
          user_id: string
          weekly_workouts_goal: number
          onboarding_completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Insert: TableInsert<{
          user_id: string
          weekly_workouts_goal?: number
          onboarding_completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Update: TableUpdate<{
          user_id?: string
          weekly_workouts_goal?: number
          onboarding_completed_at?: string | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Relationships: []
      }
      checkin_photos: {
        Row: TableRow<{
          checkin_id: string
          user_id: string
          taken_at: string
          pose: string
          photo_path: string
          width?: number | null
          height?: number | null
          notes?: string | null
          weight_kg?: number | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Insert: TableInsert<{
          checkin_id: string
          user_id: string
          taken_at: string
          pose?: string
          photo_path: string
          width?: number | null
          height?: number | null
          notes?: string | null
          weight_kg?: number | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Update: TableUpdate<{
          checkin_id?: string
          user_id?: string
          taken_at?: string
          pose?: string
          photo_path?: string
          width?: number | null
          height?: number | null
          notes?: string | null
          weight_kg?: number | null
          created_at?: string | null
          updated_at?: string | null
        }>
        Relationships: []
      }
      routine_favorites: {
        Row: TableRow<{
          user_id: string
          routine_id: string
          created_at?: string | null
        }>
        Insert: TableInsert<{
          user_id: string
          routine_id: string
          created_at?: string | null
        }>
        Update: TableUpdate<{
          user_id?: string
          routine_id?: string
          created_at?: string | null
        }>
        Relationships: []
      }
      google_calendar_connections: {
        Row: TableRow<{
          id: string
          user_id: string
          selected_calendar_id: string
          selected_calendar_summary: string | null
          sync_enabled: boolean
          status: string
          connected_at: string | null
          updated_at: string
          last_error: string | null
        }>
        Insert: TableInsert<{
          id?: string
          user_id: string
          selected_calendar_id?: string
          selected_calendar_summary?: string | null
          sync_enabled?: boolean
          status?: string
          connected_at?: string | null
          updated_at?: string
          last_error?: string | null
        }>
        Update: TableUpdate<{
          selected_calendar_id?: string
          selected_calendar_summary?: string | null
          sync_enabled?: boolean
          status?: string
          connected_at?: string | null
          updated_at?: string
          last_error?: string | null
        }>
        Relationships: []
      }
      scheduled_workout_calendar_links: {
        Row: TableRow<{
          id: string
          user_id: string
          scheduled_routine_id: string
          external_calendar_id: string
          external_event_id: string
          sync_status: string
          last_synced_at: string | null
          last_error: string | null
          created_at: string
          updated_at: string
        }>
        Insert: TableInsert<{
          id?: string
          user_id: string
          scheduled_routine_id: string
          external_calendar_id: string
          external_event_id: string
          sync_status?: string
          last_synced_at?: string | null
          last_error?: string | null
          created_at?: string
          updated_at?: string
        }>
        Update: TableUpdate<{
          external_calendar_id?: string
          external_event_id?: string
          sync_status?: string
          last_synced_at?: string | null
          last_error?: string | null
          updated_at?: string
        }>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_my_account: {
        Args: Record<string, never>
        Returns: void | null
      }
      get_last_exercise_performance: {
        Args: {
          target_exercise_definition_id: string
          exclude_workout_id?: string | null
        }
        Returns: {
          workout_id: string
          performed_at: string | null
          set_index: number
          reps: number
          weight: number
          weight_kg: number
          is_weight_canonical: boolean
        }[]
      }
      get_progress_exercise_prs: {
        Args: Record<string, never>
        Returns: {
          exercise_definition_id: string
          exercise_name: string
          workout_id: string
          performed_at: string | null
          reps: number
          weight: number
          weight_kg: number
          is_weight_canonical: boolean
          e1rm_kg: number
        }[]
      }
      get_progress_exercise_recent_occurrences: {
        Args: {
          target_exercise_definition_id: string
          occurrence_limit?: number | null
        }
        Returns: {
          exercise_definition_id: string
          exercise_name: string
          workout_id: string
          performed_at: string | null
          reps: number
          weight: number
          weight_kg: number
          is_weight_canonical: boolean
          e1rm_kg: number
        }[]
      }
      schedule_routine_for_date: {
        Args: { p_date: string; p_routine_id: string }
        Returns: Json
      }
      start_scheduled_workout: {
        Args: { p_date: string }
        Returns: Json
      }
      start_workout_from_routine: {
        Args: { p_routine_id: string }
        Returns:
          | {
              workout: Database['public']['Tables']['workouts']['Row']
              exercises: Database['public']['Tables']['workout_exercises']['Row'][]
            }
          | { error: string }
      }
    }
    Enums: {
      workout_status: WorkoutStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
