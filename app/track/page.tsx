"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Spinner } from "@/lib/Spinner";

type Match = {
  id: string;
  ticket_number: string;
  status: string;
  queue_entry_at: string;
  branch: { name_en: string; name_ar: string; code: string } | null;
};

type HeldMatch = Match & { held_at: string | null };

export default function TrackPage() {
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [mobile, setMobile] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [heldMatches, setHeldMatches] = useState<HeldMatch[]>([]);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = (en: string, ar: string) => (lang === "en" ? en : ar);

  async function handleSearch() {
    if (!mobile.trim()) return;
    setSearching(true);
    setSearched(false);
    setError(null);

    const fullMobile = `+966${mobile.trim()}`;
    const { data, error: queryError } = await supabase
      .from("queue_tickets")
      .select("id, ticket_number, status, queue_entry_at, branch:branches(name_en, name_ar, code)")
      .eq("mobile", fullMobile)
      .in("status", ["waiting", "called", "in_service"])
      .order("queue_entry_at", { ascending: false });

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: heldData, error: heldError } = await supabase
      .from("queue_tickets")
      .select("id, ticket_number, status, queue_entry_at, held_at, branch:branches(name_en, name_ar, code)")
      .eq("mobile", fullMobile)
      .eq("status", "held")
      .gte("held_at", oneDayAgo)
      .order("held_at", { ascending: false });

    setSearching(false);
    setSearched(true);

    if (queryError || heldError) {
      setError(t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
      return;
    }

    const rows = (data ?? []) as unknown as Match[];
    const heldRows = (heldData ?? []) as unknown as HeldMatch[];
    setMatches(rows);
    setHeldMatches(heldRows);

    // Exactly one active ticket and nothing held — skip straight to it.
    if (rows.length === 1 && heldRows.length === 0) {
      router.push(`/t/${rows[0].id}`);
    }
  }

  async function handleReactivate(ticketId: string) {
    setReactivatingId(ticketId);
    const { error: reactivateError } = await supabase
      .from("queue_tickets")
      .update({ status: "waiting", was_held: true, advisor_name: null, served_at: null })
      .eq("id", ticketId);
    setReactivatingId(null);
    if (reactivateError) {
      setError(t("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
      return;
    }
    router.push(`/t/${ticketId}`);
  }

  return (
    <main className="min-h-screen flex flex-col items-center bg-mg-cream" dir={dir}>
      <div className="w-full max-w-md flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-black/5 h-20 flex items-center justify-between px-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mg-logo.jpg" alt="MG" className="w-9 h-9 object-contain rounded shrink-0" />
            <div>
              <p className="font-bold text-mg-ink leading-tight">{t("Find my ticket", "البحث عن تذكرتي")}</p>
              <p className="text-xs text-mg-ink/50">{t("MG Queue System", "نظام طابور MG")}</p>
            </div>
          </div>
          <button
            aria-label="Toggle language"
            onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-sm font-semibold"
          >
            {lang === "en" ? "AR" : "EN"}
          </button>
        </header>

        <div className="flex-1 flex flex-col p-5 gap-5">
          <p className="text-sm text-mg-ink/60">
            {t(
              "Closed the tracking page by accident? Enter the mobile number you registered with to find your place in line again.",
              "أغلقت صفحة التتبع عن طريق الخطأ؟ أدخل رقم الجوال الذي سجّلت به لرؤية دورك في الطابور مرة أخرى."
            )}
          </p>

          <div>
            <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
              {t("Mobile number", "رقم الجوال")}
            </label>
            <div className="flex items-center h-14 px-4 rounded-lg border border-black/10 bg-white/70 focus-within:border-mg-red">
              <span className="text-mg-ink/50" dir="ltr">
                +966
              </span>
              <div className="w-px h-6 bg-black/10 mx-3" />
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                inputMode="numeric"
                placeholder="5X XXX XXXX"
                dir="ltr"
                className="flex-1 bg-transparent outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!mobile.trim() || searching}
            className="w-full py-4 rounded-lg bg-mg-red text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {searching && <Spinner size={16} />}
            {searching ? t("Searching…", "جارِ البحث…") : t("Find my ticket", "ابحث عن تذكرتي")}
          </button>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {searched && !error && matches.length === 0 && heldMatches.length === 0 && (
            <div className="glass-card rounded-2xl p-6 text-center flex flex-col items-center gap-2">
              <span className="text-3xl">🔍</span>
              <p className="font-semibold text-mg-ink">{t("No active ticket found", "لا توجد تذكرة نشطة")}</p>
              <p className="text-sm text-mg-ink/50">
                {t(
                  "We couldn't find a ticket currently in the queue for this number. If you haven't registered yet, scan the branch's QR code to join.",
                  "لم نجد تذكرة في الطابور حالياً لهذا الرقم. إذا لم تسجّل بعد، امسح رمز QR الخاص بالفرع للانضمام."
                )}
              </p>
            </div>
          )}

          {heldMatches.map((m) => (
            <div key={m.id} className="glass-card rounded-2xl p-5 flex flex-col items-center gap-2 text-center border-2 border-mg-red/20">
              <span className="text-3xl">👋</span>
              <p className="font-semibold text-mg-ink">{t("Welcome back!", "مرحباً بعودتك!")}</p>
              <p className="text-sm text-mg-ink/50">
                {t(
                  `You were called earlier for ticket ${m.ticket_number}${m.branch ? ` at ${m.branch.name_en}` : ""}. Rejoin the queue now and you'll be seen ahead of new arrivals.`,
                  `تم استدعاؤك سابقاً للتذكرة ${m.ticket_number}${m.branch ? ` في ${m.branch.name_ar}` : ""}. أعد الانضمام للطابور الآن وسيتم استقبالك قبل الوافدين الجدد.`
                )}
              </p>
              <button
                onClick={() => handleReactivate(m.id)}
                disabled={reactivatingId === m.id}
                className="w-full mt-2 py-3.5 rounded-lg bg-mg-red text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {reactivatingId === m.id && <Spinner size={16} />}
                {t("Rejoin the queue", "إعادة الانضمام للطابور")}
              </button>
            </div>
          ))}

          {matches.length > 1 && (
            <div className="glass-card rounded-2xl divide-y divide-black/5">
              <p className="text-xs uppercase tracking-wide text-mg-ink/50 px-4 pt-4 pb-2">
                {t("Multiple active tickets found — pick one", "تم العثور على أكثر من تذكرة نشطة — اختر واحدة")}
              </p>
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => router.push(`/t/${m.id}`)}
                  className="w-full text-left px-4 py-3 hover:bg-black/[0.02] flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="font-semibold text-sm">{m.ticket_number}</p>
                    <p className="text-xs text-mg-ink/50">{m.branch ? t(m.branch.name_en, m.branch.name_ar) : ""}</p>
                  </div>
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-mg-red/10 text-mg-red">
                    {t(m.status.replace("_", " "), m.status.replace("_", " "))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
