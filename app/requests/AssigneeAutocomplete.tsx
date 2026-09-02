"use client";

import { useEffect, useRef, useState } from "react";
import { supabase, Employee } from "@/lib/supabaseClient";
import { useLang } from "@/lib/useLang";

type Picked = { id: string; name: string } | null;

export default function AssigneeAutocomplete({
  value,
  onChange,
  placeholder,
}: {
  value: Picked;
  onChange: (emp: Picked) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [results, setResults] = useState<Employee[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const { t } = useLang();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.name]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || (value && value.name === query)) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      // dynamically queries the employee directory as the user types
      const { data } = await supabase
        .from("employees")
        .select("id, name, title, city, branch, phone, email")
        .ilike("name", `%${query}%`)
        .order("name")
        .limit(8);
      setResults((data as Employee[]) ?? []);
      setSearching(false);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Start typing a name…"}
        className="w-full h-12 px-4 rounded-lg border border-black/10 outline-none focus:border-mg-red bg-white/70"
        autoComplete="off"
      />
      {open && (searching || results.length > 0) && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-black/10 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {searching && <p className="px-4 py-2 text-xs text-black/40">{t("Searching…", "جارِ البحث…")}</p>}
          {!searching &&
            results.map((emp) => (
              <button
                type="button"
                key={emp.id}
                onMouseDown={() => {
                  onChange({ id: emp.id, name: emp.name });
                  setQuery(emp.name);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-2 hover:bg-black/5 flex flex-col"
              >
                <span className="text-sm font-medium">{emp.name}</span>
                <span className="text-xs text-black/40">
                  {[emp.title, emp.branch].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          {!searching && results.length === 0 && query && (
            <p className="px-4 py-2 text-xs text-black/40">{t("No matching employee.", "لا يوجد موظف مطابق.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
