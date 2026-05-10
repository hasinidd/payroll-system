
-- 1. Add created_by to branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- 2. Backfill existing branches to the ultra admin
UPDATE public.branches
SET created_by = (
  SELECT user_id FROM public.user_roles
  WHERE role::text = 'ultra_admin'
  ORDER BY id
  LIMIT 1
)
WHERE created_by IS NULL;

-- 3. Auto-set created_by on new branches
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

DROP TRIGGER IF EXISTS branches_set_created_by ON public.branches;
CREATE TRIGGER branches_set_created_by
  BEFORE INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.set_branch_created_by();

-- 4. Helper: branches owned by current super admin (or all, if ultra admin)
CREATE OR REPLACE FUNCTION public.get_owned_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.branches
  WHERE public.is_ultra_admin()
     OR created_by = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.get_owned_branch_ids() FROM anon;

-- 5. Replace branches policies
DROP POLICY IF EXISTS "Super admins full access on branches" ON public.branches;
DROP POLICY IF EXISTS "Branch admins can view their branches" ON public.branches;

CREATE POLICY "Ultra admins full access on branches"
  ON public.branches FOR ALL TO authenticated
  USING (public.is_ultra_admin())
  WITH CHECK (public.is_ultra_admin());

CREATE POLICY "Super admins manage own branches"
  ON public.branches FOR ALL TO authenticated
  USING (public.is_super_admin() AND created_by = auth.uid())
  WITH CHECK (public.is_super_admin() AND (created_by = auth.uid() OR created_by IS NULL));

CREATE POLICY "Branch admins can view their branches"
  ON public.branches FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_user_branch_ids()));

-- 6. Rewrite "Super admins full access" policies on every branch-scoped table
--    so super admins are scoped to their owned branches.

-- attendance
DROP POLICY IF EXISTS "Super admins full access on attendance" ON public.attendance;
CREATE POLICY "Super admins access own branches attendance"
  ON public.attendance FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- employees
DROP POLICY IF EXISTS "Super admins full access on employees" ON public.employees;
CREATE POLICY "Super admins access own branches employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- departments
DROP POLICY IF EXISTS "Super admins full access on departments" ON public.departments;
CREATE POLICY "Super admins access own branches departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- documents
DROP POLICY IF EXISTS "Super admins full access on documents" ON public.documents;
CREATE POLICY "Super admins access own branches documents"
  ON public.documents FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- holidays
DROP POLICY IF EXISTS "Super admins full access on holidays" ON public.holidays;
CREATE POLICY "Super admins access own branches holidays"
  ON public.holidays FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- leave_balances
DROP POLICY IF EXISTS "Super admins full access on leave_balances" ON public.leave_balances;
CREATE POLICY "Super admins access own branches leave_balances"
  ON public.leave_balances FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- leave_requests
DROP POLICY IF EXISTS "Super admins full access on leave_requests" ON public.leave_requests;
CREATE POLICY "Super admins access own branches leave_requests"
  ON public.leave_requests FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- loans
DROP POLICY IF EXISTS "Super admins full access on loans" ON public.loans;
CREATE POLICY "Super admins access own branches loans"
  ON public.loans FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- employee_deductions
DROP POLICY IF EXISTS "Super admins full access on employee_deductions" ON public.employee_deductions;
CREATE POLICY "Super admins access own branches employee_deductions"
  ON public.employee_deductions FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- payroll_entries
DROP POLICY IF EXISTS "Super admins full access on payroll_entries" ON public.payroll_entries;
CREATE POLICY "Super admins access own branches payroll_entries"
  ON public.payroll_entries FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- payroll_periods
DROP POLICY IF EXISTS "Super admins full access on payroll_periods" ON public.payroll_periods;
CREATE POLICY "Super admins access own branches payroll_periods"
  ON public.payroll_periods FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- company_settings
DROP POLICY IF EXISTS "Super admins full access on company_settings" ON public.company_settings;
CREATE POLICY "Super admins access own branches company_settings"
  ON public.company_settings FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- branch_admins
DROP POLICY IF EXISTS "Super admins full access on branch_admins" ON public.branch_admins;
CREATE POLICY "Super admins manage own branches branch_admins"
  ON public.branch_admins FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- branch_report_templates
DROP POLICY IF EXISTS "Super admins full access on branch_report_templates" ON public.branch_report_templates;
CREATE POLICY "Super admins access own branches templates"
  ON public.branch_report_templates FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));

-- activity_logs
DROP POLICY IF EXISTS "Super admins full access on activity_logs" ON public.activity_logs;
CREATE POLICY "Super admins access own branches activity_logs"
  ON public.activity_logs FOR ALL TO authenticated
  USING (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()))
  WITH CHECK (public.is_super_admin() AND branch_id IN (SELECT public.get_owned_branch_ids()));
