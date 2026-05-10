
-- 1. Create role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Only admins can view roles (using security definer function below)
-- We'll add this policy after the function is created

-- 2. Create security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 3. RLS policy on user_roles itself
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Assign admin role to existing admin user
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users WHERE email = 'admin@payroll.com'
ON CONFLICT DO NOTHING;

-- 5. Drop all old permissive policies and create admin-only policies

-- EMPLOYEES
DROP POLICY IF EXISTS "Authenticated users full access on employees" ON public.employees;
CREATE POLICY "Admins full access on employees"
  ON public.employees FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ATTENDANCE
DROP POLICY IF EXISTS "Authenticated users full access on attendance" ON public.attendance;
CREATE POLICY "Admins full access on attendance"
  ON public.attendance FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PAYROLL_ENTRIES
DROP POLICY IF EXISTS "Authenticated users full access on payroll_entries" ON public.payroll_entries;
CREATE POLICY "Admins full access on payroll_entries"
  ON public.payroll_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PAYROLL_PERIODS
DROP POLICY IF EXISTS "Authenticated users full access on payroll_periods" ON public.payroll_periods;
CREATE POLICY "Admins full access on payroll_periods"
  ON public.payroll_periods FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- LOANS
DROP POLICY IF EXISTS "Authenticated users full access on loans" ON public.loans;
CREATE POLICY "Admins full access on loans"
  ON public.loans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- DOCUMENTS
DROP POLICY IF EXISTS "Authenticated users full access on documents" ON public.documents;
CREATE POLICY "Admins full access on documents"
  ON public.documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- LEAVE_REQUESTS
DROP POLICY IF EXISTS "Authenticated users full access on leave_requests" ON public.leave_requests;
CREATE POLICY "Admins full access on leave_requests"
  ON public.leave_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- LEAVE_BALANCES
DROP POLICY IF EXISTS "Authenticated users full access on leave_balances" ON public.leave_balances;
CREATE POLICY "Admins full access on leave_balances"
  ON public.leave_balances FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- DEPARTMENTS
DROP POLICY IF EXISTS "Authenticated users full access on departments" ON public.departments;
CREATE POLICY "Admins full access on departments"
  ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- COMPANY_SETTINGS
DROP POLICY IF EXISTS "Authenticated users can view company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Authenticated users can update company settings" ON public.company_settings;
DROP POLICY IF EXISTS "Authenticated users can insert company settings" ON public.company_settings;
CREATE POLICY "Admins full access on company_settings"
  ON public.company_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Fix storage policies
DROP POLICY IF EXISTS "Authenticated users can view employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload employee documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete employee documents" ON storage.objects;

CREATE POLICY "Admins can view employee documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can upload employee documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-documents' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete employee documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-documents' AND public.has_role(auth.uid(), 'admin'));
