'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import {
  NUTRITION_MACROS,
  normalizeSettings,
  nutritionQueryMessage,
  type NutritionMacroKey,
  type NutritionSettings,
} from '@/lib/nutrition';

export default function NutritionSettingsPage() {
  const { user, loading } = useAuth();
  const supabase = createClient();
  const [settings, setSettings] = useState<NutritionSettings>(normalizeSettings(null));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    supabase.from('nutrition_settings').select('tracked, targets').eq('user_id', user.id).maybeSingle()
      .then(({ data, error }) => {
        const loadError = nutritionQueryMessage([error]);
        if (loadError) {
          setMessage(loadError);
          return;
        }
        setSettings(normalizeSettings(data));
      });
  }, [user]);

  function toggle(key: NutritionMacroKey) {
    setSettings((current) => {
      const tracked = current.tracked.includes(key)
        ? current.tracked.filter((item) => item !== key)
        : [...current.tracked, key];
      const ordered = NUTRITION_MACROS.map((macro) => macro.key).filter((item) => tracked.includes(item));
      return { ...current, tracked: ordered };
    });
  }

  function setTarget(key: NutritionMacroKey, raw: string) {
    setSettings((current) => {
      const targets = { ...current.targets };
      if (raw.trim() === '') delete targets[key];
      else {
        const value = Number(raw);
        if (Number.isFinite(value) && value >= 0) targets[key] = value;
      }
      return { ...current, targets };
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user || settings.tracked.length === 0) {
      setMessage('Keep at least one macro.');
      return;
    }
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('nutrition_settings').upsert({
      user_id: user.id,
      tracked: settings.tracked,
      targets: settings.targets,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setSaving(false);
    setMessage(error ? error.message : 'Saved. This applies only to your account.');
  }

  if (loading || !user) return <p className="text-sm text-zinc-500">Loading…</p>;

  return (
    <form onSubmit={save} className="max-w-xl space-y-4">
      <div>
        <Link href="/nutrition" className="text-sm text-zinc-400 hover:text-white">Back to food log</Link>
        <h1 className="text-2xl font-bold text-white mt-2">Nutrition</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Choose what you see and the daily targets you care about. Your partner&apos;s settings stay on their own login.
          Calories, fat, carbs, sugar, and sodium turn amber over the target. Protein and fiber turn amber when you are short.
        </p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl divide-y divide-zinc-800">
        {NUTRITION_MACROS.map((macro) => {
          const on = settings.tracked.includes(macro.key);
          return (
            <div key={macro.key} className="flex items-center gap-3 px-4 py-3">
              <label className="flex items-center gap-3 flex-1 text-sm text-white">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(macro.key)}
                  className="h-4 w-4 accent-blue-500"
                />
                {macro.label}
                <span className="text-zinc-500">{macro.unit}</span>
              </label>
              <label className="text-xs text-zinc-500">
                Target
                <input
                  type="number"
                  min="0"
                  step={macro.digits ? '0.1' : '1'}
                  disabled={!on}
                  value={settings.targets[macro.key] ?? ''}
                  onChange={(event) => setTarget(macro.key, event.target.value)}
                  placeholder="optional"
                  className="ml-2 w-28 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white disabled:opacity-40"
                />
              </label>
            </div>
          );
        })}
      </div>
      <button type="submit" disabled={saving} className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">
        {saving ? 'Saving…' : 'Save nutrition settings'}
      </button>
      {message && <p className="text-sm text-zinc-300">{message}</p>}
    </form>
  );
}
