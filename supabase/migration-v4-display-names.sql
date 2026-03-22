-- Add display names to household members
ALTER TABLE household_members ADD COLUMN display_name text;

-- Set your names
UPDATE household_members SET display_name = 'Mike' WHERE user_id = 'ef7d8079-ded2-486a-b0c8-d0812f890c07';
-- Update Melissa's user_id below after checking it in Supabase Auth > Users
-- UPDATE household_members SET display_name = 'Melissa' WHERE user_id = 'MELISSA_USER_ID_HERE';
