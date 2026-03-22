'use client';

import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/components/auth-provider';
import { HouseholdProvider } from '@/components/household-provider';
import { Sidebar } from '@/components/sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HouseholdProvider>
          <div className="min-h-screen">
            <Sidebar />
            <main className="lg:ml-64 pt-14 lg:pt-0 pb-20 lg:pb-0 min-h-screen">
              <div className="max-w-7xl mx-auto px-4 py-6 lg:py-8">
                {children}
              </div>
            </main>
          </div>
        </HouseholdProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
