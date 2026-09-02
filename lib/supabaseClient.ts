import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ServiceMode = "appointment" | "walk_in" | "inquiry" | "spare_parts";
export type WipServiceType = "general_repair" | "quick_service" | "vehicle_delivery";
export type TicketStatus = "waiting" | "called" | "in_service" | "completed" | "no_show" | "cancelled";

export type Branch = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  status: string;
  employee_branch: string | null;
};

export type QueueTicket = {
  id: string;
  branch_id: string;
  ticket_number: string;
  customer_name: string;
  mobile: string;
  service_mode: ServiceMode;
  wip_service_type: WipServiceType | null;
  wip_number: string | null;
  status: TicketStatus;
  preassigned_advisor: string | null;
  preassign_urgent: boolean;
  queue_entry_at: string;
  served_at: string | null;
  closed_at: string | null;
  advisor_name: string | null;
};

// ---------- Auth (app-level, not Supabase Auth) ----------
export type AppUserRole = "admin" | "manager" | "advisor" | "staff" | "parts_advisor";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: AppUserRole;
  employee_branch: string | null;
  demo_branch_code: string | null;
  title: string | null;
};

// ---------- Forms module ----------
export type FormFieldType = "text" | "number" | "date" | "repeater";

export type FormFieldDef = {
  key: string;
  label_en: string;
  label_ar: string;
  type: FormFieldType;
  required?: boolean;
  columns?: { key: string; label_en: string; label_ar: string; type: "text" | "number" | "date" }[];
};

export type FormTemplate = {
  id: string;
  name_en: string;
  name_ar: string;
  body_template: string;
  fields: FormFieldDef[];
  tables: string[][][];
  active: boolean;
  created_by: string | null;
  created_at: string;
};

export type FormSubmission = {
  id: string;
  template_id: string;
  branch: string | null;
  created_by: string;
  data: Record<string, string>;
  created_at: string;
};

// ---------- Request Management module ----------
export type RequestType = "approval" | "delegation";
export type PaymentType = "cash" | "warranty" | "internal";
export type RequestStatus = "open" | "in_progress" | "closed" | "approved" | "rejected" | "returned";
export type PaymentLineStatus = "open" | "in_progress" | "closed";

export type Employee = {
  id: string;
  name: string;
  title: string | null;
  city: string | null;
  branch: string | null;
  phone: string | null;
  email: string | null;
};

export type ServiceRequest = {
  id: string;
  wip_number: string;
  remarks: string;
  request_type: RequestType | null;
  payment_type: PaymentType | null;
  assignee_id: string | null;
  assignee_name: string | null;
  status: RequestStatus;
  locked: boolean;
  branch: string | null;
  created_by: string;
  created_at: string;
  closed_at: string | null;
};

export type RequestTypeLineStatus = "open" | "approved" | "rejected" | "returned";

export type RequestTypeLine = {
  id: string;
  request_id: string;
  request_type: RequestType;
  status: RequestTypeLineStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  created_at: string;
};

export type RequestPaymentLine = {
  id: string;
  request_id: string;
  payment_type: PaymentType;
  status: PaymentLineStatus;
  assignee_id: string | null;
  assignee_name: string | null;
  awaiting_approval: boolean;
  delegated_by: string | null;
  approval_requested_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  created_at: string;
};

export type RequestAuditEntry = {
  id: number;
  request_id: string;
  type_line_id: string | null;
  payment_line_id: string | null;
  action: string;
  actor_name: string;
  remarks: string | null;
  created_at: string;
};
