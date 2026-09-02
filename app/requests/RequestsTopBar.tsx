"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";

export default function RequestsTopBar() {
  const router = useRouter();
  const { session, logout } = useSession();
  const { t, lang, toggle, dir } = useLang();
  const [search, setSearch] = useState("");

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) return;
    router.push(`/requests/search?wip=${encodeURIComponent(search.trim())}`);
  }

  return (
    <nav className="print:hidden fixed top-0 w-full z-50 flex justify-between items-center px-6 h-20 bg-white/80 backdrop-blur-xl border-b border-mg-red/10 shadow-sm" dir={dir}>
      <div className="flex items-center gap-3">
        <img src="/mg-logo.jpg" alt="MG" className="w-8 h-8 object-contain rounded" />
        <span className="font-bold tracking-tight text-lg">{t("Request Management", "إدارة الطلبات")}</span>
      </div>
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
    </nav>
  );
}
