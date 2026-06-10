import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useBranch } from "@/hooks/useBranch";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | null;
  employeeName: string;
}

export function DocumentsDialog({ open, onOpenChange, employeeId, employeeName }: Props) {
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const { data: docs } = useQuery({
    queryKey: ["employee-documents", employeeId, branchId],
    enabled: !!employeeId && !!branchId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").eq("employee_id", employeeId!).eq("branch_id", branchId).order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleAddLink = async () => {
    if (!linkName.trim() || !linkUrl.trim() || !employeeId) return;
    if (!branchId) {
      toast.error("No branch selected. Please select a branch before adding documents.");
      return;
    }

    setAdding(true);
    try {
      const { error } = await supabase.from("documents").insert({
        employee_id: employeeId,
        file_name: linkName.trim(),
        file_path: linkUrl.trim(),
        branch_id: branchId,
      });
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      toast.success("Link saved");
      setLinkName("");
      setLinkUrl("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("documents").delete().eq("id", id).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
      toast.success("Link removed");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Documents — {employeeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Document name" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
            <Input placeholder="URL / Link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={handleAddLink} disabled={adding || !linkName.trim() || !linkUrl.trim()}>
            <Plus className="mr-2 h-4 w-4" /> {adding ? "Saving..." : "Add Link"}
          </Button>
        </div>

        <div className="rounded-md border max-h-60 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs?.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No documents</TableCell></TableRow>
              ) : docs?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm">{d.file_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(d.uploaded_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.open(d.file_path, "_blank")}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(d.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
