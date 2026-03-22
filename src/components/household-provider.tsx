'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from './auth-provider';
import type { Household, HouseholdMember } from '@/lib/types';

interface HouseholdUser {
  id: string;
  email: string;
}

interface HouseholdContext {
  household: Household | null;
  members: (HouseholdMember & { email: string })[];
  householdId: string | null;
  financeRole: 'full_access' | 'view_only';
  canEditFinances: boolean;
  householdUsers: HouseholdUser[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const HouseholdCtx = createContext<HouseholdContext>({
  household: null,
  members: [],
  householdId: null,
  financeRole: 'full_access',
  canEditFinances: true,
  householdUsers: [],
  loading: true,
  refresh: async () => {},
});

export function useHousehold() {
  return useContext(HouseholdCtx);
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supabase = createClient();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<(HouseholdMember & { email: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    // Find user's household membership
    const { data: memberRows } = await supabase
      .from('household_members')
      .select('*, households(*)')
      .eq('user_id', user.id);

    if (memberRows && memberRows.length > 0) {
      const membership = memberRows[0];
      const hh = membership.households as unknown as Household;
      setHousehold(hh);

      // Load all members of this household
      const { data: allMembers } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', hh.id);

      if (allMembers) {
        // Get emails for each member via auth admin or just store what we know
        // Since we can't query auth.users directly, we'll get user info another way
        // For now, we'll use the user_id and email mapping from auth state
        const membersWithEmail = await Promise.all(
          allMembers.map(async (m) => {
            // We know our own email
            if (m.user_id === user.id) {
              return { ...m, email: user.email ?? 'Unknown' };
            }
            // For other members, we store a simple lookup
            // In practice, you'd have a profiles table, but we'll use a workaround
            return { ...m, email: m.user_id.slice(0, 8) + '...' };
          })
        );
        setMembers(membersWithEmail);
      }
    } else {
      // No household yet — auto-create one
      const { data: newHH } = await supabase
        .from('households')
        .insert({ name: 'My Household', owner_id: user.id })
        .select()
        .single();

      if (newHH) {
        await supabase
          .from('household_members')
          .insert({ household_id: newHH.id, user_id: user.id, finance_role: 'full_access' });

        setHousehold(newHH);
        setMembers([{ id: '', household_id: newHH.id, user_id: user.id, finance_role: 'full_access', created_at: '', email: user.email ?? '' }]);
      }
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const myMembership = members.find((m) => m.user_id === user?.id);
  const financeRole = myMembership?.finance_role ?? 'full_access';
  const canEditFinances = financeRole === 'full_access';

  const householdUsers: HouseholdUser[] = members.map((m) => ({
    id: m.user_id,
    email: m.email,
  }));

  return (
    <HouseholdCtx.Provider
      value={{
        household,
        members,
        householdId: household?.id ?? null,
        financeRole,
        canEditFinances,
        householdUsers,
        loading,
        refresh: load,
      }}
    >
      {children}
    </HouseholdCtx.Provider>
  );
}
