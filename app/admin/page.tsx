"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/lib/RequireAuth";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";
import { useSession } from "@/lib/useSession";
import { useToast, ToastBanner } from "@/lib/useToast";
import { supabase, AppUser } from "@/lib/supabaseClient";

export default function AdminPage() {
  return (
    <RequireAuth allow={["admin"]}>
      <AdminPanel />
    </RequireAuth>
  );
}

function AdminPanel() {
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const { message, showToast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Record<string, { password: string; role: AppUser["role"] }>>({});
  const [showPasswordFor, setShowPasswordFor] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "staff" as AppUser["role"], employee_branch: "" });
  const [addingBusy, setAddingBusy] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("app_users").select("*").order("name");
    setUsers((data as AppUser[]) ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.employee_branch ?? "").toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, query]);

  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  function startEdit(u: AppUser) {
    setEditing((prev) => ({ ...prev, [u.id]: { password: u.password, role: u.role } }));
  }

  async function saveEdit(u: AppUser) {
    const edit = editing[u.id];
    if (!edit) return;
    setSavingIds((prev) => new Set(prev).add(u.id));
    await supabase.from("app_users").update({ password: edit.password, role: edit.role }).eq("id", u.id);
    setEditing((prev) => {
      const next = { ...prev };
      delete next[u.id];
      return next;
    });
    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(u.id);
      return next;
    });
    showToast(t("Account updated successfully.", "تم تحديث الحساب بنجاح."));
    load();
  }

  async function addUser() {
    if (!newUser.name.trim() || !newUser.email.trim() || !newUser.password.trim()) {
      showToast(t("Name, email, and password are required.", "الاسم والبريد وكلمة المرور مطلوبة."));
      return;
    }
    setAddingBusy(true);
    const { error } = await supabase.from("app_users").insert({
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      password: newUser.password.trim(),
      role: newUser.role,
      employee_branch: newUser.employee_branch.trim() || null,
    });
    setAddingBusy(false);
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    setNewUser({ name: "", email: "", password: "", role: "staff", employee_branch: "" });
    setAdding(false);
    await load();
    showToast(t("Account created.", "تم إنشاء الحساب."));
  }

  async function deleteUser(u: AppUser) {
    if (!confirm(`Delete the account for "${u.name}" (${u.email})? This cannot be undone.`)) return;
    setDeletingIds((prev) => new Set(prev).add(u.id));
    const { error } = await supabase.from("app_users").delete().eq("id", u.id);
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.delete(u.id);
      return next;
    });
    if (error) {
      showToast(t(`Error: ${error.message}`, `خطأ: ${error.message}`));
      return;
    }
    await load();
    showToast(t("Account deleted.", "تم حذف الحساب."));
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur-xl border-b border-black/5 h-16 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mg-logo.jpg" alt="MG" className="w-8 h-8 object-contain rounded" />
          <p className="font-bold text-sm">{t("Admin — User Accounts", "الإدارة — حسابات المستخدمين")}</p>
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

      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-4 flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-4">
            <Link href="/admin/requests" className="text-sm font-semibold text-mg-red hover:underline">
              {t("View all requests →", "عرض كل الطلبات ←")}
            </Link>
            <Link href="/admin/branches" className="text-sm font-semibold text-mg-red hover:underline">
              {t("View all branch links →", "عرض كل روابط الفروع ←")}
            </Link>
            <Link href="/admin/forms" className="text-sm font-semibold text-mg-red hover:underline">
              {t("Manage Forms →", "إدارة النماذج ←")}
            </Link>
          </div>
          <button onClick={() => setAdding((v) => !v)} className="px-3 py-1.5 rounded-full bg-mg-red text-white text-xs font-semibold">
            + {t("New User", "مستخدم جديد")}
          </button>
        </div>

        {adding && (
          <div className="glass-card rounded-2xl p-4 mb-4 flex flex-col gap-2">
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                value={newUser.name}
                onChange={(e) => setNewUser((d) => ({ ...d, name: e.target.value }))}
                placeholder={t("Full name", "الاسم الكامل")}
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
              />
              <input
                value={newUser.email}
                onChange={(e) => setNewUser((d) => ({ ...d, email: e.target.value }))}
                placeholder={t("Email", "البريد الإلكتروني")}
                dir="ltr"
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
              />
              <input
                value={newUser.password}
                onChange={(e) => setNewUser((d) => ({ ...d, password: e.target.value }))}
                placeholder={t("Password", "كلمة المرور")}
                dir="ltr"
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((d) => ({ ...d, role: e.target.value as AppUser["role"] }))}
                className="h-10 px-3 rounded-lg border border-black/10 text-sm"
              >
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="advisor">advisor</option>
                <option value="parts_advisor">parts_advisor</option>
                <option value="staff">staff</option>
              </select>
              <input
                value={newUser.employee_branch}
                onChange={(e) => setNewUser((d) => ({ ...d, employee_branch: e.target.value }))}
                placeholder={t("Branch (optional, e.g. Hiraa)", "الفرع (اختياري، مثل حراء)")}
                className="h-10 px-3 rounded-lg border border-black/10 text-sm outline-none focus:border-mg-red sm:col-span-2"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={addUser} disabled={addingBusy} className="px-4 py-2 rounded-lg bg-mg-red text-white text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5">
                {addingBusy && <Spinner size={12} />} {t("Create account", "إنشاء حساب")}
              </button>
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg border border-black/15 text-sm">
                {t("Cancel", "إلغاء")}
              </button>
            </div>
          </div>
        )}

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("Search by name, email, branch, role…", "بحث بالاسم أو البريد أو الفرع أو الدور…")}
          className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white mb-4"
        />

        {loading ? (
          <span className="text-black/40 text-sm inline-flex items-center gap-2"><Spinner size={14} />{t("Loading…", "جارِ التحميل…")}</span>
        ) : (
          <div className="glass-card rounded-2xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-black/40 border-b border-black/5">
                  <th className="p-3">{t("Name", "الاسم")}</th>
                  <th className="p-3">{t("Email", "البريد")}</th>
                  <th className="p-3">{t("Branch", "الفرع")}</th>
                  <th className="p-3">{t("Role", "الدور")}</th>
                  <th className="p-3">{t("Password", "كلمة المرور")}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isEditing = !!editing[u.id];
                  return (
                    <tr key={u.id} className="border-b border-black/5 last:border-0">
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3 text-black/60" dir="ltr">
                        {u.email}
                      </td>
                      <td className="p-3 text-black/60">{u.employee_branch ?? "—"}</td>
                      <td className="p-3">
                        {isEditing ? (
                          <select
                            value={editing[u.id].role}
                            onChange={(e) =>
                              setEditing((prev) => ({
                                ...prev,
                                [u.id]: { ...prev[u.id], role: e.target.value as AppUser["role"] },
                              }))
                            }
                            className="h-9 px-2 rounded-md border border-black/10 text-xs"
                          >
                            <option value="admin">admin</option>
                            <option value="manager">manager</option>
                            <option value="advisor">advisor</option>
                            <option value="parts_advisor">parts_advisor</option>
                            <option value="staff">staff</option>
                          </select>
                        ) : (
                          <span className="text-xs font-semibold bg-black/5 px-2 py-1 rounded-full">{u.role}</span>
                        )}
                      </td>
                      <td className="p-3" dir="ltr">
                        {isEditing ? (
                          <input
                            value={editing[u.id].password}
                            onChange={(e) =>
                              setEditing((prev) => ({
                                ...prev,
                                [u.id]: { ...prev[u.id], password: e.target.value },
                              }))
                            }
                            className="h-9 px-2 rounded-md border border-black/10 text-xs w-32"
                          />
                        ) : (
                          <button
                            onClick={() => setShowPasswordFor((p) => ({ ...p, [u.id]: !p[u.id] }))}
                            className="text-xs font-mono text-black/60"
                          >
                            {showPasswordFor[u.id] ? u.password : "••••••••"}
                          </button>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEdit(u)}
                              disabled={savingIds.has(u.id)}
                              className="text-xs font-semibold text-white bg-mg-red px-2.5 py-1 rounded-md disabled:opacity-50 flex items-center gap-1"
                            >
                              {savingIds.has(u.id) && <Spinner size={10} />} {t("Save", "حفظ")}
                            </button>
                            <button
                              onClick={() =>
                                setEditing((prev) => {
                                  const next = { ...prev };
                                  delete next[u.id];
                                  return next;
                                })
                              }
                              className="text-xs px-2.5 py-1 rounded-md border border-black/10"
                            >
                              {t("Cancel", "إلغاء")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => startEdit(u)} className="text-xs font-semibold text-mg-red">
                              {t("Edit", "تعديل")}
                            </button>
                            <button
                              onClick={() => deleteUser(u)}
                              disabled={deletingIds.has(u.id)}
                              className="text-xs font-semibold text-red-600 disabled:opacity-50 flex items-center gap-1"
                            >
                              {deletingIds.has(u.id) && <Spinner size={10} />} {t("Delete", "حذف")}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <ToastBanner message={message} />
    </div>
  );
}
