export function EmptyState({ title, description, action }) {
  return (
    <div className="panel px-6 py-14 text-center sm:px-10">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#f5d28a]">No models yet</p>
      <h2 className="mt-4 font-display text-3xl text-[color:var(--cream-strong)]">{title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted)]">{description}</p>
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}
