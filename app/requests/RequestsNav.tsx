"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";

export default function RequestsNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const [search, setSearch] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    router.push(`/requests/search?wip=${encodeURIComponent(search.trim())}`);
  }

  const linkClass = (href: string) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
      pathname === href ? "bg-mg-red text-white" : "text-black/60 hover:bg-black/5"
    }`;

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-xl border-b border-black/5" dir={dir}>
      <div className="max-w-6xl mx-auto px-5 py-3 flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          {session?.demo_branch_code && (
            <button
              onClick={() => router.push(`/advisor/${session.demo_branch_code}`)}
              className="text-black/40 hover:text-mg-red text-sm"
              title={t("Back to dashboard", "العودة للوحة")}
            >
              ←
            </button>
          )}
          <div className="w-8 h-8 bg-mg-red mg-octagon flex items-center justify-center text-white font-bold text-xs">
            MG
          </div>
          <span className="font-bold text-sm">{t("Request Management", "إدارة الطلبات")}</span>
        </div>

        <nav className="flex items-center gap-1">
          <Link href="/requests/new" className={linkClass("/requests/new")}>
            {t("New Request", "طلب جديد")}
          </Link>
          <Link href="/requests/assigned-to-me" className={linkClass("/requests/assigned-to-me")}>
            {t("Assigned to Me", "المسندة إليّ")}
          </Link>
          <Link href="/requests/closed" className={linkClass("/requests/closed")}>
            {t("Closed Requests", "الطلبات المغلقة")}
          </Link>
          {session?.role === "admin" && (
            <Link href="/admin/requests" className={linkClass("/admin/requests")}>
              {t("All Requests (Admin)", "كل الطلبات (الإدارة)")}
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <form onSubmit={submitSearch} className="flex items-center gap-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("Search WIP…", "بحث WIP…")}
              className="h-9 px-3 rounded-full border border-black/10 text-sm outline-none focus:border-mg-red w-32"
              dir="ltr"
            />
            <button type="submit" className="h-9 px-3 rounded-full bg-black/5 hover:bg-black/10 text-sm">
              🔍
            </button>
          </form>
          <span className="text-xs text-black/50 hidden lg:inline">{session?.name}</span>
          <button onClick={toggle} className="h-9 w-9 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold">
            {lang === "en" ? "AR" : "EN"}
          </button>
          <button
            onClick={() => {
              logout();
              router.push("/login");
            }}
            className="h-9 px-3 rounded-full bg-black/5 hover:bg-black/10 text-xs font-semibold"
          >
            {t("Log out", "خروج")}
          </button>
        </div>
      </div>
    </header>
  );
}
