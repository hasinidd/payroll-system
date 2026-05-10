ALTER POLICY "Ultra admins manage monthly OT adjustments" ON public.monthly_ot_adjustments TO authenticated;
ALTER POLICY "Super admins manage own branch OT adjustments" ON public.monthly_ot_adjustments TO authenticated;
ALTER POLICY "Branch admins manage own branch OT adjustments" ON public.monthly_ot_adjustments TO authenticated;