"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { supabase, Branch, QueueTicket } from "@/lib/supabaseClient";

export default function BranchCustomersPage() {
  return (
    <RequireAuth>
      <CustomersList />
    </RequireAuth>
  );
}

const STATUS_STYLE: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-700",
  called: "bg-blue-100 text-blue-700",
  in_service: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  no_show: "bg-red-100 text-red-700",
  cancelled: "bg-black/10 text-black/50",
};

type SortKey = "queue_entry_at" | "customer_name" | "advisor_name" | "status" | "wait_minutes" | "service_minutes";
type SortDir = "asc" | "desc";

function waitMinutes(tk: QueueTicket): number | null {
  if (!tk.served_at) return null;
  return (new Date(tk.served_at).getTime() - new Date(tk.queue_entry_at).getTime()) / 60000;
}
function serviceMinutes(tk: QueueTicket): number | null {
  if (!tk.served_at || !tk.closed_at) return null;
  return (new Date(tk.closed_at).getTime() - new Date(tk.served_at).getTime()) / 60000;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function CustomersList() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { t, lang, toggle, dir } = useLang();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [advisorFilter, setAdvisorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("queue_entry_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    async function load() {
      const { data: branchData } = await supabase
        .from("branches")
        .select("*")
        .eq("code", params.code)
        .maybeSingle();
      if (!branchData) {
        setLoading(false);
        return;
      }
      setBranch(branchData as Branch);
      const { data } = await supabase
        .from("queue_tickets")
        .select("*")
        .eq("branch_id", branchData.id)
        .neq("service_mode", "spare_parts")
        .order("queue_entry_at", { ascending: false })
        .limit(1000);
      setTickets((data as QueueTicket[]) ?? []);
      setLoading(false);
    }
    load();
  }, [params.code]);

  const advisors = useMemo(
    () => Array.from(new Set(tickets.map((tk) => tk.advisor_name).filter(Boolean))).sort() as string[],
    [tickets]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = tickets.filter((tk) => {
      if (advisorFilter && tk.advisor_name !== advisorFilter) return false;
      if (statusFilter && tk.status !== statusFilter) return false;
      if (modeFilter && tk.service_mode !== modeFilter) return false;
      if (!q) return true;
      return (
        tk.customer_name.toLowerCase().includes(q) ||
        tk.mobile.includes(q) ||
        tk.ticket_number.toLowerCase().includes(q) ||
        (tk.wip_number ?? "").toLowerCase().includes(q) ||
        (tk.advisor_name ?? "").toLowerCase().includes(q)
      );
    });

    rows = [...rows].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "queue_entry_at":
          av = new Date(a.queue_entry_at).getTime();
          bv = new Date(b.queue_entry_at).getTime();
          break;
        case "customer_name":
          av = a.customer_name.toLowerCase();
          bv = b.customer_name.toLowerCase();
          break;
        case "advisor_name":
          av = (a.advisor_name ?? "").toLowerCase();
          bv = (b.advisor_name ?? "").toLowerCase();
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "wait_minutes":
          av = waitMinutes(a) ?? -1;
          bv = waitMinutes(b) ?? -1;
          break;
        case "service_minutes":
          av = serviceMinutes(a) ?? -1;
          bv = serviceMinutes(b) ?? -1;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [tickets, query, advisorFilter, statusFilter, modeFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function exportCsv() {
    const headers = [
      "Ticket",
      "Customer Name",
      "Mobile",
      "Service Mode",
      "WIP Service Type",
      "WIP Number",
      "Status",
      "Advisor",
      "Queue Entry",
      "Served At",
      "Closed At",
      "Wait (min)",
      "Service (min)",
    ];
    const rows = filtered.map((tk) => [
      tk.ticket_number,
      tk.customer_name,
      tk.mobile,
      tk.service_mode,
      tk.wip_service_type ?? "",
      tk.wip_number ?? "",
      tk.status,
      tk.advisor_name ?? "",
      tk.queue_entry_at,
      tk.served_at ?? "",
      tk.closed_at ?? "",
      waitMinutes(tk)?.toFixed(1) ?? "",
      serviceMinutes(tk)?.toFixed(1) ?? "",
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => csvEscape(String(v))).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${branch?.code ?? "branch"}-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
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
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-black/50">{t("Branch not found.", "الفرع غير موجود.")}</p>
      </main>
    );
  }

  const SortHeader = ({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) => (
    <th className="p-3 cursor-pointer select-none hover:text-mg-red" onClick={() => toggleSort(sortKeyValue)}>
      {label} {sortKey === sortKeyValue && (sortDir === "asc" ? "▲" : "▼")}
    </th>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/advisor/${branch.code}`)} className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back to dashboard", "العودة للوحة")}
          </button>
          <p className="font-bold text-sm">
            {t("Customers —", "العملاء —")} {lang === "en" ? branch.name_en : branch.name_ar}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="px-3 h-9 rounded-full bg-mg-red text-white text-xs font-semibold">
            ⬇️ {t("Export CSV", "تصدير CSV")}
          </button>
          <button onClick={toggle} className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
            {lang === "en" ? "AR" : "EN"}
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search by name, mobile, ticket, WIP, or advisor…", "بحث بالاسم أو الجوال أو التذكرة أو WIP أو المستشار…")}
            className="flex-1 min-w-[220px] h-11 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white"
          />
          <select value={advisorFilter} onChange={(e) => setAdvisorFilter(e.target.value)} className="h-11 px-3 rounded-lg border border-black/10 bg-white text-sm">
            <option value="">{t("All advisors", "كل المستشارين")}</option>
            {advisors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-11 px-3 rounded-lg border border-black/10 bg-white text-sm">
            <option value="">{t("All statuses", "كل الحالات")}</option>
            {Object.keys(STATUS_STYLE).map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)} className="h-11 px-3 rounded-lg border border-black/10 bg-white text-sm">
            <option value="">{t("All service types", "كل أنواع الخدمة")}</option>
            <option value="appointment">appointment</option>
            <option value="walk_in">walk_in</option>
            <option value="inquiry">inquiry</option>
          </select>
        </div>

        <p className="text-xs text-black/40 mb-2">
          {filtered.length} {t("of", "من")} {tickets.length} {t("tickets shown", "تذكرة معروضة")}
        </p>

        <div className="glass-card rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-black/40 border-b border-black/5">
                <th className="p-3">{t("Ticket", "التذكرة")}</th>
                <SortHeader label={t("Name", "الاسم")} sortKeyValue="customer_name" />
                <th className="p-3">{t("Mobile", "الجوال")}</th>
                <th className="p-3">{t("Service", "الخدمة")}</th>
                <SortHeader label={t("Status", "الحالة")} sortKeyValue="status" />
                <SortHeader label={t("Advisor", "المستشار")} sortKeyValue="advisor_name" />
                <SortHeader label={t("Entered", "دخل")} sortKeyValue="queue_entry_at" />
                <SortHeader label={t("Wait (min)", "الانتظار (د)")} sortKeyValue="wait_minutes" />
                <SortHeader label={t("Service (min)", "الخدمة (د)")} sortKeyValue="service_minutes" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((tk) => (
                <tr key={tk.id} className="border-b border-black/5 last:border-0">
                  <td className="p-3 font-medium">{tk.ticket_number}</td>
                  <td className="p-3">{tk.customer_name}</td>
                  <td className="p-3" dir="ltr">
                    {tk.mobile}
                  </td>
                  <td className="p-3 text-black/60">
                    {tk.service_mode}
                    {tk.wip_service_type && ` · ${tk.wip_service_type}`}
                  </td>
                  <td className="p-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[tk.status] ?? ""}`}>
                      {tk.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3 text-black/60">{tk.advisor_name ?? "—"}</td>
                  <td className="p-3 text-black/50">{new Date(tk.queue_entry_at).toLocaleString()}</td>
                  <td className="p-3 text-black/50">{waitMinutes(tk)?.toFixed(1) ?? "—"}</td>
                  <td className="p-3 text-black/50">{serviceMinutes(tk)?.toFixed(1) ?? "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-black/40">
                    {t("No customers match.", "لا يوجد عملاء مطابقون.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
