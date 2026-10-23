import { Badge } from "@/components/ui/badge";
import { type Database } from "@/lib/supabase/database.types";

export type AppStatus = Database["public"]["Enums"]["app_status"];
export type StepStatus = Database["public"]["Enums"]["step_status"];
export type GateReason = Database["public"]["Enums"]["gate_reason"];

export const REASON_LABELS: Record<GateReason, string> = {
  medical: "Medical",
  emergency: "Emergency",
  personal: "Personal",
  other: "Other",
};

const APP_STATUS_UI: Record<
  AppStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  submitted: { label: "Awaiting review", variant: "outline" },
  under_review: { label: "Under review", variant: "secondary" },
  // Amber signals "action needed by you", not an error state.
  additional_info_required: {
    label: "Information requested",
    variant: "outline",
    className: "border-amber-400/60 text-amber-700 dark:text-amber-400",
  },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  completed: { label: "Completed", variant: "secondary" },
};

export function StatusBadge({ status }: { status: AppStatus }) {
  const ui = APP_STATUS_UI[status];
  return (
    <Badge variant={ui.variant} className={ui.className}>
      {ui.label}
    </Badge>
  );
}

const STEP_STATUS_UI: Record<
  StepStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  pending: { label: "Waiting for review", variant: "outline" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
  info_requested: {
    label: "Awaiting your answer",
    variant: "outline",
    className: "border-amber-400/60 text-amber-700 dark:text-amber-400",
  },
};

export function StepBadge({ status }: { status: StepStatus }) {
  const ui = STEP_STATUS_UI[status];
  return (
    <Badge variant={ui.variant} className={ui.className}>
      {ui.label}
    </Badge>
  );
}

export const STEP_ROLE_LABELS: Record<string, string> = {
  faculty: "Faculty review",
  hod: "HOD approval",
};

export const ACTION_LABELS: Record<string, string> = {
  approve: "Approved",
  reject: "Rejected",
  request_info: "Requested information",
  provide_info: "Student provided information",
};
