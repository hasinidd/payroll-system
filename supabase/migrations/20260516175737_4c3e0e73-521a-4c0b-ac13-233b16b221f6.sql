GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ultra_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owned_branch_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_branch_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;