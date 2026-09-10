import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabase } from "@/lib/supabaseClient";

// Configured lazily so a missing env var doesn't crash the whole
// route module at import time — instead it just fails the request
// clearly, which is easier to diagnose from the Vercel logs.
function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set in this deployment's environment variables.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

type WebhookPayload = {
  type: string;
  table: string;
  record: {
    id: string;
    status: string;
    advisor_name: string | null;
    ticket_number: string;
  };
  old_record?: {
    status: string;
  };
};

export async function POST(request: Request) {
  // Optional shared-secret check — set CALL_PUSH_WEBHOOK_SECRET in
  // Vercel and add the same value as a custom header on the Supabase
  // webhook to stop random internet requests from triggering pushes.
  // If the env var isn't set, this check is skipped entirely.
  const expectedSecret = process.env.CALL_PUSH_WEBHOOK_SECRET;
  if (expectedSecret) {
    const provided = request.headers.get("x-webhook-secret");
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (payload.table !== "queue_tickets" || payload.type !== "UPDATE") {
    return NextResponse.json({ skipped: "not a queue_tickets update" });
  }

  const record = payload.record;
  const wasAlreadyCalled = payload.old_record?.status === "called";
  if (record.status !== "called" || wasAlreadyCalled) {
    return NextResponse.json({ skipped: "not a transition into called" });
  }

  try {
    configureWebPush();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: subscriptions } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("ticket_id", record.id);

  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no subscriptions for this ticket" });
  }

  const advisorName = record.advisor_name;
  const body = advisorName
    ? `Please proceed now — ${advisorName} is ready for you.\nالرجاء التوجه الآن — ${advisorName} بانتظارك.`
    : "Please proceed now — we are ready for you.\nالرجاء التوجه الآن — نحن بانتظارك.";

  const notificationPayload = JSON.stringify({
    title: `It's your turn! · حان دورك! (${record.ticket_number})`,
    body,
    url: `/t/${record.id}`,
  });

  let sent = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        notificationPayload
      );
      sent += 1;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      // 404/410 means the subscription is dead (browser data cleared,
      // permission revoked, etc.) — clean it up so we stop trying.
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  return NextResponse.json({ sent, of: subscriptions.length });
}
