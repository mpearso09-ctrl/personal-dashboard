'use client';

import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const fitbitNotice = searchParams.get('error') === 'fitbit'
    ? 'Sign in, then connect Fitbit again. Google finished before the dashboard session was available.'
    : '';

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    if (mode === 'up') {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (!data.session) {
        setNotice('Account created. Check your email to confirm it, then sign in. Food logs and nutrition targets stay on this login.');
        setMode('in');
        setLoading(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Personal Dashboard</h1>
          <p className="text-zinc-400 mt-2">{mode === 'up' ? 'Create your own login' : 'Sign in to continue'}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {(error || fitbitNotice) && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
              {error || fitbitNotice}
            </div>
          )}
          {notice && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-4 py-3 rounded-lg text-sm">
              {notice}
            </div>
          )}
          {mode === 'up' && (
            <p className="text-sm text-zinc-400">
              Each person uses their own email. The new account gets its own food log, nutrition targets, and fitness data.
            </p>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="you@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'up' ? 6 : undefined}
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
          >
            {loading ? 'Please wait…' : mode === 'up' ? 'Create account' : 'Sign In'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setMode(mode === 'up' ? 'in' : 'up'); setError(''); setNotice(''); }}
          className="mt-4 w-full text-sm text-zinc-400 hover:text-white"
        >
          {mode === 'up' ? 'Have an account? Sign in' : 'Need your own login? Create an account'}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  );
}
