
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "approval_actions": {
                  Row: {
                    "action": string,"actor_id": string,"application_id": string,"created_at": string,"id": string,"remarks": string | null,"step_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id": string,"application_id": string,"created_at"?: string,"id"?: string,"remarks"?: string | null,"step_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string,"application_id"?: string,"created_at"?: string,"id"?: string,"remarks"?: string | null,"step_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_actions_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_actions_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "gate_pass_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_actions_step_id_fkey"
      columns: ["step_id"]
isOneToOne: false
      referencedRelation: "approval_steps"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_rules": {
                  Row: {
                    "chain": NonNullable<Json>,"created_at": string,"department_id": string | null,"id": string,"pass_validity_hours": number,"reason": Database["public"]['Enums']["gate_reason"],"requires_medical_document": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "chain": NonNullable<Json>,"created_at"?: string,"department_id"?: string | null,"id"?: string,"pass_validity_hours"?: number,"reason": Database["public"]['Enums']["gate_reason"],"requires_medical_document": boolean,"updated_at"?: string
                  }
                  Update: {
                    "chain"?: NonNullable<Json>,"created_at"?: string,"department_id"?: string | null,"id"?: string,"pass_validity_hours"?: number,"reason"?: Database["public"]['Enums']["gate_reason"],"requires_medical_document"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_rules_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                },"approval_steps": {
                  Row: {
                    "application_id": string,"approver_role": Database["public"]['Enums']["user_role"],"assigned_to": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"department_id": string,"id": string,"status": Database["public"]['Enums']["step_status"],"step_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"approver_role": Database["public"]['Enums']["user_role"],"assigned_to"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"department_id": string,"id"?: string,"status"?: Database["public"]['Enums']["step_status"],"step_order": number,"updated_at"?: string
                  }
                  Update: {
                    "application_id"?: string,"approver_role"?: Database["public"]['Enums']["user_role"],"assigned_to"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"department_id"?: string,"id"?: string,"status"?: Database["public"]['Enums']["step_status"],"step_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "approval_steps_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "gate_pass_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_steps_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_steps_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "approval_steps_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string,"entity_type": string,"id": string,"metadata": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id": string,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_logs_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"departments": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"gate_pass_applications": {
                  Row: {
                    "additional_info": string | null,"created_at": string,"decided_at": string | null,"department_id": string,"departure_at": string,"expected_return_at": string,"explanation": string,"id": string,"reason": Database["public"]['Enums']["gate_reason"],"status": Database["public"]['Enums']["app_status"],"student_id": string,"submitted_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "additional_info"?: string | null,"created_at"?: string,"decided_at"?: string | null,"department_id": string,"departure_at": string,"expected_return_at": string,"explanation": string,"id"?: string,"reason": Database["public"]['Enums']["gate_reason"],"status"?: Database["public"]['Enums']["app_status"],"student_id": string,"submitted_at"?: string,"updated_at"?: string
                  }
                  Update: {
                    "additional_info"?: string | null,"created_at"?: string,"decided_at"?: string | null,"department_id"?: string,"departure_at"?: string,"expected_return_at"?: string,"explanation"?: string,"id"?: string,"reason"?: Database["public"]['Enums']["gate_reason"],"status"?: Database["public"]['Enums']["app_status"],"student_id"?: string,"submitted_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gate_pass_applications_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gate_pass_applications_student_id_fkey"
      columns: ["student_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gate_passes": {
                  Row: {
                    "application_id": string,"expires_at": string,"id": string,"issued_at": string,"pass_code": string | null,"revoked_at": string | null,"token_hash": string,"valid_from": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"expires_at": string,"id"?: string,"issued_at"?: string,"pass_code"?: string | null,"revoked_at"?: string | null,"token_hash": string,"valid_from"?: string
                  }
                  Update: {
                    "application_id"?: string,"expires_at"?: string,"id"?: string,"issued_at"?: string,"pass_code"?: string | null,"revoked_at"?: string | null,"token_hash"?: string,"valid_from"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gate_passes_application_id_fkey"
      columns: ["application_id"]
isOneToOne: true
      referencedRelation: "gate_pass_applications"
      referencedColumns: ["id"]
    }
                  ]
                },"gate_verification_logs": {
                  Row: {
                    "event": Database["public"]['Enums']["verification_event"],"gate_user_id": string,"id": string,"occurred_at": string,"pass_id": string,"result": Database["public"]['Enums']["verification_result"]
                  }
                  ComputedFields: never
                  Insert: {
                    "event": Database["public"]['Enums']["verification_event"],"gate_user_id": string,"id"?: string,"occurred_at"?: string,"pass_id": string,"result": Database["public"]['Enums']["verification_result"]
                  }
                  Update: {
                    "event"?: Database["public"]['Enums']["verification_event"],"gate_user_id"?: string,"id"?: string,"occurred_at"?: string,"pass_id"?: string,"result"?: Database["public"]['Enums']["verification_result"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "gate_verification_logs_gate_user_id_fkey"
      columns: ["gate_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gate_verification_logs_pass_id_fkey"
      columns: ["pass_id"]
isOneToOne: false
      referencedRelation: "gate_passes"
      referencedColumns: ["id"]
    }
                  ]
                },"medical_documents": {
                  Row: {
                    "application_id": string,"byte_size": number,"content_type": string,"id": string,"label": string,"storage_path": string,"uploaded_at": string,"uploaded_by": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id": string,"byte_size": number,"content_type": string,"id"?: string,"label": string,"storage_path": string,"uploaded_at"?: string,"uploaded_by": string
                  }
                  Update: {
                    "application_id"?: string,"byte_size"?: number,"content_type"?: string,"id"?: string,"label"?: string,"storage_path"?: string,"uploaded_at"?: string,"uploaded_by"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "medical_documents_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "gate_pass_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "medical_documents_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "application_id": string | null,"body": string,"created_at": string,"id": string,"read_at": string | null,"title": string,"type": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "application_id"?: string | null,"body": string,"created_at"?: string,"id"?: string,"read_at"?: string | null,"title": string,"type": string,"user_id": string
                  }
                  Update: {
                    "application_id"?: string | null,"body"?: string,"created_at"?: string,"id"?: string,"read_at"?: string | null,"title"?: string,"type"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_application_id_fkey"
      columns: ["application_id"]
isOneToOne: false
      referencedRelation: "gate_pass_applications"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"department_id": string | null,"designation": string | null,"full_name": string,"id": string,"phone": string | null,"role": Database["public"]['Enums']["user_role"],"roll_number": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department_id"?: string | null,"designation"?: string | null,"full_name": string,"id": string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"roll_number"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"department_id"?: string | null,"designation"?: string | null,"full_name"?: string,"id"?: string,"phone"?: string | null,"role"?: Database["public"]['Enums']["user_role"],"roll_number"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_department_id_fkey"
      columns: ["department_id"]
isOneToOne: false
      referencedRelation: "departments"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "check_roll_number_available":
{ Args: { "candidate": string }; Returns: boolean
                           },
"fn_admin_create_department":
{ Args: { "p_code": string,"p_name": string }; Returns: {
              "code": string,
"created_at": string,
"id": string,
"name": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "departments"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_admin_create_rule":
{ Args: { "p_chain": Json,"p_department_id": string | null,"p_pass_validity_hours": number,"p_reason": Database["public"]['Enums']["gate_reason"],"p_requires_medical_document": boolean }; Returns: {
              "chain": NonNullable<Json>,
"created_at": string,
"department_id": string | null,
"id": string,
"pass_validity_hours": number,
"reason": Database["public"]['Enums']["gate_reason"],
"requires_medical_document": boolean,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "approval_rules"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_admin_create_user":
{ Args: { "p_department_id": string | null,"p_designation": string | null,"p_full_name": string,"p_role": Database["public"]['Enums']["user_role"],"p_roll_number": string | null,"p_user_id": string }; Returns: {
              "created_at": string,
"department_id": string | null,
"designation": string | null,
"full_name": string,
"id": string,
"phone": string | null,
"role": Database["public"]['Enums']["user_role"],
"roll_number": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_admin_delete_department":
{ Args: { "p_id": string }; Returns: undefined
                           },
"fn_admin_delete_rule":
{ Args: { "p_id": string }; Returns: undefined
                           },
"fn_admin_list_rules":
{ Args: { "p_rule_id"?: string }; Returns: {
              "chain": Json,"created_at": string,"department_code": string | null,"department_id": string | null,"department_name": string | null,"id": string,"pass_validity_hours": number,"reason": Database["public"]['Enums']["gate_reason"],"requires_medical_document": boolean,"updated_at": string
            }[]
                           },
"fn_admin_list_users":
{ Args: { "p_role"?: Database["public"]['Enums']["user_role"],"p_search"?: string,"p_user_id"?: string }; Returns: {
              "created_at": string,"department_code": string | null,"department_id": string | null,"department_name": string | null,"designation": string | null,"email": string,"full_name": string,"id": string,"role": Database["public"]['Enums']["user_role"],"roll_number": string | null,"total_count": number,"updated_at": string
            }[]
                           },
"fn_admin_record_password_reset":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"fn_admin_update_department":
{ Args: { "p_code": string,"p_id": string,"p_name": string }; Returns: {
              "code": string,
"created_at": string,
"id": string,
"name": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "departments"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_admin_update_rule":
{ Args: { "p_chain": Json,"p_id": string,"p_pass_validity_hours": number,"p_requires_medical_document": boolean }; Returns: {
              "chain": NonNullable<Json>,
"created_at": string,
"department_id": string | null,
"id": string,
"pass_validity_hours": number,
"reason": Database["public"]['Enums']["gate_reason"],
"requires_medical_document": boolean,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "approval_rules"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_admin_update_user":
{ Args: { "p_department_id": string | null,"p_designation": string | null,"p_full_name": string,"p_role": Database["public"]['Enums']["user_role"],"p_roll_number": string | null,"p_user_id": string }; Returns: {
              "created_at": string,
"department_id": string | null,
"designation": string | null,
"full_name": string,
"id": string,
"phone": string | null,
"role": Database["public"]['Enums']["user_role"],
"roll_number": string | null,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_decide_application":
{ Args: { "p_action": string,"p_application_id": string,"p_remarks"?: string }; Returns: {
              "application_id": string,
"approver_role": Database["public"]['Enums']["user_role"],
"assigned_to": string | null,
"created_at": string,
"decided_at": string | null,
"decided_by": string | null,
"department_id": string,
"id": string,
"status": Database["public"]['Enums']["step_status"],
"step_order": number,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "approval_steps"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_gate_record":
{ Args: { "p_event": Database["public"]['Enums']["verification_event"],"p_token_or_code": string }; Returns: Json
                           },
"fn_gate_verify":
{ Args: { "p_token_or_code": string }; Returns: Json
                           },
"fn_issue_pass":
{ Args: { "p_application_id": string }; Returns: {
              "application_id": string,
"expires_at": string,
"id": string,
"issued_at": string,
"pass_code": string | null,
"revoked_at": string | null,
"token_hash": string,
"valid_from": string
            }
                          SetofOptions: {
        from: "*"
        to: "gate_passes"
        isOneToOne: true
        isSetofReturn: false
      } },
"fn_mark_notifications_read":
{ Args: { "p_ids": (string)[] }; Returns: number
                           },
"fn_pass_qr_token":
{ Args: { "p_pass_id": string }; Returns: string
                           },
"fn_provide_info":
{ Args: { "p_application_id": string,"p_text": string }; Returns: undefined
                           },
"fn_submit_application":
{ Args: { "p_application_id"?: string,"p_departure_at": string,"p_docs"?: Json,"p_expected_return_at": string,"p_explanation": string,"p_reason": Database["public"]['Enums']["gate_reason"] }; Returns: {
              "additional_info": string | null,
"created_at": string,
"decided_at": string | null,
"department_id": string,
"departure_at": string,
"expected_return_at": string,
"explanation": string,
"id": string,
"reason": Database["public"]['Enums']["gate_reason"],
"status": Database["public"]['Enums']["app_status"],
"student_id": string,
"submitted_at": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "gate_pass_applications"
        isOneToOne: true
        isSetofReturn: false
      } },
"get_user_department":
{ Args: { "uid": string }; Returns: string
                           },
"get_user_role":
{ Args: { "uid": string }; Returns: Database["public"]['Enums']["user_role"]
                           },
"is_admin":
{ Args: { "uid"?: string }; Returns: boolean
                           }
          }
          Enums: {
            "app_status": "submitted"|"under_review"|"additional_info_required"|"approved"|"rejected"|"completed","gate_reason": "medical"|"emergency"|"personal"|"other","step_status": "pending"|"approved"|"rejected"|"info_requested","user_role": "student"|"faculty"|"hod"|"security"|"admin","verification_event": "exit"|"return"|"rejection","verification_result": "valid"|"expired"|"revoked"|"already_exited"|"already_returned"|"invalid_token"|"staff_rejected"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_status": ["submitted", "under_review", "additional_info_required", "approved", "rejected", "completed"],"gate_reason": ["medical", "emergency", "personal", "other"],"step_status": ["pending", "approved", "rejected", "info_requested"],"user_role": ["student", "faculty", "hod", "security", "admin"],"verification_event": ["exit", "return", "rejection"],"verification_result": ["valid", "expired", "revoked", "already_exited", "already_returned", "invalid_token", "staff_rejected"]
          }
        }
} as const
