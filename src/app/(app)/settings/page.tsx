'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import type { FitnessGoals } from '@/lib/types';
import { Settings, Save, Check } from 'lucide-react';

const defaultGoals: Omit<FitnessGoals, 'id' | 'user_id' | 'updated_at'> = {
  calories_max: 2100,
  protein_min: 180,
  steps_min: 10000,
  sleep_min: 7.0,
  calories_burned_min: 3000,
  carbs_min: 125,
  carbs_max: 165,
  fat_min: 55,
  fat_max: 80,
  fiber_min: 30,
  fiber_max: 55,
  challenge_name: 'Iron69',
  challenge_start_date: null,
  challenge_days: 69,
  goal_weight: 170,
  goal_body_fat: 12,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [goals, setGoals] = useState(defaultGoals);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('fitness_goals')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const { id, user_id, updated_at, ...rest } = data;
          setGoals(rest);
        }
        setLoading(false);
      });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await supabase.from('fitness_goals').upsert(
      { ...goals, user_id: user.id },
      { onConflict: 'user_id' }
    );
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!user || loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-zinc-400">Loading...</div></div>;
  }

  function updateGoal(field: string, value: string) {
    setGoals((prev) => ({
      ...prev,
      [field]: field === 'challenge_name' || field === 'challenge_start_date' ? value : Number(value),
    }));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <Settings size={24} />
        Settings
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Challenge Settings</CardTitle>
        </CardHeader>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Challenge Name" value={goals.challenge_name} onChange={(v) => updateGoal('challenge_name', v)} />
          <Field label="Start Date" value={goals.challenge_start_date ?? ''} onChange={(v) => updateGoal('challenge_start_date', v)} type="date" />
          <Field label="Duration (days)" value={goals.challenge_days} onChange={(v) => updateGoal('challenge_days', v)} type="number" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Targets</CardTitle>
        </CardHeader>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Calories (max)" value={goals.calories_max} onChange={(v) => updateGoal('calories_max', v)} type="number" />
          <Field label="Protein (min g)" value={goals.protein_min} onChange={(v) => updateGoal('protein_min', v)} type="number" />
          <Field label="Steps (min)" value={goals.steps_min} onChange={(v) => updateGoal('steps_min', v)} type="number" />
          <Field label="Sleep (min hours)" value={goals.sleep_min} onChange={(v) => updateGoal('sleep_min', v)} type="number" step="0.5" />
          <Field label="Calories Burned (min)" value={goals.calories_burned_min} onChange={(v) => updateGoal('calories_burned_min', v)} type="number" />
          <Field label="Carbs Min (g)" value={goals.carbs_min} onChange={(v) => updateGoal('carbs_min', v)} type="number" />
          <Field label="Carbs Max (g)" value={goals.carbs_max} onChange={(v) => updateGoal('carbs_max', v)} type="number" />
          <Field label="Fat Min (g)" value={goals.fat_min} onChange={(v) => updateGoal('fat_min', v)} type="number" />
          <Field label="Fat Max (g)" value={goals.fat_max} onChange={(v) => updateGoal('fat_max', v)} type="number" />
          <Field label="Fiber Min (g)" value={goals.fiber_min} onChange={(v) => updateGoal('fiber_min', v)} type="number" />
          <Field label="Fiber Max (g)" value={goals.fiber_max} onChange={(v) => updateGoal('fiber_max', v)} type="number" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Body Composition Goals</CardTitle>
        </CardHeader>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Goal Weight (lbs)" value={goals.goal_weight} onChange={(v) => updateGoal('goal_weight', v)} type="number" step="0.1" />
          <Field label="Goal Body Fat (%)" value={goals.goal_body_fat} onChange={(v) => updateGoal('goal_body_fat', v)} type="number" step="0.1" />
        </div>
      </Card>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
      >
        {saved ? <Check size={18} /> : <Save size={18} />}
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        step={step}
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );
}
