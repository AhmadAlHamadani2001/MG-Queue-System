"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { useToast, ToastBanner } from "@/lib/useToast";
import { Spinner } from "@/lib/Spinner";
import { supabase, Branch, QueuePriorityTier } from "@/lib/supabaseClient";

const TIER_LABELS: Record<QueuePriorityTier, [string, string]> = {
  inquiry: ["Inquiry", "استفسار"],
  appointment: ["Appointment", "موعد مسبق"],
  vehicle_delivery: ["Receive Vehicle", "استلام المركبة"],
  general_repair: ["General Repair", "إصلاح عام"],
  quick_service: ["Quick Service", "خدمة سريعة"],
};

const ALL_TIERS: QueuePriorityTier[] = ["inquiry", "appointment", "vehicle_delivery", "general_repair", "quick_service"];

function fullOrder(order: QueuePriorityTier[]): QueuePriorityTier[] {
  const missing = ALL_TIERS.filter((tier) => !order.includes(tier));
  return [...order, ...missing];
}

export default function QueueSettingsPage() {
  return (
    <RequireAuth allow={["manager", "admin"]}>
      <QueueSettingsInner />
    </RequireAuth>
  );
}

function QueueSettingsInner() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const { session } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const { message, showToast } = useToast();

  const [branch, setBranch] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [order, setOrder] = useState<QueuePriorityTier[]>(ALL_TIERS);
  const [fairnessEnabled, setFairnessEnabled] = useState(true);
  const [overrideMinutes, setOverrideMinutes] = useState(15);

  // Branch scoping — same rule as the rest of the dashboard: your own
  // branch only, unless admin or Head Office.
  useEffect(() => {
    if (session === undefined || !session) return;
    const canSeeAll = session.role === "admin" || session.employee_branch === "Head Office";
    if (!canSeeAll && session.demo_branch_code && session.demo_branch_code !== params.code) {
      router.replace(`/advisor/${session.demo_branch_code}/queue-settings`);
    }
  }, [session, params.code, router]);

  useEffect(() => {
    async function load() {
      const { data: branchData } = await supabase.from("branches").select("*").eq("code", params.code).maybeSingle();
      if (!branchData) {
        setLoading(false);
        return;
      }
      setBranch(branchData as Branch);

      const { data: settings } = await supabase
        .from("branch_queue_settings")
        .select("*")
        .eq("branch_id", branchData.id)
        .maybeSingle();
      if (settings) {
        setOrder(fullOrder(settings.priority_order));
        setFairnessEnabled(settings.fairness_enabled);
        setOverrideMinutes(settings.fairness_override_minutes);
      }
      setLoading(false);
    }
    load();
  }, [params.code]);

  function moveUp(index: number) {
    if (index === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }
  function moveDown(index: number) {
    setOrder((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  async function save() {
    if (!branch || !session) return;
    setSaving(true);
    const { error } = await supabase.from("branch_queue_settings").upsert({
      branch_id: branch.id,
      priority_order: order,
      fairness_enabled: fairnessEnabled,
      fairness_override_minutes: overrideMinutes,
      updated_by: session.name,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    showToast(t("Queue settings saved.", "تم حفظ إعدادات الطابور."));
  }

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
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/advisor/${branch.code}`)} className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back to dashboard", "العودة للوحة")}
          </button>
          <p className="font-bold text-sm">
            {t("Queue Settings —", "إعدادات الطابور —")} {lang === "en" ? branch.name_en : branch.name_ar}
          </p>
        </div>
        <button onClick={toggle} className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
          {lang === "en" ? "AR" : "EN"}
        </button>
      </header>

      <div className="max-w-2xl mx-auto p-6 flex flex-col gap-5">
        <p className="text-sm text-black/50">
          {t(
            "Adjust how \"Call Next Customer\" picks who's next for this branch only — other branches are unaffected.",
            "اضبط كيفية اختيار \"استدعاء العميل التالي\" لمن هو التالي في هذا الفرع فقط — الفروع الأخرى لن تتأثر."
          )}
        </p>

        <div className="glass-card rounded-2xl p-6">
          <p className="font-semibold text-sm mb-1">{t("Priority order", "ترتيب الأولوية")}</p>
          <p className="text-xs text-black/40 mb-4">
            {t(
              "Checked before anything else, top to bottom. A manager's urgent assignment always overrides this.",
              "يُفحص قبل أي شيء آخر، من الأعلى للأسفل. الإسناد العاجل من المدير يتجاوز هذا دائماً."
            )}
          </p>
          <div className="flex flex-col gap-2">
            {order.map((tier, i) => (
              <div key={tier} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-mg-red/10 text-mg-red text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="font-medium text-sm">{t(TIER_LABELS[tier][0], TIER_LABELS[tier][1])}</span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    className="w-8 h-8 rounded-lg border border-black/10 disabled:opacity-30 hover:bg-black/5"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveDown(i)}
                    disabled={i === order.length - 1}
                    className="w-8 h-8 rounded-lg border border-black/10 disabled:opacity-30 hover:bg-black/5"
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-black/40 mt-3">
            {t(
              "All five categories are ranked above — reorder any of them. Quick Service's fairness rule (below) still applies wherever it ends up in this list.",
              "جميع الفئات الخمس مرتبة أعلاه — يمكنك إعادة ترتيب أي منها. تظل قاعدة عدالة الخدمة السريعة (أدناه) سارية أياً كان مكانها في هذه القائمة."
            )}
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6">
          <p className="font-semibold text-sm mb-1">{t("Quick Service fairness", "عدالة الخدمة السريعة")}</p>
          <p className="text-xs text-black/40 mb-4">
            {t(
              "Quick Service carries an incentive — when on, it's spread across advisors instead of going to whoever asks first.",
              "الخدمة السريعة تحمل حافزاً — عند التفعيل، تُوزَّع على المستشارين بدلاً من أن تذهب لمن يطلب أولاً."
            )}
          </p>
          <label className="flex items-center gap-3 mb-4">
            <input type="checkbox" checked={fairnessEnabled} onChange={(e) => setFairnessEnabled(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm">{t("Distribute Quick Service fairly across advisors", "توزيع الخدمة السريعة بعدالة على المستشارين")}</span>
          </label>

          <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">
            {t("Override fairness after this many minutes of waiting", "تجاوز العدالة بعد هذا العدد من دقائق الانتظار")}
          </label>
          <input
            type="number"
            min={0}
            value={overrideMinutes}
            onChange={(e) => setOverrideMinutes(Math.max(0, Number(e.target.value)))}
            disabled={!fairnessEnabled}
            className="w-32 h-11 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70 disabled:opacity-40"
          />
          <p className="text-xs text-black/40 mt-2">
            {t(
              "Once a Quick Service customer has waited this long, they're served by whoever calls next, fairness aside — so nobody waits forever.",
              "بمجرد أن ينتظر عميل الخدمة السريعة هذه المدة، يُخدم من قِبل من يستدعي التالي بغض النظر عن العدالة — حتى لا ينتظر أحد إلى الأبد."
            )}
          </p>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3.5 rounded-lg bg-mg-red text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving && <Spinner size={16} />} {t("Save settings", "حفظ الإعدادات")}
        </button>
      </div>
      <ToastBanner message={message} />
    </div>
  );
}
