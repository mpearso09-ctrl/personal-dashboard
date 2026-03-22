'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from './auth-provider';
import type { Household, HouseholdMember } from '@/lib/types';

export interface HouseholdUser {
  id: string;
  displayName: string;
  email: string;
}

interface HouseholdContext {
  household: Household | null;
  members: HouseholdMember[];
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
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data: ownedHouseholds } = await supabase
      .from('households')
      .select('*')
      .eq('owner_id', user.id);

    const { data: memberRows } = await supabase
      .from('household_members')
      .select('*, households(*)')
      .eq('user_id', user.id);

    if (memberRows && memberRows.length > 0) {
      const membership = memberRows[0];
      const hh = membership.households as unknown as Household;
      setHousehold(hh);

      const { data: allMembers } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', hh.id);

      setMembers(allMembers ?? []);
    } else if (ownedHouseholds && ownedHouseholds.length > 0) {
      const hh = ownedHouseholds[0];
      setHousehold(hh);
      await supabase
        .from('household_members')
        .upsert({ household_id: hh.id, user_id: user.id, finance_role: 'full_access', display_name: user.email?.split('@')[0] ?? null }, { onConflict: 'household_id,user_id' });
      const { data: allMembers } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', hh.id);
      setMembers(allMembers ?? []);
    } else {
      const { data: newHH, error: hhError } = await supabase
        .from('households')
        .insert({ name: 'My Household', owner_id: user.id })
        .select()
        .single();

      if (hhError) {
        console.error('Failed to create household:', hhError);
        setLoading(false);
        return;
      }

      if (newHH) {
        await supabase
          .from('household_members')
          .insert({ household_id: newHH.id, user_id: user.id, finance_role: 'full_access', display_name: user.email?.split('@')[0] ?? null });

        setHousehold(newHH);
        const { data: allMembers } = await supabase
          .from('household_members')
          .select('*')
          .eq('household_id', newHH.id);
        setMembers(allMembers ?? []);
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
    displayName: m.display_name ?? m.user_id.slice(0, 8),
    email: m.user_id === user?.id ? (user.email ?? '') : (m.display_name ?? m.user_id.slice(0, 8)),
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
