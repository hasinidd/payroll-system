
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS shift_start_time time NOT NULL DEFAULT '08:00:00';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false;
