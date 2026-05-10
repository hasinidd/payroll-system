
ALTER TABLE public.employees
  ADD COLUMN welfare numeric NOT NULL DEFAULT 0,
  ADD COLUMN salary_advance numeric NOT NULL DEFAULT 0,
  ADD COLUMN recoveries numeric NOT NULL DEFAULT 0,
  ADD COLUMN deposits numeric NOT NULL DEFAULT 0,
  ADD COLUMN other_deductions numeric NOT NULL DEFAULT 0,
  ADD COLUMN other_deduction_reason text DEFAULT '';
