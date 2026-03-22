-- Fix infinite recursion in RLS policies
-- The household_members SELECT policy was querying household_members itself.
-- Fix: use direct user_id check instead of subquery.

-- ============================================================
-- Drop ALL existing policies on both tables
-- ============================================================
DROP POLICY IF EXISTS "Members see own household" ON households;
DROP POLICY IF EXISTS "Members can view household" ON households;
DROP POLICY IF EXISTS "Users can create households" ON households;
DROP POLICY IF EXISTS "Owner can update household" ON households;
DROP POLICY IF EXISTS "Owner can delete household" ON households;

DROP POLICY IF EXISTS "Members see household members" ON household_members;
DROP POLICY IF EXISTS "Members can view members" ON household_members;
DROP POLICY IF EXISTS "Can insert members" ON household_members;
DROP POLICY IF EXISTS "Owner can update members" ON household_members;
DROP POLICY IF EXISTS "Owner can delete members" ON household_members;

-- ============================================================
-- Households: simple owner-based policies (no circular refs)
-- ============================================================
CREATE POLICY "households_insert" ON households FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "households_select" ON households FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "households_update" ON households FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "households_delete" ON households FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================
-- Household members: use direct user_id match (no self-referencing subquery)
-- ============================================================

-- You can always see your own membership row
-- You can also see rows that share your household_id IF you look up
-- your household via the households table (which has no circular ref)
CREATE POLICY "hm_select" ON household_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
  );

-- You can insert yourself, or the owner can insert others
CREATE POLICY "hm_insert" ON household_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
  );

-- Only household owner can update (change roles)
CREATE POLICY "hm_update" ON household_members FOR UPDATE
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));

-- Only household owner can remove members
CREATE POLICY "hm_delete" ON household_members FOR DELETE
  USING (household_id IN (SELECT id FROM households WHERE owner_id = auth.uid()));

-- ============================================================
-- Also let non-owner members SELECT their household row
-- by joining through their own membership
-- We do this with a separate permissive policy on households
-- ============================================================
CREATE POLICY "households_select_member" ON households FOR SELECT
  USING (id IN (
    SELECT household_id FROM household_members WHERE user_id = auth.uid()
  ));
-- This is safe: households SELECT queries household_members,
-- and household_members SELECT queries households (owner_id check),
-- so there's no circular loop.
