'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';

type PromptState = 'hidden' | 'android' | 'ios';

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export function InstallPrompt() {
  const [state, setState] = useState<PromptState>('hidden');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Don't show if already installed / opened from home screen
    if (isInStandalone()) return;

    // Don't show if user already dismissed
    if (sessionStorage.getItem('pwa-prompt-dismissed')) return;

    // Android / Chrome: capture the native install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setState('android');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // iOS Safari: show manual instructions (no native prompt available)
    if (isIos()) {
      // Small delay so it doesn't flash on first render
      const t = setTimeout(() => setState('ios'), 1500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      };
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  function dismiss() {
    sessionStorage.setItem('pwa-prompt-dismissed', '1');
    setState('hidden');
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setState('hidden');
    setDeferredPrompt(null);
  }

  if (state === 'hidden') return null;

  return (
    <div className="fixed bottom-20 left-3 right-3 z-[150] lg:left-auto lg:right-4 lg:w-80 bg-zinc-800 border border-zinc-700 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
      <div className="text-2xl mt-0.5 shrink-0">📱</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white mb-0.5">Install this app</p>
        {state === 'android' ? (
          <p className="text-xs text-zinc-400 mb-3">
            Add to your home screen for the best experience — works offline too.
          </p>
        ) : (
          <p className="text-xs text-zinc-400 mb-3">
            Tap <strong className="text-zinc-200">Share</strong> then{' '}
            <strong className="text-zinc-200">Add to Home Screen</strong> for the best experience.
          </p>
        )}
        {state === 'android' && (
          <button
            onClick={install}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-2 rounded-lg min-h-[36px] transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Install
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        className="text-zinc-500 hover:text-zinc-300 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
