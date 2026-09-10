"use client";

import { supabase } from "./supabaseClient";

// Public key only — safe to ship in client code. The matching
// private key lives server-side only (Vercel env var), used to sign
// outgoing push messages.
const VAPID_PUBLIC_KEY = "BDBQiBGKSDkNM0y6nJSGn9AvawxsCGpwsNNrqmTQLngW6cuN1oLfliE6OUtiLHfUoC9zGWizWFzmwsQD867jaXI";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

// Registers the service worker, subscribes this device to push, and
// saves the subscription against this specific ticket so the
// send-call-push function knows exactly who to notify when it's
// called. Safe to call more than once — reuses an existing
// subscription if one's already active.
export async function subscribeToPush(ticketId: string, mobile: string): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        ticket_id: ticketId,
        mobile,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" }
    );
    return !error;
  } catch {
    return false;
  }
}
