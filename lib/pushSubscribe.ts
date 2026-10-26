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

// iPhone / iPad (iPadOS reports itself as "Macintosh" but has touch).
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

// True when opened from a Home Screen icon rather than a browser tab.
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

// Running inside the iPhone App Clip's WebView (it adds "MGQueueClip"
// to the user agent). Native code handles lock-screen alerts there.
export function isInAppClip(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("MGQueueClip");
}

// On iPhone, Web Push only exists inside a Home Screen app (iOS 16.4+).
// In a normal Safari tab the customer has to install first.
export function needsHomeScreenInstall(): boolean {
  return isIOS() && !isStandalone();
}

export type PushStatus = "on" | "denied" | "unsupported" | "error";

// Asks for notification permission and subscribes this device to the
// ticket. Must be called straight from a tap: iOS refuses the
// permission prompt if it isn't tied to a user gesture, so the
// permission request comes first, before any other await.
export async function enablePushAlerts(ticketId: string, mobile: string): Promise<PushStatus> {
  if (!pushSupported() || typeof Notification === "undefined") return "unsupported";
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      return "error";
    }
  }
  if (permission !== "granted") return "denied";
  return (await subscribeToPush(ticketId, mobile)) ? "on" : "error";
}

// Re-links an already-allowed device to this ticket without a prompt —
// e.g. a returning customer opening the Home Screen app for a new visit.
export async function resubscribeIfGranted(ticketId: string, mobile: string): Promise<boolean> {
  if (!pushSupported() || typeof Notification === "undefined") return false;
  if (Notification.permission !== "granted") return false;
  return subscribeToPush(ticketId, mobile);
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
