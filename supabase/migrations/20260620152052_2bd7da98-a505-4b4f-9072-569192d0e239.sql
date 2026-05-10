CREATE OR REPLACE FUNCTION public.can_manage_payroll_settings()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin()
      OR EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role IN ('hr'::public.app_role, 'accountant'::public.app_role)
      )
$$;