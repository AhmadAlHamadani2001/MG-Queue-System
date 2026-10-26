import { supabase } from "./supabaseClient";
import { branchPositions } from "./queuePosition";
import { apnsConfigured, isDeadToken, sendAlert, sendLiveActivity, LiveActivityState } from "./apns";

// Keeps every iPhone App Clip in a branch in sync after a queue change:
// - the called customer gets a lock-screen alert (MG chime) and their
//   Live Activity flips to "It's your turn";
// - everyone else waiting gets their "people ahead" number updated in
//   the Dynamic Island, only when it actually changed;
// - finished tickets end their Live Activity.

const TERMINAL = new Set(["completed", "no_show", "cancelled"]);

type DeviceRow = {
  id: string;
  ticket_id: string;
  device_token: string | null;
  activity_token: string | null;
  last_position: number | null;
  last_status: string | null;
  queue_tickets: {
    id: string;
    status: string;
    advisor_name: string | null;
    ticket_number: string;
  };
};

export type IosSyncResult = { skipped?: string; alerts: number; activityUpdates: number; removed: number };

export async function syncIosDevices(
  branchId: string,
  calledTicketId: string | null,
  call: { title: string; body: string } | null
): Promise<IosSyncResult> {
  const result: IosSyncResult = { alerts: 0, activityUpdates: 0, removed: 0 };
  if (!apnsConfigured()) return { ...result, skipped: "APNs env vars not set" };

  const { data } = await supabase
    .from("ios_devices")
    .select("id, ticket_id, device_token, activity_token, last_position, last_status, queue_tickets!inner(id, status, advisor_name, ticket_number, branch_id)")
    .eq("queue_tickets.branch_id", branchId);
  const devices = (data ?? []) as unknown as DeviceRow[];
  if (devices.length === 0) return { ...result, skipped: "no iOS devices in branch" };

  const positions = await branchPositions(branchId);

  await Promise.all(
    devices.map(async (device) => {
      const ticket = device.queue_tickets;
      const state: LiveActivityState = {
        status: ticket.status,
        position: positions.get(ticket.id) ?? null,
        advisorName: ticket.advisor_name,
      };
      const statusChanged = state.status !== device.last_status;
      const positionChanged = state.position !== device.last_position;
      const isCall = ticket.id === calledTicketId && call !== null;
      if (!isCall && !statusChanged && !positionChanged) return;

      let deviceToken = device.device_token;
      let activityToken = device.activity_token;

      if (isCall && deviceToken) {
        const r = await sendAlert(deviceToken, call.title, call.body, `/t/${ticket.id}`);
        if (r.ok) result.alerts += 1;
        else if (isDeadToken(r)) deviceToken = null;
      }

      if (activityToken) {
        const r = TERMINAL.has(state.status)
          ? await sendLiveActivity(activityToken, "end", state, {
              priority: 10,
              dismissInSeconds: state.status === "completed" ? 300 : 60,
            })
          : await sendLiveActivity(activityToken, "update", state, {
              priority: isCall || statusChanged ? 10 : 5,
              // No device token: let the Live Activity itself carry the
              // alert + chime so the customer still hears the call.
              alert: isCall && !deviceToken ? call : undefined,
            });
        if (r.ok) result.activityUpdates += 1;
        else if (isDeadToken(r)) activityToken = null;
      }

      const removedNow =
        (device.device_token && !deviceToken ? 1 : 0) + (device.activity_token && !activityToken ? 1 : 0);
      result.removed += removedNow;

      await supabase
        .from("ios_devices")
        .update({
          device_token: deviceToken,
          activity_token: activityToken,
          last_position: state.position,
          last_status: state.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", device.id);
    })
  );

  return result;
}
