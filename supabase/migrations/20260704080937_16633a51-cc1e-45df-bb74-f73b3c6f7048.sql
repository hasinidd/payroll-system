ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS ot_hours_divisor numeric NOT NULL DEFAULT 240,
  ADD COLUMN IF NOT EXISTS ot_default_multiplier numeric NOT NULL DEFAULT 1.5;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_ot_hours_divisor_positive CHECK (ot_hours_divisor > 0);