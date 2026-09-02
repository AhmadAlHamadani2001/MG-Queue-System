"use client";

import { useState, useCallback } from "react";
import { supabase, AppUser } from "./supabaseClient";

const KEY = "mg_session";

export type Session = {
  id: string;
  name: string;
  email: string;
  role: AppUser["role"];
  title: string | null;
  employee_branch: string | null;
  demo_branch_code: string | null;
};

export function useSession() {
  // Lazy-init reads localStorage synchronously on first render (not in
  // a useEffect after paint) — this is what removes the unstyled
  // "Loading…" flash that made navigating between sections feel like
  // opening a different site.
  const [session, setSessionState] = useState<Session | null | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase
      .from("app_users")
      .select("id, name, email, password, role, title, employee_branch, demo_branch_code")
      .ilike("email", email.trim())
      .maybeSingle();

    if (error || !data) return { ok: false as const, error: "No account found with that email." };
    if (data.password !== password) return { ok: false as const, error: "Incorrect password." };

    const s: Session = {
      id: data.id,
      name: data.name,
      email: data.email,
      role: data.role,
      title: data.title ?? null,
      employee_branch: data.employee_branch ?? null,
      demo_branch_code: data.demo_branch_code,
    };
    window.localStorage.setItem(KEY, JSON.stringify(s));
    setSessionState(s);
    return { ok: true as const, session: s };
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(KEY);
    setSessionState(null);
  }, []);

  return { session, login, logout };
}
