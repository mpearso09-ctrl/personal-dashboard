'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function OfflineIndicator() {
  const [status, setStatus] = useState<'online' | 'offline' | 'back-online'>('online');

  useEffect(() => {
    // Sync with real status on mount
    if (!navigator.onLine) setStatus('offline');

    function handleOffline() {
      setStatus('offline');
    }

    function handleOnline() {
      setStatus('back-online');
      // Hide the "back online" notice after 3 seconds
      const t = setTimeout(() => setStatus('online'), 3000);
      return () => clearTimeout(t);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (status === 'online') return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-[200] text-center text-xs font-medium py-1.5 px-4 transition-colors',
        status === 'offline'
          ? 'bg-amber-600 text-white'
          : 'bg-emerald-600 text-white'
      )}
      style={{ paddingTop: 'max(0.375rem, env(safe-area-inset-top))' }}
    >
      {status === 'offline' ? '📡 Offline — data won\'t sync until you reconnect' : '✓ Back online'}
    </div>
  );
}
