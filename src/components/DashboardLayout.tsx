import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldCheck,
  History,
  FileBarChart2,
  Settings,
  LogOut,
  Menu,
  X,
  MessageSquarePlus,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardLayoutProps {
  breadcrumb: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export default function DashboardLayout({ breadcrumb, title, actions, children }: DashboardLayoutProps) {
  const { user, venueName, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    ...(user?.role === 'super_admin' || user?.role === 'restaurant_admin'
      ? [{ to: '/admin', label: 'Admin Console', icon: ShieldCheck }]
      : []),
    { to: '/dashboard', label: 'Manager Analytics', icon: LayoutDashboard },
    { to: '/history', label: 'Feedback History', icon: History },
    { to: '/reports', label: 'Reports & Exports', icon: FileBarChart2 },
    { to: '/settings', label: 'Settings & Privacy', icon: Settings },
  ];

  const roleLabel =
    user?.role === 'super_admin'
      ? 'Super Admin'
      : user?.role === 'restaurant_admin'
        ? 'Restaurant Admin'
        : 'Restaurant Manager';

  const SidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-slate-900 text-slate-100">
      <div>
        <div className="border-b border-slate-800 px-6 py-5">
          <Link to="/" className="font-display text-base font-bold tracking-tight text-white">
            DineSense Feedback
          </Link>
          <p className="mt-1 text-xs text-slate-400 truncate">
            {venueName || 'Platform Administration'}
          </p>
        </div>

        <nav className="space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          <div className="pt-4 mt-4 border-t border-slate-800">
            <Link
              to={user?.venue_id ? `/feedback/${user.venue_id}` : '/feedback'}
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800/60 hover:text-white transition-colors whitespace-nowrap"
            >
              <MessageSquarePlus className="h-4 w-4 shrink-0" />
              <span>Open Guest Form</span>
            </Link>
          </div>
        </nav>
      </div>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 px-2">
          <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
          <p className="text-xs text-slate-400 truncate">
            {roleLabel} · {user?.email}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-slate-800 bg-slate-900">
        <div className="sticky top-0 h-screen">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-64 max-w-[80vw] h-full">
            <button
              aria-label="Close navigation"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 rounded-md p-1.5 text-slate-300 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 truncate">{breadcrumb}</p>
                <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 truncate">
                  {title}
                </h1>
              </div>
            </div>
            {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
