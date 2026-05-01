export function LoadingState({ label = "Loading..." }) {
  return (
    <div className="panel flex min-h-[240px] items-center justify-center px-6 py-10">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#f5d28a]/20 border-t-[#f5d28a]" />
        <p className="mt-4 text-sm text-[color:var(--muted)]">{label}</p>
      </div>
    </div>
  );
}
