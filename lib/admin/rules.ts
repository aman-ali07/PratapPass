import type { DepartmentOption } from "@/lib/admin/users";
import {
  type GateReason,
  RULE_CHAIN_VALUES,
  type RuleChainValue,
} from "@/lib/validation/admin";

/** Copy shared by the rules list, forms, and filters. */
export const GATE_REASON_OPTIONS = [
  { value: "medical", label: "Medical" },
  { value: "personal", label: "Personal" },
  { value: "emergency", label: "Emergency" },
  { value: "other", label: "Other" },
] as const satisfies readonly { value: GateReason; label: string }[];

/**
 * Chain presets. The value is the comma-joined role order submitted to the
 * action; `fn_admin_create_rule` / `fn_admin_update_rule` re-validate it.
 */
export const RULE_CHAIN_OPTIONS = [
  { value: "faculty,hod", label: "Faculty → HOD" },
  { value: "faculty", label: "Faculty only" },
  { value: "hod", label: "HOD only" },
  { value: "hod,faculty", label: "HOD → Faculty" },
] as const satisfies readonly { value: RuleChainValue; label: string }[];

export function gateReasonLabel(reason: string): string {
  return GATE_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
}

export function ruleChainLabel(value: string): string {
  return RULE_CHAIN_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

/**
 * Maps a stored `chain` jsonb to a supported preset. Returns null for shapes
 * the UI cannot represent (the page shows the raw value and the form requires
 * an explicit choice instead of silently rewriting it).
 */
export function parseRuleChain(chain: unknown): RuleChainValue | null {
  if (!Array.isArray(chain) || chain.length < 1 || chain.length > 2) return null;
  if (!chain.every((role) => role === "faculty" || role === "hod")) return null;
  const value = chain.join(",");
  return (RULE_CHAIN_VALUES as readonly string[]).includes(value)
    ? (value as RuleChainValue)
    : null;
}

/** The fields the list and edit page render (snake_case matches the RPC row). */
export type AdminRuleRecord = {
  id: string;
  department_id: string | null;
  department_code: string | null;
  department_name: string | null;
  reason: GateReason;
  chain: unknown;
  requires_medical_document: boolean;
  pass_validity_hours: number;
  created_at: string;
  updated_at: string;
};

export type { DepartmentOption };
