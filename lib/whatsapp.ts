import { supabase } from "./supabaseClient";
import { ticketRef } from "./whatsappLink";

// WhatsApp Cloud API (Meta) — server only.
// Free: the customer messages us first, which opens a 24h customer
// service window; replies inside it cost nothing.
//
// Env (Vercel):
//   WHATSAPP_TOKEN            permanent System User access token
//   WHATSAPP_PHONE_NUMBER_ID  phone number ID from the WhatsApp > API Setup page
//   WHATSAPP_VERIFY_TOKEN     any secret string, also typed into the Meta webhook form
//   WHATSAPP_APP_SECRET       Meta app secret, used to check webhook signatures

const GRAPH_URL = "https://graph.facebook.com/v21.0";
const WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ["waiting", "called", "held", "in_service"];

export function whatsappConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

// "0551234567", "+966 55 123 4567", "00966551234567" -> "966551234567"
export function normalizeSaudiMobile(input: string | null | undefined): string {
  let d = (input ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("05") && d.length === 10) d = `966${d.slice(1)}`;
  else if (d.startsWith("5") && d.length === 9) d = `966${d}`;
  return d;
}

export function insideFreeWindow(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < WINDOW_MS - 5 * 60 * 1000;
}

export type WhatsAppResult = { ok: boolean; status: number; error?: string };

export async function sendWhatsAppText(to: string, body: string): Promise<WhatsAppResult> {
  try {
    const res = await fetch(`${GRAPH_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: true, body },
      }),
    });
    if (res.ok) return { ok: true, status: res.status };
    const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { ok: false, status: res.status, error: data.error?.message };
  } catch (e) {
    return { ok: false, status: 0, error: (e as Error).message };
  }
}

// Sends the "your turn" WhatsApp message for a called ticket, if the
// customer opted in and the free 24h window is still open.
export async function notifyWhatsAppOnCall(
  ticketId: string,
  message: string
): Promise<{ sent: boolean; reason?: string }> {
  if (!whatsappConfigured()) return { sent: false, reason: "WhatsApp env vars not set" };
  const { data: sub } = await supabase
    .from("whatsapp_subscriptions")
    .select("id, wa_id, last_inbound_at")
    .eq("ticket_id", ticketId)
    .maybeSingle();
  if (!sub) return { sent: false, reason: "customer did not opt in" };
  if (!insideFreeWindow(sub.last_inbound_at)) return { sent: false, reason: "24h window closed" };

  const result = await sendWhatsAppText(sub.wa_id, message);
  if (result.ok) {
    await supabase.from("whatsapp_subscriptions").update({ notified_at: new Date().toISOString() }).eq("id", sub.id);
    return { sent: true };
  }
  return { sent: false, reason: result.error ?? `HTTP ${result.status}` };
}

export type InboundTicket = {
  id: string;
  branch_id: string;
  ticket_number: string;
  status: string;
  advisor_name: string | null;
};

// Finds the ticket an incoming WhatsApp message is about:
// 1. the "ref xxxxxxxx" code from the pre-filled message;
// 2. otherwise the customer's active ticket with the same mobile number.
export async function findTicketForInbound(waId: string, text: string): Promise<InboundTicket | null> {
  const { data } = await supabase
    .from("queue_tickets")
    .select("id, branch_id, ticket_number, status, advisor_name, mobile, queue_entry_at")
    .in("status", ACTIVE_STATUSES)
    .order("queue_entry_at", { ascending: false })
    .limit(500);
  const tickets = (data ?? []) as (InboundTicket & { mobile: string | null })[];

  const refMatch = text.match(/ref\s*[:#]?\s*([0-9a-f]{8})/i);
  if (refMatch) {
    const ref = refMatch[1].toLowerCase();
    const byRef = tickets.find((t) => ticketRef(t.id) === ref);
    if (byRef) return byRef;
  }

  const sender = normalizeSaudiMobile(waId);
  return tickets.find((t) => normalizeSaudiMobile(t.mobile) === sender) ?? null;
}
