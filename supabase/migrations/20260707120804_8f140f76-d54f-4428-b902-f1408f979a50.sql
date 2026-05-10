
CREATE TABLE public.device_log_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  file_name TEXT,
  shift_start_time TEXT,
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_log_import_jobs TO authenticated;
GRANT ALL ON public.device_log_import_jobs TO service_role;

ALTER TABLE public.device_log_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own device log jobs"
  ON public.device_log_import_jobs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_device_log_import_jobs_updated_at
  BEFORE UPDATE ON public.device_log_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX device_log_import_jobs_user_status_idx
  ON public.device_log_import_jobs (user_id, status, created_at DESC);
