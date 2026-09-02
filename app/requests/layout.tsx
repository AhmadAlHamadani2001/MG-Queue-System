"use client";

import RequireAuth from "@/lib/RequireAuth";
import RequestsTopBar from "./RequestsTopBar";
import RequestsSidebar from "./RequestsSidebar";
import { useLang } from "@/lib/useLang";

export default function RequestsLayout({ children }: { children: React.ReactNode }) {
  const { dir } = useLang();
  return (
    <RequireAuth>
      <div className="min-h-screen bg-[#F4F6F8]" dir={dir}>
        <RequestsTopBar />
        <RequestsSidebar />
        <main className={`pt-24 pb-10 px-5 ${dir === "rtl" ? "md:mr-64" : "md:ml-64"}`}>
          <div className="max-w-5xl mx-auto">{children}</div>
        </main>
      </div>
    </RequireAuth>
  );
}
