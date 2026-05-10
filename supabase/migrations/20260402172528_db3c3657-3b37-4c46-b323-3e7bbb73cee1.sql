
CREATE TABLE public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Your Company Name',
  address_line1 text NOT NULL DEFAULT '',
  address_line2 text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view company settings"
  ON public.company_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can update company settings"
  ON public.company_settings FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert company settings"
  ON public.company_settings FOR INSERT TO authenticated WITH CHECK (true);

-- Insert default row
INSERT INTO public.company_settings (company_name, address_line1)
VALUES ('Sunrise Consortium (Pvt) Ltd', '199, New Digana Rd, Naththarampotha, Kundasale');

-- Also add designation column to employees table (needed for pay slip)
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS designation text NOT NULL DEFAULT '';
