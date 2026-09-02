"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { useToast, ToastBanner } from "@/lib/useToast";
import { supabase, FormTemplate, FormFieldDef, FormFieldType } from "@/lib/supabaseClient";

export default function AdminFormsPage() {
  return (
    <RequireAuth allow={["admin"]}>
      <FormsManager />
    </RequireAuth>
  );
}

function emptyField(): FormFieldDef {
  return { key: "", label_en: "", label_ar: "", type: "text" };
}

function FormsManager() {
  const { t, dir } = useLang();
  const { message, showToast } = useToast();

  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState<{
    name_en: string;
    name_ar: string;
    body_template: string;
    fields: FormFieldDef[];
    tablesJson: string;
  }>({ name_en: "", name_ar: "", body_template: "", fields: [emptyField()], tablesJson: "[]" });
  const [tablesError, setTablesError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("form_templates").select("*").order("created_at", { ascending: false });
    setTemplates((data as FormTemplate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setDraft({ name_en: "", name_ar: "", body_template: "", fields: [emptyField()], tablesJson: "[]" });
    setTablesError(null);
    setCreating(true);
    setEditingId(null);
  }

  function startEdit(tpl: FormTemplate) {
    setDraft({
      name_en: tpl.name_en,
      name_ar: tpl.name_ar,
      body_template: tpl.body_template,
      fields: tpl.fields.length ? tpl.fields : [emptyField()],
      tablesJson: JSON.stringify(tpl.tables ?? [], null, 1),
    });
    setTablesError(null);
    setEditingId(tpl.id);
    setCreating(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setCreating(false);
  }

  function updateField(index: number, patch: Partial<FormFieldDef>) {
    setDraft((d) => ({
      ...d,
      fields: d.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    }));
  }
  function addField() {
    setDraft((d) => ({ ...d, fields: [...d.fields, emptyField()] }));
  }
  function removeField(index: number) {
    setDraft((d) => ({ ...d, fields: d.fields.filter((_, i) => i !== index) }));
  }

  async function saveTemplate() {
    if (!draft.name_en.trim() || !draft.name_ar.trim() || !draft.body_template.trim()) {
      showToast(t("Name (both languages) and body text are required.", "الاسم (باللغتين) ونص المحتوى مطلوبان."));
      return;
    }
    let parsedTables: string[][][] = [];
    try {
      parsedTables = draft.tablesJson.trim() ? JSON.parse(draft.tablesJson) : [];
      setTablesError(null);
    } catch {
      setTablesError(t("Tables JSON is invalid — fix it before saving.", "بيانات الجداول JSON غير صالحة — صححها قبل الحفظ."));
      return;
    }
    const cleanFields = draft.fields.filter((f) => f.key.trim());
    setSaving(true);
    const payload = {
      name_en: draft.name_en.trim(),
      name_ar: draft.name_ar.trim(),
      body_template: draft.body_template,
      fields: cleanFields,
      tables: parsedTables,
    };
    const { error } = editingId
      ? await supabase.from("form_templates").update(payload).eq("id", editingId)
      : await supabase.from("form_templates").insert(payload);
    setSaving(false);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    setEditingId(null);
    setCreating(false);
    await load();
    showToast(t("Saved.", "تم الحفظ."));
  }

  async function toggleActive(tpl: FormTemplate) {
    const { error } = await supabase.from("form_templates").update({ active: !tpl.active }).eq("id", tpl.id);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    await load();
  }

  async function deleteTemplate(tpl: FormTemplate) {
    if (!confirm(`Delete "${tpl.name_en}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("form_templates").delete().eq("id", tpl.id);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    await load();
    showToast(t("Deleted.", "تم الحذف."));
  }

  const isEditingOrCreating = creating || editingId !== null;

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back", "رجوع")}
          </Link>
          <p className="font-bold text-sm">{t("Forms Management", "إدارة النماذج")}</p>
        </div>
        {!isEditingOrCreating && (
          <button onClick={startCreate} className="px-3 h-9 rounded-full bg-mg-red text-white text-xs font-semibold">
            + {t("New Form", "نموذج جديد")}
          </button>
        )}
      </header>

      <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5">
        🚧 {t("Developing — the Forms module is still being adjusted.", "قيد التطوير — لا يزال قسم النماذج قيد التعديل.")}
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {isEditingOrCreating ? (
          <div className="glass-card rounded-2xl p-6 flex flex-col gap-4">
            <p className="font-semibold">{creating ? t("New Form", "نموذج جديد") : t("Edit Form", "تعديل النموذج")}</p>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">{t("Name (English)", "الاسم (إنجليزي)")}</label>
                <input
                  value={draft.name_en}
                  onChange={(e) => setDraft((d) => ({ ...d, name_en: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">{t("Name (Arabic)", "الاسم (عربي)")}</label>
                <input
                  value={draft.name_ar}
                  onChange={(e) => setDraft((d) => ({ ...d, name_ar: e.target.value }))}
                  dir="rtl"
                  className="w-full h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">
                {t("Body text — use {{field_key}} for each fill-in value", "النص — استخدم {{field_key}} لكل قيمة يتم تعبئتها")}
              </label>
              <textarea
                value={draft.body_template}
                onChange={(e) => setDraft((d) => ({ ...d, body_template: e.target.value }))}
                dir="rtl"
                className="w-full h-48 p-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red resize-none font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-wide text-black/50">{t("Fields", "الحقول")}</p>
                <button onClick={addField} className="text-xs font-semibold text-mg-red">
                  + {t("Add field", "إضافة حقل")}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {draft.fields.map((f, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <input
                        value={f.key}
                        onChange={(e) => updateField(i, { key: e.target.value.replace(/\s+/g, "_") })}
                        placeholder="field_key"
                        dir="ltr"
                        className="col-span-2 h-9 px-2 rounded-lg border border-black/10 text-xs font-mono outline-none focus:border-mg-red"
                      />
                      <input
                        value={f.label_en}
                        onChange={(e) => updateField(i, { label_en: e.target.value })}
                        placeholder={t("Label (English)", "التسمية (إنجليزي)")}
                        className="col-span-3 h-9 px-2 rounded-lg border border-black/10 text-xs outline-none focus:border-mg-red"
                      />
                      <input
                        value={f.label_ar}
                        onChange={(e) => updateField(i, { label_ar: e.target.value })}
                        placeholder={t("Label (Arabic)", "التسمية (عربي)")}
                        dir="rtl"
                        className="col-span-3 h-9 px-2 rounded-lg border border-black/10 text-xs outline-none focus:border-mg-red"
                      />
                      <select
                        value={f.type}
                        onChange={(e) => updateField(i, { type: e.target.value as FormFieldType })}
                        className="col-span-2 h-9 px-1 rounded-lg border border-black/10 text-xs"
                      >
                        <option value="text">text</option>
                        <option value="number">number</option>
                        <option value="date">date</option>
                        <option value="repeater">repeater (add-as-many-rows)</option>
                      </select>
                      <label className="col-span-1 flex items-center gap-1 text-[11px]">
                        <input
                          type="checkbox"
                          checked={f.required !== false}
                          onChange={(e) => updateField(i, { required: e.target.checked })}
                        />
                        {t("Req.", "مطلوب")}
                      </label>
                      <button onClick={() => removeField(i)} className="col-span-1 text-red-600 text-xs font-semibold">
                        {t("Remove", "حذف")}
                      </button>
                    </div>
                    {f.type === "repeater" && (
                      <input
                        value={JSON.stringify(f.columns ?? [])}
                        onChange={(e) => {
                          try {
                            updateField(i, { columns: JSON.parse(e.target.value) });
                          } catch {
                            /* ignore until valid JSON is typed */
                          }
                        }}
                        placeholder='[{"key":"notes","label_en":"Notes","label_ar":"ملاحظات","type":"text"}]'
                        dir="ltr"
                        className="h-8 px-2 rounded-lg border border-black/10 text-[11px] font-mono outline-none focus:border-mg-red"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-black/50 mb-1 block">
                {t(
                  "Tables (optional, advanced) — JSON array of tables, each a 2D array of cell strings. Reference a table from the body text with [TABLE:0], [TABLE:1], etc.",
                  "الجداول (اختياري، متقدم) — مصفوفة JSON من الجداول، كل جدول مصفوفة ثنائية الأبعاد من نصوص الخلايا. أشر إلى جدول من نص المحتوى باستخدام [TABLE:0]، [TABLE:1]، إلخ."
                )}
              </label>
              <textarea
                value={draft.tablesJson}
                onChange={(e) => setDraft((d) => ({ ...d, tablesJson: e.target.value }))}
                dir="ltr"
                className="w-full h-32 p-3 rounded-lg border border-black/10 text-xs outline-none focus:border-mg-red resize-none font-mono"
              />
              {tablesError && <p className="text-xs text-red-600 mt-1">{tablesError}</p>}
            </div>

            <div className="flex gap-3 mt-2">
              <button onClick={saveTemplate} disabled={saving} className="px-5 py-2.5 rounded-lg bg-mg-red text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Spinner size={12} />} {t("Save", "حفظ")}
              </button>
              <button onClick={cancelEdit} className="px-5 py-2.5 rounded-lg border border-black/15 text-sm">
                {t("Cancel", "إلغاء")}
              </button>
            </div>
          </div>
        ) : loading ? (
          <span className="text-black/40 text-sm inline-flex items-center gap-2">
            <Spinner size={14} />
            {t("Loading…", "جارِ التحميل…")}
          </span>
        ) : (
          <div className="glass-card rounded-2xl divide-y divide-black/5">
            {templates.map((tpl) => (
              <div key={tpl.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-sm">
                    {tpl.name_en} <span className="text-black/40">/ {tpl.name_ar}</span>
                  </p>
                  <p className="text-xs text-black/40 mt-0.5">
                    {tpl.fields.length} {t("fields", "حقول")} · {tpl.active ? t("active", "مفعّل") : t("inactive", "غير مفعّل")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(tpl)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5">
                    {t("Edit", "تعديل")}
                  </button>
                  <button onClick={() => toggleActive(tpl)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5">
                    {tpl.active ? t("Deactivate", "إيقاف") : t("Activate", "تفعيل")}
                  </button>
                  <button onClick={() => deleteTemplate(tpl)} className="text-xs font-semibold px-3 py-1.5 rounded-full text-red-600 hover:bg-red-50">
                    {t("Delete", "حذف")}
                  </button>
                </div>
              </div>
            ))}
            {templates.length === 0 && <p className="p-6 text-center text-black/40 text-sm">{t("No forms yet.", "لا توجد نماذج بعد.")}</p>}
          </div>
        )}
      </div>
      <ToastBanner message={message} />
    </div>
  );
}
