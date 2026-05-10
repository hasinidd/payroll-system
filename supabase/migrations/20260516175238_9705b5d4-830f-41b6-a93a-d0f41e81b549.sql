CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_ultra_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text = 'super_admin'
        AND COALESCE(
          (
            SELECT aa.is_active
            FROM public.admin_accounts aa
            WHERE aa.user_id = auth.uid()
            LIMIT 1
          ),
          true
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.get_owned_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id
  FROM public.branches b
  WHERE public.is_ultra_admin()
     OR (public.is_super_admin() AND b.created_by = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.set_branch_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_branch_created_by_trigger ON public.branches;
CREATE TRIGGER set_branch_created_by_trigger
BEFORE INSERT ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.set_branch_created_by();

DROP POLICY IF EXISTS "Super admins can view own admin account" ON public.admin_accounts;
CREATE POLICY "Super admins can view own admin account"
ON public.admin_accounts
FOR SELECT
TO authenticated
USING (user_id = auth.uid());