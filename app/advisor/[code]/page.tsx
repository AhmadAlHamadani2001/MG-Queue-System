"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { useSession } from "@/lib/useSession";
import { useToast, ToastBanner } from "@/lib/useToast";
import { Spinner } from "@/lib/Spinner";
import { supabase, Branch, QueueTicket, Employee, AppUser, BranchQueueSettings, QueuePriorityTier } from "@/lib/supabaseClient";

const WIP_LABELS: Record<string, [string, string]> = {
  general_repair: ["General Repair", "إصلاح عام"],
  quick_service: ["Quick Service", "خدمة سريعة"],
  vehicle_delivery: ["Receive Vehicle after Repair/Quick Service", "استلام المركبة بعد الإصلاح/الخدمة السريعة"],
};

const ALL_QUEUE_TIERS: QueuePriorityTier[] = ["inquiry", "appointment", "vehicle_delivery", "general_repair", "quick_service"];

const DEFAULT_QUEUE_SETTINGS: Pick<BranchQueueSettings, "priority_order" | "fairness_enabled" | "fairness_override_minutes"> = {
  priority_order: ALL_QUEUE_TIERS,
  fairness_enabled: true,
  fairness_override_minutes: 15,
};

// A branch may have saved settings before Appointment/General
// Repair/Quick Service existed as explicit, orderable tiers — this
// appends whatever's missing (in the standard default order) so no
// category ever silently becomes unreachable.
function fullPriorityOrder(order: QueuePriorityTier[]): QueuePriorityTier[] {
  const missing = ALL_QUEUE_TIERS.filter((tier) => !order.includes(tier));
  return [...order, ...missing];
}

function categoryOf(tk: QueueTicket): QueuePriorityTier | null {
  if (tk.service_mode === "inquiry") return "inquiry";
  if (tk.service_mode === "appointment") return "appointment";
  if (tk.wip_service_type === "vehicle_delivery") return "vehicle_delivery";
  if (tk.wip_service_type === "general_repair") return "general_repair";
  if (tk.wip_service_type === "quick_service") return "quick_service";
  return null;
}

// Ranking used by "Call Next Customer": a specific pre-assignment from
// a manager always wins; then the branch's configured priority order
// across all five real categories (Inquiry, Appointment, Receive
// Vehicle, General Repair, Quick Service) — reorderable per branch.
// Quick Service can optionally be distributed fairly across advisors
// (it carries an incentive, so no single advisor should be able to
// always grab it) unless the customer has already waited past the
// branch's fairness window. Every one of these levers is adjustable
// per branch — see /advisor/[code]/queue-settings.
function pickNextTicket(
  waiting: QueueTicket[],
  advisorName: string,
  quickServiceCounts: Record<string, number>,
  settings: Pick<BranchQueueSettings, "priority_order" | "fairness_enabled" | "fairness_override_minutes">
): QueueTicket | null {
  // Urgent pre-assignment jumps straight to the front, ahead of
  // everything else — not configurable, this is a direct manager action.
  const urgent = waiting.find((tk) => tk.preassigned_advisor === advisorName && tk.preassign_urgent);
  if (urgent) return urgent;

  // Anything reserved for a DIFFERENT advisor is invisible to this
  // advisor's ranking entirely — they won't take it even if it would
  // otherwise be next. A non-urgent reservation for THIS advisor stays
  // in the pool and is picked up in its normal turn below.
  const eligible = waiting.filter((tk) => !tk.preassigned_advisor || tk.preassigned_advisor === advisorName);

  // A reactivated hold customer already made it partway through once
  // — they jump ahead of the normal category order (but still behind
  // an explicit urgent preassignment above), oldest reactivation first.
  const reactivated = eligible.filter((tk) => tk.was_held);
  if (reactivated.length > 0) return reactivated[0];

  for (const tier of fullPriorityOrder(settings.priority_order)) {
    const matches = eligible.filter((tk) => categoryOf(tk) === tier);
    if (matches.length === 0) continue;
    const oldest = matches[0]; // eligible preserves ascending queue_entry_at order

    if (tier === "quick_service" && settings.fairness_enabled) {
      const waitedMin = (Date.now() - new Date(oldest.queue_entry_at).getTime()) / 60000;
      if (waitedMin > settings.fairness_override_minutes) return oldest;

      const myCount = quickServiceCounts[advisorName] ?? 0;
      const counts = Object.values(quickServiceCounts);
      const minCount = counts.length ? Math.min(...counts) : 0;
      if (myCount <= minCount) return oldest;

      continue; // not this advisor's fair turn — move on to the next tier
    }

    return oldest;
  }

  return null;
}

