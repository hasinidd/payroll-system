
ALTER TABLE public.admin_accounts
ADD COLUMN feature_flags jsonb NOT NULL DEFAULT '{
  "dashboard": true,
  "employees": true,
  "attendance": true,
  "leave": true,
  "payroll": true,
  "deductions": true,
  "holidays": true,
  "reports": true,
  "settings": true
}'::jsonb;
