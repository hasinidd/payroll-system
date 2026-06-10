import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Edit, Trash2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { EmployeeDialog } from "@/components/employees/EmployeeDialog";
import { BulkImportDialog } from "@/components/employees/BulkImportDialog";
import { DocumentsDialog } from "@/components/employees/DocumentsDialog";
import type { Database } from "@/integrations/supabase/types";
import { useBranch } from "@/hooks/useBranch";

type Employee = Database["public"]["Tables"]["employees"]["Row"];

const Employees = () => {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsEmployee, setDocsEmployee] = useState<{ id: string; name: string } | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const { data: employees, isLoading } = useQuery({
    queryKey: ["employees", branchId],
    queryFn: async () => {
      let q = supabase.from("employees").select("*, departments(name)");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      // Numeric-aware sort so "2" comes before "10" instead of lexical "10","2".
      return (data ?? []).slice().sort((a: any, b: any) =>
        String(a.employee_no ?? "").localeCompare(String(b.employee_no ?? ""), undefined, { numeric: true, sensitivity: "base" })
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employee deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = employees?.filter((e: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (e.first_name ?? "").toLowerCase().includes(q) ||
      (e.last_name ?? "").toLowerCase().includes(q) ||
      `${e.first_name ?? ""} ${e.last_name ?? ""}`.toLowerCase().includes(q) ||
      (e.employee_no ?? "").toLowerCase().includes(q) ||
      (e.nic_number ?? "").toLowerCase().includes(q) ||
      (e.biometric_id ?? "").toLowerCase().includes(q) ||
      (e.epf_no ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Employees</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <Upload className="mr-2 h-4 w-4" /> Bulk Import
          </Button>
          <Button onClick={() => { setEditingEmployee(null); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Add Employee
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, emp no, NIC, biometric ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emp No</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Basic Salary</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
            ) : filtered?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No employees found</TableCell></TableRow>
            ) : (
              filtered?.map((emp: any) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.employee_no}</TableCell>
                  <TableCell>{emp.first_name} {emp.last_name}</TableCell>
                  <TableCell>{emp.departments?.name ?? "—"}</TableCell>
                  <TableCell>{emp.category}</TableCell>
                  <TableCell>{Number(emp.basic_salary).toLocaleString("en-LK", { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell>
                    <Badge variant={emp.status === "Active" ? "default" : emp.status === "Terminated" ? "destructive" : "secondary"}>
                      {emp.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => { setEditingEmployee(emp); setDialogOpen(true); }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => { setDocsEmployee({ id: emp.id, name: `${emp.first_name} ${emp.last_name}` }); setDocsOpen(true); }}>
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(emp.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EmployeeDialog open={dialogOpen} onOpenChange={setDialogOpen} employee={editingEmployee} />
      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} />
      <DocumentsDialog open={docsOpen} onOpenChange={setDocsOpen} employeeId={docsEmployee?.id ?? null} employeeName={docsEmployee?.name ?? ""} />
    </div>
  );
};

export default Employees;
