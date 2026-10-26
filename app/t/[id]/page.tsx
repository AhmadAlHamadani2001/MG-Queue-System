"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase, Branch, QueueTicket } from "@/lib/supabaseClient";
import { Spinner } from "@/lib/Spinner";
import { unlockAudio, unlockSpeech, playCallAnnouncement, showCallNotification } from "@/lib/notifySound";
import { enablePushAlerts, isInAppClip, needsHomeScreenInstall, resubscribeIfGranted, PushStatus } from "@/lib/pushSubscribe";
import { ticketPosition } from "@/lib/queuePosition";

// How often the in-page alert repeats while the customer hasn't
// acknowledged it, and how many repeats at most.
const ALERT_REPEAT_MS = 20000;
const ALERT_MAX_REPEATS = 4;

export default function TrackingPage() {
  const params = useParams<{ id: string }>();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [ticket, setTicket] = useState<QueueTicket | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);
  const [position, setPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  // Inside the iPhone App Clip, native code owns lock-screen alerts and
  // the Live Activity, so the web-push button/status are hidden.
  const [inAppClip, setInAppClip] = useState(false);
  // Full-screen "it's your turn" overlay, repeats until acknowledged.
  const [alertActive, setAlertActive] = useState(false);
  const announcedServedAtRef = useRef<string | null>(null);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = (en: string, ar: string) => (lang === "en" ? en : ar);

  useEffect(() => {
    setInAppClip(isInAppClip());
  }, []);

  // A visible, explicit tap is far more reliable than a passive
  // listener for unlocking audio/speech on mobile — especially iOS
  // Safari, which is picky about exactly when in the gesture the
  // unlock happens. Keep the passive listeners too as a fallback for
  // anyone who interacts with the page before tapping this.
  async function enableSound() {
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
    // Push is the one that works while the page is closed or the phone
    // is locked — the others only help while the page is alive. On an
    // iPhone Safari tab it can't work yet (install guide shown instead).
    if (ticket && !needsHomeScreenInstall() && !isInAppClip()) {
      setPushStatus(await enablePushAlerts(ticket.id, ticket.mobile));
    }
  }

  // Device already allowed notifications (e.g. returning customer in
  // the Home Screen app): link it to this ticket silently.
  useEffect(() => {
    if (!ticket) return;
    resubscribeIfGranted(ticket.id, ticket.mobile).then((ok) => {
      if (ok) setPushStatus("on");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  useEffect(() => {
    // Passive fallback only unlocks audio — it must not hide the
    // enable button, or the customer never gets the push prompt.
    const unlock = () => {
      unlockAudio();
      unlockSpeech();
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

  const computePosition = useCallback(async (branchId: string, _entryAt: string, ticketId: string) => {
    setPosition(await ticketPosition(branchId, ticketId));
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
      setAlertActive(true);
      playCallAnnouncement(ticketData.advisor_name);
      showCallNotification(ticketData.advisor_name, ticketData.ticket_number, lang);
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
  }, [params.id, computePosition, lang]);

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

  // While the call alert is up: repeat the chime + voice every 20s and
  // flash the tab title, until the customer taps "OK" or the advisor
  // moves the ticket on (in_service, held, etc.).
  useEffect(() => {
    if (!alertActive) return;
    if (ticket?.status !== "called") {
      setAlertActive(false);
      return;
    }
    const advisorName = ticket.advisor_name;
    let repeats = 0;
    const repeatId = setInterval(() => {
      repeats += 1;
      if (repeats > ALERT_MAX_REPEATS) {
        clearInterval(repeatId);
        return;
      }
      playCallAnnouncement(advisorName);
    }, ALERT_REPEAT_MS);

    const originalTitle = document.title;
    const flashText = lang === "en" ? "🔔 It's your turn!" : "🔔 حان دورك!";
    let flip = false;
    const titleId = setInterval(() => {
      flip = !flip;
      document.title = flip ? flashText : originalTitle;
    }, 1000);

    return () => {
      clearInterval(repeatId);
      clearInterval(titleId);
      document.title = originalTitle;
    };
  }, [alertActive, ticket?.status, ticket?.advisor_name, lang]);

  // Keep the screen awake while waiting, so the page stays alive and
  // the in-page alert can fire on time. Released once served/done.
  const ticketStatus = ticket?.status;
  useEffect(() => {
    if (!soundEnabled) return;
    if (ticketStatus !== "waiting" && ticketStatus !== "called") return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled) {
          next.release().catch(() => {});
          return;
        }
        lock?.release().catch(() => {});
        lock = next;
      } catch {
        // Denied (low battery, unsupported) — the alert still works.
      }
    };
    acquire();
    // The OS drops the lock when the page is hidden; take it back.
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [soundEnabled, ticketStatus]);

  function acknowledgeAlert() {
    setAlertActive(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

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
            🔔 {t("Tap to enable sound & notification alerts for when it's your turn", "اضغط لتفعيل تنبيهات الصوت والإشعارات عند حلول دورك")}
          </button>
        )}

        {pushStatus && !completed && !inAppClip && (
          <p
            className={`w-full py-2 px-5 text-xs text-center border-b ${
              pushStatus === "on"
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-amber-50 text-amber-800 border-amber-100"
            }`}
          >
            {pushStatus === "on"
              ? t("✓ Lock-screen alerts are on — we'll notify you when it's your turn.", "✓ تنبيهات شاشة القفل مفعّلة — سننبهك عند حلول دورك.")
              : pushStatus === "denied"
              ? t("Notifications are blocked. Turn them on in Settings › Notifications › MG Queue.", "الإشعارات محظورة. فعّلها من الإعدادات › الإشعارات › MG Queue.")
              : pushStatus === "unsupported"
              ? t("Lock-screen alerts need iOS 16.4 or later. Keep this page open to hear your turn.", "تنبيهات شاشة القفل تتطلب iOS 16.4 أو أحدث. أبقِ هذه الصفحة مفتوحة لسماع دورك.")
              : t("Couldn't turn on lock-screen alerts. Keep this page open to hear your turn.", "تعذر تفعيل تنبيهات شاشة القفل. أبقِ هذه الصفحة مفتوحة لسماع دورك.")}
          </p>
        )}

        {alertActive && beingCalled && (
          <div
            role="alertdialog"
            aria-live="assertive"
            className="fixed inset-0 z-50 bg-gradient-to-br from-mg-red to-mg-redDeep flex flex-col items-center justify-center text-center p-8 gap-3"
            dir={dir}
          >
            <div className="text-6xl animate-bounce">🔔</div>
            <p className="text-white/80 text-sm uppercase tracking-widest">{t("It's your turn", "حان دورك")}</p>
            <p className="text-6xl font-bold text-white">{ticket.ticket_number}</p>
            <p className="text-2xl font-semibold text-white">{t("Please proceed now", "يرجى التوجه الآن")}</p>
            <p className="text-white/85">
              {ticket.advisor_name
                ? t(`Advisor ${ticket.advisor_name} is ready for you.`, `المستشار ${ticket.advisor_name} بانتظارك.`)
                : t("An advisor is ready for you.", "أحد المستشارين بانتظارك.")}
            </p>
            <button
              onClick={acknowledgeAlert}
              className="mt-6 w-full max-w-xs py-4 rounded-full bg-white text-mg-red font-bold text-lg shadow-lg"
            >
              {t("OK, I'm on my way", "حسناً، أنا قادم")}
            </button>
          </div>
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
