"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { PageLoading } from "@/lib/Spinner";

export default function Home() {
  const router = useRouter();
  const { session } = useSession();

  useEffect(() => {
    if (session === undefined) return; // still reading localStorage
    if (!session) {
      router.replace("/login");
      return;
    }
    if (session.role === "admin") router.replace("/admin");
    else if (session.employee_branch === "Head Office") router.replace("/hq");
    else if (session.role === "parts_advisor" && session.demo_branch_code) router.replace(`/parts/${session.demo_branch_code}`);
    else if (session.demo_branch_code) router.replace(`/advisor/${session.demo_branch_code}`);
    else router.replace("/team");
  }, [session, router]);

  return <PageLoading />;
}
