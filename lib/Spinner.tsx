export function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={`animate-spin text-current ${className}`}
      style={{ width: size, height: size }}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-4a6 6 0 0 0-6-6V2z"
      />
    </svg>
  );
}

export function PageLoading({ label }: { label?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center gap-2 text-black/40">
      <Spinner size={20} />
      {label && <span className="text-sm">{label}</span>}
    </main>
  );
}

export function InlineLoading({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-black/40 py-10">
      <Spinner size={18} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
