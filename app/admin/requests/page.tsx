"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { useSession } from "@/lib/useSession";
import { Spinner } from "@/lib/Spinner";
import { supabase, ServiceRequest, RequestPaymentLine } from "@/lib/supabaseClient";

export default function AdminRequestsPage() {
  return (
    <RequireAuth allow={["admin"]}>
      <AllRequests />
    </RequireAuth>
  );
}

function AllRequests() {
  const { t, lang, toggle, dir } = useLang();
  const { session, logout } = useSession();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [lines, setLines] = useState<RequestPaymentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: reqs }, { data: paymentLines }] = await Promise.all([
        supabase.from("requests").select("*").order("created_at", { ascending: false }),
        supabase.from("request_payment_lines").select("*"),
      ]);
      setRequests((reqs as ServiceRequest[]) ?? []);
      setLines((paymentLines as RequestPaymentLine[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const linesByRequest = useMemo(() => {
    const map = new Map<string, RequestPaymentLine[]>();
    lines.forEach((l) => map.set(l.request_id, [...(map.get(l.request_id) ?? []), l]));
    return map;
  }, [lines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      (r) => r.wip_number.toLowerCase().includes(q) || r.remarks.toLowerCase().includes(q) || r.created_by.toLowerCase().includes(q)
    );
  }, [requests, query]);

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back", "رجوع")}
          </Link>
          <p className="font-bold text-sm">{t("All Requests — Admin", "كل الطلبات — الإدارة")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-black/50 hidden sm:inline">{session?.name}</span>
          <button onClick={toggle} className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
            {lang === "en" ? "AR" : "EN"}
          </button>
          <button onClick={logout} className="px-3 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
            {t("Log out", "خروج")}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search by WIP number, remarks, or creator…", "بحث برقم WIP أو الملاحظات أو المنشئ…")}
          className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white mb-4"
        />

        {loading ? (
          <span className="text-black/40 text-sm inline-flex items-center gap-2">
            <Spinner size={14} />
            {t("Loading…", "جارِ التحميل…")}
          </span>
        ) : (
          <div className="glass-card rounded-2xl divide-y divide-black/5">
            {filtered.map((r) => {
              const reqLines = linesByRequest.get(r.id) ?? [];
              return (
                <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-black/[0.02]">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">
                      WIP {r.wip_number} — {r.remarks}
                    </p>
                    <p className="text-xs text-black/40 mt-0.5">
                      {t("by", "بواسطة")} {r.created_by} ·{" "}
                      {reqLines.length > 0
                        ? reqLines.map((l) => `${l.payment_type} (${l.status})`).join(", ")
                        : t("no payment lines yet", "لا توجد سطور دفع بعد")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${
                      r.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {r.status.replace("_", " ")}
                  </span>
                </Link>
              );
            })}
            {filtered.length === 0 && <p className="p-6 text-center text-black/40 text-sm">{t("No requests match.", "لا توجد طلبات مطابقة.")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
