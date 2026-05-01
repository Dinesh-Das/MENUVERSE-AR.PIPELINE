import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Dashboard" },
  { to: "/upload", label: "Upload Model" }
];

export function Layout() {
  return (
    <div className="min-h-screen">
      <div className="shell">
        <header className="panel mb-8 overflow-hidden px-6 py-5 sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.35em] text-[#f5d28a]">
                Standalone Test UI
              </p>
              <h1 className="font-display text-3xl text-[color:var(--cream-strong)] sm:text-4xl">
                AR Pipeline Studio
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--muted)] sm:text-base">
                A separate admin UI for testing uploads, processing, previews, and AR-ready food assets before
                Menuverse consumes them over API in production.
              </p>
            </div>

            <nav className="flex flex-wrap gap-3">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive
                      ? "inline-flex items-center rounded-full bg-[color:var(--cream)] px-5 py-2.5 text-sm font-semibold text-[color:var(--ink)]"
                      : "inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
}
