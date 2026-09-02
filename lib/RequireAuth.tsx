"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import type { AppUser } from "@/lib/supabaseClient";

export default function RequireAuth({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: AppUser["role"][];
}) {
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) {
      router.replace("/login");
    } else if (session && session.role !== "admin" && allow && !allow.includes(session.role)) {
      router.replace("/");
    }
  }, [session, allow, router]);

  if (session === undefined) {
    return (
      <main className="min-h-screen flex items-center justify-center gap-2 bg-[#F4F6F8] text-black/40">
        <div className="w-6 h-6 border-2 border-mg-red/30 border-t-mg-red rounded-full animate-spin" />
        <span className="text-sm">Loading…</span>
      </main>
    );
  }
  if (!session || (session.role !== "admin" && allow && !allow.includes(session.role))) {
    return (
      <main className="min-h-screen flex items-center justify-center gap-2 bg-[#F4F6F8] text-black/40">
        <div className="w-6 h-6 border-2 border-mg-red/30 border-t-mg-red rounded-full animate-spin" />
        <span className="text-sm">Redirecting…</span>
      </main>
    );
  }

  return <>{children}</>;
}
