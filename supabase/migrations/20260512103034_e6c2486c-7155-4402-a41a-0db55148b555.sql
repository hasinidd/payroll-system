DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_periods_month_year_key'
      AND conrelid = 'public.payroll_periods'::regclass
  ) THEN
    ALTER TABLE public.payroll_periods DROP CONSTRAINT payroll_periods_month_year_key;
  END IF;
END $$;

ALTER TABLE public.payroll_periods
  ADD CONSTRAINT payroll_periods_branch_id_month_year_key UNIQUE (branch_id, month, year);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_employee_no_key'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees DROP CONSTRAINT employees_employee_no_key;
  END IF;
END $$;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_branch_id_employee_no_key UNIQUE (branch_id, employee_no);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_epf_no_key'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees DROP CONSTRAINT employees_epf_no_key;
  END IF;
END $$;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_branch_id_epf_no_key UNIQUE (branch_id, epf_no);