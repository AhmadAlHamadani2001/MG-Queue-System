"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, ServiceRequest } from "@/lib/supabaseClient";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";

export default function RequestsHome() {
  const { t, dir } = useLang();
  const [open, setOpen] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("requests")
        .select("*")
        .not("status", "in", "(closed,approved,rejected)")
        .order("created_at", { ascending: false })
        .limit(20);
      setOpen((data as ServiceRequest[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="flex flex-col gap-6" dir={dir}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t("Open requests", "الطلبات المفتوحة")}</h1>
        <Link href="/requests/new" className="px-4 py-2 rounded-lg bg-mg-red text-white text-sm font-semibold shadow-[0_4px_14px_rgba(226,6,19,0.3)]">
          + {t("New Request", "طلب جديد")}
        </Link>
      </div>

      {loading ? (
        <span className="text-black/40 text-sm inline-flex items-center gap-2"><Spinner size={14} />{t("Loading…", "جارِ التحميل…")}</span>
      ) : open.length === 0 ? (
        <p className="text-black/40 text-sm">{t("No open requests yet.", "لا توجد طلبات مفتوحة بعد.")}</p>
      ) : (
        <div className="glass-card rounded-2xl divide-y divide-black/5">
          {open.map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-black/[0.02]">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  WIP {r.wip_number} — {r.remarks}
                </p>
                <p className="text-xs text-black/40 mt-0.5">
                  {r.request_type ? `${r.request_type} · ` : ""}
                  {t("by", "بواسطة")} {r.created_by}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-amber-100 text-amber-700",
    in_progress: "bg-blue-100 text-blue-700",
    closed: "bg-emerald-100 text-emerald-700",
  };
  return <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${styles[status] ?? ""}`}>{status.replace("_", " ")}</span>;
}
