-- Create RPC function to get household members with display names
-- This bypasses PostgREST schema cache issues
CREATE OR REPLACE FUNCTION get_household_members(p_household_id uuid)
RETURNS TABLE (
  id uuid,
  household_id uuid,
  user_id uuid,
  display_name text,
  finance_role text,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, household_id, user_id, display_name, finance_role, created_at
  FROM household_members
  WHERE household_members.household_id = p_household_id
    AND (
      household_members.user_id = auth.uid()
      OR p_household_id IN (SELECT h.id FROM households h WHERE h.owner_id = auth.uid())
    );
$$;
