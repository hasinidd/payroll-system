ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS holiday_multiplier numeric NOT NULL DEFAULT 2.0;