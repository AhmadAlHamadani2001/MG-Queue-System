"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, ServiceRequest } from "@/lib/supabaseClient";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";

type Row = { request: ServiceRequest; lines: string[] };

export default function AssignedToMePage() {
  const { session } = useSession();
  const { t } = useLang();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const name = session?.name;

  useEffect(() => {
    async function load() {
      if (!name) {
        setLoading(false);
        return;
      }

      const { data: paymentLines } = await supabase
        .from("request_payment_lines")
        .select("request_id, payment_type")
        .eq("assignee_name", name);

      const lineLabels = new Map<string, string[]>();
      (paymentLines ?? []).forEach((l: { request_id: string; payment_type: string }) => {
        lineLabels.set(l.request_id, [...(lineLabels.get(l.request_id) ?? []), l.payment_type]);
      });

      const requestIds = Array.from(lineLabels.keys());
      if (requestIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: requests } = await supabase.from("requests").select("*").in("id", requestIds);
      const built = (requests as ServiceRequest[] | null ?? [])
        .map((r) => ({ request: r, lines: lineLabels.get(r.id) ?? [] }))
        .sort((a, b) => new Date(b.request.created_at).getTime() - new Date(a.request.created_at).getTime());
      setRows(built);
      setLoading(false);
    }
    load();
  }, [name]);

  if (!name) {
    return <p className="text-black/50 text-sm">{t("Sign in to see what's assigned to you.", "سجّل الدخول لرؤية ما هو مسند إليك.")}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-bold">
        {t("Assigned to me —", "مسند إليّ —")} {name}
      </h1>
      {loading ? (
        <span className="text-black/40 text-sm inline-flex items-center gap-2">
          <Spinner size={14} />
          {t("Loading…", "جارِ التحميل…")}
        </span>
      ) : rows.length === 0 ? (
        <p className="text-black/40 text-sm">{t("Nothing assigned to you right now.", "لا يوجد شيء مسند إليك حالياً.")}</p>
      ) : (
        <div className="glass-card rounded-2xl divide-y divide-black/5">
          {rows.map(({ request, lines }) => (
            <Link
              key={request.id}
              href={`/requests/${request.id}`}
              className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-black/[0.02]"
            >
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  WIP {request.wip_number} — {request.remarks}
                </p>
                <p className="text-xs text-black/40 mt-0.5">
                  {t("your lines:", "المسارات الخاصة بك:")} {lines.join(", ")}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                {request.status.replace("_", " ")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
