"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { useSession } from "@/lib/useSession";
import { useToast, ToastBanner } from "@/lib/useToast";
import { Spinner } from "@/lib/Spinner";
import { supabase, Branch, QueueTicket, AppUser } from "@/lib/supabaseClient";

export default function PartsQueuePage() {
  return (
    <RequireAuth allow={["parts_advisor", "manager", "admin"]}>
      <PartsDashboard />
    </RequireAuth>
  );
}

function PartsDashboard() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const { message, showToast } = useToast();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [branchPartsAdvisors, setBranchPartsAdvisors] = useState<AppUser[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [completeModalFor, setCompleteModalFor] = useState<string | null>(null);

  const advisorName = session?.name ?? "";
  const canSeeQueue = session?.role === "admin" || session?.role === "manager" || session?.employee_branch === "Head Office";

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadTickets = useCallback(async (branchId: string) => {
    const { data } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("branch_id", branchId)
      .eq("service_mode", "spare_parts")
      .in("status", ["waiting", "called", "in_service"])
      .order("queue_entry_at", { ascending: true });
    setTickets((data as QueueTicket[]) ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: branchData } = await supabase.from("branches").select("*").eq("code", params.code).maybeSingle();
      if (!branchData) {
        setLoading(false);
        return;
      }
      setBranch(branchData as Branch);
      await loadTickets(branchData.id);
      setLoading(false);
    }
    init();
  }, [params.code, loadTickets]);

  useEffect(() => {
    if (!branch) return;
    const channel = supabase
      .channel(`parts-${branch.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_tickets", filter: `branch_id=eq.${branch.id}` }, () => loadTickets(branch.id))
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.id]);

  useEffect(() => {
    if (!branch?.employee_branch || !canSeeQueue) return;
    async function loadAdvisors() {
      const { data } = await supabase
        .from("app_users")
        .select("*")
        .eq("employee_branch", branch!.employee_branch)
        .eq("role", "parts_advisor");
      setBranchPartsAdvisors((data as AppUser[]) ?? []);
    }
    loadAdvisors();
  }, [branch?.employee_branch, canSeeQueue]);

  async function serveNow(ticketId: string) {
    await supabase
      .from("queue_tickets")
      .update({
        status: "called",
        served_at: new Date().toISOString(),
        advisor_name: advisorName,
        preassigned_advisor: null,
        preassign_urgent: false,
      })
      .eq("id", ticketId);
    showToast(t("Customer called.", "تم استدعاء العميل."));
  }

  async function assignAdvisor(ticketId: string, name: string) {
    if (!name) {
      await supabase.from("queue_tickets").update({ preassigned_advisor: null, preassign_urgent: false }).eq("id", ticketId);
      showToast(t("Assignment cleared.", "تم إلغاء الإسناد."));
      return;
    }
    const urgent = window.confirm(
      t(
        `Is this urgent for ${name}?\n\nOK = urgent — serves next immediately.\nCancel = normal — stays in queue order.`,
        `هل هذا عاجل لـ ${name}؟\n\nموافق = عاجل — يُخدم تالياً فوراً.\nإلغاء = عادي — يبقى في ترتيب الطابور.`
      )
    );
    await supabase.from("queue_tickets").update({ preassigned_advisor: name, preassign_urgent: urgent }).eq("id", ticketId);
    showToast(
      urgent
        ? t(`Urgently assigned to ${name}.`, `تم الإسناد العاجل إلى ${name}.`)
        : t(`Reserved for ${name} in normal turn.`, `تم الحجز لـ ${name} في الدور العادي.`)
    );
  }

  async function confirmComplete() {
    if (!completeModalFor) return;
    await supabase.from("queue_tickets").update({ status: "completed", closed_at: new Date().toISOString() }).eq("id", completeModalFor);
    setCompleteModalFor(null);
    showToast(t("Marked complete.", "تم الإنهاء."));
  }

  async function noShow(ticketId: string) {
    await supabase.from("queue_tickets").update({ status: "no_show" }).eq("id", ticketId);
    showToast(t("Marked as no-show.", "تم تسجيله كعدم حضور."));
  }

  const waiting = useMemo(() => tickets.filter((tk) => tk.status === "waiting"), [tickets]);
  const active = useMemo(() => tickets.filter((tk) => tk.status === "called" || tk.status === "in_service"), [tickets]);
  const activeSession = active[0] ?? null;

  const sessionDuration = useMemo(() => {
    if (!activeSession?.served_at) return "00:00";
    const secs = Math.max(0, Math.floor((now - new Date(activeSession.served_at).getTime()) / 1000));
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }, [activeSession, now]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center gap-2 text-black/40">
        <Spinner size={20} />
        <span className="text-sm">{t("Loading…", "جارِ التحميل…")}</span>
      </main>
    );
  }
  if (!branch) {
    return (
      <main className="min-h-screen flex items-center justify-center text-center p-8">
        <p className="text-black/50">{t("Branch not found.", "الفرع غير موجود.")}</p>
      </main>
    );
  }

  return (
    <div className="font-en text-[#191c1e] h-screen overflow-hidden flex" dir={dir}>
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-20 bg-white/80 backdrop-blur-xl border-b border-mg-red/10 shadow-sm">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <img src="/mg-logo.jpg" alt="MG" className="w-8 h-8 object-contain rounded" />
            <span className="font-bold tracking-tight text-lg">{t("Spare Parts Dashboard", "لوحة قطع الغيار")}</span>
          </div>
          <Link href={`/advisor/${branch.code}`} className="hidden md:flex text-black/60 h-20 items-center hover:text-mg-red transition">
            ← {t("Service Dashboard", "لوحة الخدمة")}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-black/50 hidden sm:inline">{session?.name}</span>
          <button onClick={toggle} className="px-3 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
            {lang === "en" ? "AR" : "EN"}
          </button>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="px-3 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold"
          >
            {t("Log out", "خروج")}
          </button>
        </div>
      </nav>

      <main className="flex-1 pt-20 p-6 h-full overflow-y-auto">
        <div className="max-w-[1440px] mx-auto h-full flex flex-col gap-6">
          <div className="glass-card rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-[#1a1a1a] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 border border-mg-red/30">
                🧰 {t("Branch", "الفرع")}: {lang === "en" ? branch.name_en : branch.name_ar}
              </div>
              <div className="h-6 w-px bg-black/10 hidden sm:block" />
              <div className="flex items-center gap-2 text-black/60 text-sm">
                ➡️ {t("Next in line:", "التالي في الطابور:")}{" "}
                <strong className="text-black">{waiting[0] ? waiting[0].ticket_number : t("none", "لا يوجد")}</strong>
              </div>
            </div>
            <div className="text-xs font-medium text-mg-red bg-mg-red/10 border border-mg-red/20 px-3 py-1 rounded-full flex items-center gap-1">
              ✅ {t("Live · Realtime connected", "مباشر · متصل")}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100%-80px)]">
            <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
              <h2 className="font-semibold text-lg flex justify-between items-center">
                {t("Live Queue", "قائمة الانتظار")}
                <span className="text-xs bg-mg-red/10 text-mg-red px-2 py-1 rounded-md border border-mg-red/20">
                  {waiting.length} {t("waiting", "بالانتظار")}
                </span>
              </h2>
              <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                {waiting.length === 0 && (
                  <p className="text-black/30 text-sm text-center py-10">{t("No one waiting.", "لا يوجد أحد بالانتظار.")}</p>
                )}
                {waiting.map((tk) => (
                  <div key={tk.id} className="glass-card hover-glow rounded-xl p-4">
                    <div className="flex items-start gap-4">
                      <div className="w-14 shrink-0 flex flex-col items-center pt-1">
                        <span className="text-[11px] text-black/40">{t("Ticket", "تذكرة")}</span>
                        <span className="text-lg font-bold">{tk.ticket_number}</span>
                      </div>
                      <div className="flex-1 pt-1 min-w-0">
                        <h4 className="font-semibold text-[16px] truncate flex items-center gap-2 flex-wrap">
                          <span className="truncate">{tk.customer_name}</span>
                          {tk.preassign_urgent && tk.preassigned_advisor && (
                            <span className="shrink-0 bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-full">
                              {t("Urgent", "عاجل")}
                            </span>
                          )}
                        </h4>
                        <p className="text-sm text-black/50 mt-0.5">{t("Spare Parts", "قطع غيار")}</p>
                        <div className="flex items-center gap-4 mt-2 text-[13px] text-black/50 flex-wrap">
                          <span>⏱ {waitLabel(tk.queue_entry_at, lang)}</span>
                          {tk.preassigned_advisor && <span className="text-mg-red font-medium">→ {tk.preassigned_advisor}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0 items-end">
                        <button
                          onClick={() => withBusy(tk.id, () => serveNow(tk.id))}
                          disabled={busyIds.has(tk.id)}
                          className="px-3 py-1.5 rounded-lg bg-mg-red text-white text-xs font-semibold shadow-[0_4px_14px_rgba(226,6,19,0.3)] disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {busyIds.has(tk.id) && <Spinner size={12} />} {t("Serve now", "استدعاء")}
                        </button>
                        {canSeeQueue && (
                          <select
                            value={tk.preassigned_advisor ?? ""}
                            onChange={(e) => assignAdvisor(tk.id, e.target.value)}
                            className="text-[11px] px-2 py-1 rounded-md border border-black/10 bg-white/70 max-w-[130px]"
                          >
                            <option value="">{t("Assign advisor…", "إسناد مستشار…")}</option>
                            {branchPartsAdvisors.map((a) => (
                              <option key={a.id} value={a.name}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 h-full min-h-0">
              <div className="deep-glass-panel rounded-2xl h-full p-8 flex flex-col relative overflow-hidden">
                {!activeSession ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                    <span className="text-3xl">🪑</span>
                    <p className="font-semibold text-black/60">{t("No active session", "لا توجد جلسة نشطة")}</p>
                    <p className="text-sm text-black/40 max-w-xs">
                      {t('Click "Serve now" on a waiting ticket to start a session here.', 'اضغط "استدعاء" على تذكرة بالانتظار لبدء جلسة هنا.')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-8 relative z-10">
                      <div>
                        <span className="text-xs uppercase tracking-widest text-mg-red font-bold mb-2 block">
                          {t("Active Session", "الجلسة النشطة")}
                        </span>
                        <h1 className="text-3xl font-bold">{activeSession.ticket_number}</h1>
                      </div>
                      <div className="text-right glass-card px-4 py-2 rounded-xl border border-mg-red/20">
                        <div className="text-2xl text-mg-red font-bold tabular-nums">{sessionDuration}</div>
                        <span className="text-[11px] text-black/50 uppercase tracking-wide">{t("Duration", "المدة")}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-8 relative z-10">
                      <div className="glass-card p-4 rounded-xl border-t-2 border-t-mg-red">
                        <span className="text-[12px] text-black/50 flex items-center gap-1 mb-1">👤 {t("Customer Name", "اسم العميل")}</span>
                        <p className="text-lg font-semibold">{activeSession.customer_name}</p>
                      </div>
                      <div className="glass-card p-4 rounded-xl">
                        <span className="text-[12px] text-black/50 flex items-center gap-1 mb-1">🧰 {t("Requested", "المطلوب")}</span>
                        <p className="text-lg font-semibold">{t("Spare Parts", "قطع غيار")}</p>
                      </div>
                      <div className="glass-card p-4 rounded-xl">
                        <span className="text-[12px] text-black/50 flex items-center gap-1 mb-1">📱 {t("Mobile", "الجوال")}</span>
                        <p className="text-lg font-semibold" dir="ltr">
                          {activeSession.mobile}
                        </p>
                      </div>
                      <div className="glass-card p-4 rounded-xl flex flex-col justify-center bg-black/[0.02]">
                        <p className="text-sm text-black/50">
                          {t("Entered queue", "دخل الطابور")} {waitLabel(activeSession.queue_entry_at, lang)}
                        </p>
                      </div>
                    </div>

                    <div className="mb-8 relative z-10 flex-1">
                      <label className="text-sm mb-2 block font-semibold flex items-center gap-2">📝 {t("Advisor Notes", "ملاحظات المستشار")}</label>
                      <textarea
                        value={notes[activeSession.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [activeSession.id]: e.target.value }))}
                        placeholder={t(
                          "Enter part details or customer requests here… (kept locally for now — not yet saved to the database)",
                          "أدخل تفاصيل القطعة أو طلبات العميل هنا… (محفوظة محلياً حالياً وليست في قاعدة البيانات بعد)"
                        )}
                        className="w-full bg-white/70 border border-black/10 focus:border-mg-red focus:ring-1 focus:ring-mg-red rounded-xl resize-none h-28 p-4 outline-none"
                      />
                    </div>

                    <div className="flex gap-3 mt-auto relative z-10 flex-wrap">
                      <button
                        onClick={() => setCompleteModalFor(activeSession.id)}
                        className="flex-1 py-4 px-6 rounded-xl bg-mg-red text-white font-bold text-[15px] shadow-[0_4px_14px_rgba(226,6,19,0.3)]"
                      >
                        {t("Complete Session", "إنهاء الجلسة")}
                      </button>
                      <button
                        onClick={() => withBusy(activeSession.id, () => noShow(activeSession.id))}
                        disabled={busyIds.has(activeSession.id)}
                        className="py-4 px-6 rounded-xl border border-black/10 bg-white/50 flex items-center gap-2 hover:border-mg-red hover:bg-mg-red/5 disabled:opacity-50"
                      >
                        {busyIds.has(activeSession.id) ? <Spinner size={14} /> : "🚫"} {t("No Show", "لم يحضر")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {completeModalFor && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6">
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm bg-white">
            <p className="font-semibold text-lg mb-1">{t("Complete session", "إنهاء الجلسة")}</p>
            <p className="text-sm text-black/50 mb-5">{t("Mark this order as fulfilled.", "وضع علامة أن هذا الطلب قد تم تلبيته.")}</p>
            <div className="flex gap-3">
              <button onClick={() => setCompleteModalFor(null)} className="py-3 px-4 rounded-lg border border-black/15 font-semibold flex-1">
                {t("Cancel", "إلغاء")}
              </button>
              <button onClick={confirmComplete} className="py-3 px-4 rounded-lg bg-mg-red text-white font-bold flex-1">
                {t("Complete", "إنهاء")}
              </button>
            </div>
          </div>
        </div>
      )}
      <ToastBanner message={message} />
    </div>
  );
}

function waitLabel(entryAt: string, lang: "en" | "ar") {
  const mins = Math.max(0, Math.round((Date.now() - new Date(entryAt).getTime()) / 60000));
  return lang === "en" ? `${mins} min ago` : `منذ ${mins} د`;
}
