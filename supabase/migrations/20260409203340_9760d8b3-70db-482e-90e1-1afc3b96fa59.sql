
-- Create branches table
CREATE TABLE public.branches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- Create branch_admins table
CREATE TABLE public.branch_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);
ALTER TABLE public.branch_admins ENABLE ROW LEVEL SECURITY;

-- Create activity_logs table
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Insert default branch
INSERT INTO public.branches (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Main Branch');

-- Add branch_id to all existing tables
ALTER TABLE public.employees ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.attendance ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.departments ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.documents ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.employee_deductions ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.holidays ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.leave_balances ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.leave_requests ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.loans ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.payroll_entries ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.payroll_periods ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE public.company_settings ADD COLUMN branch_id UUID REFERENCES public.branches(id) DEFAULT '00000000-0000-0000-0000-000000000001';

-- Make branch_id NOT NULL
ALTER TABLE public.employees ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.attendance ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.departments ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.documents ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.employee_deductions ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.holidays ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.leave_balances ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.leave_requests ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.loans ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.payroll_entries ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.payroll_periods ALTER COLUMN branch_id SET NOT NULL;
ALTER TABLE public.company_settings ALTER COLUMN branch_id SET NOT NULL;

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_branch_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT branch_id FROM public.branch_admins
  WHERE user_id = auth.uid()
$$;

-- Trigger for branches
CREATE TRIGGER update_branches_updated_at
  BEFORE UPDATE ON public.branches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for branches
CREATE POLICY "Super admins full access on branches"
  ON public.branches FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins can view their branches"
  ON public.branches FOR SELECT TO authenticated
  USING (id IN (SELECT public.get_user_branch_ids()));

-- RLS for branch_admins
CREATE POLICY "Super admins full access on branch_admins"
  ON public.branch_admins FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins can view own assignment"
  ON public.branch_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS for activity_logs
CREATE POLICY "Super admins full access on activity_logs"
  ON public.activity_logs FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins can view their branch logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (branch_id IN (SELECT public.get_user_branch_ids()));
CREATE POLICY "Branch admins can insert their branch logs"
  ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

-- Update RLS for all data tables
DROP POLICY IF EXISTS "Admins full access on employees" ON public.employees;
CREATE POLICY "Super admins full access on employees" ON public.employees FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch employees" ON public.employees FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on attendance" ON public.attendance;
CREATE POLICY "Super admins full access on attendance" ON public.attendance FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch attendance" ON public.attendance FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on departments" ON public.departments;
CREATE POLICY "Super admins full access on departments" ON public.departments FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch departments" ON public.departments FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on documents" ON public.documents;
CREATE POLICY "Super admins full access on documents" ON public.documents FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch documents" ON public.documents FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on employee_deductions" ON public.employee_deductions;
CREATE POLICY "Super admins full access on employee_deductions" ON public.employee_deductions FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch employee_deductions" ON public.employee_deductions FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on holidays" ON public.holidays;
CREATE POLICY "Super admins full access on holidays" ON public.holidays FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch holidays" ON public.holidays FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on leave_balances" ON public.leave_balances;
CREATE POLICY "Super admins full access on leave_balances" ON public.leave_balances FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch leave_balances" ON public.leave_balances FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on leave_requests" ON public.leave_requests;
CREATE POLICY "Super admins full access on leave_requests" ON public.leave_requests FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch leave_requests" ON public.leave_requests FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on loans" ON public.loans;
CREATE POLICY "Super admins full access on loans" ON public.loans FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch loans" ON public.loans FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on payroll_entries" ON public.payroll_entries;
CREATE POLICY "Super admins full access on payroll_entries" ON public.payroll_entries FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch payroll_entries" ON public.payroll_entries FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on payroll_periods" ON public.payroll_periods;
CREATE POLICY "Super admins full access on payroll_periods" ON public.payroll_periods FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch payroll_periods" ON public.payroll_periods FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));

DROP POLICY IF EXISTS "Admins full access on company_settings" ON public.company_settings;
CREATE POLICY "Super admins full access on company_settings" ON public.company_settings FOR ALL TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "Branch admins access own branch company_settings" ON public.company_settings FOR ALL TO authenticated USING (branch_id IN (SELECT public.get_user_branch_ids())) WITH CHECK (branch_id IN (SELECT public.get_user_branch_ids()));
