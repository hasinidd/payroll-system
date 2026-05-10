
-- 1) Restrict monthly_ot_adjustments to branch scope
DROP POLICY IF EXISTS "Authenticated can view monthly OT adjustments" ON public.monthly_ot_adjustments;
DROP POLICY IF EXISTS "Authenticated can insert monthly OT adjustments" ON public.monthly_ot_adjustments;
DROP POLICY IF EXISTS "Authenticated can update monthly OT adjustments" ON public.monthly_ot_adjustments;
DROP POLICY IF EXISTS "Authenticated can delete monthly OT adjustments" ON public.monthly_ot_adjustments;

CREATE POLICY "Ultra admins manage monthly OT adjustments"
  ON public.monthly_ot_adjustments FOR ALL
  USING (public.is_ultra_admin())
  WITH CHECK (public.is_ultra_admin());

CREATE POLICY "Super admins manage own branch OT adjustments"
  ON public.monthly_ot_adjustments FOR ALL
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

CREATE POLICY "Branch admins manage own branch OT adjustments"
  ON public.monthly_ot_adjustments FOR ALL
  USING (branch_id IN (SELECT public.get_user_branch_ids()))
  WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

-- 2) Remove storage policies that reference unused 'admin' role
DROP POLICY IF EXISTS "Admins can view employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete employee documents" ON storage.objects;
