import { QueueTicket } from "./supabaseClient";

export type DailyStat = {
  date: string; // YYYY-MM-DD
  throughput: number;
  avgWaitMin: number | null;
  avgServiceMin: number | null;
};

export type HourStat = { hour: number; count: number };
export type DayOfWeekStat = { day: string; count: number };

function dateKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export function computeDailyStats(tickets: QueueTicket[], days: number): DailyStat[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }

  const byDay = new Map<string, QueueTicket[]>();
  tickets.forEach((tk) => {
    const key = dateKey(tk.queue_entry_at);
    byDay.set(key, [...(byDay.get(key) ?? []), tk]);
  });

  return keys.map((key) => {
    const dayTickets = byDay.get(key) ?? [];
    const completed = dayTickets.filter((tk) => tk.status === "completed");
    const withWait = completed.filter((tk) => tk.served_at);
    const withService = completed.filter((tk) => tk.served_at && tk.closed_at);
    return {
      date: key,
      throughput: completed.length,
      avgWaitMin: withWait.length
        ? withWait.reduce((s, tk) => s + (new Date(tk.served_at!).getTime() - new Date(tk.queue_entry_at).getTime()), 0) /
          withWait.length /
          60000
        : null,
      avgServiceMin: withService.length
        ? withService.reduce((s, tk) => s + (new Date(tk.closed_at!).getTime() - new Date(tk.served_at!).getTime()), 0) /
          withService.length /
          60000
        : null,
    };
  });
}

export function computeHourlyStats(tickets: QueueTicket[]): HourStat[] {
  const counts = new Array(24).fill(0);
  tickets.forEach((tk) => {
    const h = new Date(tk.queue_entry_at).getHours();
    counts[h]++;
  });
  return counts.map((count, hour) => ({ hour, count }));
}

const DAY_NAMES_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAMES_AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

export function computeDayOfWeekStats(tickets: QueueTicket[], lang: "en" | "ar"): DayOfWeekStat[] {
  const counts = new Array(7).fill(0);
  tickets.forEach((tk) => {
    const d = new Date(tk.queue_entry_at).getDay();
    counts[d]++;
  });
  const names = lang === "en" ? DAY_NAMES_EN : DAY_NAMES_AR;
  return counts.map((count, i) => ({ day: names[i], count }));
}

export type BranchBusyLevel = "busy" | "moderate" | "quiet";

export function branchBusyLevel(waitingCount: number): BranchBusyLevel {
  if (waitingCount > 8) return "busy";
  if (waitingCount > 3) return "moderate";
  return "quiet";
}

export function branchBusyColor(level: BranchBusyLevel) {
  return level === "busy" ? "bg-red-500" : level === "moderate" ? "bg-amber-400" : "bg-emerald-500";
}

export function branchBusyLabel(level: BranchBusyLevel, t: (en: string, ar: string) => string) {
  if (level === "busy") return t("Busy", "مزدحم");
  if (level === "moderate") return t("Moderate", "متوسط");
  return t("Quiet", "هادئ");
}
