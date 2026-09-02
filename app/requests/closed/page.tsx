"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, ServiceRequest } from "@/lib/supabaseClient";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";

export default function ClosedRequestsPage() {
  const { t, dir } = useLang();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .in("status", ["closed", "approved", "rejected"])
        .order("closed_at", { ascending: false })
        .limit(50);
      setRequests((data as ServiceRequest[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-5" dir={dir}>
      <h1 className="text-xl font-bold">{t("Closed requests", "الطلبات المغلقة")}</h1>
      {loading ? (
        <span className="text-black/40 text-sm inline-flex items-center gap-2"><Spinner size={14} />{t("Loading…", "جارِ التحميل…")}</span>
      ) : requests.length === 0 ? (
        <p className="text-black/40 text-sm">{t("No closed requests yet.", "لا توجد طلبات مغلقة بعد.")}</p>
      ) : (
        <div className="glass-card rounded-2xl divide-y divide-black/5">
          {requests.map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-black/[0.02]">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  WIP {r.wip_number} — {r.remarks}
                </p>
                <p className="text-xs text-black/40 mt-0.5">
                  {t("closed", "أُغلق")} {r.closed_at ? new Date(r.closed_at).toLocaleString() : "—"}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                {r.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
