"use client";

import { useEffect, useState, useCallback } from "react";

const KEY = "mg_requests_user_name";

export function useCurrentUser() {
  const [name, setNameState] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored) setNameState(stored);
  }, []);

  const setName = useCallback((value: string) => {
    setNameState(value);
    window.localStorage.setItem(KEY, value);
  }, []);

  return [name, setName] as const;
}
