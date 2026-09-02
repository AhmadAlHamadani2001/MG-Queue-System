"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/lib/RequireAuth";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { supabase, Branch, QueueTicket } from "@/lib/supabaseClient";
import { computeDailyStats, computeHourlyStats, computeDayOfWeekStats, branchBusyLevel, branchBusyColor } from "@/lib/analyticsUtils";
import { LeadTimeLineChart, ThroughputChart, HourlyChart, DayOfWeekChart } from "@/lib/AnalyticsCharts";

type BranchStat = Branch & { waiting: number; active: number; avgWaitMin: number | null };
type SortKey = "date" | "throughput" | "avgWaitMin" | "avgServiceMin";

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function HqPage() {
  return (
    <RequireAuth>
      <HqInner />
    </RequireAuth>
  );
}

function HqInner() {
  const router = useRouter();
  const { session } = useSession();
  const [stats, setStats] = useState<BranchStat[]>([]);
  const [rangeTickets, setRangeTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [rangeDays, setRangeDays] = useState(14);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { t, lang, toggle, dir } = useLang();

  useEffect(() => {
    if (session === undefined) return;
    if (!session) return;
    const allowed = session.role === "admin" || session.employee_branch === "Head Office";
    if (!allowed) {
      if (session.demo_branch_code) router.replace(`/advisor/${session.demo_branch_code}`);
      else router.replace("/team");
    }
  }, [session, router]);

  const loadStats = useCallback(async () => {
    const { data: branches } = await supabase.from("branches").select("*").order("code");

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: tickets } = await supabase
      .from("queue_tickets")
      .select("branch_id, status, queue_entry_at, served_at")
      .gte("queue_entry_at", startOfDay.toISOString());

    const rows: BranchStat[] = (branches ?? []).map((b) => {
      const branchTickets = (tickets ?? []).filter((tk) => tk.branch_id === b.id);
      const active = branchTickets.filter((tk) => ["waiting", "called", "in_service"].includes(tk.status));
      const served = branchTickets.filter((tk) => tk.served_at);
      const avgWaitMin = served.length
        ? served.reduce((sum, tk) => sum + (new Date(tk.served_at!).getTime() - new Date(tk.queue_entry_at).getTime()), 0) / served.length / 60000
        : null;
      return {
        ...b,
        waiting: active.filter((tk) => tk.status === "waiting").length,
        active: active.filter((tk) => tk.status !== "waiting").length,
        avgWaitMin,
      };
    });
    setStats(rows);
    setLoading(false);
  }, []);

  const loadRangeTickets = useCallback(async () => {
    const rangeStart = new Date();
    rangeStart.setHours(0, 0, 0, 0);
    rangeStart.setDate(rangeStart.getDate() - (rangeDays - 1));
    const { data } = await supabase
      .from("queue_tickets")
      .select("*")
      .neq("service_mode", "spare_parts")
      .gte("queue_entry_at", rangeStart.toISOString());
    setRangeTickets((data as QueueTicket[]) ?? []);
  }, [rangeDays]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadRangeTickets();
  }, [loadRangeTickets]);

  useEffect(() => {
    const channel = supabase
      .channel("hq-overview")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets" }, () => loadStats())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  const dailyStats = useMemo(() => computeDailyStats(rangeTickets, rangeDays), [rangeTickets, rangeDays]);
  const hourlyStats = useMemo(() => computeHourlyStats(rangeTickets), [rangeTickets]);
  const dayOfWeekStats = useMemo(() => computeDayOfWeekStats(rangeTickets, lang), [rangeTickets, lang]);

  const sortedDaily = useMemo(() => {
    const rows = [...dailyStats];
    rows.sort((a, b) => {
      const av: number | string = sortKey === "date" ? a.date : a[sortKey] ?? -1;
      const bv: number | string = sortKey === "date" ? b.date : b[sortKey] ?? -1;
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
    a.download = `kingdom-daily-stats-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalWaiting = stats.reduce((sum, b) => sum + b.waiting, 0);
  const withWaitTimes = stats.filter((b) => b.avgWaitMin !== null);
  const kingdomAvgWait = withWaitTimes.length ? withWaitTimes.reduce((sum, b) => sum + (b.avgWaitMin ?? 0), 0) / withWaitTimes.length : null;

  return (
    <main className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img src="/mg-logo.jpg" alt="MG" className="w-8 h-8 object-contain rounded" />
          <p className="font-bold text-mg-ink text-sm">{t("MG Queue System — Head Office", "نظام طابور MG – الإدارة العامة")}</p>
        </div>
        <div className="flex items-center gap-2">
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label={t("Live waiting", "الانتظار المباشر")} value={String(totalWaiting)} />
          <StatCard label={t("Kingdom avg wait", "متوسط الانتظار بالمملكة")} value={kingdomAvgWait !== null ? `${kingdomAvgWait.toFixed(1)} ${t("min", "د")}` : "—"} />
          <StatCard label={t("Branches live", "الفروع المتصلة")} value={`${stats.length}`} />
          <StatCard
            label={t("Busiest branch", "أكثر الفروع ازدحاماً")}
            value={
              stats.length
                ? (lang === "en" ? [...stats].sort((a, b) => b.waiting - a.waiting)[0]?.name_en : [...stats].sort((a, b) => b.waiting - a.waiting)[0]?.name_ar) ?? "—"
                : "—"
            }
            small
          />
        </div>

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-mg-ink/50 mb-2">{t("Kingdom daily lead times", "أزمنة الإنجاز اليومية بالمملكة")}</p>
            <LeadTimeLineChart data={dailyStats} t={t} />
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-mg-ink/50 mb-2">{t("Kingdom daily throughput", "الإنتاجية اليومية بالمملكة")}</p>
            <ThroughputChart data={dailyStats} t={t} />
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-mg-ink/50 mb-2">{t("Peak hours — kingdom-wide", "ساعات الذروة — على مستوى المملكة")}</p>
            <HourlyChart data={hourlyStats} t={t} />
          </div>
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-mg-ink/50 mb-2">{t("Peak days — kingdom-wide", "أيام الذروة — على مستوى المملكة")}</p>
            <DayOfWeekChart data={dayOfWeekStats} t={t} />
          </div>
        </div>

        <div className="glass-card rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs uppercase tracking-wide text-mg-ink/50">{t("Kingdom daily data", "البيانات اليومية للمملكة")}</p>
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

        {loading ? (
          <span className="text-mg-ink/50 inline-flex items-center gap-2">
            <Spinner size={14} />
            {t("Loading…", "جارِ التحميل…")}
          </span>
        ) : (
          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-mg-ink/50 mb-4">{t("Branch load — click any branch to open its dashboard", "حمل الفروع — اضغط على أي فرع لفتح لوحته")}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {stats.map((b) => {
                const level = branchBusyLevel(b.waiting);
                return (
                  <Link key={b.id} href={`/advisor/${b.code}`} className="rounded-xl bg-white border border-black/5 p-4 hover:border-mg-red/40 transition block">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-mg-ink text-sm">{lang === "en" ? b.name_en : b.name_ar}</p>
                      <span className={`w-2 h-2 rounded-full ${branchBusyColor(level)}`} />
                    </div>
                    <p className="text-mg-ink/50 text-xs">
                      {b.waiting} {t("waiting", "بالانتظار")} · {b.active} {t("in progress", "قيد التنفيذ")}
                      {b.avgWaitMin !== null && (
                        <>
                          {" "}
                          · {b.avgWaitMin.toFixed(1)} {t("min avg wait", "د متوسط الانتظار")}
                        </>
                      )}
                    </p>
                  </Link>
                );
              })}
              {stats.length === 0 && (
                <p className="text-mg-ink/40 text-sm">{t("No branches yet — run supabase/schema.sql to seed one.", "لا توجد فروع بعد — نفّذ supabase/schema.sql لإضافة فرع.")}</p>
              )}
            </div>
          </div>
        )}
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

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-[11px] uppercase tracking-wide text-mg-ink/50">{label}</p>
      <p className={`font-bold text-mg-ink mt-1 ${small ? "text-base" : "text-2xl"}`}>{value}</p>
    </div>
  );
}
