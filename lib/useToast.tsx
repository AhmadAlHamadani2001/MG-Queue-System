"use client";

import { useCallback, useState } from "react";

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setMessage(msg);
    window.setTimeout(() => setMessage(null), 2600);
  }, []);

  return { message, showToast };
}

export function ToastBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-[#191c1e] text-white px-5 py-3 rounded-xl shadow-2xl text-sm font-medium flex items-center gap-2 animate-[fadeIn_.2s_ease]">
      <span>✅</span>
      <span>{message}</span>
    </div>
  );
}
