import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabaseClient";
import { findTicketForInbound, sendWhatsAppText, whatsappConfigured } from "@/lib/whatsapp";
import { ticketPosition } from "@/lib/queuePosition";

// Meta WhatsApp Cloud API webhook.
// GET  = one-time verification when the webhook is added in Meta.
// POST = incoming customer messages. A "Notify me" message links the
//        customer's WhatsApp to their ticket and gets a free confirmation
//        reply; the "your turn" message is sent later by send-call-push.

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

function validSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured: skip the check (set it in production)
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

type InboundMessage = { from: string; type: string; text?: { body?: string }; button?: { text?: string } };
type WebhookBody = {
  object?: string;
  entry?: { changes?: { value?: { messages?: InboundMessage[] } }[] }[];
};

function siteUrl(request: Request): string {
  return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (body.object !== "whatsapp_business_account" || !whatsappConfigured()) {
    return NextResponse.json({ skipped: true });
  }

  const messages = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
  const site = siteUrl(request);

  for (const msg of messages) {
    const text = msg.text?.body ?? msg.button?.text ?? "";
    const ticket = await findTicketForInbound(msg.from, text);

    if (!ticket) {
      await sendWhatsAppText(
        msg.from,
        "We couldn't find an active ticket for this number. Please open your ticket page and tap \"Notify me on WhatsApp\" again.\n" +
          "لم نجد تذكرة نشطة لهذا الرقم. افتح صفحة تذكرتك واضغط «نبهني عبر واتساب» مرة أخرى."
      );
      continue;
    }

    await supabase.from("whatsapp_subscriptions").upsert(
      { ticket_id: ticket.id, wa_id: msg.from, last_inbound_at: new Date().toISOString() },
      { onConflict: "ticket_id" }
    );

    const link = `${site}/t/${ticket.id}`;
    let reply: string;
    if (ticket.status === "called") {
      reply =
        `🔔 It's your turn now! Ticket ${ticket.ticket_number}. Please proceed${ticket.advisor_name ? ` to ${ticket.advisor_name}` : ""}.\n` +
        `🔔 حان دورك الآن! التذكرة ${ticket.ticket_number}. يرجى التوجه${ticket.advisor_name ? ` إلى ${ticket.advisor_name}` : ""}.\n${link}`;
    } else {
      const position = ticket.status === "waiting" ? await ticketPosition(ticket.branch_id, ticket.id) : null;
      const ahead = position ? `\nPeople ahead: ${position} · عملاء قبلك: ${position}` : "";
      reply =
        `✅ Done! We'll message you here when it's your turn. Ticket ${ticket.ticket_number}.\n` +
        `✅ تم! سنرسل لك هنا عند حلول دورك. التذكرة ${ticket.ticket_number}.${ahead}\n${link}`;
    }
    await sendWhatsAppText(msg.from, reply);
  }

  // Always 200 so Meta doesn't retry and send duplicates.
  return NextResponse.json({ received: messages.length });
}
