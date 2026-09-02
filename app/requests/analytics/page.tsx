"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { supabase, ServiceRequest, RequestPaymentLine } from "@/lib/supabaseClient";

export default function RequestAnalyticsPage() {
  const { session } = useSession();
  const { t, dir } = useLang();

  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [lines, setLines] = useState<RequestPaymentLine[]>([]);
  const [loading, setLoading] = useState(true);

  const canSeeAll = session?.role === "admin" || session?.employee_branch === "Head Office";

  useEffect(() => {
    async function load() {
      const { data: reqs } = await supabase.from("requests").select("*");
      const { data: paymentLines } = await supabase.from("request_payment_lines").select("*");
      setRequests((reqs as ServiceRequest[]) ?? []);
      setLines((paymentLines as RequestPaymentLine[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const scopedRequestIds = useMemo(() => {
    const scoped = canSeeAll ? requests : requests.filter((r) => r.branch === session?.employee_branch);
    return new Set(scoped.map((r) => r.id));
  }, [requests, canSeeAll, session?.employee_branch]);

  const requestById = useMemo(() => new Map(requests.map((r) => [r.id, r])), [requests]);

  const scopedLines = useMemo(() => lines.filter((l) => scopedRequestIds.has(l.request_id)), [lines, scopedRequestIds]);

  const pending = scopedLines.filter((l) => l.status !== "closed");
  const closed = scopedLines.filter((l) => l.status === "closed" && l.closed_at);

  const byAssignee = useMemo(() => {
    const map = new Map<string, number>();
    pending.forEach((l) => {
      const name = l.assignee_name ?? t("Unassigned", "غير مسند");
      map.set(name, (map.get(name) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [pending, t]);

  const avgLeadTimeHours = closed.length
    ? closed.reduce((sum, l) => sum + (new Date(l.closed_at!).getTime() - new Date(l.created_at).getTime()), 0) / closed.length / 3600000
    : null;

  const avgOpenAgeHours = pending.length
    ? pending.reduce((sum, l) => sum + (Date.now() - new Date(l.created_at).getTime()), 0) / pending.length / 3600000
    : null;

  const byBranch = useMemo(() => {
    if (!canSeeAll) return [];
    const map = new Map<string, number>();
    pending.forEach((l) => {
      const branch = requestById.get(l.request_id)?.branch ?? t("Unknown", "غير معروف");
      map.set(branch, (map.get(branch) ?? 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [pending, requestById, canSeeAll, t]);

  return (
    <div className="flex flex-col gap-6" dir={dir}>
      <div>
        <h1 className="text-xl font-bold">{t("Request Analytics", "تحليلات الطلبات")}</h1>
        <p className="text-sm text-black/40">
          {canSeeAll
            ? t("Kingdom-wide — every branch.", "على مستوى المملكة — كل الفروع.")
            : t(`Scoped to your branch (${session?.employee_branch ?? "—"}).`, `مقتصر على فرعك (${session?.employee_branch ?? "—"}).`)}
        </p>
      </div>

      {loading ? (
        <span className="text-black/40 text-sm inline-flex items-center gap-2">
          <Spinner size={14} />
          {t("Loading…", "جارِ التحميل…")}
        </span>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label={t("Pending lines", "السطور المعلقة")} value={String(pending.length)} />
            <Stat label={t("Closed lines", "السطور المغلقة")} value={String(closed.length)} />
            <Stat
              label={t("Avg lead time (closed)", "متوسط زمن الإنجاز (المغلقة)")}
              value={avgLeadTimeHours !== null ? `${avgLeadTimeHours.toFixed(1)} ${t("hrs", "س")}` : "—"}
            />
            <Stat
              label={t("Avg age (still open)", "متوسط العمر (المفتوحة)")}
              value={avgOpenAgeHours !== null ? `${avgOpenAgeHours.toFixed(1)} ${t("hrs", "س")}` : "—"}
            />
          </div>

          <div className="glass-card rounded-2xl p-5">
            <p className="text-xs uppercase tracking-wide text-black/40 mb-3">{t("Pending by assignee", "المعلق حسب المسؤول")}</p>
            {byAssignee.length === 0 ? (
              <p className="text-sm text-black/40">{t("Nothing pending.", "لا يوجد شيء معلق.")}</p>
            ) : (
              <div className="flex flex-col gap-2">
                {byAssignee.map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span>{name}</span>
                    <span className="font-semibold bg-black/5 px-2 py-0.5 rounded-full text-xs">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {canSeeAll && (
            <div className="glass-card rounded-2xl p-5">
              <p className="text-xs uppercase tracking-wide text-black/40 mb-3">{t("Pending by branch", "المعلق حسب الفرع")}</p>
              {byBranch.length === 0 ? (
                <p className="text-sm text-black/40">{t("Nothing pending.", "لا يوجد شيء معلق.")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {byBranch.map(([branch, count]) => (
                    <div key={branch} className="flex items-center justify-between text-sm">
                      <span>{branch}</span>
                      <span className="font-semibold bg-black/5 px-2 py-0.5 rounded-full text-xs">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
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
