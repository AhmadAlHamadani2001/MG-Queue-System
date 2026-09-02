"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, PaymentType } from "@/lib/supabaseClient";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";

const PAYMENT_OPTIONS: { value: PaymentType; en: string; ar: string }[] = [
  { value: "cash", en: "Cash", ar: "نقدي" },
  { value: "warranty", en: "Warranty", ar: "ضمان" },
  { value: "internal", en: "Internal", ar: "داخلي" },
];

type DuplicateMatch = { id: string; created_by: string; created_at: string };

export default function NewRequestPage() {
  const router = useRouter();
  const { session } = useSession();
  const { t, dir } = useLang();

  const [wipNumber, setWipNumber] = useState("");
  const [remarks, setRemarks] = useState("");
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<DuplicateMatch | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  function togglePayment(pt: PaymentType) {
    setPaymentTypes((prev) => (prev.includes(pt) ? prev.filter((p) => p !== pt) : [...prev, pt]));
  }

  async function checkDuplicate() {
    const wip = wipNumber.trim();
    if (!wip) {
      setDuplicate(null);
      return;
    }
    setCheckingDuplicate(true);
    let query = supabase.from("requests").select("id, created_by, created_at").ilike("wip_number", wip);
    if (session?.employee_branch) {
      query = query.eq("branch", session.employee_branch);
    }
    const { data } = await query.order("created_at", { ascending: false }).limit(1);
    setDuplicate((data && data[0]) ?? null);
    setCheckingDuplicate(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!session) return;
    if (!wipNumber.trim() || !remarks.trim()) {
      setError(t("WIP Number and Remarks are required.", "رقم WIP والملاحظات مطلوبة."));
      return;
    }

    setSubmitting(true);

    const { data, error: insertError } = await supabase
      .from("requests")
      .insert({
        wip_number: wipNumber.trim(),
        remarks: remarks.trim(),
        payment_type: paymentTypes[0] ?? null,
        status: "in_progress",
        branch: session.employee_branch ?? null,
        created_by: session.name,
      })
      .select("id")
      .single();

    if (insertError || !data) {
      setSubmitting(false);
      setError(insertError?.message ?? t("Something went wrong.", "حدث خطأ ما."));
      return;
    }

    // Each payment type becomes its own line, started automatically —
    // no separate "Start process" step.
    if (paymentTypes.length > 0) {
      await supabase.from("request_payment_lines").insert(
        paymentTypes.map((pt) => ({ request_id: data.id, payment_type: pt, status: "in_progress" }))
      );
    }

    await supabase.from("request_audit_log").insert({
      request_id: data.id,
      action: "created",
      actor_name: session.name,
      remarks: t("Request created.", "تم إنشاء الطلب."),
    });

    router.push(`/requests/${data.id}`);
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-xl flex flex-col gap-5" dir={dir}>
      <h1 className="text-xl font-bold">{t("New Request", "طلب جديد")}</h1>

      <Field label={t("WIP Number", "رقم WIP")} required>
        <input
          value={wipNumber}
          onChange={(e) => {
            setWipNumber(e.target.value);
            if (duplicate) setDuplicate(null);
          }}
          onBlur={checkDuplicate}
          placeholder="e.g. WIP-2201"
          dir="ltr"
          className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70"
        />
        {checkingDuplicate && (
          <p className="text-xs text-black/40 mt-1 flex items-center gap-1.5">
            <Spinner size={10} /> {t("Checking for existing records…", "جارِ التحقق من وجود سجلات سابقة…")}
          </p>
        )}
        {duplicate && (
          <div className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
            <p className="text-amber-800">
              {t(
                `A request for this WIP already exists in ${session?.employee_branch ? "this branch" : "the system"} — created by ${duplicate.created_by} on ${new Date(duplicate.created_at).toLocaleDateString()}.`,
                `يوجد طلب لهذا الـWIP بالفعل ${session?.employee_branch ? "في هذا الفرع" : "في النظام"} — أنشأه ${duplicate.created_by} بتاريخ ${new Date(duplicate.created_at).toLocaleDateString()}.`
              )}
            </p>
            <Link href={`/requests/${duplicate.id}`} className="text-amber-900 font-semibold underline text-xs">
              {t("View existing request", "عرض الطلب الموجود")}
            </Link>
          </div>
        )}
      </Field>

      <Field label={t("Remarks", "الملاحظات")} required>
        <textarea
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder={t("Describe the request…", "صف الطلب…")}
          className="w-full h-28 p-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70 resize-none"
        />
      </Field>

      <Field label={t("Payment Type(s)", "أنواع الدفع")}>
        <p className="text-xs text-black/40 -mt-1 mb-1">
          {t(
            "Optional here — you can always add payment types (even more than one of the same kind) from the request page after creating it.",
            "اختياري هنا — يمكنك دائماً إضافة أنواع دفع (وأكثر من نوع واحد من نفس الفئة) من صفحة الطلب بعد إنشائه."
          )}
        </p>
        <div className="flex gap-2 flex-wrap">
          {PAYMENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePayment(opt.value)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                paymentTypes.includes(opt.value) ? "border-mg-red bg-mg-red/5 text-mg-red" : "border-black/10 bg-white/70"
              }`}
            >
              {t(opt.en, opt.ar)}
            </button>
          ))}
        </div>
      </Field>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-4 rounded-lg bg-mg-red text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {submitting && <Spinner size={16} />}
        {submitting ? t("Creating…", "جارِ الإنشاء…") : t("Create Request", "إنشاء الطلب")}
      </button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">
        {label} {required && <span className="text-mg-red">*</span>}
      </label>
      {children}
    </div>
  );
}
