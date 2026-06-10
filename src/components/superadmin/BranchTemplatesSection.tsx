import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Trash2, FileText, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

const REPORT_TYPES = [
  { key: "payslip", label: "Payslip", accept: ".xlsx,.pdf" },
  { key: "c_form", label: "C Form (EPF)", accept: ".xlsx,.pdf" },
  { key: "bank_summary", label: "Bank Summary", accept: ".xlsx,.pdf" },
  { key: "signature_list", label: "Signature List", accept: ".xlsx,.pdf" },
  { key: "attendance_summary", label: "Attendance Summary", accept: ".xlsx,.pdf" },
];

interface Props {
  branchId: string;
  branchName: string;
}

const BranchTemplatesSection = ({ branchId, branchName }: Props) => {
  const queryClient = useQueryClient();

  const { data: templates } = useQuery({
    queryKey: ["branch-templates", branchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_report_templates")
        .select("*")
        .eq("branch_id", branchId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ reportType, file }: { reportType: string; file: File }) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "xlsx";
      const storagePath = `${branchId}/${reportType}.${ext}`;

      // Upload to storage (overwrite if exists)
      const { error: uploadError } = await supabase.storage
        .from("report-templates")
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Check if record exists
      const existing = templates?.find((t: any) => t.report_type === reportType);
      if (existing) {
        const { error } = await supabase
          .from("branch_report_templates")
          .update({
            file_name: file.name,
            file_path: storagePath,
            file_type: ext,
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("branch_report_templates")
          .insert({
            branch_id: branchId,
            report_type: reportType,
            file_name: file.name,
            file_path: storagePath,
            file_type: ext,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-templates", branchId] });
      toast.success("Template uploaded successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (template: any) => {
      await supabase.storage.from("report-templates").remove([template.file_path]);
      const { error } = await supabase
        .from("branch_report_templates")
        .delete()
        .eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["branch-templates", branchId] });
      toast.success("Template removed");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Label className="text-base font-semibold">Report Templates — {branchName}</Label>
      <p className="text-sm text-muted-foreground">
        Upload custom Excel (.xlsx) or PDF templates for each report type. These templates will be used when generating reports for this branch.
      </p>
      <div className="grid gap-3">
        {REPORT_TYPES.map((rt) => {
          const template = templates?.find((t: any) => t.report_type === rt.key);
          return (
            <TemplateRow
              key={rt.key}
              reportType={rt}
              template={template}
              onUpload={(file) => uploadMutation.mutate({ reportType: rt.key, file })}
              onDelete={() => template && deleteMutation.mutate(template)}
              isUploading={uploadMutation.isPending}
            />
          );
        })}
      </div>
    </div>
  );
};

function TemplateRow({
  reportType,
  template,
  onUpload,
  onDelete,
  isUploading,
}: {
  reportType: { key: string; label: string; accept: string };
  template: any;
  onUpload: (file: File) => void;
  onDelete: () => void;
  isUploading: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      e.target.value = "";
    }
  };

  const Icon = template?.file_type === "pdf" ? FileText : FileSpreadsheet;

  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{reportType.label}</p>
          {template ? (
            <p className="text-xs text-muted-foreground">{template.file_name}</p>
          ) : (
            <p className="text-xs text-muted-foreground italic">No template uploaded (uses default)</p>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={reportType.accept}
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
        >
          <Upload className="mr-1 h-3 w-3" />
          {template ? "Replace" : "Upload"}
        </Button>
        {template && (
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default BranchTemplatesSection;
