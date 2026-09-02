"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "mg_lang";
export type Lang = "en" | "ar";

export function useLang() {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(KEY) as Lang | null;
    return stored === "ar" ? "ar" : "en";
  });

  useEffect(() => {
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    document.documentElement.setAttribute("lang", lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(KEY, l);
  }, []);

  const toggle = useCallback(() => {
    setLang(lang === "en" ? "ar" : "en");
  }, [lang, setLang]);

  const t = useCallback((en: string, ar: string) => (lang === "en" ? en : ar), [lang]);

  return { lang, setLang, toggle, t, dir: lang === "ar" ? "rtl" : ("ltr" as const) };
}
