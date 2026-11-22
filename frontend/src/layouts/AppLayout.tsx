import clsx from 'clsx';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarClock, Cpu, Fish, Gauge, Layers, LogOut, Menu, Moon, Settings, SlidersHorizontal, Sun, Users, Waves, X, Zap,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../hooks/useTheme';

const NAV = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/tanks', label: 'My Tanks', icon: Fish },
  { to: '/devices', label: 'Devices', icon: Cpu },
  { to: '/lighting', label: 'Lighting Configuration', icon: SlidersHorizontal },
  { to: '/profiles', label: 'Lighting Profiles', icon: Layers },
  { to: '/scheduler', label: 'Scheduler', icon: CalendarClock },
  { to: '/energy', label: 'Energy Monitoring', icon: Zap },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/users', label: 'User Management', icon: Users, enterpriseAdmin: true },
];

export function AppLayout() {
  const { user, organizations, activeOrg, switchOrg, logout, isEnterprise, can } = useAuth();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = NAV.filter((n) => !n.enterpriseAdmin || (isEnterprise && can('admin')));

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <div className="mb-4 flex items-center gap-2 px-2 py-3">
        <Waves className="h-7 w-7 text-reef-500" />
        <div>
          <p className="font-bold leading-tight">Reef Lighting</p>
          <p className="text-xs text-slate-500">{activeOrg?.name}</p>
        </div>
      </div>
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setOpen(false)}
          className={({ isActive }) => clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
            isActive ? 'bg-reef-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-abyss-700')}
        >
          <Icon className="h-4 w-4" /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-slate-200 bg-white dark:border-abyss-700 dark:bg-abyss-800 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white dark:bg-abyss-800" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close menu" className="absolute right-3 top-4 p-1" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-abyss-700 dark:bg-abyss-900/80">
          <button aria-label="Open menu" className="rounded p-1 lg:hidden" onClick={() => setOpen(true)}><Menu className="h-6 w-6" /></button>
          {organizations.length > 1 && (
            <select aria-label="Organization" className="input w-auto py-1.5" value={activeOrg?.id} onChange={(e) => { switchOrg(e.target.value); navigate('/'); }}>
              {organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          <div className="flex-1" />
          <button aria-label="Toggle theme" onClick={toggle} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-abyss-700">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <span className="hidden text-sm text-slate-600 dark:text-slate-300 sm:inline">{user?.displayName}</span>
          <button aria-label="Sign out" onClick={() => logout().then(() => navigate('/login'))} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-abyss-700"><LogOut className="h-5 w-5" /></button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}
