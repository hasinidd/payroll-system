-- 1. Extend role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'hr';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

-- 2. Payroll component toggles on company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS epf_enabled            boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS etf_enabled            boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ot_enabled             boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_deduction_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.company_settings.epf_enabled            IS 'When false, EPF 8%/12% are skipped in payroll.';
COMMENT ON COLUMN public.company_settings.etf_enabled            IS 'When false, ETF 3% is skipped in payroll.';
COMMENT ON COLUMN public.company_settings.ot_enabled             IS 'When false, OT pay is skipped in payroll.';
COMMENT ON COLUMN public.company_settings.late_deduction_enabled IS 'When false, late minutes are still recorded but no deduction is applied.';