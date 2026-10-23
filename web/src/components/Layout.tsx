import { NavLink, Outlet } from "react-router";
import { useAuth } from "../lib/auth";
import {
  BarbellMark,
  LibraryIcon,
  ProgramsIcon,
  ProgressIcon,
  SettingsIcon,
  TodayIcon,
} from "./icons";

const NAV = [
  { to: "/", label: "Today", Icon: TodayIcon, end: true },
  { to: "/programs", label: "Programs", Icon: ProgramsIcon },
  { to: "/library", label: "Library", Icon: LibraryIcon },
  { to: "/progress", label: "Progress", Icon: ProgressIcon },
];

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BarbellMark />
      <span className="font-display text-[26px] leading-none font-bold tracking-tight">FitTrack</span>
    </span>
  );
}

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule px-4 py-6 md:flex">
        <div className="px-2">
          <Wordmark />
        </div>
        <nav aria-label="Main" className="mt-10 flex flex-col gap-1">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold transition-colors ${
                  isActive ? "bg-panel text-ink shadow-[inset_3px_0_0_var(--accent)]" : "text-ink-2 hover:text-ink"
                }`
              }
            >
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-rule pt-4">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-semibold ${
                isActive ? "text-ink" : "text-ink-2 hover:text-ink"
              }`
            }
          >
            <SettingsIcon />
            Settings
          </NavLink>
          {user ? <p className="truncate px-3 pt-1 text-sm text-ink-3">{user.email}</p> : null}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex items-center justify-between border-b border-rule px-4 py-3 md:hidden">
        <Wordmark />
        <NavLink to="/settings" aria-label="Settings" className="rounded-md p-2 text-ink-2">
          <SettingsIcon />
        </NavLink>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1040px] px-4 pt-6 pb-28 md:px-10 md:pt-10 md:pb-16">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-rule bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${
                isActive ? "text-accent" : "text-ink-3"
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
