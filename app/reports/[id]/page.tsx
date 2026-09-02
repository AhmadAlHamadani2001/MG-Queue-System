"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { supabase, ServiceRequest, RequestAuditEntry, RequestPaymentLine, PaymentType } from "@/lib/supabaseClient";

const PAYMENT_LABELS: Record<PaymentType, string> = {
  cash: "Cash",
  warranty: "Warranty",
  internal: "Internal",
};

export default function RequestReportPage() {
  return (
    <RequireAuth>
      <Report />
    </RequireAuth>
  );
}

function Report() {
  const params = useParams<{ id: string }>();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [audit, setAudit] = useState<RequestAuditEntry[]>([]);
  const [paymentLines, setPaymentLines] = useState<RequestPaymentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  async function downloadPdf() {
    if (!reportRef.current || !request) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(reportRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "pt", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
      pdf.save(`WIP-${request.wip_number}-report.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  useEffect(() => {
    async function load() {
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
    }
    load();
  }, [params.id]);

  const numbered = (() => {
    const counters: Record<string, number> = {};
    return paymentLines.map((line) => {
      counters[line.payment_type] = (counters[line.payment_type] ?? 0) + 1;
      return { line, number: counters[line.payment_type] };
    });
  })();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-black/40">
        <p>Loading report…</p>
      </main>
    );
  }
  if (!request) {
    return (
      <main className="min-h-screen flex items-center justify-center text-black/40">
        <p>Request not found.</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="print:hidden sticky top-0 bg-white border-b border-black/10 p-4 flex justify-between items-center">
        <p className="text-sm text-black/50">This report downloads as an actual PDF file — no print dialog involved.</p>
        <button
          onClick={downloadPdf}
          disabled={downloading}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
        >
          {downloading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Generating…
            </>
          ) : (
            <>⬇️ Download PDF</>
          )}
        </button>
      </div>

      <div ref={reportRef} className="max-w-3xl mx-auto p-10 print:p-0" style={{ backgroundColor: "#ffffff" }}>
        <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 bg-red-600 flex items-center justify-center text-white font-bold text-xs"
              style={{ clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)" }}
            >
              MG
            </div>
            <div>
              <p className="font-bold text-lg leading-tight">MG Queue System</p>
              <p className="text-xs text-black/50">Request Report</p>
            </div>
          </div>
          <p className="text-xs text-black/50">Generated {new Date().toLocaleString()}</p>
        </div>

        <div className="mb-8">
          <p className="text-xs uppercase tracking-wide text-black/50">WIP Number</p>
          <p className="text-3xl font-bold mb-4">{request.wip_number}</p>
          <table className="w-full text-sm mb-4">
            <tbody>
              <tr className="border-b border-black/10">
                <td className="py-1.5 pr-4 font-semibold w-40">Status</td>
                <td className="py-1.5">{request.status.replace("_", " ")}</td>
              </tr>
              <tr className="border-b border-black/10">
                <td className="py-1.5 pr-4 font-semibold">Created by</td>
                <td className="py-1.5">{request.created_by}</td>
              </tr>
              <tr className="border-b border-black/10">
                <td className="py-1.5 pr-4 font-semibold">Created at</td>
                <td className="py-1.5">{new Date(request.created_at).toLocaleString()}</td>
              </tr>
              {request.branch && (
                <tr className="border-b border-black/10">
                  <td className="py-1.5 pr-4 font-semibold">Branch</td>
                  <td className="py-1.5">{request.branch}</td>
                </tr>
              )}
              {request.closed_at && (
                <tr className="border-b border-black/10">
                  <td className="py-1.5 pr-4 font-semibold">Closed at</td>
                  <td className="py-1.5">{new Date(request.closed_at).toLocaleString()}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs uppercase tracking-wide text-black/50 mb-1">Remarks</p>
          <p className="text-sm border border-black/10 rounded p-3">{request.remarks}</p>
        </div>

        {numbered.map(({ line, number }) => {
          const entries = audit.filter((a) => a.payment_line_id === line.id);
          return (
            <div key={line.id} className="mb-8 break-inside-avoid">
              <div className="flex items-center justify-between border-b border-black pb-1 mb-2">
                <p className="font-bold text-base">
                  {PAYMENT_LABELS[line.payment_type]} {number}
                </p>
                <p className="text-xs font-semibold uppercase">{line.status.replace("_", " ")}</p>
              </div>
              <table className="w-full text-xs mb-3">
                <tbody>
                  <tr>
                    <td className="py-1 pr-4 font-semibold w-40">Assigned to</td>
                    <td className="py-1">{line.assignee_name ?? "—"}</td>
                  </tr>
                  {line.closed_by && (
                    <tr>
                      <td className="py-1 pr-4 font-semibold">Closed by</td>
                      <td className="py-1">
                        {line.closed_by} {line.closed_at && `on ${new Date(line.closed_at).toLocaleString()}`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <p className="text-xs font-semibold uppercase text-black/60 mb-1">History</p>
              {entries.length === 0 ? (
                <p className="text-xs text-black/40 italic">No activity recorded.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-black/30 text-left">
                      <th className="py-1 pr-3 font-semibold">Timestamp</th>
                      <th className="py-1 pr-3 font-semibold">By</th>
                      <th className="py-1 pr-3 font-semibold">Action</th>
                      <th className="py-1 font-semibold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id} className="border-b border-black/10 align-top">
                        <td className="py-1 pr-3 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="py-1 pr-3 whitespace-nowrap">{e.actor_name}</td>
                        <td className="py-1 pr-3 whitespace-nowrap">{e.action.replace(/_/g, " ")}</td>
                        <td className="py-1">{e.remarks ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}

        {numbered.length === 0 && <p className="text-sm text-black/40 italic">No payment lines were ever added to this request.</p>}

        <p className="text-[10px] text-black/30 mt-10 pt-4 border-t border-black/10">
          MG Queue System — internal request report. Generated {new Date().toLocaleString()}.
        </p>
      </div>
    </div>
  );
}
