"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { useToast, ToastBanner } from "@/lib/useToast";
import { supabase, Branch } from "@/lib/supabaseClient";

export default function AdminBranchesPage() {
  return (
    <RequireAuth allow={["admin"]}>
      <BranchLinks />
    </RequireAuth>
  );
}

function BranchLinks() {
  const { t, dir } = useLang();
  const { message, showToast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name_en: string; name_ar: string }>({ name_en: "", name_ar: "" });
  const [saving, setSaving] = useState(false);

  const [adding, setAdding] = useState(false);
  const [newBranch, setNewBranch] = useState({ code: "", name_en: "", name_ar: "" });

  async function load() {
    const { data } = await supabase.from("branches").select("*").order("code");
    setBranches((data as Branch[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function copyLink(code: string) {
    const url = `${window.location.origin}/branch/${code}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  }

  function startEdit(b: Branch) {
    setEditingId(b.id);
    setDraft({ name_en: b.name_en, name_ar: b.name_ar });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const { error } = await supabase.from("branches").update(draft).eq("id", id);
    setSaving(false);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    setEditingId(null);
    await load();
    showToast(t("Branch updated.", "تم تحديث الفرع."));
  }

  async function addBranch() {
    if (!newBranch.code.trim() || !newBranch.name_en.trim() || !newBranch.name_ar.trim()) {
      showToast(t("Code and both names are required.", "الرمز والاسمان مطلوبان."));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("branches").insert({
      code: newBranch.code.trim().toUpperCase(),
      name_en: newBranch.name_en.trim(),
      name_ar: newBranch.name_ar.trim(),
      status: "open",
    });
    setSaving(false);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    setNewBranch({ code: "", name_en: "", name_ar: "" });
    setAdding(false);
    await load();
    showToast(t("Branch added.", "تمت إضافة الفرع."));
  }

  async function deleteBranch(b: Branch) {
    if (!confirm(`Delete "${b.name_en}" (${b.code})? This cannot be undone.`)) return;
    const { error } = await supabase.from("branches").delete().eq("id", b.id);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    await load();
    showToast(t("Branch deleted.", "تم حذف الفرع."));
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back", "رجوع")}
          </Link>
          <p className="font-bold text-sm">{t("All Branch Links", "كل روابط الفروع")}</p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="px-3 h-9 rounded-full bg-mg-red text-white text-xs font-semibold">
          + {t("New Branch", "فرع جديد")}
        </button>
      </header>

      <div className="max-w-4xl mx-auto p-6">
        {adding && (
          <div className="glass-card rounded-2xl p-4 mb-4 flex flex-col gap-2">
            <div className="grid sm:grid-cols-3 gap-2">
              <input
                value={newBranch.code}
                onChange={(e) => setNewBranch((d) => ({ ...d, code: e.target.value }))}
                placeholder={t("Code (e.g. JED-02)", "الرمز (مثل JED-02)")}
                dir="ltr"
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
              />
              <input
                value={newBranch.name_en}
                onChange={(e) => setNewBranch((d) => ({ ...d, name_en: e.target.value }))}
                placeholder={t("Name (English)", "الاسم (إنجليزي)")}
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
              />
              <input
                value={newBranch.name_ar}
                onChange={(e) => setNewBranch((d) => ({ ...d, name_ar: e.target.value }))}
                placeholder={t("Name (Arabic)", "الاسم (عربي)")}
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={addBranch} disabled={saving} className="px-4 py-2 rounded-lg bg-mg-red text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {saving && <Spinner size={12} />} {t("Create", "إنشاء")}
              </button>
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-black/15 text-sm">
                {t("Cancel", "إلغاء")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <span className="text-black/40 text-sm inline-flex items-center gap-2">
            <Spinner size={14} />
            {t("Loading…", "جارِ التحميل…")}
          </span>
        ) : (
          <div className="glass-card rounded-2xl divide-y divide-black/5">
            {branches.map((b) => {
              const isEditing = editingId === b.id;
              return (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  {!isEditing ? (
                    <>
                      <div>
                        <p className="font-semibold text-sm">{t(b.name_en, b.name_ar)}</p>
                        <p className="text-xs text-black/40" dir="ltr">
                          /branch/{b.code}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(b)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5">
                          {t("Edit", "تعديل")}
                        </button>
                        <button onClick={() => copyLink(b.code)} className="text-xs font-semibold px-3 py-1.5 rounded-full border border-black/15 hover:bg-black/5">
                          {copied === b.code ? t("Copied!", "تم النسخ!") : t("Copy customer link", "نسخ رابط العميل")}
                        </button>
                        <Link href={`/advisor/${b.code}`} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-mg-red text-white hover:bg-mg-red/90">
                          {t("Open dashboard", "فتح اللوحة")}
                        </Link>
                        <button onClick={() => deleteBranch(b)} className="text-xs font-semibold px-3 py-1.5 rounded-full text-red-600 hover:bg-red-50">
                          {t("Delete", "حذف")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="w-full flex flex-col sm:flex-row gap-2">
                      <input
                        value={draft.name_en}
                        onChange={(e) => setDraft((d) => ({ ...d, name_en: e.target.value }))}
                        placeholder={t("Name (English)", "الاسم (إنجليزي)")}
                        className="flex-1 h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <input
                        value={draft.name_ar}
                        onChange={(e) => setDraft((d) => ({ ...d, name_ar: e.target.value }))}
                        placeholder={t("Name (Arabic)", "الاسم (عربي)")}
                        className="flex-1 h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => saveEdit(b.id)} disabled={saving} className="px-3 py-2 rounded-lg bg-mg-red text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5">
                          {saving && <Spinner size={12} />} {t("Save", "حفظ")}
                        </button>
                        <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-lg border border-black/15 text-xs">
                          {t("Cancel", "إلغاء")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <ToastBanner message={message} />
    </div>
  );
}
