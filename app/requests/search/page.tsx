"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase, ServiceRequest } from "@/lib/supabaseClient";
import { useLang } from "@/lib/useLang";

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="text-black/40 text-sm">Loading…</p>}>
      <SearchResults />
    </Suspense>
  );
}

function SearchResults() {
  const searchParams = useSearchParams();
  const wip = searchParams.get("wip") ?? "";
  const { t, dir } = useLang();
  const [results, setResults] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!wip) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from("requests").select("*").ilike("wip_number", `%${wip}%`).order("created_at", { ascending: false });
      setResults((data as ServiceRequest[]) ?? []);
      setLoading(false);
    }
    load();
  }, [wip]);

  return (
    <div className="flex flex-col gap-5" dir={dir}>
      <h1 className="text-xl font-bold">
        {t("Search results for", "نتائج البحث عن")} &ldquo;{wip}&rdquo;
      </h1>
      {loading ? (
        <p className="text-black/40 text-sm">{t("Searching…", "جارِ البحث…")}</p>
      ) : results.length === 0 ? (
        <p className="text-black/40 text-sm">{t("No requests match that WIP number.", "لا توجد طلبات مطابقة لرقم WIP هذا.")}</p>
      ) : (
        <div className="glass-card rounded-2xl divide-y divide-black/5">
          {results.map((r) => (
            <Link key={r.id} href={`/requests/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-black/[0.02]">
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  WIP {r.wip_number} — {r.remarks}
                </p>
                <p className="text-xs text-black/40 mt-0.5">
                  {t("by", "بواسطة")} {r.created_by}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold px-2 py-1 rounded-full bg-black/5">{r.status.replace("_", " ")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
