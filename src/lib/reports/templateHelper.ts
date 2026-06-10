import { supabase } from "@/integrations/supabase/client";

/**
 * Fetches a branch-specific template file as ArrayBuffer.
 * Returns null if no custom template is uploaded for that branch/report type.
 */
export async function fetchBranchTemplate(
  branchId: string,
  reportType: string
): Promise<{ arrayBuffer: ArrayBuffer; fileType: string } | null> {
  const { data: template } = await supabase
    .from("branch_report_templates")
    .select("*")
    .eq("branch_id", branchId)
    .eq("report_type", reportType)
    .maybeSingle();

  if (!template) return null;

  const { data: fileData, error } = await supabase.storage
    .from("report-templates")
    .download((template as any).file_path);

  if (error || !fileData) return null;

  const arrayBuffer = await fileData.arrayBuffer();
  return { arrayBuffer, fileType: (template as any).file_type };
}
