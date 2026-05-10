
-- =========================================================
-- 1. Fix employee-documents storage policies (branch-scoped)
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete documents" ON storage.objects;

CREATE POLICY "Ultra admins manage employee-documents"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'employee-documents' AND public.is_ultra_admin())
  WITH CHECK (bucket_id = 'employee-documents' AND public.is_ultra_admin());

CREATE POLICY "Super admins manage employee-documents in own branches"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND public.is_super_admin()
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_owned_branch_ids())
  )
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND public.is_super_admin()
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_owned_branch_ids())
  );

CREATE POLICY "Branch admins manage employee-documents in own branch"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_branch_ids())
  )
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_branch_ids())
  );

-- =========================================================
-- 2. Fix report-templates storage policies (branch-scoped)
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can upload report templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view report templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update report templates" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete report templates" ON storage.objects;

CREATE POLICY "Ultra admins manage report-templates"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'report-templates' AND public.is_ultra_admin())
  WITH CHECK (bucket_id = 'report-templates' AND public.is_ultra_admin());

CREATE POLICY "Super admins manage report-templates in own branches"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'report-templates'
    AND public.is_super_admin()
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_owned_branch_ids())
  )
  WITH CHECK (
    bucket_id = 'report-templates'
    AND public.is_super_admin()
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_owned_branch_ids())
  );

CREATE POLICY "Branch admins read report-templates in own branch"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-templates'
    AND ((storage.foldername(name))[1])::uuid IN (SELECT public.get_user_branch_ids())
  );

-- =========================================================
-- 3. Fix user_roles privilege escalation
-- =========================================================
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Ultra admins can view all roles (in addition to existing manage-all policy)
CREATE POLICY "Ultra admins can view all roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_ultra_admin());

-- =========================================================
-- 4. Lock down SECURITY DEFINER helper functions
-- =========================================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_ultra_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_branch_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_owned_branch_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_branch_created_by() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_ultra_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_branch_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owned_branch_ids() TO authenticated;
