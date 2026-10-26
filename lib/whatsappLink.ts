// Client-safe helpers for the "Notify me on WhatsApp" button.
// NEXT_PUBLIC_WHATSAPP_NUMBER = the business WhatsApp number, digits
// only with country code (e.g. 9665XXXXXXXX). Button hidden if unset.

export function whatsappNumber(): string | null {
  const raw = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  const digits = raw ? raw.replace(/\D/g, "") : "";
  return digits || null;
}

// Short reference the webhook uses to find the ticket: first 8 hex
// characters of the ticket UUID.
export function ticketRef(ticketId: string): string {
  return ticketId.replace(/-/g, "").slice(0, 8).toLowerCase();
}

// Pre-filled message. Bilingual; the "ref" part is what the server reads.
export function notifyMessage(ticketNumber: string, ticketId: string): string {
  return `🔔 Notify me when it's my turn · نبهني عند حلول دوري\nTicket ${ticketNumber} (ref ${ticketRef(ticketId)})`;
}

export function whatsappNotifyUrl(ticketNumber: string, ticketId: string): string | null {
  const number = whatsappNumber();
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(notifyMessage(ticketNumber, ticketId))}`;
}
