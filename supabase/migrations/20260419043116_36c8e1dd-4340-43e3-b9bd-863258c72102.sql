-- Allow authenticated users to read their own role rows.
-- Without this, super_admin users cannot see they have super_admin role,
-- causing them to be denied access in the frontend.
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());