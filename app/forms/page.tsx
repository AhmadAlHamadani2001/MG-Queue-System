"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { useToast, ToastBanner } from "@/lib/useToast";
import { Spinner } from "@/lib/Spinner";
import { supabase, FormTemplate } from "@/lib/supabaseClient";

export default function FormsPage() {
  return (
    <RequireAuth>
      <FormsInner />
    </RequireAuth>
  );
}

function fillTemplate(body: string, values: Record<string, string>) {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? "");
}

function PreviewTable({ table, values }: { table: string[][]; values: Record<string, string> }) {
  return (
    <table className="w-full text-sm border-collapse my-4">
      <tbody>
        {table.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td key={ci} className="border border-black/15 px-3 py-2.5 align-top text-[14px]">
                {fillTemplate(cell, values)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FormsInner() {
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const { message, showToast } = useToast();

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FormTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [repeaterValues, setRepeaterValues] = useState<Record<string, Record<string, string>[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("form_templates").select("*").eq("active", true).order("name_en");
      setTemplates((data as FormTemplate[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function selectTemplate(tpl: FormTemplate) {
    setSelected(tpl);
    setValues({});
    setRepeaterValues({});
    setSubmitted(false);
  }

  const scalarFields = selected ? selected.fields.filter((f) => f.type !== "repeater") : [];
  const repeaterFields = selected ? selected.fields.filter((f) => f.type === "repeater") : [];

  const allFilled = selected
    ? scalarFields.filter((f) => f.required !== false).every((f) => values[f.key]?.trim()) &&
      repeaterFields
        .filter((f) => f.required !== false)
        .every((f) => (repeaterValues[f.key] ?? []).length > 0)
    : false;

  function addRepeaterRow(fieldKey: string) {
    setRepeaterValues((prev) => ({ ...prev, [fieldKey]: [...(prev[fieldKey] ?? []), {}] }));
  }
  function removeRepeaterRow(fieldKey: string, index: number) {
    setRepeaterValues((prev) => ({ ...prev, [fieldKey]: (prev[fieldKey] ?? []).filter((_, i) => i !== index) }));
  }
  function updateRepeaterCell(fieldKey: string, index: number, columnKey: string, value: string) {
    setRepeaterValues((prev) => ({
      ...prev,
      [fieldKey]: (prev[fieldKey] ?? []).map((row, i) => (i === index ? { ...row, [columnKey]: value } : row)),
    }));
  }

  async function saveSubmission() {
    if (!selected || !allFilled || !session) return;
    setSaving(true);
    const { error } = await supabase.from("form_submissions").insert({
      template_id: selected.id,
      branch: session.employee_branch,
      created_by: session.name,
      data: { ...values, ...repeaterValues },
    });
    setSaving(false);
    if (error) {
      showToast(t(`Error saving: ${error.message}`, `خطأ في الحفظ: ${error.message}`));
      return;
    }
    setSubmitted(true);
    showToast(t("Saved. You can now download the PDF.", "تم الحفظ. يمكنك الآن تنزيل PDF."));
  }

  async function downloadPdf() {
    if (!previewRef.current || !selected) return;
    setDownloading(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true });
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
      pdf.save(`${selected.name_en.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setDownloading(false);
    }
  }

  const filledBody = selected ? fillTemplate(selected.body_template, values) : "";

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6 print:hidden">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back", "رجوع")}
          </button>
          <p className="font-bold text-sm">{t("Forms", "النماذج")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-black/50 hidden sm:inline">{session?.name}</span>
          <button onClick={toggle} className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
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
      </header>

      <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 print:hidden">
        🚧 {t("Developing — this module is still being adjusted, changes are coming.", "قيد التطوير — لا يزال هذا القسم قيد التعديل، وستأتي تغييرات قريباً.")}
      </div>

      <div className="max-w-3xl mx-auto p-6 flex flex-col gap-5">
        {!selected ? (
          <>
            <h1 className="text-xl font-bold">{t("Choose a form", "اختر نموذجاً")}</h1>
            {loading ? (
              <span className="text-black/40 text-sm inline-flex items-center gap-2">
                <Spinner size={14} />
                {t("Loading…", "جارِ التحميل…")}
              </span>
            ) : templates.length === 0 ? (
              <p className="text-black/40 text-sm">{t("No forms available yet.", "لا توجد نماذج متاحة بعد.")}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => selectTemplate(tpl)}
                    className="glass-card rounded-xl p-5 text-left hover:border-mg-red/40 transition"
                  >
                    <p className="font-semibold">{t(tpl.name_en, tpl.name_ar)}</p>
                    <p className="text-xs text-black/40 mt-1">
                      {tpl.fields.length} {t("fields", "حقول")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between print:hidden">
              <h1 className="text-xl font-bold">{t(selected.name_en, selected.name_ar)}</h1>
              <button onClick={() => setSelected(null)} className="text-sm text-black/50 hover:text-mg-red">
                {t("Choose another form", "اختر نموذجاً آخر")}
              </button>
            </div>

            {!submitted ? (
              <div className="glass-card rounded-2xl p-6 flex flex-col gap-4">
                {selected.fields.map((f) =>
                  f.type === "repeater" ? (
                    <div key={f.key}>
                      <label className="text-xs uppercase tracking-wide text-black/50 mb-2 block">
                        {t(f.label_en, f.label_ar)}{" "}
                        {f.required !== false ? (
                          <span className="text-mg-red">*</span>
                        ) : (
                          <span className="text-black/30 normal-case">({t("optional", "اختياري")})</span>
                        )}
                      </label>
                      <div className="flex flex-col gap-2">
                        {(repeaterValues[f.key] ?? []).map((row, ri) => (
                          <div key={ri} className="flex gap-2 items-center bg-black/[0.02] rounded-lg p-2">
                            {(f.columns ?? []).map((col) => (
                              <input
                                key={col.key}
                                type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
                                value={row[col.key] ?? ""}
                                onChange={(e) => updateRepeaterCell(f.key, ri, col.key, e.target.value)}
                                placeholder={t(col.label_en, col.label_ar)}
                                className="flex-1 h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red bg-white"
                              />
                            ))}
                            <button
                              onClick={() => removeRepeaterRow(f.key, ri)}
                              className="shrink-0 text-red-600 text-xs font-semibold px-2"
                            >
                              {t("Remove", "حذف")}
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addRepeaterRow(f.key)}
                          className="self-start text-xs font-semibold text-mg-red hover:underline"
                        >
                          + {t("Add row", "إضافة سطر")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={f.key}>
                      <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">
                        {t(f.label_en, f.label_ar)}{" "}
                        {f.required !== false ? (
                          <span className="text-mg-red">*</span>
                        ) : (
                          <span className="text-black/30 normal-case">({t("optional", "اختياري")})</span>
                        )}
                      </label>
                      <input
                        type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        className="w-full h-11 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70"
                      />
                    </div>
                  )
                )}
                <button
                  onClick={saveSubmission}
                  disabled={!allFilled || saving}
                  className="mt-2 w-full py-3.5 rounded-lg bg-mg-red text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving && <Spinner size={16} />} {t("Save & Preview", "حفظ ومعاينة")}
                </button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <div
                    ref={previewRef}
                    id="form-print-area"
                    dir="rtl"
                    style={{ fontFamily: "Cairo, sans-serif", backgroundColor: "#ffffff", width: "210mm", margin: "0 auto", position: "relative" }}
                    className="rounded-2xl border border-black/10 text-black overflow-hidden print:rounded-none print:border-0"
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: "45%",
                        left: "50%",
                        transform: "translate(-50%, -50%) rotate(-30deg)",
                        fontSize: "64px",
                        fontWeight: 800,
                        color: "rgba(226, 6, 19, 0.12)",
                        letterSpacing: "4px",
                        pointerEvents: "none",
                        whiteSpace: "nowrap",
                        zIndex: 5,
                      }}
                    >
                      {t("DEVELOPING", "قيد التطوير")}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/letterhead-header.png" alt="" className="w-full block" />

                  <div className="px-12 py-10">
                    <div className="flex items-center justify-between mb-8 pb-3 border-b border-black/15">
                      <h2 className="text-xl font-bold">{selected.name_ar}</h2>
                      <p className="text-xs text-black/40">{new Date().toLocaleDateString("en-GB")}</p>
                    </div>
                    <div className="text-[15px] leading-[2]">
                      {filledBody.split("\n").map((line, i) => {
                        const trimmed = line.trim();
                        const tableMatch = trimmed.match(/^\[TABLE:(\d+)\]$/);
                        if (tableMatch) {
                          const table = selected.tables?.[Number(tableMatch[1])];
                          return table ? <PreviewTable key={i} table={table} values={values} /> : null;
                        }
                        const repeaterMatch = trimmed.match(/^\[REPEATER:(\w+)\]$/);
                        if (repeaterMatch) {
                          const field = selected.fields.find((f) => f.key === repeaterMatch[1] && f.type === "repeater");
                          const rows = repeaterValues[repeaterMatch[1]] ?? [];
                          if (!field) return null;
                          if (rows.length === 0) {
                            return (
                              <p key={i} className="text-black/40 text-sm">
                                {t("No entries added.", "لم تتم إضافة أي سطر.")}
                              </p>
                            );
                          }
                          const generated = [
                            (field.columns ?? []).map((c) => t(c.label_en, c.label_ar)),
                            ...rows.map((row) => (field.columns ?? []).map((c) => row[c.key] ?? "")),
                          ];
                          return <PreviewTable key={i} table={generated} values={{}} />;
                        }
                        return (
                          <p key={i} className={trimmed ? "" : "h-3"}>
                            {line || "\u00A0"}
                          </p>
                        );
                      })}
                    </div>
                  </div>

                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/letterhead-footer.png" alt="" className="w-full block mt-4" />
                  </div>
                </div>

                <div className="flex gap-3 print:hidden">
                  <button onClick={() => setSubmitted(false)} className="py-3 px-5 rounded-lg border border-black/15 font-semibold">
                    {t("Edit", "تعديل")}
                  </button>
                  <button onClick={() => window.print()} className="py-3 px-5 rounded-lg border border-black/15 font-semibold">
                    🖨️ {t("Print", "طباعة")}
                  </button>
                  <button
                    onClick={downloadPdf}
                    disabled={downloading}
                    className="flex-1 py-3 px-5 rounded-lg bg-mg-red text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {downloading && <Spinner size={16} />} {t("Download PDF", "تنزيل PDF")}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
      <ToastBanner message={message} />
    </div>
  );
}
