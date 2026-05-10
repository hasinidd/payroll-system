
CREATE TABLE public.monthly_ot_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  ot_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  ot_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_ot_adjustments TO authenticated;
GRANT ALL ON public.monthly_ot_adjustments TO service_role;

ALTER TABLE public.monthly_ot_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view monthly OT adjustments"
  ON public.monthly_ot_adjustments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert monthly OT adjustments"
  ON public.monthly_ot_adjustments FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update monthly OT adjustments"
  ON public.monthly_ot_adjustments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated can delete monthly OT adjustments"
  ON public.monthly_ot_adjustments FOR DELETE
  TO authenticated USING (true);

CREATE TRIGGER update_monthly_ot_adjustments_updated_at
  BEFORE UPDATE ON public.monthly_ot_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
