"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { supabase, Branch, QueueTicket } from "@/lib/supabaseClient";
import { computeDailyStats, computeHourlyStats, computeDayOfWeekStats, branchBusyLevel, branchBusyColor, branchBusyLabel } from "@/lib/analyticsUtils";
import { LeadTimeLineChart, ThroughputChart, HourlyChart, DayOfWeekChart } from "@/lib/AnalyticsCharts";

export default function AdvisorAnalyticsPage() {
  return (
    <RequireAuth>
      <AnalyticsInner />
    </RequireAuth>
  );
}

type SortKey = "date" | "throughput" | "avgWaitMin" | "avgServiceMin";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function AnalyticsInner() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { t, lang, toggle, dir } = useLang();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [otherBranches, setOtherBranches] = useState<{ name: string; waiting: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(14);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const isAdvisor = session?.role === "advisor";
  const isManager = session?.role === "manager";
  const canSeeAll = session?.role === "admin" || session?.employee_branch === "Head Office";

  useEffect(() => {
    if (session === undefined || !session) return;
    if (!canSeeAll && session.demo_branch_code && session.demo_branch_code !== params.code) {
      router.replace(`/advisor/${session.demo_branch_code}/analytics`);
    }
  }, [session, params.code, router, canSeeAll]);

  const load = useCallback(async () => {
    const { data: branchData } = await supabase.from("branches").select("*").eq("code", params.code).maybeSingle();
    if (!branchData) {
      setLoading(false);
      return;
    }
    setBranch(branchData as Branch);

    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - (rangeDays - 1));

    const { data } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("branch_id", branchData.id)
      .neq("service_mode", "spare_parts")
      .gte("queue_entry_at", rangeStart.toISOString());
    setTickets((data as QueueTicket[]) ?? []);

    if (isManager) {
      const { data: branches } = await supabase.from("branches").select("id, code, name_en, name_ar");
      const { data: liveTickets } = await supabase.from("queue_tickets").select("branch_id, status").eq("status", "waiting");
      const rows = (branches ?? [])
        .filter((b) => b.code !== params.code)
        .map((b) => ({
          name: lang === "en" ? b.name_en : b.name_ar,
          waiting: (liveTickets ?? []).filter((tk) => tk.branch_id === b.id).length,
        }));
      setOtherBranches(rows);
    }

    setLoading(false);
  }, [params.code, rangeDays, isManager, lang]);

  useEffect(() => {
    load();
  }, [load]);

  const dailyStats = useMemo(() => computeDailyStats(tickets, rangeDays), [tickets, rangeDays]);
  const hourlyStats = useMemo(() => computeHourlyStats(tickets), [tickets]);
  const dayOfWeekStats = useMemo(() => computeDayOfWeekStats(tickets, lang), [tickets, lang]);

  const sortedDaily = useMemo(() => {
    const rows = [...dailyStats];
    rows.sort((a, b) => {
      let av: number | string = sortKey === "date" ? a.date : a[sortKey] ?? -1;
      let bv: number | string = sortKey === "date" ? b.date : b[sortKey] ?? -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [dailyStats, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function exportCsv() {
    const headers = ["Date", "Throughput", "Avg Wait (min)", "Avg Service (min)"];
    const rows = sortedDaily.map((r) => [r.date, String(r.throughput), r.avgWaitMin?.toFixed(1) ?? "", r.avgServiceMin?.toFixed(1) ?? ""]);
    const csv = [headers, ...rows].map((row) => row.map((v) => csvEscape(v)).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${branch?.code ?? "branch"}-daily-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center gap-2">
        <Spinner size={20} />
        <span className="text-black/40">{t("Loading…", "جارِ التحميل…")}</span>
      </main>
    );
  }
  if (!branch) {
    return (
      <main className="min-h-screen flex items-center justify-center text-center p-8">
        <p className="text-black/50">{t("Branch not found.", "الفرع غير موجود.")}</p>
      </main>
    );
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const completed = tickets.filter((tk) => tk.status === "completed");
  const waiting = tickets.filter((tk) => tk.status === "waiting" && tk.queue_entry_at.slice(0, 10) === todayStr);
  const noShow = tickets.filter((tk) => tk.status === "no_show");
  const appointments = tickets.filter((tk) => tk.service_mode === "appointment");
  const walkIns = tickets.filter((tk) => tk.service_mode === "walk_in");
  const avgWaitMin = average(dailyStats.map((d) => d.avgWaitMin).filter((v): v is number => v !== null));
  const avgServiceMin = average(dailyStats.map((d) => d.avgServiceMin).filter((v): v is number => v !== null));

  const advisorRowsAll = (() => {
    const byAdvisor = new Map<string, QueueTicket[]>();
    completed.forEach((tk) => {
      if (!tk.advisor_name) return;
      byAdvisor.set(tk.advisor_name, [...(byAdvisor.get(tk.advisor_name) ?? []), tk]);
    });
    return Array.from(byAdvisor.entries())
      .map(([name, list]) => ({
        name,
        served: list.length,
        avgWait: average(list.filter((tk) => tk.served_at).map((tk) => (new Date(tk.served_at!).getTime() - new Date(tk.queue_entry_at).getTime()) / 60000)),
        avgService: average(
          list.filter((tk) => tk.served_at && tk.closed_at).map((tk) => (new Date(tk.closed_at!).getTime() - new Date(tk.served_at!).getTime()) / 60000)
        ),
        quickServiceCount: list.filter((tk) => tk.wip_service_type === "quick_service").length,
      }))
      .sort((a, b) => b.served - a.served);
  })();

  const advisorRows = isAdvisor ? advisorRowsAll.filter((r) => r.name === session?.name) : advisorRowsAll;

  return (
    <main className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <button onClick={() => router.push(`/advisor/${branch.code}`)} className="text-black/50 hover:text-mg-red text-sm">
          ← {t("Back to dashboard", "العودة للوحة")}
        </button>
        <div className="flex items-center gap-3">
          <p className="font-semibold text-sm">
            {t("Analytics —", "التحليلات —")} {lang === "en" ? branch.name_en : branch.name_ar}
          </p>
          <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} className="h-9 px-2 rounded-lg border border-black/10 text-xs bg-white">
            <option value={7}>{t("7 days", "٧ أيام")}</option>
            <option value={14}>{t("14 days", "١٤ يوماً")}</option>
            <option value={30}>{t("30 days", "٣٠ يوماً")}</option>
          </select>
          <button onClick={toggle} className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
            {lang === "en" ? "AR" : "EN"}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <p className="text-xs uppercase tracking-wide text-black/40 mb-4">
          {isAdvisor ? t("Today — your numbers", "اليوم — أرقامك") : t("Today so far", "اليوم حتى الآن")}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label={t("Total tickets (range)", "إجمالي التذاكر (الفترة)")} value={String(tickets.length)} />
          <Stat label={t("Completed (range)", "مكتملة (الفترة)")} value={String(completed.length)} />
          <Stat label={t("Waiting now", "بالانتظار الآن")} value={String(waiting.length)} />
          <Stat label={t("No-shows (range)", "لم يحضروا (الفترة)")} value={String(noShow.length)} />
          <Stat label={t("Avg wait (range)", "متوسط الانتظار (الفترة)")} value={avgWaitMin ? `${avgWaitMin.toFixed(1)} ${t("min", "د")}` : "—"} />
          <Stat label={t("Avg service (range)", "متوسط الخدمة (الفترة)")} value={avgServiceMin ? `${avgServiceMin.toFixed(1)} ${t("min", "د")}` : "—"} />
          <Stat label={t("Appointments", "مواعيد")} value={String(appointments.length)} />
          <Stat label={t("Walk-ins", "بدون موعد")} value={String(walkIns.length)} />
        </div>

        {isManager && otherBranches.length > 0 && (
          <div className="glass-card rounded-2xl p-5 mb-6">
            <p className="text-xs uppercase tracking-wide text-black/40 mb-3">
              {t("Other branches — live status only", "الفروع الأخرى — الحالة فقط")}
            </p>
            <div className="flex flex-wrap gap-2">
              {otherBranches.map((b) => {
                const level = branchBusyLevel(b.waiting);
                return (
                  <span key={b.name} className="inline-flex items-center gap-1.5 text-xs bg-black/[0.03] rounded-full px-3 py-1.5">
                    <span className={`w-2 h-2 rounded-full ${branchBusyColor(level)}`} />
                    {b.name} · {branchBusyLabel(level, t)}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-black/40 mb-2">{t("Daily lead times", "أزمنة الإنجاز اليومية")}</p>
            <LeadTimeLineChart data={dailyStats} t={t} />
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-black/40 mb-2">{t("Daily throughput", "الإنتاجية اليومية")}</p>
            <ThroughputChart data={dailyStats} t={t} />
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-black/40 mb-2">{t("Peak hours", "ساعات الذروة")}</p>
            <HourlyChart data={hourlyStats} t={t} />
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-black/40 mb-2">{t("Peak days", "أيام الذروة")}</p>
            <DayOfWeekChart data={dayOfWeekStats} t={t} />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-wide text-black/40">{t("Daily data", "البيانات اليومية")}</p>
            <button onClick={exportCsv} className="px-3 py-1.5 rounded-full bg-mg-red text-white text-xs font-semibold">
              ⬇️ {t("Export CSV", "تصدير CSV")}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-black/40 border-b border-black/5">
                  <SortHeader label={t("Date", "التاريخ")} sortKeyValue="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHeader label={t("Throughput", "الإنتاجية")} sortKeyValue="throughput" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHeader label={t("Avg wait", "متوسط الانتظار")} sortKeyValue="avgWaitMin" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <SortHeader label={t("Avg service", "متوسط الخدمة")} sortKeyValue="avgServiceMin" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedDaily.map((r) => (
                  <tr key={r.date} className="border-b border-black/5 last:border-0">
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.throughput}</td>
                    <td className="p-2">{r.avgWaitMin !== null ? `${r.avgWaitMin.toFixed(1)} ${t("min", "د")}` : "—"}</td>
                    <td className="p-2">{r.avgServiceMin !== null ? `${r.avgServiceMin.toFixed(1)} ${t("min", "د")}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5">
          <p className="text-xs uppercase tracking-wide text-black/40 mb-4">
            {isAdvisor ? t("Your performance", "أداؤك") : t("By advisor — today", "حسب المستشار — اليوم")}
          </p>
          {advisorRows.length === 0 ? (
            <p className="text-sm text-black/40">{t("No tickets served yet today.", "لم تُقدَّم أي خدمة اليوم بعد.")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-black/40 border-b border-black/5">
                    <th className="p-2">{t("Advisor", "المستشار")}</th>
                    <th className="p-2">{t("Served", "تم خدمتهم")}</th>
                    <th className="p-2">{t("Avg wait", "متوسط الانتظار")}</th>
                    <th className="p-2">{t("Avg service", "متوسط الخدمة")}</th>
                    <th className="p-2">{t("Quick Service", "خدمة سريعة")}</th>
                  </tr>
                </thead>
                <tbody>
                  {advisorRows.map((row) => (
                    <tr key={row.name} className="border-b border-black/5 last:border-0">
                      <td className="p-2 font-medium">{row.name}</td>
                      <td className="p-2">{row.served}</td>
                      <td className="p-2">{row.avgWait !== null ? `${row.avgWait.toFixed(1)} ${t("min", "د")}` : "—"}</td>
                      <td className="p-2">{row.avgService !== null ? `${row.avgService.toFixed(1)} ${t("min", "د")}` : "—"}</td>
                      <td className="p-2">{row.quickServiceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function SortHeader({
  label,
  sortKeyValue,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  sortKeyValue: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  return (
    <th className="p-2 cursor-pointer select-none hover:text-mg-red" onClick={() => onClick(sortKeyValue)}>
      {label} {sortKey === sortKeyValue && (sortDir === "asc" ? "▲" : "▼")}
    </th>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-black/40">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function average(nums: number[]) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
