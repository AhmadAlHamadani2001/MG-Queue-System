"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { useLang } from "@/lib/useLang";

export default function RequestsSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useSession();
  const { t, dir } = useLang();

  const linkClass = (href: string) =>
    `mx-2 my-1 p-3 flex items-center gap-3 text-sm rounded-xl transition ${
      pathname === href ? "bg-mg-red/10 text-mg-red border border-mg-red/20 font-medium" : "text-black/60 hover:bg-black/5 hover:text-mg-red"
    }`;

  function backHref() {
    if (session?.demo_branch_code) return `/advisor/${session.demo_branch_code}`;
    if (session?.role === "admin") return "/admin";
    return "/team";
  }

  return (
    <aside
      className={`print:hidden fixed top-0 h-screen flex-col py-8 bg-white/90 backdrop-blur-2xl border-r border-mg-red/10 shadow-lg w-64 pt-28 z-40 hidden md:flex ${
        dir === "rtl" ? "right-0 border-l border-r-0" : "left-0"
      }`}
    >
      <div className="px-6 mb-4">
        <button
          onClick={() => router.push(backHref())}
          className="text-xs font-semibold text-black/50 hover:text-mg-red flex items-center gap-1 mb-4"
        >
          ← {t("Back to Dashboard", "العودة للوحة")}
        </button>
        <h3 className="font-semibold text-[15px] leading-tight">{t("Request Management", "إدارة الطلبات")}</h3>
        <p className="text-xs text-black/50">{session?.name}</p>
      </div>

      <nav className="flex-1 flex flex-col gap-1 px-2">
        <Link href="/requests/new" className={linkClass("/requests/new")}>
          📝 {t("New Request", "طلب جديد")}
        </Link>
        <Link href="/requests/assigned-to-me" className={linkClass("/requests/assigned-to-me")}>
          📥 {t("Assigned to Me", "المسندة إليّ")}
        </Link>
        <Link href="/requests/closed" className={linkClass("/requests/closed")}>
          ✅ {t("Closed Requests", "الطلبات المغلقة")}
        </Link>
        <Link href="/requests/analytics" className={linkClass("/requests/analytics")}>
          📊 {t("Analytics", "التحليلات")}
        </Link>
        {session?.role === "admin" && (
          <Link href="/admin/requests" className={linkClass("/admin/requests")}>
            🗂️ {t("All Requests (Admin)", "كل الطلبات (الإدارة)")}
          </Link>
        )}
      </nav>
    </aside>
  );
}
