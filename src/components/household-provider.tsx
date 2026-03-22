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

// Fetch display names via raw REST to bypass PostgREST schema cache
async function fetchDisplayNames(householdId: string, accessToken: string): Promise<Record<string, string>> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/household_members?select=user_id,display_name&household_id=eq.${householdId}`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    const rows: { user_id: string; display_name: string | null }[] = await res.json();
    const map: Record<string, string> = {};
    for (const row of rows) {
      if (row.display_name) map[row.user_id] = row.display_name;
    }
    return map;
  } catch {
    return {};
  }
}

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const supabase = createClient();

  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? '';

    const { data: ownedHouseholds } = await supabase
      .from('households')
      .select('*')
      .eq('owner_id', user.id);

    const { data: memberRows } = await supabase
      .from('household_members')
      .select('*, households(*)')
      .eq('user_id', user.id);

    let hhId: string | null = null;

    if (memberRows && memberRows.length > 0) {
      const membership = memberRows[0];
      const hh = membership.households as unknown as Household;
      setHousehold(hh);
      hhId = hh.id;

      const { data: allMembers } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', hh.id);

      setMembers(allMembers ?? []);
    } else if (ownedHouseholds && ownedHouseholds.length > 0) {
      const hh = ownedHouseholds[0];
      setHousehold(hh);
      hhId = hh.id;

      const { data: existing } = await supabase
        .from('household_members')
        .select('id')
        .eq('household_id', hh.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!existing) {
        await supabase
          .from('household_members')
          .insert({ household_id: hh.id, user_id: user.id, finance_role: 'full_access' });
      }

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
          .insert({ household_id: newHH.id, user_id: user.id, finance_role: 'full_access' });

        setHousehold(newHH);
        hhId = newHH.id;
        const { data: allMembers } = await supabase
          .from('household_members')
          .select('*')
          .eq('household_id', newHH.id);
        setMembers(allMembers ?? []);
      }
    }

    // Fetch display names via raw REST (bypasses PostgREST schema cache)
    if (hhId && accessToken) {
      const names = await fetchDisplayNames(hhId, accessToken);
      console.log('[household] display names from REST:', names);
      setDisplayNames(names);
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const myMembership = members.find((m) => m.user_id === user?.id);
  const financeRole = myMembership?.finance_role ?? 'full_access';
  const canEditFinances = financeRole === 'full_access';

  const householdUsers: HouseholdUser[] = members.map((m) => ({
    id: m.user_id,
    displayName: displayNames[m.user_id] ?? m.display_name ?? m.user_id.slice(0, 8),
    email: m.user_id === user?.id ? (user.email ?? '') : (displayNames[m.user_id] ?? m.display_name ?? m.user_id.slice(0, 8)),
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
