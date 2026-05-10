-- Add report config columns to company_settings
ALTER TABLE public.company_settings 
  ADD COLUMN IF NOT EXISTS epf_reg_no text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS report_footer text NOT NULL DEFAULT '';

-- Ensure every branch has a company_settings row
INSERT INTO public.company_settings (branch_id, company_name)
SELECT b.id, b.name
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.company_settings cs WHERE cs.branch_id = b.id
);