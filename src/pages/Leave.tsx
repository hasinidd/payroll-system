import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Check, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const LEAVE_TYPES = ["Annual", "Casual", "Sick", "Other", "Maternity"] as const;
const leaveTypeToColumn: Record<string, string> = {
  Annual: "annual", Casual: "casual", Sick: "sick", Other: "other", Maternity: "maternity",
};

const Leave = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = useState(false);
  const [editBalanceId, setEditBalanceId] = useState<string | null>(null);
  const [balanceForm, setBalanceForm] = useState({ annual: "14", casual: "7", sick: "7", maternity: "84", other: "0" });
  const [form, setForm] = useState({ employee_id: "", leave_type: "Annual" as any, start_date: "", end_date: "", days: "1" });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const { data: employees } = useQuery({
    queryKey: ["employees-list", branchId],
    queryFn: async () => {
      let q = supabase.from("employees").select("id, employee_no, first_name, last_name").eq("status", "Active").order("employee_no");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: requests } = useQuery({
    queryKey: ["leave-requests", branchId],
    queryFn: async () => {
      let q = supabase.from("leave_requests").select("*, employees(employee_no, first_name, last_name)").order("created_at", { ascending: false });
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: balances } = useQuery({
    queryKey: ["leave-balances", selectedYear, branchId],
    queryFn: async () => {
      let q = supabase.from("leave_balances").select("*, employees(employee_no, first_name, last_name)").eq("year", selectedYear).order("created_at");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      const { error } = await supabase.from("leave_requests").insert({
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        days: parseFloat(form.days),
        branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success("Leave request created");
      setDialogOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status, employee_id, leave_type, days }: { id: string; status: "Approved" | "Rejected"; employee_id: string; leave_type: string; days: number }) => {
      if (!branchId) throw new Error("No branch selected");
      const { error } = await supabase.from("leave_requests").update({ status }).eq("id", id).eq("branch_id", branchId);
      if (error) throw error;

      // Auto-deduct leave balance on approval
      if (status === "Approved") {
        const col = leaveTypeToColumn[leave_type];
        if (col) {
          const year = new Date().getFullYear();
          const { data: balance } = await supabase.from("leave_balances")
            .select("*").eq("employee_id", employee_id).eq("year", year).eq("branch_id", branchId).maybeSingle();

          if (balance) {
            const currentBalance = Number((balance as any)[col]);
            const newBalance = Math.max(0, currentBalance - days);
            const updatePayload: Record<string, number> = {};
            updatePayload[col] = newBalance;
            const { error: updateErr } = await supabase.from("leave_balances")
              .update(updatePayload as any).eq("id", balance.id).eq("branch_id", branchId);
            if (updateErr) throw updateErr;
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      toast.success("Status updated & balance adjusted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Initialize leave balances for all employees for selected year
  const initBalancesMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      if (!employees) return;
      const existingIds = new Set(balances?.map((b: any) => b.employee_id) ?? []);
      const toInsert = employees.filter((e) => !existingIds.has(e.id)).map((e) => ({
        employee_id: e.id,
        year: selectedYear,
        annual: parseFloat(balanceForm.annual),
        casual: parseFloat(balanceForm.casual),
        sick: parseFloat(balanceForm.sick),
        maternity: parseFloat(balanceForm.maternity),
        other: parseFloat(balanceForm.other),
        branch_id: branchId,
      }));
      if (toInsert.length === 0) {
        toast.info("All employees already have balances for this year");
        return;
      }
      const { error } = await supabase.from("leave_balances").insert(toInsert);
      if (error) throw error;
      return toInsert.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      setBalanceDialogOpen(false);
      if (count) toast.success(`Initialized balances for ${count} employees`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Edit single balance
  const updateBalanceMutation = useMutation({
    mutationFn: async () => {
      if (!editBalanceId) return;
      if (!branchId) throw new Error("No branch selected");
      const { error } = await supabase.from("leave_balances").update({
        annual: parseFloat(balanceForm.annual),
        casual: parseFloat(balanceForm.casual),
        sick: parseFloat(balanceForm.sick),
        maternity: parseFloat(balanceForm.maternity),
        other: parseFloat(balanceForm.other),
      }).eq("id", editBalanceId).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      setEditBalanceId(null);
      toast.success("Balance updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleEditBalance = (b: any) => {
    setEditBalanceId(b.id);
    setBalanceForm({
      annual: String(b.annual), casual: String(b.casual),
      sick: String(b.sick), maternity: String(b.maternity), other: String(b.other),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Leave Management</h1>
        <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" /> New Request</Button>
      </div>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Requests</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        <TabsContent value="requests">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.employees?.employee_no} — {r.employees?.first_name} {r.employees?.last_name}</TableCell>
                    <TableCell>{r.leave_type}</TableCell>
                    <TableCell>{r.start_date}</TableCell>
                    <TableCell>{r.end_date}</TableCell>
                    <TableCell>{r.days}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "Approved" ? "default" : r.status === "Rejected" ? "destructive" : "secondary"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.status === "Pending" && (
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" onClick={() => statusMutation.mutate({ id: r.id, status: "Approved", employee_id: r.employee_id, leave_type: r.leave_type, days: r.days })}>
                            <Check className="h-4 w-4 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => statusMutation.mutate({ id: r.id, status: "Rejected", employee_id: r.employee_id, leave_type: r.leave_type, days: r.days })}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="balances">
          <div className="flex gap-4 items-end mb-4">
            <div>
              <Label>Year</Label>
              <Input type="number" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="w-28" />
            </div>
            <Button variant="outline" onClick={() => setBalanceDialogOpen(true)}>
              <RefreshCw className="mr-2 h-4 w-4" /> Initialize Balances
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Annual</TableHead>
                  <TableHead className="text-right">Casual</TableHead>
                  <TableHead className="text-right">Sick</TableHead>
                  <TableHead className="text-right">Other</TableHead>
                  <TableHead className="text-right">Maternity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances?.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No balances set. Click "Initialize Balances" to set up.</TableCell></TableRow>
                ) : balances?.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell>{b.employees?.employee_no} — {b.employees?.first_name} {b.employees?.last_name}</TableCell>
                    {editBalanceId === b.id ? (
                      <>
                        {["annual", "casual", "sick", "other", "maternity"].map((col) => (
                          <TableCell key={col} className="text-right">
                            <Input type="number" step="0.5" value={(balanceForm as any)[col]}
                              onChange={(e) => setBalanceForm({ ...balanceForm, [col]: e.target.value })}
                              className="h-8 w-16 text-right ml-auto" />
                          </TableCell>
                        ))}
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateBalanceMutation.mutate()}>
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditBalanceId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell className={Number(b.annual) === 0 ? "text-right text-destructive font-semibold" : "text-right"}>{b.annual}</TableCell>
                        <TableCell className={Number(b.casual) === 0 ? "text-right text-destructive font-semibold" : "text-right"}>{b.casual}</TableCell>
                        <TableCell className={Number(b.sick) === 0 ? "text-right text-destructive font-semibold" : "text-right"}>{b.sick}</TableCell>
                        <TableCell className="text-right">{b.other}</TableCell>
                        <TableCell className="text-right">{b.maternity}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" onClick={() => handleEditBalance(b)}>Edit</Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Initialize Balances Dialog */}
      <Dialog open={balanceDialogOpen} onOpenChange={setBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Initialize Leave Balances — {selectedYear}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Set default leave days for all employees who don't have balances yet for {selectedYear}.</p>
          <div className="grid grid-cols-2 gap-4">
            {LEAVE_TYPES.map((type) => (
              <div key={type}>
                <Label>{type}</Label>
                <Input type="number" step="0.5" value={(balanceForm as any)[leaveTypeToColumn[type]]}
                  onChange={(e) => setBalanceForm({ ...balanceForm, [leaveTypeToColumn[type]]: e.target.value })} />
              </div>
            ))}
          </div>
          <Button onClick={() => initBalancesMutation.mutate()} disabled={initBalancesMutation.isPending} className="w-full">
            {initBalancesMutation.isPending ? "Initializing..." : "Initialize for All Employees"}
          </Button>
        </DialogContent>
      </Dialog>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Leave Request</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>From</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>To</Label><Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Days</Label><Input type="number" step="0.5" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} /></div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
              {createMutation.isPending ? "Saving..." : "Submit"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leave;
