import { supabase } from "./supabaseClient";

// "People ahead" shown to the customer: waiting tickets in the branch
// ordered by queue entry time. Shared by the tracking page and the
// iPhone Live Activity so both always show the same number.

// Map of ticketId -> 1-based position for every waiting ticket in a branch.
export async function branchPositions(branchId: string): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("queue_tickets")
    .select("id, queue_entry_at")
    .eq("branch_id", branchId)
    .eq("status", "waiting")
    .order("queue_entry_at", { ascending: true });

  const positions = new Map<string, number>();
  (data ?? []).forEach((row, idx) => positions.set(row.id as string, idx + 1));
  return positions;
}

// Position of one ticket, or null if it isn't waiting.
export async function ticketPosition(branchId: string, ticketId: string): Promise<number | null> {
  const positions = await branchPositions(branchId);
  return positions.get(ticketId) ?? null;
}
