
-- Create is_ultra_admin() using plpgsql to defer enum validation
CREATE OR REPLACE FUNCTION public.is_ultra_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text = 'ultra_admin'
  );
END;
$$;

-- Create admin_accounts table (may already exist from partial migration)
CREATE TABLE IF NOT EXISTS public.admin_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  max_branches integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist from partial migration, then recreate
DROP POLICY IF EXISTS "Ultra admins full access on admin_accounts" ON public.admin_accounts;
CREATE POLICY "Ultra admins full access on admin_accounts"
ON public.admin_accounts
FOR ALL
TO authenticated
USING (is_ultra_admin())
WITH CHECK (is_ultra_admin());

DROP POLICY IF EXISTS "Ultra admins can manage roles" ON public.user_roles;
CREATE POLICY "Ultra admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (is_ultra_admin())
WITH CHECK (is_ultra_admin());

-- Trigger for updated_at (drop if exists from partial)
DROP TRIGGER IF EXISTS update_admin_accounts_updated_at ON public.admin_accounts;
CREATE TRIGGER update_admin_accounts_updated_at
BEFORE UPDATE ON public.admin_accounts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
