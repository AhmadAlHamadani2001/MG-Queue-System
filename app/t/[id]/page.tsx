"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase, Branch, QueueTicket } from "@/lib/supabaseClient";
import { Spinner } from "@/lib/Spinner";
import { unlockAudio, unlockSpeech, playCallAnnouncement } from "@/lib/notifySound";

export default function TrackingPage() {
  const params = useParams<{ id: string }>();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const announcedServedAtRef = useRef<string | null>(null);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = (en: string, ar: string) => (lang === "en" ? en : ar);

  // A visible, explicit tap is far more reliable than a passive
  // listener for unlocking audio/speech on mobile — especially iOS
  // Safari, which is picky about exactly when in the gesture the
  // unlock happens. Keep the passive listeners too as a fallback for
  // anyone who interacts with the page before tapping this.
  function enableSound() {
    unlockAudio();
    unlockSpeech();
    setSoundEnabled(true);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(80);
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      unlockSpeech();
      setSoundEnabled(true);
    };
    document.addEventListener("touchstart", unlock, { once: true });
    document.addEventListener("click", unlock, { once: true });
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  const computePosition = useCallback(async (branchId: string, entryAt: string, ticketId: string) => {
    const { data } = await supabase
      .from("queue_tickets")
      .select("id, queue_entry_at")
      .eq("branch_id", branchId)
      .eq("status", "waiting")
      .order("queue_entry_at", { ascending: true });

    if (!data) return;
    const idx = data.findIndex((row) => row.id === ticketId);
    setPosition(idx === -1 ? null : idx + 1);
  }, []);

  const loadTicket = useCallback(async () => {
    const { data: ticketData } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();

    if (!ticketData) {
      setLoading(false);
      return;
    }
    setTicket(ticketData as QueueTicket);

    // Announce as soon as we see status "called" with a served_at we
    // haven't announced yet — this fires whether we got here via the
    // live realtime push (tab in foreground) or via the tab regaining
    // visibility after being backgrounded (see the visibilitychange
    // listener below), so a customer who was away in another app
    // still gets alerted the moment they come back.
    if (ticketData.status === "called" && ticketData.served_at && announcedServedAtRef.current !== ticketData.served_at) {
      announcedServedAtRef.current = ticketData.served_at;
      playCallAnnouncement(ticketData.advisor_name);
    }

    const { data: branchData } = await supabase
      .from("branches")
      .select("id, code, name_en, name_ar, status")
      .eq("id", ticketData.branch_id)
      .maybeSingle();
    setBranch(branchData as Branch | null);

    if (ticketData.status === "waiting") {
      await computePosition(ticketData.branch_id, ticketData.queue_entry_at, ticketData.id);
    } else {
      setPosition(0);
    }
    setLoading(false);
  }, [params.id, computePosition]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  // Mobile OSes heavily throttle or pause JavaScript in a backgrounded
  // browser tab — if the customer switched to another app to scroll,
  // the realtime push may never actually run until they come back.
  // Re-check the moment the tab becomes visible again so the alert
  // still fires as close to "on time" as a plain web page can manage.
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        loadTicket();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [loadTicket]);

  useEffect(() => {
    if (!ticket) return;

    const channel = supabase
      .channel(`branch-${ticket.branch_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_tickets", filter: `branch_id=eq.${ticket.branch_id}` },
        () => {
          loadTicket();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.branch_id]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center gap-2">
        <Spinner size={20} />
        <span className="text-mg-ink/50">{t("Loading…", "جارِ التحميل…")}</span>
      </main>
    );
  }

  if (!ticket || !branch) {
    return (
      <main className="min-h-screen flex items-center justify-center text-center p-8">
        <p className="text-mg-ink/60">{t("Ticket not found.", "التذكرة غير موجودة.")}</p>
      </main>
    );
  }

  const beingCalled = ticket.status === "called";
  const inService = ticket.status === "in_service";
  const completed = ticket.status === "completed";

  const circumference = 2 * Math.PI * 70;
  const progress = position !== null ? Math.max(0, 1 - Math.min(position, 8) / 8) : 1;
  const dashOffset = circumference * (1 - progress);

  return (
    <main className="min-h-screen flex flex-col items-center bg-mg-cream" dir={dir}>
      <div className="w-full max-w-md flex flex-col min-h-screen">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-xl border-b border-black/5 h-20 flex items-center justify-between px-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mg-logo.jpg" alt="MG" className="w-9 h-9 object-contain rounded shrink-0" />
            <div>
              <p className="font-bold text-mg-ink leading-tight">
                {lang === "en" ? branch.name_en : branch.name_ar}
              </p>
              <span className="text-xs text-mg-ink/50 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {t("Live", "مباشر")}
              </span>
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

        {!soundEnabled && (
          <button
            onClick={enableSound}
            className="w-full py-3 px-5 bg-mg-red/10 border-b border-mg-red/20 text-mg-red text-sm font-semibold flex items-center justify-center gap-2"
          >
            🔔 {t("Tap to enable sound alerts for when it's your turn", "اضغط لتفعيل التنبيه الصوتي عند حلول دورك")}
          </button>
        )}

        <div className="flex-1 flex flex-col p-5 gap-6">
          <div className="flex justify-between items-center px-1">
            <div>
              <p className="text-xs uppercase tracking-wide text-mg-ink/50">
                {t("Ticket number", "رقم التذكرة")}
              </p>
              <p className="text-3xl font-bold text-mg-ink">{ticket.ticket_number}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-mg-ink/50">{t("Service", "الخدمة")}</p>
              <p className="font-medium text-mg-ink">
                {ticket.service_mode === "appointment"
                  ? t("Appointment", "موعد مسبق")
                  : t("Walk-in", "بدون موعد")}
              </p>
            </div>
          </div>

          {!completed && (
            <section className="flex flex-col items-center py-6">
              <div className="relative w-56 h-56">
                <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
                  <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="10" />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    fill="none"
                    stroke="#E20613"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: "stroke-dashoffset 1s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-5xl font-bold text-mg-ink">
                    {beingCalled || inService ? "•" : position ?? "—"}
                  </span>
                  <span className="text-sm text-mg-ink/50 mt-1">
                    {beingCalled
                      ? t("being called", "يتم استدعاؤك")
                      : inService
                      ? t("in service", "قيد الخدمة")
                      : t("people ahead", "عملاء قبلك")}
                  </span>
                </div>
              </div>
            </section>
          )}

          {beingCalled && (
            <div className="rounded-2xl bg-gradient-to-br from-mg-red to-mg-redDeep p-6 text-center animate-pulse">
              <p className="text-white/80 text-xs uppercase tracking-widest mb-2">
                {t("You're being called", "حان دورك الآن")}
              </p>
              <p className="text-2xl font-bold text-white mb-1">
                {t("Please proceed now", "يرجى التوجه الآن")}
              </p>
              <p className="text-white/85 text-sm">
                {ticket.advisor_name
                  ? t(`Advisor ${ticket.advisor_name} is ready for you.`, `المستشار ${ticket.advisor_name} بانتظارك.`)
                  : t("An advisor is ready for you.", "أحد المستشارين بانتظارك.")}
              </p>
            </div>
          )}

          {inService && (
            <div className="glass-card rounded-2xl p-6 text-center">
              <p className="font-semibold text-mg-ink">{t("You're being served", "جاري خدمتك الآن")}</p>
            </div>
          )}

          {completed && (
            <div className="glass-card rounded-2xl p-8 text-center flex flex-col items-center gap-2">
              <span className="text-3xl">✅</span>
              <p className="font-semibold text-mg-ink">{t("Service complete", "اكتملت الخدمة")}</p>
              <p className="text-sm text-mg-ink/50">
                {t("Thank you for visiting MG.", "شكراً لزيارتكم إم جي.")}
              </p>
            </div>
          )}

          {!beingCalled && !inService && !completed && (
            <div className="flex items-center gap-3 bg-white py-3 px-5 rounded-full border border-black/5 shadow-sm mx-auto">
              <span className="text-mg-red">⏱</span>
              <div>
                <p className="text-xs text-mg-ink/50">{t("Estimated wait", "الانتظار المتوقع")}</p>
                <p className="font-semibold text-mg-ink">
                  ~{position ? position * 6 : 0} {t("minutes", "دقيقة")}
                </p>
              </div>
            </div>
          )}

          <p className="text-xs text-mg-ink/40 text-center mt-auto pt-4">
            {t("If you close this page, you can find it again anytime with your mobile number at", "إذا أغلقت هذه الصفحة، يمكنك العثور عليها مرة أخرى في أي وقت برقم جوالك عبر")}{" "}
            <a href="/track" className="text-mg-red font-medium underline">
              {t("Find my ticket", "البحث عن تذكرتي")}
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