export default function AdvisorPage() {
  return (
    <RequireAuth>
      <AdvisorDashboard />
    </RequireAuth>
  );
}

function AdvisorDashboard() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const { message, showToast } = useToast();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [noShowTickets, setNoShowTickets] = useState<QueueTicket[]>([]);
  const [heldTickets, setHeldTickets] = useState<QueueTicket[]>([]);
  const [branchAdvisors, setBranchAdvisors] = useState<AppUser[]>([]);
  const [queueSettings, setQueueSettings] = useState<Pick<
    BranchQueueSettings,
    "priority_order" | "fairness_enabled" | "fairness_override_minutes"
  >>(DEFAULT_QUEUE_SETTINGS);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  const [completeModalFor, setCompleteModalFor] = useState<string | null>(null);
  const [completeWipNumber, setCompleteWipNumber] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [busyTicketIds, setBusyTicketIds] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState(false);
  const [callingNext, setCallingNext] = useState(false);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyTicketIds((prev) => new Set(prev).add(id));
    try {
      await fn();
    } finally {
      setBusyTicketIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const advisorName = session?.name ?? "";
  const canSeeQueue = session?.role === "admin" || session?.role === "manager" || session?.employee_branch === "Head Office";

  useEffect(() => {
    if (session === undefined || !session) return;
    const canSeeAll = session.role === "admin" || session.employee_branch === "Head Office";
    if (!canSeeAll && session.demo_branch_code && session.demo_branch_code !== params.code) {
      router.replace(`/advisor/${session.demo_branch_code}`);
    }
  }, [session, params.code, router]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!advisorName) return;

    async function loadPendingCount() {
      const { count } = await supabase
        .from("request_payment_lines")
        .select("id", { count: "exact", head: true })
        .eq("assignee_name", advisorName)
        .neq("status", "closed");
      setPendingRequestCount(count ?? 0);
    }
    loadPendingCount();

    const channel = supabase
      .channel(`pending-requests-${advisorName}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_payment_lines" }, loadPendingCount)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [advisorName]);

  const loadTickets = useCallback(async (branchId: string) => {
    const { data } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("branch_id", branchId)
      .in("status", ["waiting", "called", "in_service"])
      .neq("service_mode", "spare_parts")
      .order("queue_entry_at", { ascending: true });
    setTickets((data as QueueTicket[]) ?? []);

    const { data: noShows } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("branch_id", branchId)
      .eq("status", "no_show")
      .neq("service_mode", "spare_parts")
      .order("queue_entry_at", { ascending: false })
      .limit(10);
    setNoShowTickets((noShows as QueueTicket[]) ?? []);

    // Held tickets stay reactivatable for 24 hours from when they
    // were held — older ones just stop appearing here (and in the
    // customer's own /track lookup), no cleanup job needed.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: held } = await supabase
      .from("queue_tickets")
      .select("*")
      .eq("branch_id", branchId)
      .eq("status", "held")
      .neq("service_mode", "spare_parts")
      .gte("held_at", oneDayAgo)
      .order("held_at", { ascending: false });
    setHeldTickets((held as QueueTicket[]) ?? []);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: branchData } = await supabase
        .from("branches")
        .select("*")
        .eq("code", params.code)
        .maybeSingle();
      if (!branchData) {
        setLoading(false);
        return;
      }
      setBranch(branchData as Branch);
      const { data: settingsData } = await supabase
        .from("branch_queue_settings")
        .select("*")
        .eq("branch_id", branchData.id)
        .maybeSingle();
      if (settingsData) {
        setQueueSettings({
          priority_order: settingsData.priority_order,
          fairness_enabled: settingsData.fairness_enabled,
          fairness_override_minutes: settingsData.fairness_override_minutes,
        });
      }
      await loadTickets(branchData.id);
      setLoading(false);
    }
    init();
  }, [params.code, loadTickets]);

  useEffect(() => {
    if (!branch) return;
    const channel = supabase
      .channel(`advisor-${branch.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "queue_tickets", filter: `branch_id=eq.${branch.id}` },
        () => loadTickets(branch.id)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branch_queue_settings", filter: `branch_id=eq.${branch.id}` },
        (payload) => {
          const row = payload.new as BranchQueueSettings | undefined;
          if (row) {
            setQueueSettings({
              priority_order: row.priority_order,
              fairness_enabled: row.fairness_enabled,
              fairness_override_minutes: row.fairness_override_minutes,
            });
          }
        }
      )
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
        .eq("role", "advisor");
      setBranchAdvisors((data as AppUser[]) ?? []);
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
        was_held: false,
      })
      .eq("id", ticketId);
    showToast(t("Customer called.", "تم استدعاء العميل."));
  }

  async function getQuickServiceCountsToday(branchId: string) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("queue_tickets")
      .select("advisor_name")
      .eq("branch_id", branchId)
      .eq("wip_service_type", "quick_service")
      .not("served_at", "is", null)
      .gte("served_at", startOfDay.toISOString());
    const counts: Record<string, number> = {};
    (data ?? []).forEach((r: { advisor_name: string | null }) => {
      if (r.advisor_name) counts[r.advisor_name] = (counts[r.advisor_name] ?? 0) + 1;
    });
    return counts;
  }

  async function callNextCustomer() {
    if (!branch || callingNext) return;
    setCallingNext(true);
    const counts = await getQuickServiceCountsToday(branch.id);
    const candidate = pickNextTicket(waiting, advisorName, counts, queueSettings);
    if (!candidate) {
      setCallingNext(false);
      showToast(t("No customer available for you right now.", "لا يوجد عميل متاح لك الآن."));
      return;
    }
    await serveNow(candidate.id);
    setCallingNext(false);
  }

  async function assignAdvisor(ticketId: string, name: string) {
    if (!name) {
      await supabase.from("queue_tickets").update({ preassigned_advisor: null, preassign_urgent: false }).eq("id", ticketId);
      showToast(t("Assignment cleared.", "تم إلغاء الإسناد."));
      return;
    }
    const urgent = window.confirm(
      t(
        `Is this urgent for ${name}?\n\nOK = urgent — serves next on their queue immediately.\nCancel = normal — stays in queue order, but only ${name} will serve them when their turn comes.`,
        `هل هذا عاجل لـ ${name}؟\n\nموافق = عاجل — يُخدم تالياً في طابوره فوراً.\nإلغاء = عادي — يبقى في ترتيب الطابور، لكن ${name} فقط من سيخدمه عند دوره.`
      )
    );
    await supabase.from("queue_tickets").update({ preassigned_advisor: name, preassign_urgent: urgent }).eq("id", ticketId);
    showToast(
      urgent
        ? t(`Urgently assigned to ${name}.`, `تم الإسناد العاجل إلى ${name}.`)
        : t(`Reserved for ${name} in normal turn.`, `تم الحجز لـ ${name} في الدور العادي.`)
    );
  }

  function openCompleteModal(ticketId: string, existingWipNumber: string | null) {
    setCompleteWipNumber(existingWipNumber ?? "");
    setCompleteModalFor(ticketId);
  }

  async function confirmComplete() {
    if (!completeModalFor) return;
    setCompleting(true);
    const updates: Record<string, unknown> = { status: "completed", closed_at: new Date().toISOString() };
    if (completeWipNumber.trim()) updates.wip_number = completeWipNumber.trim();
    await supabase.from("queue_tickets").update(updates).eq("id", completeModalFor);
    setCompleteModalFor(null);
    setCompleteWipNumber("");
    setCompleting(false);
    showToast(t("Session completed successfully.", "تم إنهاء الجلسة بنجاح."));
  }

  async function noShow(ticketId: string) {
    await supabase.from("queue_tickets").update({ status: "no_show" }).eq("id", ticketId);
    showToast(t("Marked as no-show.", "تم تسجيله كعدم حضور."));
  }

  async function holdCustomer(ticketId: string) {
    await supabase.from("queue_tickets").update({ status: "held", held_at: new Date().toISOString() }).eq("id", ticketId);
    showToast(t("Customer held — valid for 24 hours.", "تم تعليق العميل — صالح لمدة 24 ساعة."));
  }

  async function reactivateFromHold(ticketId: string) {
    await supabase
      .from("queue_tickets")
      .update({ status: "waiting", was_held: true, advisor_name: null, served_at: null })
      .eq("id", ticketId);
    showToast(t("Reactivated — back in the queue with priority.", "تمت إعادة التنشيط — رجع للطابور بأولوية."));
  }

  async function returnToQueue(ticketId: string) {
    await supabase
      .from("queue_tickets")
      .update({ status: "waiting", queue_entry_at: new Date().toISOString() })
      .eq("id", ticketId);
    showToast(t("Returned to queue.", "تمت الإعادة إلى الطابور."));
  }

  async function transferToManager(ticketId: string) {
    if (!branch?.employee_branch) {
      showToast(t("No manager mapping for this branch yet.", "لا يوجد مدير مرتبط بهذا الفرع بعد."));
      return;
    }
    setTransferring(true);

    const myTitle = (session?.title ?? "").toLowerCase();
    let targetTitlePatterns: string[];
    if (myTitle.includes("supervisor")) {
      targetTitlePatterns = ["%service manager%", "%head of service%", "%manager%"];
    } else if (myTitle.includes("advisor")) {
      targetTitlePatterns = ["%service supervisor%", "%supervisor%", "%service manager%", "%manager%"];
    } else {
      targetTitlePatterns = ["%manager%"];
    }

    let manager: Employee | null = null;
    for (const pattern of targetTitlePatterns) {
      const { data } = await supabase
        .from("employees")
        .select("*")
        .eq("branch", branch.employee_branch)
        .ilike("title", pattern)
        .limit(1)
        .maybeSingle();
      if (data) {
        manager = data as Employee;
        break;
      }
    }

    if (!manager) {
      setTransferring(false);
      showToast(t("No manager found for this branch.", "لم يتم العثور على مدير لهذا الفرع."));
      return;
    }

    await supabase.from("queue_tickets").update({ advisor_name: manager.name }).eq("id", ticketId);
    setTransferring(false);
    showToast(t(`Transferred to ${manager.name}.`, `تم التحويل إلى ${manager.name}.`));
  }

  const waiting = useMemo(() => tickets.filter((tk) => tk.status === "waiting"), [tickets]);
  const active = useMemo(
    () => tickets.filter((tk) => tk.status === "called" || tk.status === "in_service"),
    [tickets]
  );
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mg-logo.jpg" alt="MG" className="w-8 h-8 object-contain rounded" />
            <span className="font-bold tracking-tight text-lg">{t("Service Dashboard", "لوحة الخدمة")}</span>
          </div>
          <div className="hidden md:flex gap-8 h-20 items-center">
            <span className="font-bold text-mg-red border-b-2 border-mg-red h-20 flex items-center">
              {t("Dashboard", "الرئيسية")}
            </span>
            <Link href={`/advisor/${branch.code}/analytics`} className="text-black/60 h-20 flex items-center hover:text-mg-red transition">
              {t("Analytics", "التحليلات")}
            </Link>
            <Link href={`/advisor/${branch.code}/customers`} className="text-black/60 h-20 flex items-center hover:text-mg-red transition">
              {t("Customers", "العملاء")}
            </Link>
          </div>
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

      <aside
        className={`fixed top-0 h-screen flex-col py-8 bg-white/90 backdrop-blur-2xl shadow-lg w-64 pt-28 z-40 hidden md:flex ${
          dir === "rtl" ? "right-0 border-l border-mg-red/10" : "left-0 border-r border-mg-red/10"
        }`}
      >
        <div className="px-6 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 mg-octagon bg-black/5 flex items-center justify-center text-mg-red font-bold border border-mg-red/30">
              {advisorName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </div>
            <div>
              <h3 className="font-semibold text-[15px] leading-tight">{advisorName}</h3>
              <p className="text-xs text-black/50">{lang === "en" ? branch.name_en : branch.name_ar}</p>
            </div>
          </div>
          {!canSeeQueue && (
            <button
              onClick={callNextCustomer}
              disabled={callingNext || waiting.length === 0}
              className="w-full py-3 px-4 rounded-md bg-mg-red text-white font-semibold text-sm flex justify-center items-center gap-2 shadow-[0_4px_14px_rgba(226,6,19,0.3)] disabled:opacity-40"
            >
              {callingNext ? <Spinner size={14} /> : "📣"} {t("Call Next Customer", "استدعاء العميل التالي")}
            </button>
          )}
        </div>
        <nav className="flex-1 flex flex-col gap-1 px-2">
          <span className="bg-mg-red/10 text-mg-red rounded-xl mx-2 my-1 p-3 flex items-center gap-3 text-sm font-medium border border-mg-red/20">
            📋 {t("Queue Management", "إدارة الطابور")}
          </span>
          <Link href={`/advisor/${branch.code}/analytics`} className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
            📊 {t("Analytics", "التحليلات")}
          </Link>
          <Link href={`/advisor/${branch.code}/customers`} className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
            🧑‍🤝‍🧑 {t("Customers", "العملاء")}
          </Link>
          {canSeeQueue && (
            <Link href={`/parts/${branch.code}`} className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
              🧰 {t("Spare Parts Queue", "طابور قطع الغيار")}
            </Link>
          )}
          {canSeeQueue && (
            <Link href={`/advisor/${branch.code}/queue-settings`} className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
              ⚙️ {t("Queue Settings", "إعدادات الطابور")}
            </Link>
          )}
          <Link href="/requests" className="text-black/60 mx-2 my-1 p-3 flex items-center justify-between text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
            <span className="flex items-center gap-3">🗂️ {t("Request Management", "إدارة الطلبات")}</span>
            {pendingRequestCount > 0 && (
              <span className="bg-mg-red text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{pendingRequestCount}</span>
            )}
          </Link>
          <Link href="/forms" className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
            📄 {t("Forms", "النماذج")}
          </Link>
          <Link href="/team" className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
            👥 {t("Team", "الفريق")}
          </Link>
          {session?.role === "admin" && (
            <Link href="/admin" className="text-black/60 mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl hover:bg-black/5 hover:text-mg-red transition">
              🔐 {t("Admin", "الإدارة")}
            </Link>
          )}
        </nav>
      </aside>

      <main className={`flex-1 pt-20 p-6 h-full overflow-y-auto ${dir === "rtl" ? "md:mr-64" : "md:ml-64"}`}>
        <div className="max-w-[1440px] mx-auto h-full flex flex-col gap-6">
          <div className="glass-card rounded-xl p-4 flex flex-wrap justify-between items-center gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="bg-[#1a1a1a] text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 border border-mg-red/30">
                🏁 {t("Branch", "الفرع")}: {lang === "en" ? branch.name_en : branch.name_ar}
              </div>
              <div className="h-6 w-px bg-black/10 hidden sm:block" />
              <div className="flex items-center gap-2 text-black/60 text-sm">
                {canSeeQueue ? (
                  <>
                    ➡️ {t("Next in line:", "التالي في الطابور:")}{" "}
                    <strong className="text-black">{waiting[0] ? waiting[0].ticket_number : t("none", "لا يوجد")}</strong>
                  </>
                ) : (
                  <>
                    ⏳ {waiting.length} {t("waiting", "بالانتظار")}
                  </>
                )}
              </div>
            </div>
            <div className="text-xs font-medium text-mg-red bg-mg-red/10 border border-mg-red/20 px-3 py-1 rounded-full flex items-center gap-1">
              ✅ {t("Live · Realtime connected", "مباشر · متصل")}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100%-80px)]">
            <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
              {canSeeQueue ? (
                <>
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
                      <div
                        key={tk.id}
                        className={`glass-card hover-glow rounded-xl p-4 ${
                          tk.service_mode === "appointment" ? "border-l-4 border-l-mg-red" : ""
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-14 shrink-0 flex flex-col items-center pt-1">
                            <span className="text-[11px] text-black/40">{t("Ticket", "تذكرة")}</span>
                            <span className="text-lg font-bold">{tk.ticket_number}</span>
                          </div>
                          <div className="flex-1 pt-1 min-w-0">
                            <h4 className="font-semibold text-[16px] truncate flex items-center gap-2 flex-wrap">
                              <span className="truncate">{tk.customer_name}</span>
                              {tk.service_mode === "appointment" && (
                                <span className="shrink-0 bg-mg-red/10 text-mg-red border border-mg-red/30 text-[11px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                  ⭐ {t("Appointment", "موعد")}
                                </span>
                              )}
                              {tk.preassign_urgent && tk.preassigned_advisor && (
                                <span className="shrink-0 bg-red-600 text-white text-[11px] px-2 py-0.5 rounded-full">
                                  {t("Urgent", "عاجل")}
                                </span>
                              )}
                            </h4>
                            <p className="text-sm text-black/50 mt-0.5">
                              {t("Service:", "الخدمة:")}{" "}
                              {tk.service_mode === "inquiry"
                                ? t("Inquiry", "استفسار")
                                : tk.wip_service_type
                                ? t(WIP_LABELS[tk.wip_service_type][0], WIP_LABELS[tk.wip_service_type][1])
                                : t("Diagnostics", "تشخيص")}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-[13px] text-black/50 flex-wrap">
                              <span>⏱ {waitLabel(tk.queue_entry_at, lang)}</span>
                              {tk.wip_number && <span dir="ltr">WIP: {tk.wip_number}</span>}
                              {tk.preassigned_advisor && (
                                <span className="text-mg-red font-medium">→ {tk.preassigned_advisor}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1.5 shrink-0 items-end">
                            <button
                              onClick={() => withBusy(tk.id, () => serveNow(tk.id))}
                              disabled={busyTicketIds.has(tk.id)}
                              className="px-3 py-1.5 rounded-lg bg-mg-red text-white text-xs font-semibold shadow-[0_4px_14px_rgba(226,6,19,0.3)] disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {busyTicketIds.has(tk.id) && <Spinner size={12} />} {t("Serve now", "استدعاء")}
                            </button>
                            <select
                              value={tk.preassigned_advisor ?? ""}
                              onChange={(e) => assignAdvisor(tk.id, e.target.value)}
                              className="text-[11px] px-2 py-1 rounded-md border border-black/10 bg-white/70 max-w-[130px]"
                            >
                              <option value="">{t("Assign advisor…", "إسناد مستشار…")}</option>
                              {branchAdvisors.map((a) => (
                                <option key={a.id} value={a.name}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {noShowTickets.length > 0 && (
                    <div className="border-t border-black/10 pt-3">
                      <p className="text-xs uppercase tracking-wide text-black/40 mb-2">
                        {t("No-shows — recoverable", "لم يحضروا — قابل للاسترجاع")}
                      </p>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {noShowTickets.map((tk) => (
                          <div key={tk.id} className="flex items-center justify-between gap-2 bg-black/[0.03] rounded-lg px-3 py-2">
                            <p className="text-sm font-medium truncate min-w-0">
                              {tk.ticket_number} · {tk.customer_name}
                            </p>
                            <button
                              onClick={() => withBusy(tk.id, () => returnToQueue(tk.id))}
                              disabled={busyTicketIds.has(tk.id)}
                              className="shrink-0 text-xs font-semibold text-mg-red hover:underline disabled:opacity-50 flex items-center gap-1"
                            >
                              {busyTicketIds.has(tk.id) && <Spinner size={10} />} {t("Return to queue", "إعادة للطابور")}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {heldTickets.length > 0 && (
                    <div className="border-t border-black/10 pt-3">
                      <p className="text-xs uppercase tracking-wide text-black/40 mb-2">
                        {t("On hold — valid 24h, or customer can reactivate via /track", "معلّق — صالح 24 ساعة، أو يمكن للعميل إعادة التنشيط عبر /track")}
                      </p>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {heldTickets.map((tk) => (
                          <div key={tk.id} className="flex items-center justify-between gap-2 bg-black/[0.03] rounded-lg px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {tk.ticket_number} · {tk.customer_name}
                              </p>
                              <p className="text-[11px] text-black/40">{holdExpiryLabel(tk.held_at, lang)}</p>
                            </div>
                            <button
                              onClick={() => withBusy(tk.id, () => reactivateFromHold(tk.id))}
                              disabled={busyTicketIds.has(tk.id)}
                              className="shrink-0 text-xs font-semibold text-mg-red hover:underline disabled:opacity-50 flex items-center gap-1"
                            >
                              {busyTicketIds.has(tk.id) && <Spinner size={10} />} {t("Reactivate", "إعادة تنشيط")}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 glass-card rounded-2xl p-8">
                  <span className="text-4xl">📣</span>
                  <div>
                    <p className="font-semibold text-lg mb-1">{t("Ready when you are", "جاهز عندما تكون مستعداً")}</p>
                    <p className="text-sm text-black/50 max-w-xs">
                      {t(
                        "The queue is managed automatically — click Call Next Customer and we'll bring you the right one.",
                        "يُدار الطابور تلقائياً — اضغط استدعاء العميل التالي وسنحضر لك العميل المناسب."
                      )}
                    </p>
                  </div>
                  <button
                    onClick={callNextCustomer}
                    disabled={callingNext || waiting.length === 0}
                    className="px-8 py-4 rounded-xl bg-mg-red text-white font-bold shadow-[0_4px_14px_rgba(226,6,19,0.3)] disabled:opacity-40 flex items-center gap-2"
                  >
                    {callingNext ? <Spinner size={16} /> : "📣"} {t("Call Next Customer", "استدعاء العميل التالي")}
                  </button>
                  <p className="text-xs text-black/40">
                    {waiting.length} {t("waiting", "بالانتظار")}
                  </p>
                </div>
              )}
            </div>

            <div className="lg:col-span-7 h-full min-h-0">
              <div className="deep-glass-panel rounded-2xl h-full p-8 flex flex-col relative overflow-hidden">
                {!activeSession ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                    <span className="text-3xl">🪑</span>
                    <p className="font-semibold text-black/60">{t("No active session", "لا توجد جلسة نشطة")}</p>
                    <p className="text-sm text-black/40 max-w-xs">
                      {canSeeQueue
                        ? t('Click "Serve now" on a waiting ticket to start a session here.', 'اضغط "استدعاء" على تذكرة بالانتظار لبدء جلسة هنا.')
                        : t('Click "Call Next Customer" to start a session here.', 'اضغط "استدعاء العميل التالي" لبدء جلسة هنا.')}
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
                        <span className="text-[12px] text-black/50 flex items-center gap-1 mb-1">🔧 {t("Requested Service", "الخدمة المطلوبة")}</span>
                        <p className="text-lg font-semibold">
                          {activeSession.service_mode === "inquiry"
                            ? t("Inquiry", "استفسار")
                            : activeSession.wip_service_type
                            ? t(WIP_LABELS[activeSession.wip_service_type][0], WIP_LABELS[activeSession.wip_service_type][1])
                            : t("Not specified (walk-in)", "غير محدد (بدون موعد)")}
                        </p>
                      </div>
                      <div className="glass-card p-4 rounded-xl">
                        <span className="text-[12px] text-black/50 flex items-center gap-1 mb-1">📱 {t("Mobile", "الجوال")}</span>
                        <p className="text-lg font-semibold" dir="ltr">
                          {activeSession.mobile}
                        </p>
                      </div>
                      <div className="glass-card p-4 rounded-xl flex flex-col justify-center bg-black/[0.02]">
                        <span className="chip-audit px-3 py-1 rounded-md inline-block w-max mb-2 text-xs">
                          {activeSession.service_mode === "appointment" ? t("Appointment", "موعد مسبق") : t("Walk-in", "بدون موعد")}
                        </span>
                        <p className="text-sm text-black/50">
                          {t("Entered queue", "دخل الطابور")} {waitLabel(activeSession.queue_entry_at, lang)}
                          {activeSession.wip_number && (
                            <span className="block mt-1" dir="ltr">
                              WIP: {activeSession.wip_number}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="mb-8 relative z-10 flex-1">
                      <label className="text-sm mb-2 block font-semibold flex items-center gap-2">📝 {t("Advisor Notes", "ملاحظات المستشار")}</label>
                      <textarea
                        value={notes[activeSession.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [activeSession.id]: e.target.value }))}
                        placeholder={t(
                          "Enter service details or customer requests here… (kept locally for now — not yet saved to the database)",
                          "أدخل تفاصيل الخدمة أو طلبات العميل هنا… (محفوظة محلياً حالياً وليست في قاعدة البيانات بعد)"
                        )}
                        className="w-full bg-white/70 border border-black/10 focus:border-mg-red focus:ring-1 focus:ring-mg-red rounded-xl resize-none h-28 p-4 outline-none"
                      />
                    </div>

                    <div className="flex gap-3 mt-auto relative z-10 flex-wrap">
                      <button
                        onClick={() => openCompleteModal(activeSession.id, activeSession.wip_number)}
                        className="flex-1 py-4 px-6 rounded-xl bg-mg-red text-white font-bold text-[15px] shadow-[0_4px_14px_rgba(226,6,19,0.3)]"
                      >
                        {t("Complete Session", "إنهاء الجلسة")}
                      </button>
                      <button
                        onClick={() => withBusy(activeSession.id, () => noShow(activeSession.id))}
                        disabled={busyTicketIds.has(activeSession.id)}
                        className="py-4 px-6 rounded-xl border border-black/10 bg-white/50 flex items-center gap-2 hover:border-mg-red hover:bg-mg-red/5 disabled:opacity-50"
                      >
                        {busyTicketIds.has(activeSession.id) ? <Spinner size={14} /> : "🚫"} {t("No Show", "لم يحضر")}
                      </button>
                      <button
                        onClick={() => withBusy(activeSession.id, () => holdCustomer(activeSession.id))}
                        disabled={busyTicketIds.has(activeSession.id)}
                        className="py-4 px-6 rounded-xl border border-black/10 bg-white/50 flex items-center gap-2 hover:border-mg-red hover:bg-mg-red/5 disabled:opacity-50"
                      >
                        {busyTicketIds.has(activeSession.id) ? <Spinner size={14} /> : "⏸️"} {t("Hold", "تعليق")}
                      </button>
                      <button
                        onClick={() => transferToManager(activeSession.id)}
                        disabled={transferring}
                        className="py-4 px-6 rounded-xl border border-black/10 bg-white/50 flex items-center gap-2 hover:border-mg-red hover:bg-mg-red/5 disabled:opacity-40"
                      >
                        {transferring ? <Spinner size={14} /> : "🔀"} {transferring ? t("Transferring…", "جارِ التحويل…") : t("Transfer to Manager", "تحويل إلى المدير")}
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
            <p className="text-sm text-black/50 mb-4">{t("Add a WIP number for this job (optional).", "أدخل رقم WIP لهذه الخدمة (اختياري).")}</p>
            <input
              value={completeWipNumber}
              onChange={(e) => setCompleteWipNumber(e.target.value)}
              placeholder={t("WIP number (optional)", "رقم WIP (اختياري)")}
              dir="ltr"
              className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red mb-5"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setCompleteModalFor(null);
                  setCompleteWipNumber("");
                }}
                className="py-3 px-4 rounded-lg border border-black/15 font-semibold flex-1"
              >
                {t("Cancel", "إلغاء")}
              </button>
              <button onClick={confirmComplete} disabled={completing} className="py-3 px-4 rounded-lg bg-mg-red text-white font-bold flex-1 disabled:opacity-50 flex items-center justify-center gap-1.5">
                {completing && <Spinner size={14} />} {t("Complete", "إنهاء")}
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

function holdExpiryLabel(heldAt: string | null, lang: "en" | "ar") {
  if (!heldAt) return "";
  const hoursLeft = 24 - (Date.now() - new Date(heldAt).getTime()) / 3600000;
  const rounded = Math.max(0, Math.round(hoursLeft));
  return lang === "en" ? `Expires in ~${rounded}h` : `تنتهي خلال ~${rounded} س`;
}
