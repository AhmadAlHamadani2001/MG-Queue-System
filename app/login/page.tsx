"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";
import { Spinner } from "@/lib/Spinner";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const { t, lang, toggle, dir } = useLang();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await login(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const s = result.session;
    if (s.role === "admin") {
      router.push("/admin");
    } else if (s.employee_branch === "Head Office") {
      router.push("/hq");
    } else if (s.role === "parts_advisor" && s.demo_branch_code) {
      router.push(`/parts/${s.demo_branch_code}`);
    } else if (s.demo_branch_code) {
      router.push(`/advisor/${s.demo_branch_code}`);
    } else {
      router.push("/team");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-mg-cream p-6" dir={dir}>
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3">
          <button
            onClick={toggle}
            className="px-3 py-1.5 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold"
          >
            {lang === "en" ? "العربية" : "English"}
          </button>
        </div>
        <div className="glass-card rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mg-logo.jpg" alt="MG" className="w-10 h-10 object-contain rounded" />
            <div>
              <p className="font-bold text-mg-ink">{t("MG Queue System", "نظام طابور MG")}</p>
              <p className="text-xs text-mg-ink/50">{t("Staff sign in", "تسجيل دخول الموظفين")}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
                {t("Email", "البريد الإلكتروني")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@jiadmotors.com"
                className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wide text-mg-ink/50 mb-1 block">
                {t("Password", "كلمة المرور")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70"
                dir="ltr"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-lg bg-mg-red text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {submitting && <Spinner size={16} />}
              {submitting ? t("Signing in…", "جارِ الدخول…") : t("Sign in", "دخول")}
            </button>
          </form>

          <p className="text-xs text-mg-ink/40 mt-5 text-center">
            {t(
              "Your account was provisioned by an admin — use your work email and the password they gave you.",
              "تم إنشاء حسابك من قبل المسؤول — استخدم بريدك الرسمي وكلمة المرور التي زودك بها."
            )}
          </p>
          <div className="flex justify-center gap-4 mt-4 pt-4 border-t border-black/5 text-xs text-mg-ink/40">
            <a href="/branch/JED-01" className="hover:text-mg-red">{t("Customer? Join a queue", "عميل؟ انضم للطابور")}</a>
            <a href="/track" className="hover:text-mg-red">{t("Find my ticket", "البحث عن تذكرتي")}</a>
            <a href="/hq" className="hover:text-mg-red">{t("Head Office overview", "نظرة عامة للإدارة")}</a>
          </div>
        </div>
      </div>
    </main>
  );
}
