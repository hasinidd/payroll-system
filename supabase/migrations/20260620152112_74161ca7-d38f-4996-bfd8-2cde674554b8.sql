REVOKE EXECUTE ON FUNCTION public.can_manage_payroll_settings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_payroll_settings() TO authenticated;