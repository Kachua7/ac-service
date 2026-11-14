import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { AuthUser } from '../../shared/types';

export type CustomerRoute = 'home' | 'book' | 'track' | 'bookings';

interface HeaderProps {
  user: AuthUser;
  currentRoute: CustomerRoute;
  onNavigate: (route: CustomerRoute) => void;
  onLogout: () => void;
}

const CUSTOMER_NAV: Array<{ route: CustomerRoute; label: string }> = [
  { route: 'home', label: 'Services' },
  { route: 'track', label: 'Track Live' },
  { route: 'bookings', label: 'My Bookings' },
];

export function Header({ user, currentRoute, onNavigate, onLogout }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (route: CustomerRoute) => {
    onNavigate(route);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => (user.role === 'CUSTOMER' ? handleNav('home') : undefined)}
          className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-600"
        >
          VayuCare
        </button>

        {/* Zone 2: Strictly Role-Isolated Navigation Links */}
        {user.role === 'CUSTOMER' && (
          <nav
            aria-label="Customer navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            {CUSTOMER_NAV.map((item) => {
              const active = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => handleNav(item.route)}
                  className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                    active
                      ? 'border-sky-600 text-slate-900 font-semibold'
                      : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onLogout}
              className="whitespace-nowrap shrink-0 py-1 border-b-2 border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300 transition-colors"
            >
              Sign Out
            </button>
          </nav>
        )}

        {user.role === 'TECHNICIAN' && (
          <nav
            aria-label="Technician navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <span className="whitespace-nowrap shrink-0 py-1 border-b-2 border-sky-600 text-slate-900 font-semibold">
              Field Dispatch
            </span>
            <span className="whitespace-nowrap shrink-0 text-slate-500">
              {user.name}
            </span>
          </nav>
        )}

        {user.role === 'ADMIN' && (
          <nav
            aria-label="Admin navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <span className="whitespace-nowrap shrink-0 py-1 border-b-2 border-sky-600 text-slate-900 font-semibold">
              Operations Console
            </span>
            <span className="whitespace-nowrap shrink-0 text-slate-500">
              {user.name}
            </span>
          </nav>
        )}

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          {user.role === 'CUSTOMER' ? (
            <button
              type="button"
              onClick={() => handleNav('book')}
              className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              Book Service
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              Sign Out
            </button>
          )}

          {user.role === 'CUSTOMER' && (
            <button
              type="button"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 md:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {mobileOpen && user.role === 'CUSTOMER' && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {CUSTOMER_NAV.map((item) => {
              const active = currentRoute === item.route;
              return (
                <button
                  key={item.route}
                  type="button"
                  onClick={() => handleNav(item.route)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                    active ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onLogout();
              }}
              className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
