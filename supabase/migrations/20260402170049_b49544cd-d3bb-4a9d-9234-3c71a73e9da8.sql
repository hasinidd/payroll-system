
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Departments
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on departments" ON public.departments FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Employees
CREATE TYPE public.employee_category AS ENUM ('Management', 'Office');
CREATE TYPE public.employee_status AS ENUM ('Active', 'Terminated', 'Promoted');

CREATE TABLE public.employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_no TEXT NOT NULL UNIQUE,
  epf_no TEXT NOT NULL UNIQUE,
  nic_number TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  category public.employee_category NOT NULL DEFAULT 'Office',
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  attendance_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  fuel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  travel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  bank_name TEXT,
  bank_account_no TEXT,
  status public.employee_status NOT NULL DEFAULT 'Active',
  status_remark TEXT,
  join_date DATE NOT NULL,
  termination_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on employees" ON public.employees FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Leave Balances
CREATE TABLE public.leave_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  annual NUMERIC(5,1) NOT NULL DEFAULT 0,
  casual NUMERIC(5,1) NOT NULL DEFAULT 0,
  sick NUMERIC(5,1) NOT NULL DEFAULT 0,
  other NUMERIC(5,1) NOT NULL DEFAULT 0,
  maternity NUMERIC(5,1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, year)
);
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on leave_balances" ON public.leave_balances FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Leave Requests
CREATE TYPE public.leave_type AS ENUM ('Annual', 'Casual', 'Sick', 'Other', 'Maternity');
CREATE TYPE public.leave_status AS ENUM ('Pending', 'Approved', 'Rejected');

CREATE TABLE public.leave_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  leave_type public.leave_type NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC(5,1) NOT NULL,
  status public.leave_status NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on leave_requests" ON public.leave_requests FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Attendance
CREATE TYPE public.attendance_status AS ENUM ('Present', 'Leave', 'No Pay', 'Half Day');

CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status public.attendance_status NOT NULL DEFAULT 'Present',
  in_time TIME,
  out_time TIME,
  ot_hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  ot_multiplier NUMERIC(3,1) NOT NULL DEFAULT 1.5,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on attendance" ON public.attendance FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Payroll Periods
CREATE TABLE public.payroll_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL,
  days_in_month INTEGER NOT NULL,
  required_days INTEGER NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_by UUID REFERENCES auth.users(id),
  lock_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month, year)
);
ALTER TABLE public.payroll_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on payroll_periods" ON public.payroll_periods FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Payroll Entries
CREATE TABLE public.payroll_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_period_id UUID NOT NULL REFERENCES public.payroll_periods(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  attendance_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  attendance_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  no_pay_days NUMERIC(5,1) NOT NULL DEFAULT 0,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  gross_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  no_pay_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  late_pay_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  ot_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  fuel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  travel_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  incentives NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earnings NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_employee NUMERIC(12,2) NOT NULL DEFAULT 0,
  epf_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  etf_employer NUMERIC(12,2) NOT NULL DEFAULT 0,
  welfare NUMERIC(12,2) NOT NULL DEFAULT 0,
  salary_advance NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposits NUMERIC(12,2) NOT NULL DEFAULT 0,
  recoveries NUMERIC(12,2) NOT NULL DEFAULT 0,
  loan_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  other_deduction_reason TEXT,
  total_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(payroll_period_id, employee_id)
);
ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on payroll_entries" ON public.payroll_entries FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Loans
CREATE TABLE public.loans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  loan_amount NUMERIC(12,2) NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  installments INTEGER NOT NULL,
  with_interest BOOLEAN NOT NULL DEFAULT false,
  monthly_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on loans" ON public.loans FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Documents
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access on documents" ON public.documents FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Storage bucket for employee documents
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-documents', 'employee-documents', false);
CREATE POLICY "Authenticated users can upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'employee-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can view documents" ON storage.objects FOR SELECT USING (bucket_id = 'employee-documents' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete documents" ON storage.objects FOR DELETE USING (bucket_id = 'employee-documents' AND auth.uid() IS NOT NULL);
