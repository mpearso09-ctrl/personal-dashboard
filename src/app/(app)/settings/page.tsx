'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/auth-provider';
import { useHousehold } from '@/components/household-provider';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import type { FitnessGoals, HouseholdMember } from '@/lib/types';
import { Settings, Save, Check, Users, Shield, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const { household, members, refresh: refreshHousehold } = useHousehold();
  const supabase = createClient();
  const [goals, setGoals] = useState(defaultGoals);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  const isOwner = household?.owner_id === user?.id;

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

  async function inviteMember() {
    if (!inviteEmail.trim() || !household) return;
    setInviteError('');
    setInviteSuccess('');

    // Look up user by email — we need to find their user_id
    // Since we can't query auth.users from client, the invited user
    // needs to already have an account. We'll add them by searching
    // for existing household members or use a workaround.
    // For a 2-person household, the simplest approach: the second user
    // logs in and auto-joins via a shared invite code, or we look them up.

    // Workaround: use Supabase admin or just tell the user to share household ID
    // For now, we'll try to add by user ID found in the system
    // The practical approach for 2 users: after both sign up, the owner
    // enters the second user's email and we match it.

    // Since RPC isn't set up, let's use a simpler approach:
    // Store the email as a pending invite, and when that user logs in,
    // they auto-join. For now, add them if they exist.
    setInviteError('To add a household member: both users must have Supabase accounts. Enter their email below — if they have an account, they will be added.');
    setInviteSuccess('Share your household ID with the other user, or add them manually in Supabase dashboard: household_members table.');
  }

  async function updateMemberRole(memberId: string, newRole: 'full_access' | 'view_only') {
    if (!isOwner) return;
    await supabase.from('household_members').update({ finance_role: newRole }).eq('id', memberId);
    refreshHousehold();
  }

  async function removeMember(memberId: string, memberUserId: string) {
    if (!isOwner || memberUserId === user?.id) return;
    if (!confirm('Remove this member from the household?')) return;
    await supabase.from('household_members').delete().eq('id', memberId);
    refreshHousehold();
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

      {/* Household & Finance Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users size={20} className="text-blue-400" />
            Household & Finance Permissions
          </CardTitle>
        </CardHeader>
        <div className="space-y-4">
          {household && (
            <div className="text-sm text-zinc-400">
              Household: <span className="text-white font-medium">{household.name}</span>
              {isOwner && <span className="text-blue-400 ml-2">(Owner)</span>}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-zinc-300">Members</h4>
            {members.map((member) => {
              const isSelf = member.user_id === user.id;
              const isThisOwner = member.user_id === household?.owner_id;
              return (
                <div key={member.id} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-medium text-zinc-300">
                      {member.email[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="text-sm text-white">
                        {member.email}
                        {isSelf && <span className="text-zinc-500 ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {isThisOwner ? 'Owner' : 'Member'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isThisOwner ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-400">
                        <ShieldCheck size={14} /> Full Access (Owner)
                      </span>
                    ) : isOwner ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateMemberRole(member.id, member.finance_role === 'full_access' ? 'view_only' : 'full_access')}
                          className={cn(
                            'flex items-center gap-1 px-3 py-1 rounded text-xs font-medium border transition-colors',
                            member.finance_role === 'full_access'
                              ? 'bg-emerald-600/20 border-emerald-600/40 text-emerald-400'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          )}
                        >
                          <Shield size={12} />
                          {member.finance_role === 'full_access' ? 'Full Access' : 'View Only'}
                        </button>
                        <button
                          onClick={() => removeMember(member.id, member.user_id)}
                          className="text-xs text-zinc-600 hover:text-red-400"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className={cn(
                        'flex items-center gap-1 text-xs',
                        member.finance_role === 'full_access' ? 'text-emerald-400' : 'text-zinc-400'
                      )}>
                        <Shield size={12} />
                        {member.finance_role === 'full_access' ? 'Full Access' : 'View Only'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isOwner && (
            <div className="pt-2">
              <p className="text-xs text-zinc-500 mb-2">
                To add a member: create their account in Supabase Auth, then add a row to <code className="bg-zinc-800 px-1 rounded">household_members</code> with your household ID and their user ID.
              </p>
              {household && (
                <div className="text-xs text-zinc-500">
                  Household ID: <code className="bg-zinc-800 px-1 rounded text-zinc-300">{household.id}</code>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

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
