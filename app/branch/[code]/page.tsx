"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase, Branch, ServiceMode, WipServiceType } from "@/lib/supabaseClient";
import { Spinner } from "@/lib/Spinner";

const WIP_OPTIONS: { value: WipServiceType; en: string; ar: string; icon: string }[] = [
  { value: "general_repair", en: "General Repair", ar: "إصلاح عام", icon: "🔧" },
  { value: "quick_service", en: "Quick Service", ar: "خدمة سريعة", icon: "⚡" },
  { value: "vehicle_delivery", en: "Receive Vehicle after Repair/Quick Service", ar: "استلام المركبة بعد الإصلاح/الخدمة السريعة", icon: "🚚" },
];

const MODE_LABELS: Record<ServiceMode, [string, string]> = {
  appointment: ["Appointment", "موعد مسبق"],
  walk_in: ["Walk-in", "بدون موعد"],
  inquiry: ["Inquiry", "استفسار"],
  spare_parts: ["Spare Parts", "قطع غيار"],
};

export default function BranchRegistrationPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();

  const [lang, setLang] = useState<"en" | "ar">("en");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [loadingBranch, setLoadingBranch] = useState(true);
  const [step, setStep] = useState(1);

  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<ServiceMode | null>(null);
  const [wip, setWip] = useState<WipServiceType | null>(null);
  const [wipNumber, setWipNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateCheck, setDuplicateCheck] = useState<{ type: "active" | "held"; id: string; ticketNumber: string } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = (en: string, ar: string) => (lang === "en" ? en : ar);

  useEffect(() => {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", lang);
  }, [dir, lang]);

  useEffect(() => {
    async function loadBranch() {
      setLoadingBranch(true);
      const { data } = await supabase
        .from("branches")
        .select("id, code, name_en, name_ar, status")
        .eq("code", params.code)
        .maybeSingle();
      setBranch(data as Branch | null);
      setLoadingBranch(false);
    }
    loadBranch();
  }, [params.code]);

  async function checkExistingTicketThenContinue() {
    if (!mobile || !name || !branch) return;
    setCheckingDuplicate(true);
    const fullMobile = `+966${mobile}`;

    const { data: activeData } = await supabase
      .from("queue_tickets")
      .select("id, ticket_number")
      .eq("branch_id", branch.id)
      .eq("mobile", fullMobile)
      .in("status", ["waiting", "called", "in_service"])
      .order("queue_entry_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeData) {
      setDuplicateCheck({ type: "active", id: activeData.id, ticketNumber: activeData.ticket_number });
      setCheckingDuplicate(false);
      return;
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: heldData } = await supabase
      .from("queue_tickets")
      .select("id, ticket_number")
      .eq("branch_id", branch.id)
      .eq("mobile", fullMobile)
      .eq("status", "held")
      .gte("held_at", oneDayAgo)
      .order("held_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (heldData) {
      setDuplicateCheck({ type: "held", id: heldData.id, ticketNumber: heldData.ticket_number });
      setCheckingDuplicate(false);
      return;
    }

    setCheckingDuplicate(false);
    setStep(2);
  }

  async function rejoinFromHold(ticketId: string) {
    await supabase
      .from("queue_tickets")
      .update({ status: "waiting", was_held: true, advisor_name: null, served_at: null })
      .eq("id", ticketId);
    router.push(`/t/${ticketId}`);
  }

  async function handleSubmit() {
    if (!branch || !mobile || !name || !mode) return;
    if ((mode === "appointment" || mode === "walk_in") && !wip) return;
    if (mode === "appointment" && !wipNumber.trim()) return;
    setSubmitting(true);
    setError(null);

    const { data, error: insertError } = await supabase
      .from("queue_tickets")
      .insert({
        branch_id: branch.id,
        customer_name: name,
        mobile: `+966${mobile}`,
        service_mode: mode,
        wip_service_type: wip,
        wip_number: mode === "appointment" ? wipNumber.trim() || null : null,
        status: "waiting",
      })
      .select("id")
      .single();

    setSubmitting(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Something went wrong. Please try again.");
      return;
    }

    router.push(`/t/${data.id}`);
  }

  if (loadingBranch) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-mg-ink/50">{t("Loading branch…", "جارِ التحميل…")}</p>
      </main>
    );
  }

  if (!branch) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-lg font-semibold text-mg-ink">
          {t("Branch not found", "الفرع غير موجود")}
        </p>
        <p className="text-mg-ink/50 text-sm">
          {t(
            "Check the QR code or run the seed data in supabase/schema.sql.",
            "تحقق من رمز QR أو نفّذ بيانات التهيئة في supabase/schema.sql."
          )}
        </p>
      </main>
    );
  }

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
              <p className="text-xs text-mg-ink/50">
                {t("After-Sales Service Center", "مركز خدمة ما بعد البيع")}
              </p>
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

        <div className="flex items-center gap-2 px-5 pt-5">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-2 rounded-full transition-all ${
                n === step ? "w-6 bg-mg-red" : "w-2 bg-black/15"
              }`}
            />
          ))}
        </div>

        <form
          className="flex-1 flex flex-col gap-5 p-5"
          onSubmit={(e) => e.preventDefault()}
        >
          {step === 1 && (
            <>
              <div>
                <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
                  {t("Mobile number", "رقم الجوال")}
                </label>
                <div className="flex items-center h-14 px-4 rounded-lg border border-black/10 bg-white/70 focus-within:border-mg-red">
                  <span className="text-mg-ink/50 mirror">+966</span>
                  <div className="w-px h-6 bg-black/10 mx-3" />
                  <input
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    placeholder="5X XXX XXXX"
                    className="flex-1 bg-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
                  {t("Customer name", "اسم العميل")}
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ahmad Al Hamadani"
                  className="w-full h-14 px-4 rounded-lg border border-black/10 bg-white/70 outline-none focus:border-mg-red"
                />
              </div>
              <button
                type="button"
                disabled={!mobile || !name || checkingDuplicate}
                onClick={checkExistingTicketThenContinue}
                className="mt-auto w-full py-4 rounded-lg bg-mg-ink text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {checkingDuplicate && <Spinner size={16} />}
                {t("Continue", "متابعة")}
              </button>
              <button
                type="button"
                onClick={() => router.push("/track")}
                className="text-center text-sm text-mg-red font-medium py-1"
              >
                {t("Already have a ticket? Track it", "لديك تذكرة بالفعل؟ تتبعها")}
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
                {t("Service type", "نوع الخدمة")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMode("appointment")}
                  className={`glass-card rounded-xl p-4 flex flex-col items-center gap-2 border ${
                    mode === "appointment" ? "border-mg-red bg-mg-red/5" : "border-black/10"
                  }`}
                >
                  <span className="text-xl">📅</span>
                  <span className="text-sm font-semibold">{t("Appointment", "موعد مسبق")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("walk_in")}
                  className={`glass-card rounded-xl p-4 flex flex-col items-center gap-2 border ${
                    mode === "walk_in" ? "border-mg-red bg-mg-red/5" : "border-black/10"
                  }`}
                >
                  <span className="text-xl">🎫</span>
                  <span className="text-sm font-semibold">{t("Walk-in", "بدون موعد")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("inquiry");
                    setWip(null);
                  }}
                  className={`glass-card rounded-xl p-4 flex flex-col items-center gap-2 border ${
                    mode === "inquiry" ? "border-mg-red bg-mg-red/5" : "border-black/10"
                  }`}
                >
                  <span className="text-xl">❓</span>
                  <span className="text-sm font-semibold">{t("Inquiry", "استفسار")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("spare_parts");
                    setWip(null);
                  }}
                  className={`glass-card rounded-xl p-4 flex flex-col items-center gap-2 border ${
                    mode === "spare_parts" ? "border-mg-red bg-mg-red/5" : "border-black/10"
                  }`}
                >
                  <span className="text-xl">🧰</span>
                  <span className="text-sm font-semibold">{t("Spare Parts", "قطع غيار")}</span>
                </button>
              </div>

              {(mode === "appointment" || mode === "walk_in") && (
                <div className="flex flex-col gap-3 mt-2">
                  <label className="text-xs uppercase tracking-wide text-mg-ink/50">
                    {t("What do you need?", "ما الخدمة المطلوبة؟")}
                  </label>
                  {WIP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setWip(opt.value)}
                      className={`flex items-center gap-3 h-14 px-4 rounded-lg border bg-white/70 text-left ${
                        wip === opt.value ? "border-mg-red bg-mg-red/5" : "border-black/10"
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{t(opt.en, opt.ar)}</span>
                    </button>
                  ))}
                </div>
              )}

              {mode === "appointment" && (
                <div>
                  <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
                    {t("WIP number", "رقم WIP")}
                  </label>
                  <input
                    value={wipNumber}
                    onChange={(e) => setWipNumber(e.target.value)}
                    placeholder={t("e.g. WIP-2201", "مثال: WIP-2201")}
                    className="w-full h-14 px-4 rounded-lg border border-black/10 bg-white/70 outline-none focus:border-mg-red"
                    dir="ltr"
                  />
                </div>
              )}

              <div className="flex gap-3 mt-auto">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="py-4 px-5 rounded-lg border border-black/15 font-semibold"
                >
                  {t("Back", "رجوع")}
                </button>
                <button
                  type="button"
                  disabled={
                    !mode ||
                    ((mode === "appointment" || mode === "walk_in") && !wip) ||
                    (mode === "appointment" && !wipNumber.trim())
                  }
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 rounded-lg bg-mg-ink text-white font-bold disabled:opacity-40"
                >
                  {t("Continue", "متابعة")}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="glass-card rounded-2xl p-5 flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-mg-ink/50">
                  {t("Review", "مراجعة")}
                </p>
                <Row label={t("Name", "الاسم")} value={name} />
                <Row label={t("Mobile", "الجوال")} value={`+966 ${mobile}`} dirOverride="ltr" />
                <Row label={t("Service", "الخدمة")} value={MODE_LABELS[mode!] ? t(MODE_LABELS[mode!][0], MODE_LABELS[mode!][1]) : ""} />
                {wip && (
                  <Row
                    label={t("Requested for", "الخدمة المطلوبة")}
                    value={t(
                      WIP_OPTIONS.find((o) => o.value === wip)!.en,
                      WIP_OPTIONS.find((o) => o.value === wip)!.ar
                    )}
                  />
                )}
                {mode === "appointment" && wipNumber && (
                  <Row label={t("WIP number", "رقم WIP")} value={wipNumber} dirOverride="ltr" />
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-3 mt-auto">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="py-4 px-5 rounded-lg border border-black/15 font-semibold"
                >
                  {t("Back", "رجوع")}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className="flex-1 py-4 rounded-lg bg-mg-red text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting && <Spinner size={16} />}
                  {submitting ? t("Joining…", "جارِ الانضمام…") : t("Join the queue", "انضم إلى الطابور")}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      {duplicateCheck && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-6">
          <div className="glass-card rounded-2xl p-6 w-full max-w-sm bg-white flex flex-col items-center text-center gap-2">
            <span className="text-3xl">{duplicateCheck.type === "held" ? "👋" : "⚠️"}</span>
            {duplicateCheck.type === "held" ? (
              <>
                <p className="font-semibold text-mg-ink">{t("You have a held ticket", "لديك تذكرة معلّقة")}</p>
                <p className="text-sm text-mg-ink/50">
                  {t(
                    `You were called earlier for ticket ${duplicateCheck.ticketNumber}. Rejoin the queue and you'll be seen ahead of new arrivals — or create a brand new ticket if this is a different visit.`,
                    `تم استدعاؤك سابقاً للتذكرة ${duplicateCheck.ticketNumber}. أعد الانضمام للطابور وسيتم استقبالك قبل الوافدين الجدد — أو أنشئ تذكرة جديدة إذا كانت هذه زيارة مختلفة.`
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-mg-ink">{t("You already have an active ticket", "لديك تذكرة نشطة بالفعل")}</p>
                <p className="text-sm text-mg-ink/50">
                  {t(
                    `Ticket ${duplicateCheck.ticketNumber} is already in this queue for this number. View it, or create a new ticket if this is a different visit.`,
                    `التذكرة ${duplicateCheck.ticketNumber} موجودة بالفعل في هذا الطابور لهذا الرقم. اعرضها، أو أنشئ تذكرة جديدة إذا كانت هذه زيارة مختلفة.`
                  )}
                </p>
              </>
            )}
            <div className="w-full flex flex-col gap-2 mt-3">
              <button
                onClick={() => (duplicateCheck.type === "held" ? rejoinFromHold(duplicateCheck.id) : router.push(`/t/${duplicateCheck.id}`))}
                className="w-full py-3.5 rounded-lg bg-mg-red text-white font-bold"
              >
                {duplicateCheck.type === "held" ? t("Rejoin the queue", "إعادة الانضمام للطابور") : t("View my ticket", "عرض تذكرتي")}
              </button>
              <button
                onClick={() => {
                  setDuplicateCheck(null);
                  setStep(2);
                }}
                className="w-full py-3.5 rounded-lg border border-black/15 font-semibold text-mg-ink"
              >
                {t("Create new ticket anyway", "إنشاء تذكرة جديدة على أي حال")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Row({ label, value, dirOverride }: { label: string; value: string; dirOverride?: "ltr" | "rtl" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-mg-ink/50">{label}</span>
      <span className="font-medium text-mg-ink" dir={dirOverride}>
        {value}
      </span>
    </div>
  );
}
