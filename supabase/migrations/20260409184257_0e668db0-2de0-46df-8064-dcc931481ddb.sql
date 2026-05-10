
-- Create deduction type enum
CREATE TYPE public.deduction_type AS ENUM ('Welfare', 'Salary Advance', 'Recovery', 'Deposit', 'Other');

-- Create employee_deductions table
CREATE TABLE public.employee_deductions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  deduction_type deduction_type NOT NULL,
  description TEXT DEFAULT '',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  interest_rate NUMERIC NOT NULL DEFAULT 0,
  with_interest BOOLEAN NOT NULL DEFAULT false,
  installments INTEGER NOT NULL DEFAULT 1,
  monthly_deduction NUMERIC NOT NULL DEFAULT 0,
  remaining_balance NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_deductions ENABLE ROW LEVEL SECURITY;

-- Admin access policy
CREATE POLICY "Admins full access on employee_deductions"
  ON public.employee_deductions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_employee_deductions_updated_at
  BEFORE UPDATE ON public.employee_deductions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
