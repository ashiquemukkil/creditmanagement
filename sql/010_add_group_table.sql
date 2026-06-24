-- Create Group table
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(category, sub_category)
);

-- Create index on category
CREATE INDEX idx_groups_category ON groups(category);

-- Add group_id column to customers table if it doesn't exist
ALTER TABLE customers ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES groups(id);

-- Create index on customer.group_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_customers_group_id ON customers(group_id);

-- Insert default group
INSERT INTO groups (category, sub_category) 
VALUES ('Default', 'General')
ON CONFLICT (category, sub_category) DO NOTHING;

-- Update existing customers without a group to use the default group
UPDATE customers 
SET group_id = (SELECT id FROM groups WHERE category = 'Default' AND sub_category = 'General')
WHERE group_id IS NULL;

-- Enable RLS on groups table
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for groups table
-- Policy for SELECT - all authenticated users can read groups
DROP POLICY IF EXISTS groups_select_authenticated ON groups;
CREATE POLICY groups_select_authenticated
ON groups
FOR SELECT
TO authenticated
USING (is_active = true);

-- Policy for INSERT - only admin and collaborator can create groups
DROP POLICY IF EXISTS groups_insert_team ON groups;
CREATE POLICY groups_insert_team
ON groups
FOR INSERT
TO authenticated
WITH CHECK (public.current_app_role() IN ('admin', 'collaborator'));

-- Policy for UPDATE - only admin and collaborator can update groups
DROP POLICY IF EXISTS groups_update_team ON groups;
CREATE POLICY groups_update_team
ON groups
FOR UPDATE
TO authenticated
USING (public.current_app_role() IN ('admin', 'collaborator'))
WITH CHECK (public.current_app_role() IN ('admin', 'collaborator'));

-- Policy for DELETE - only admin can delete groups
DROP POLICY IF EXISTS groups_delete_admin ON groups;
CREATE POLICY groups_delete_admin
ON groups
FOR DELETE
TO authenticated
USING (public.current_app_role() = 'admin');
