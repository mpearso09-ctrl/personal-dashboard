'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useTheme } from './theme-provider';
import { useAuth } from './auth-provider';
import {
  LayoutDashboard,
  Dumbbell,
  DollarSign,
  Settings,
  LogOut,
  Sun,
  Moon,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/fitness', label: 'Fitness', icon: Dumbbell },
  { href: '/finances', label: 'Finances', icon: DollarSign },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const firstName = user?.email?.split('@')[0] ?? 'User';

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <span className="text-lg font-bold text-white">Dashboard</span>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-zinc-400 hover:text-white"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="px-6 py-6">
          <h1 className="text-xl font-bold text-white">Personal Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1 capitalize">{firstName}</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                )}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-6 space-y-1">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 w-full"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-red-400 hover:bg-zinc-800 w-full"
          >
            <LogOut size={20} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tabs */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur border-t border-zinc-800">
        <div className="flex justify-around py-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-1 text-xs',
                  active ? 'text-blue-400' : 'text-zinc-500'
                )}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
