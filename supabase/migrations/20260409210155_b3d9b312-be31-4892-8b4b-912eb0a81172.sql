
-- Create storage bucket for report templates
INSERT INTO storage.buckets (id, name, public) VALUES ('report-templates', 'report-templates', false);

-- Storage policies
CREATE POLICY "Authenticated users can upload report templates"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'report-templates');

CREATE POLICY "Authenticated users can view report templates"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'report-templates');

CREATE POLICY "Authenticated users can update report templates"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'report-templates');

CREATE POLICY "Authenticated users can delete report templates"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'report-templates');

-- Create tracking table
CREATE TABLE public.branch_report_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'xlsx',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(branch_id, report_type)
);

ALTER TABLE public.branch_report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins full access on branch_report_templates"
ON public.branch_report_templates FOR ALL TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Branch admins can view their branch templates"
ON public.branch_report_templates FOR SELECT TO authenticated
USING (branch_id IN (SELECT get_user_branch_ids()));

CREATE TRIGGER update_branch_report_templates_updated_at
BEFORE UPDATE ON public.branch_report_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
