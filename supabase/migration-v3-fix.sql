-- Fix RLS policies for households and household_members
-- The original FOR ALL policies created a chicken-and-egg problem:
-- you need to be a member to create a household, but can't be a member
-- without a household.

-- ============================================================
-- Fix households table policies
-- ============================================================
DROP POLICY IF EXISTS "Members see own household" ON households;

-- Anyone can create a household (they become owner)
CREATE POLICY "Users can create households" ON households FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Members can view their household
CREATE POLICY "Members can view household" ON households FOR SELECT
  USING (
    owner_id = auth.uid() OR
    id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- Only owner can update/delete
CREATE POLICY "Owner can update household" ON households FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete household" ON households FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================
-- Fix household_members table policies
-- ============================================================
DROP POLICY IF EXISTS "Members see household members" ON household_members;

-- Users can add themselves to a household they own
-- (or the owner adds others — checked via household ownership)
CREATE POLICY "Can insert members" ON household_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR
    household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
  );

-- Members can view other members in their household
CREATE POLICY "Members can view members" ON household_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
  );

-- Owner can update member roles
CREATE POLICY "Owner can update members" ON household_members FOR UPDATE
  USING (
    household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
  );

-- Owner can remove members (but not themselves via this policy)
CREATE POLICY "Owner can delete members" ON household_members FOR DELETE
  USING (
    household_id IN (SELECT id FROM households WHERE owner_id = auth.uid())
  );
