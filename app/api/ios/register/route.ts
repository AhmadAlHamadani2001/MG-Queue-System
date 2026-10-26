import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { ticketPosition } from "@/lib/queuePosition";

// Called by the iPhone App Clip once it lands on /t/<ticketId>.
// Body: { ticketId, deviceToken?, activityToken? } (tokens as hex).
// - With only ticketId: returns the ticket info so the clip can start
//   its Live Activity.
// - With tokens: saves them so the call webhook can push the
//   lock-screen alert and Live Activity updates.
// Response: { ticketNumber, branchName, status, position, advisorName }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{32,512}$/i;

type Body = { ticketId?: unknown; deviceToken?: unknown; activityToken?: unknown };

function cleanToken(value: unknown): string | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !TOKEN_RE.test(value)) return "invalid";
  return value.toLowerCase();
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const ticketId = typeof body.ticketId === "string" ? body.ticketId : "";
  if (!UUID_RE.test(ticketId)) {
    return NextResponse.json({ error: "invalid ticketId" }, { status: 400 });
  }
  const deviceToken = cleanToken(body.deviceToken);
  const activityToken = cleanToken(body.activityToken);
  if (deviceToken === "invalid" || activityToken === "invalid") {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  const { data: ticket } = await supabase
    .from("queue_tickets")
    .select("id, branch_id, ticket_number, status, advisor_name")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) {
    return NextResponse.json({ error: "ticket not found" }, { status: 404 });
  }

  const { data: branch } = await supabase.from("branches").select("*").eq("id", ticket.branch_id).maybeSingle();
  const position = ticket.status === "waiting" ? await ticketPosition(ticket.branch_id, ticket.id) : null;

  if (deviceToken || activityToken) {
    const row: Record<string, unknown> = {
      ticket_id: ticket.id,
      last_position: position,
      last_status: ticket.status,
      updated_at: new Date().toISOString(),
    };
    if (deviceToken) row.device_token = deviceToken;
    if (activityToken) row.activity_token = activityToken;
    const { error } = await supabase.from("ios_devices").upsert(row, { onConflict: "ticket_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ticketNumber: ticket.ticket_number,
    branchName: branch ? `${branch.name_en} · ${branch.name_ar}` : "MG",
    status: ticket.status,
    position,
    advisorName: ticket.advisor_name,
  });
}
