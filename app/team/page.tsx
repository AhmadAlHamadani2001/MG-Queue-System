"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { useSession } from "@/lib/useSession";
import { useToast, ToastBanner } from "@/lib/useToast";
import { supabase, Employee } from "@/lib/supabaseClient";

export default function TeamPage() {
  return (
    <RequireAuth>
      <TeamDirectory />
    </RequireAuth>
  );
}

function TeamDirectory() {
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const { message, showToast } = useToast();
  const isAdmin = session?.role === "admin";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Employee>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase.from("employees").select("*").order("name");
    setEmployees((data as Employee[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(e: Employee) {
    setEditingId(e.id);
    setDraft({ name: e.name, title: e.title, city: e.city, branch: e.branch, phone: e.phone, email: e.email });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    const { error } = await supabase.from("employees").update(draft).eq("id", id);
    setSaving(false);
    if (error) {
      showToast(t(`Error saving: ${error.message}`, `خطأ في الحفظ: ${error.message}`));
      return;
    }
    setEditingId(null);
    await load();
    showToast(t("Team member updated.", "تم تحديث بيانات الموظف."));
  }

  const branches = useMemo(
    () => Array.from(new Set(employees.map((e) => e.branch).filter(Boolean))).sort() as string[],
    [employees]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (branchFilter && e.branch !== branchFilter) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        (e.title ?? "").toLowerCase().includes(q) ||
        (e.branch ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, query, branchFilter]);

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-black/50 hover:text-mg-red text-sm">
            ← {t("Back", "رجوع")}
          </button>
          <p className="font-bold text-sm">{t("Team Directory", "دليل الفريق")}</p>
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

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search by name or title…", "بحث بالاسم أو المسمى الوظيفي…")}
            className="flex-1 min-w-[200px] h-11 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white"
          />
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="h-11 px-3 rounded-lg border border-black/10 bg-white text-sm"
          >
            <option value="">{t("All branches", "كل الفروع")}</option>
            {branches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <p className="text-xs text-black/40 mb-3">
            {t("You're an admin — click Edit on any card to update that person's details.", "أنت مسؤول — اضغط تعديل على أي بطاقة لتحديث بيانات ذلك الشخص.")}
          </p>
        )}

        {loading ? (
          <span className="text-black/40 text-sm inline-flex items-center gap-2"><Spinner size={14} />{t("Loading…", "جارِ التحميل…")}</span>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((e) => {
              const isEditing = editingId === e.id;
              return (
                <div key={e.id} className="glass-card rounded-xl p-4">
                  {!isEditing ? (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm">{e.name}</p>
                        {isAdmin && (
                          <button onClick={() => startEdit(e)} className="text-xs font-semibold text-mg-red shrink-0">
                            {t("Edit", "تعديل")}
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-black/50 mt-0.5">{e.title}</p>
                      <p className="text-xs text-black/40 mt-1">{e.branch}</p>
                      {e.email && (
                        <p className="text-xs text-black/40 mt-1" dir="ltr">
                          {e.email}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <input
                        value={draft.name ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, name: ev.target.value }))}
                        placeholder={t("Name", "الاسم")}
                        className="h-9 px-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <input
                        value={draft.title ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, title: ev.target.value }))}
                        placeholder={t("Title", "المسمى الوظيفي")}
                        className="h-9 px-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <input
                        value={draft.city ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, city: ev.target.value }))}
                        placeholder={t("City", "المدينة")}
                        className="h-9 px-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <input
                        value={draft.branch ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, branch: ev.target.value }))}
                        placeholder={t("Branch", "الفرع")}
                        className="h-9 px-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <input
                        value={draft.phone ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, phone: ev.target.value }))}
                        placeholder={t("Phone", "الجوال")}
                        dir="ltr"
                        className="h-9 px-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <input
                        value={draft.email ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, email: ev.target.value }))}
                        placeholder={t("Email", "البريد الإلكتروني")}
                        dir="ltr"
                        className="h-9 px-2 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveEdit(e.id)}
                          disabled={saving}
                          className="flex-1 h-9 rounded-lg bg-mg-red text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                        >
                          {saving && <Spinner size={12} />} {t("Save", "حفظ")}
                        </button>
                        <button onClick={() => setEditingId(null)} className="flex-1 h-9 rounded-lg border border-black/15 text-xs font-semibold">
                          {t("Cancel", "إلغاء")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-black/40 text-sm col-span-full">{t("No matches.", "لا توجد نتائج.")}</p>
            )}
          </div>
        )}
      </div>
      <ToastBanner message={message} />
    </div>
  );
}

