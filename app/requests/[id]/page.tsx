"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase, ServiceRequest, RequestAuditEntry, RequestPaymentLine, PaymentType } from "@/lib/supabaseClient";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { useToast, ToastBanner } from "@/lib/useToast";
import { InlineLoading, Spinner } from "@/lib/Spinner";
import AssigneeAutocomplete from "../AssigneeAutocomplete";

const PAYMENT_LABELS: Record<PaymentType, [string, string]> = {
  cash: ["Cash", "نقدي"],
  warranty: ["Warranty", "ضمان"],
  internal: ["Internal", "داخلي"],
};

function withComment(base: string, comment: string | undefined, t: (en: string, ar: string) => string) {
  if (!comment) return base;
  return `${base} ${t("Comment:", "تعليق:")} ${comment}`;
}

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, dir } = useLang();
  const { message, showToast } = useToast();

  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [audit, setAudit] = useState<RequestAuditEntry[]>([]);
  const [paymentLines, setPaymentLines] = useState<RequestPaymentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [addPaymentType, setAddPaymentType] = useState<PaymentType | "">("");

  const actorName = session?.name ?? "";

  const load = useCallback(async () => {
    const { data: req } = await supabase.from("requests").select("*").eq("id", params.id).maybeSingle();
    setRequest(req as ServiceRequest | null);

    const { data: log } = await supabase
      .from("request_audit_log")
      .select("*")
      .eq("request_id", params.id)
      .order("created_at", { ascending: true });
    setAudit((log as RequestAuditEntry[]) ?? []);

    const { data: lines } = await supabase
      .from("request_payment_lines")
      .select("*")
      .eq("request_id", params.id)
      .order("created_at", { ascending: true });
    setPaymentLines((lines as RequestPaymentLine[]) ?? []);

    setLoading(false);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`request-${params.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests", filter: `id=eq.${params.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_audit_log", filter: `request_id=eq.${params.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "request_payment_lines", filter: `request_id=eq.${params.id}` }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // Every mutation reports failure via toast instead of failing
  // silently — if something doesn't visibly happen (e.g. Return not
  // reassigning), this is what will actually tell you why.
  function reportIfError(error: { message: string } | null, context: string) {
    if (error) {
      showToast(t(`Error (${context}): ${error.message}`, `خطأ (${context}): ${error.message}`));
      return true;
    }
    return false;
  }

  async function logAction(action: string, remarks: string, paymentLineId: string) {
    const { error } = await supabase.from("request_audit_log").insert({
      request_id: params.id,
      payment_line_id: paymentLineId,
      action,
      actor_name: actorName,
      remarks,
    });
    reportIfError(error, "log");
  }

  async function syncRequestStatus() {
    const { data: lines } = await supabase.from("request_payment_lines").select("status").eq("request_id", params.id);
    if (!lines || lines.length === 0) return;
    const allClosed = lines.every((l) => l.status === "closed");
    if (allClosed) {
      await supabase.from("requests").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", params.id);
    } else {
      await supabase.from("requests").update({ status: "in_progress", closed_at: null }).eq("id", params.id);
    }
  }

  async function addPaymentLine() {
    if (!addPaymentType) return;
    const { data, error } = await supabase
      .from("request_payment_lines")
      .insert({ request_id: params.id, payment_type: addPaymentType, status: "in_progress" })
      .select("id")
      .single();
    if (reportIfError(error, "add payment line")) return;
    if (data) {
      await logAction("created", t("Line started.", "تم بدء المسار."), data.id);
    }
    setAddPaymentType("");
    await syncRequestStatus();
    showToast(t("Payment line added.", "تمت إضافة سطر الدفع."));
  }

  const numberedLines = useMemo(() => {
    const counters: Record<string, number> = {};
    return paymentLines.map((line) => {
      counters[line.payment_type] = (counters[line.payment_type] ?? 0) + 1;
      return { line, number: counters[line.payment_type] };
    });
  }, [paymentLines]);

  if (loading) return <InlineLoading label={t("Loading…", "جارِ التحميل…")} />;
  if (!request) return <p className="text-black/50 text-sm">{t("Request not found.", "الطلب غير موجود.")}</p>;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5" dir={dir}>
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-black/40">{t("WIP Number", "رقم WIP")}</p>
            <p className="text-2xl font-bold" dir="ltr">
              {request.wip_number}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs font-semibold px-2 py-1 rounded-full ${
                request.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
              }`}
            >
              {t(request.status.replace("_", " "), request.status.replace("_", " "))}
            </span>
            {/* A real formatted report, not a screen-print of this interactive page */}
            <Link
              href={`/reports/${request.id}`}
              target="_blank"
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5 flex items-center gap-1"
            >
              ⬇️ {t("Download report (PDF)", "تنزيل التقرير (PDF)")}
            </Link>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <Info label={t("Created by", "أنشأه")} value={request.created_by} />
          <Info label={t("Created at", "تاريخ الإنشاء")} value={new Date(request.created_at).toLocaleString()} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-black/40 mb-1">{t("Remarks", "الملاحظات")}</p>
          <p className="text-sm bg-black/[0.03] rounded-lg p-3">{request.remarks}</p>
        </div>
      </div>

      {numberedLines.length === 0 && (
        <p className="text-sm text-black/40 text-center py-4">
          {t("No payment lines yet — add one below to get started.", "لا توجد سطور دفع بعد — أضف واحداً بالأسفل للبدء.")}
        </p>
      )}

      {numberedLines.map(({ line, number }) => (
        <PaymentLineCard
          key={line.id}
          line={line}
          label={`${t(PAYMENT_LABELS[line.payment_type][0], PAYMENT_LABELS[line.payment_type][1])} ${number}`}
          chatEntries={audit.filter((a) => a.payment_line_id === line.id)}
          t={t}
          currentUserName={actorName}
          isAdmin={session?.role === "admin"}
          onLog={(action, remarks) => logAction(action, remarks, line.id)}
          onClose={async (comment) => {
            const { error } = await supabase
              .from("request_payment_lines")
              .update({ status: "closed", closed_by: actorName, closed_at: new Date().toISOString() })
              .eq("id", line.id);
            if (reportIfError(error, "close")) return;
            const base = t('Status changed to "closed".', 'تم تغيير الحالة إلى "مغلق".');
            await logAction("status_changed", withComment(base, comment, t), line.id);
            await syncRequestStatus();
            showToast(t("Closed successfully.", "تم الإغلاق بنجاح."));
          }}
          onReopen={async (comment) => {
            const { error } = await supabase
              .from("request_payment_lines")
              .update({ status: "in_progress", closed_by: null, closed_at: null })
              .eq("id", line.id);
            if (reportIfError(error, "reopen")) return;
            const base = t("Reopened.", "تمت إعادة الفتح.");
            await logAction("reopened", withComment(base, comment, t), line.id);
            await syncRequestStatus();
            showToast(t("Reopened successfully.", "تمت إعادة الفتح بنجاح."));
          }}
          onAssign={async (assignee, comment) => {
            const { error } = await supabase
              .from("request_payment_lines")
              .update({ assignee_id: assignee.id, assignee_name: assignee.name, delegated_by: actorName })
              .eq("id", line.id);
            if (reportIfError(error, "assign")) return;
            const base = t(`Assigned to ${assignee.name}.`, `تم الإسناد إلى ${assignee.name}.`);
            await logAction("assigned", withComment(base, comment, t), line.id);
            showToast(t("Assigned successfully.", "تم الإسناد بنجاح."));
          }}
          onDelegate={async (assignee, task, comment) => {
            const { error } = await supabase
              .from("request_payment_lines")
              .update({ assignee_id: assignee.id, assignee_name: assignee.name, delegated_by: actorName })
              .eq("id", line.id);
            if (reportIfError(error, "delegate")) return;
            let base = task
              ? t(`Delegated "${task}" to ${assignee.name}.`, `تم تفويض "${task}" إلى ${assignee.name}.`)
              : t(`Delegated to ${assignee.name}.`, `تم التفويض إلى ${assignee.name}.`);
            base = withComment(base, comment, t);
            await logAction("delegated", base, line.id);
            showToast(t("Delegated successfully.", "تم التفويض بنجاح."));
          }}
          onRequestApproval={async (approver, comment) => {
            const { error } = await supabase
              .from("request_payment_lines")
              .update({
                awaiting_approval: true,
                assignee_id: approver.id,
                assignee_name: approver.name,
                approval_requested_by: actorName,
              })
              .eq("id", line.id);
            if (reportIfError(error, "request approval")) return;
            const base = t(`Approval requested from ${approver.name}.`, `تم طلب الموافقة من ${approver.name}.`);
            await logAction("approval_requested", withComment(base, comment, t), line.id);
            showToast(t("Approval requested.", "تم طلب الموافقة."));
          }}
          onMarkDone={async (comment) => {
            const backTo = line.delegated_by;
            const { error } = await supabase
              .from("request_payment_lines")
              .update({ assignee_name: backTo, delegated_by: null })
              .eq("id", line.id);
            if (reportIfError(error, "mark done")) return;
            const base = backTo
              ? t(`Marked done by ${line.assignee_name}, reassigned back to ${backTo}.`, `تم الإنجاز بواسطة ${line.assignee_name}، وأعيد الإسناد إلى ${backTo}.`)
              : t("Marked done.", "تم الإنجاز.");
            await logAction("done", withComment(base, comment, t), line.id);
            showToast(t("Marked done.", "تم الإنجاز."));
          }}
          onDecision={async (decision, comment) => {
            const labels: Record<string, [string, string]> = {
              approved: ["Approved.", "تمت الموافقة."],
              rejected: ["Rejected.", "تم الرفض."],
              returned: ["Returned for changes.", "تم الإرجاع للمراجعة."],
            };
            // Any decision ends this approval cycle and hands the line
            // back to whoever originally requested the approval —
            // captured BEFORE this update, since the same update also
            // clears approval_requested_by.
            const requester = line.approval_requested_by;
            const updates: Record<string, unknown> = {
              awaiting_approval: false,
              delegated_by: null,
              approval_requested_by: null,
            };
            if (requester) {
              updates.assignee_name = requester;
            }
            const { error } = await supabase.from("request_payment_lines").update(updates).eq("id", line.id);
            if (reportIfError(error, decision)) return;

            let base = t(labels[decision][0], labels[decision][1]);
            if (requester) {
              base = t(`${labels[decision][0]} Reassigned back to ${requester}.`, `${labels[decision][1]} أعيد الإسناد إلى ${requester}.`);
            }
            await logAction(decision, withComment(base, comment, t), line.id);
            showToast(t("Action recorded successfully.", "تم تسجيل الإجراء بنجاح."));
          }}
        />
      ))}

      <div className="glass-card rounded-2xl p-4 flex gap-2 items-center print:hidden">
        <select
          value={addPaymentType}
          onChange={(e) => setAddPaymentType(e.target.value as PaymentType | "")}
          className="h-10 px-3 rounded-lg border border-black/10 text-sm bg-white/70"
        >
          <option value="">{t("Add payment type…", "إضافة نوع دفع…")}</option>
          {(["cash", "warranty", "internal"] as PaymentType[]).map((pt) => (
            <option key={pt} value={pt}>
              {t(PAYMENT_LABELS[pt][0], PAYMENT_LABELS[pt][1])}
            </option>
          ))}
        </select>
        <button onClick={addPaymentLine} disabled={!addPaymentType} className="h-10 px-4 rounded-lg bg-mg-ink text-white text-sm font-semibold disabled:opacity-40">
          {t("Add", "إضافة")}
        </button>
        <p className="text-xs text-black/40">{t("You can add more than one of the same type.", "يمكنك إضافة أكثر من نوع واحد من نفس الفئة.")}</p>
      </div>

      <ToastBanner message={message} />
    </div>
  );
}

type PendingKind = "assign" | "delegate" | "approval" | "approved" | "rejected" | "returned" | "close" | "reopen" | "done" | null;

function PaymentLineCard({
  line,
  label,
  chatEntries,
  t,
  currentUserName,
  isAdmin,
  onLog,
  onClose,
  onReopen,
  onAssign,
  onDelegate,
  onRequestApproval,
  onMarkDone,
  onDecision,
}: {
  line: RequestPaymentLine;
  label: string;
  chatEntries: RequestAuditEntry[];
  t: (en: string, ar: string) => string;
  currentUserName: string;
  isAdmin: boolean;
  onLog: (action: string, remarks: string) => Promise<void>;
  onClose: (comment?: string) => Promise<void>;
  onReopen: (comment?: string) => Promise<void>;
  onAssign: (assignee: { id: string; name: string }, comment?: string) => Promise<void>;
  onDelegate: (assignee: { id: string; name: string }, task: string, comment?: string) => Promise<void>;
  onRequestApproval: (approver: { id: string; name: string }, comment?: string) => Promise<void>;
  onMarkDone: (comment?: string) => Promise<void>;
  onDecision: (decision: "approved" | "rejected" | "returned", comment?: string) => Promise<void>;
}) {
  const isAssignee = !!currentUserName && currentUserName === line.assignee_name;
  const isRequester = !!currentUserName && currentUserName === line.approval_requested_by;
  const unclaimed = !line.assignee_name;
  const canDecide = isAdmin || isAssignee;
  const canMarkDone = isAdmin || isAssignee;
  const canDelegate = isAdmin || isAssignee || isRequester || unclaimed;

  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const [pending, setPending] = useState<PendingKind>(null);
  const [pendingComment, setPendingComment] = useState("");
  const [pendingAssignee, setPendingAssignee] = useState<{ id: string; name: string } | null>(null);
  const [pendingTask, setPendingTask] = useState("");
  const [busy, setBusy] = useState(false);

  function openPending(kind: PendingKind) {
    setPending(kind);
    setPendingComment("");
    setPendingAssignee(null);
    setPendingTask("");
  }
  function cancelPending() {
    setPending(null);
    setPendingComment("");
    setPendingAssignee(null);
    setPendingTask("");
  }

  async function submitNote() {
    if (!note.trim()) return;
    setNoteBusy(true);
    await onLog("remark_added", note.trim());
    setNote("");
    setNoteBusy(false);
  }

  async function confirmPending() {
    if (!pending) return;
    setBusy(true);
    const comment = pendingComment.trim() || undefined;
    if (pending === "assign" && pendingAssignee) await onAssign(pendingAssignee, comment);
    else if (pending === "delegate" && pendingAssignee) await onDelegate(pendingAssignee, pendingTask.trim(), comment);
    else if (pending === "approval" && pendingAssignee) await onRequestApproval(pendingAssignee, comment);
    else if (pending === "close") await onClose(comment);
    else if (pending === "reopen") await onReopen(comment);
    else if (pending === "done") await onMarkDone(comment);
    else if (pending === "approved" || pending === "rejected" || pending === "returned") await onDecision(pending, comment);
    setBusy(false);
    cancelPending();
  }

  const needsAssigneePick = pending === "assign" || pending === "delegate" || pending === "approval";
  const canConfirm = needsAssigneePick ? !!pendingAssignee : true;

  const pendingLabels: Record<string, [string, string]> = {
    assign: ["Assign", "إسناد"],
    delegate: ["Delegate", "تفويض"],
    approval: ["Request approval", "طلب موافقة"],
    approved: ["Approve", "موافقة"],
    rejected: ["Reject", "رفض"],
    returned: ["Return", "إرجاع"],
    close: ["Close request", "إغلاق الطلب"],
    reopen: ["Reopen", "إعادة فتح"],
    done: ["Mark done", "وضع علامة تم"],
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="font-semibold text-sm">{label}</p>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            line.status === "closed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          }`}
        >
          {t(line.status.replace("_", " "), line.status.replace("_", " "))}
        </span>
      </div>

      <p className="text-sm text-black/60 mb-3">
        {t("Assigned to:", "مسند إلى:")} <span className="font-medium text-black">{line.assignee_name ?? t("nobody yet", "لا أحد بعد")}</span>
      </p>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("Add a general note (not tied to a specific action)…", "أضف ملاحظة عامة (غير مرتبطة بإجراء معين)…")}
        className="w-full h-16 p-3 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70 resize-none text-sm mb-2"
      />

      <div className="flex flex-wrap gap-2 mb-2 print:hidden">
        <button onClick={submitNote} disabled={!note.trim() || noteBusy} className="px-4 py-2 rounded-lg bg-mg-ink text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5">
          {noteBusy && <Spinner size={12} />} {t("Add to audit trail", "إضافة إلى سجل المراجعة")}
        </button>

        {canDelegate && (
          <button onClick={() => openPending("assign")} disabled={busy} className="px-4 py-2 rounded-lg border border-black/15 font-semibold text-sm disabled:opacity-50">
            {t("Assign", "إسناد")}
          </button>
        )}

        {!line.awaiting_approval ? (
          <button onClick={() => openPending("approval")} disabled={busy} className="px-4 py-2 rounded-lg border border-black/15 font-semibold text-sm disabled:opacity-50">
            {t("Approval", "طلب موافقة")}
          </button>
        ) : canDecide ? (
          <>
            <button onClick={() => openPending("approved")} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50">
              {t("Approve", "موافقة")}
            </button>
            <button onClick={() => openPending("rejected")} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold text-sm disabled:opacity-50">
              {t("Reject", "رفض")}
            </button>
            <button onClick={() => openPending("returned")} disabled={busy} className="px-4 py-2 rounded-lg border border-black/15 font-semibold text-sm disabled:opacity-50">
              {t("Return", "إرجاع")}
            </button>
          </>
        ) : (
          <p className="text-xs text-black/40 self-center">
            {t(`Only ${line.assignee_name} can decide this.`, `فقط ${line.assignee_name} يمكنه اتخاذ القرار.`)}
          </p>
        )}

        {canDelegate && (
          <button onClick={() => openPending("delegate")} disabled={busy} className="px-4 py-2 rounded-lg border border-black/15 font-semibold text-sm disabled:opacity-50">
            {t("Delegate", "تفويض")}
          </button>
        )}

        {line.delegated_by && !line.awaiting_approval && canMarkDone && (
          <button onClick={() => openPending("done")} disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm disabled:opacity-50">
            {t("Done", "تم")}
          </button>
        )}

        {line.status !== "closed" ? (
          <button onClick={() => openPending("close")} disabled={busy} className="px-4 py-2 rounded-lg bg-mg-red text-white font-semibold text-sm disabled:opacity-50">
            {t("Close request", "إغلاق الطلب")}
          </button>
        ) : (
          <button onClick={() => openPending("reopen")} disabled={busy} className="px-4 py-2 rounded-lg border border-black/15 font-semibold text-sm disabled:opacity-50">
            {t("Reopen", "إعادة فتح")}
          </button>
        )}
      </div>

      {/* Small comment (and, where relevant, assignee) box for whichever action was just clicked */}
      {pending && (
        <div className="flex flex-col gap-2 mb-3 p-3 rounded-lg bg-black/[0.03] print:hidden">
          <p className="text-xs font-semibold text-black/60">{t(pendingLabels[pending][0], pendingLabels[pending][1])}</p>
          {needsAssigneePick && (
            <AssigneeAutocomplete
              value={pendingAssignee}
              onChange={setPendingAssignee}
              placeholder={pending === "approval" ? t("Who should approve?", "من يجب أن يوافق؟") : t("Who is this for?", "لمن هذا؟")}
            />
          )}
          {pending === "delegate" && (
            <input
              value={pendingTask}
              onChange={(e) => setPendingTask(e.target.value)}
              placeholder={t("Task / action (optional)", "المهمة / الإجراء (اختياري)")}
              className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red bg-white/70"
            />
          )}
          <textarea
            value={pendingComment}
            onChange={(e) => setPendingComment(e.target.value)}
            placeholder={t("Comment (optional)", "تعليق (اختياري)")}
            className="h-16 p-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red bg-white/70 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={confirmPending} disabled={!canConfirm || busy} className="px-3 py-1.5 rounded-lg bg-mg-red text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5">
              {busy && <Spinner size={12} />} {t("Confirm", "تأكيد")}
            </button>
            <button onClick={cancelPending} className="px-3 py-1.5 rounded-lg border border-black/15 text-xs">
              {t("Cancel", "إلغاء")}
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-black/10 pt-3">
        <p className="text-xs uppercase tracking-wide text-black/40 mb-2">{t("Chat history", "سجل المحادثة")}</p>
        <div className="flex flex-col gap-3 max-h-56 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
          {chatEntries.map((entry) => (
            <div key={entry.id} className="border-l-2 border-mg-red/40 pl-3">
              <p className="text-xs font-medium">{entry.actor_name}</p>
              <p className="text-[11px] text-black/40 mb-0.5">
                {new Date(entry.created_at).toLocaleString()} · {entry.action.replace(/_/g, " ")}
              </p>
              {entry.remarks && <p className="text-xs text-black/70">{entry.remarks}</p>}
            </div>
          ))}
          {chatEntries.length === 0 && <p className="text-xs text-black/30">{t("No activity yet.", "لا يوجد نشاط بعد.")}</p>}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-black/40">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
