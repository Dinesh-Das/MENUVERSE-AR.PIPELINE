export function StatCard({ label, value, accent }) {
  return (
    <div className="panel overflow-hidden px-5 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">{label}</p>
          <p className="mt-3 font-display text-4xl text-[color:var(--cream-strong)]">{value}</p>
        </div>
        <div
          className="h-16 w-16 rounded-full"
          style={{
            background: accent
          }}
        />
      </div>
    </div>
  );
}
