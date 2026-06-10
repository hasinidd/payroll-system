import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Search, Plus, Trash2, Power, Eye } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number) => Number(n).toLocaleString("en-LK", { minimumFractionDigits: 2 });
const DEDUCTION_TYPES = ["Welfare", "Salary Advance", "Recovery", "Deposit", "Loan", "Other"] as const;

type StatusFilter = "all" | "active" | "completed" | "paused";

const Deductions = () => {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");
  const [filterEmployee, setFilterEmployee] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDed, setDetailDed] = useState<any>(null);
  const [selectedEmpId, setSelectedEmpId] = useState("");
  const [form, setForm] = useState({
    deduction_type: "Welfare" as string,
    description: "",
    total_amount: 0,
    interest_rate: 0,
    with_interest: false,
    installments: 1,
    is_recurring: false,
  });
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const { data: employees } = useQuery({
    queryKey: ["employees-active", branchId],
    queryFn: async () => {
      let q = supabase.from("employees").select("id, employee_no, first_name, last_name, basic_salary").eq("status", "Active").order("employee_no");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: deductions, isLoading } = useQuery({
    queryKey: ["employee-deductions", branchId],
    queryFn: async () => {
      let q = supabase.from("employee_deductions").select("*, employees(employee_no, first_name, last_name, basic_salary)").order("created_at", { ascending: false });
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const calcMonthly = (amount: number, rate: number, installments: number, withInterest: boolean) => {
    if (installments <= 0) return 0;
    if (!withInterest || rate <= 0) return Math.round((amount / installments) * 100) / 100;
    const interest = amount * (rate / 100 / 12) * installments;
    const total = amount + interest;
    return Math.round((total / installments) * 100) / 100;
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEmpId) throw new Error("Select an employee");
      if (!branchId) throw new Error("No branch selected");
      const monthly = form.is_recurring
        ? form.total_amount
        : calcMonthly(form.total_amount, form.interest_rate, form.installments, form.with_interest);
      const totalWithInterest = form.with_interest && !form.is_recurring
        ? form.total_amount + form.total_amount * (form.interest_rate / 100 / 12) * form.installments
        : form.total_amount;

      const { error } = await supabase.from("employee_deductions").insert({
        employee_id: selectedEmpId,
        deduction_type: form.deduction_type as any,
        description: form.description,
        total_amount: form.is_recurring ? form.total_amount : totalWithInterest,
        interest_rate: form.interest_rate,
        with_interest: form.with_interest,
        installments: form.is_recurring ? 0 : form.installments,
        monthly_deduction: monthly,
        remaining_balance: form.is_recurring ? 0 : totalWithInterest,
        is_recurring: form.is_recurring,
        branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-deductions"] });
      setDialogOpen(false);
      resetForm();
      toast.success("Deduction added");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("employee_deductions").update({ is_active: active } as any).eq("id", id).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-deductions"] });
      toast.success("Status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_deductions").delete().eq("id", id).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-deductions"] });
      setDetailDed(null);
      toast.success("Deduction removed");
    },
  });

  const resetForm = () => {
    setSelectedEmpId("");
    setForm({ deduction_type: "Welfare", description: "", total_amount: 0, interest_rate: 0, with_interest: false, installments: 1, is_recurring: false });
  };

  const getStatus = (d: any): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } => {
    if (!d.is_active && !d.is_recurring && Number(d.remaining_balance) <= 0) return { label: "Completed", variant: "outline" };
    if (!d.is_active) return { label: "Paused", variant: "secondary" };
    return { label: "Active", variant: "default" };
  };

  const filtered = deductions?.filter((d: any) => {
    const emp = d.employees;
    const matchSearch = !search ||
      emp?.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp?.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      emp?.employee_no?.toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || d.deduction_type === filterType;
    const matchEmployee = filterEmployee === "all" || d.employee_id === filterEmployee;
    const status = getStatus(d);
    const matchStatus = filterStatus === "all" ||
      (filterStatus === "active" && status.label === "Active") ||
      (filterStatus === "completed" && status.label === "Completed") ||
      (filterStatus === "paused" && status.label === "Paused");
    return matchSearch && matchType && matchStatus && matchEmployee;
  });

  // Summary counts
  const activeCount = deductions?.filter((d: any) => getStatus(d).label === "Active").length ?? 0;
  const completedCount = deductions?.filter((d: any) => getStatus(d).label === "Completed").length ?? 0;
  const pausedCount = deductions?.filter((d: any) => getStatus(d).label === "Paused").length ?? 0;
  const totalMonthly = deductions?.filter((d: any) => getStatus(d).label === "Active")
    .reduce((sum: number, d: any) => sum + Number(d.monthly_deduction), 0) ?? 0;

  const previewMonthly = form.is_recurring
    ? form.total_amount
    : calcMonthly(form.total_amount, form.interest_rate, form.installments, form.with_interest);
  const previewTotal = form.with_interest && !form.is_recurring
    ? form.total_amount + form.total_amount * (form.interest_rate / 100 / 12) * form.installments
    : form.total_amount;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Deductions</h1>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Deduction
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="cursor-pointer hover:bg-muted/30" onClick={() => setFilterStatus("active")}>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Active</div>
            <div className="text-2xl font-bold">{activeCount}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/30" onClick={() => setFilterStatus("completed")}>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Completed</div>
            <div className="text-2xl font-bold">{completedCount}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/30" onClick={() => setFilterStatus("paused")}>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Paused</div>
            <div className="text-2xl font-bold">{pausedCount}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:bg-muted/30" onClick={() => setFilterStatus("all")}>
          <CardContent className="pt-4 pb-3">
            <div className="text-sm text-muted-foreground">Total Monthly (Active)</div>
            <div className="text-2xl font-bold">LKR {fmt(totalMonthly)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {DEDUCTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusFilter)}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEmployee} onValueChange={setFilterEmployee}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees?.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterType !== "all" || filterStatus !== "all" || filterEmployee !== "all" || search) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterType("all"); setFilterStatus("all"); setFilterEmployee("all"); setSearch(""); }}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Deductions Table */}
      <div className="rounded-md border overflow-auto max-h-[60vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Monthly</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-center">Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={9} className="text-center">Loading...</TableCell></TableRow>
              ) : filtered?.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No deductions found</TableCell></TableRow>
              ) : (
                filtered?.map((d: any) => {
                  const status = getStatus(d);
                  const progress = d.is_recurring ? null : d.total_amount > 0
                    ? Math.round(((d.total_amount - d.remaining_balance) / d.total_amount) * 100)
                    : 0;
                  return (
                    <TableRow
                      key={d.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => setDetailDed(d)}
                    >
                      <TableCell className="whitespace-nowrap font-medium">{d.employees?.employee_no} — {d.employees?.first_name} {d.employees?.last_name}</TableCell>
                      <TableCell><Badge variant="outline">{d.deduction_type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">{d.description || "—"}</TableCell>
                      <TableCell className="text-right">{fmt(d.total_amount)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(d.monthly_deduction)}</TableCell>
                      <TableCell className="text-right">{d.is_recurring ? "∞" : fmt(d.remaining_balance)}</TableCell>
                      <TableCell className="text-center">
                        {progress !== null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${progress >= 100 ? "bg-green-500" : "bg-primary"}`}
                                style={{ width: `${Math.min(progress, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{progress}%</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Recurring</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDetailDed(d)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleMutation.mutate({ id: d.id, active: !d.is_active })}>
                            <Power className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(d.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailDed} onOpenChange={(open) => { if (!open) setDetailDed(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deduction Details</DialogTitle>
          </DialogHeader>
          {detailDed && (() => {
            const status = getStatus(detailDed);
            const paid = Number(detailDed.total_amount) - Number(detailDed.remaining_balance);
            const progress = detailDed.is_recurring ? null : detailDed.total_amount > 0
              ? Math.round((paid / Number(detailDed.total_amount)) * 100) : 0;
            return (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="text-sm">{detailDed.deduction_type}</Badge>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Employee</p>
                  <p className="font-medium">{detailDed.employees?.employee_no} — {detailDed.employees?.first_name} {detailDed.employees?.last_name}</p>
                </div>

                {detailDed.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p>{detailDed.description}</p>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="font-bold text-lg">{fmt(detailDed.total_amount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Monthly Deduction</p>
                    <p className="font-bold text-lg">{fmt(detailDed.monthly_deduction)}</p>
                  </div>
                </div>

                {!detailDed.is_recurring && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Paid So Far</p>
                        <p className="font-medium text-green-600">{fmt(paid)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Remaining Balance</p>
                        <p className="font-medium text-orange-600">{fmt(detailDed.remaining_balance)}</p>
                      </div>
                    </div>

                    {progress !== null && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-muted-foreground">Progress</span>
                          <span className="font-medium">{progress}%</span>
                        </div>
                        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${progress >= 100 ? "bg-green-500" : "bg-primary"}`}
                            style={{ width: `${Math.min(progress, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Interest</p>
                    <p>{detailDed.with_interest ? `${detailDed.interest_rate}% p.a.` : "None"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Installments</p>
                    <p>{detailDed.is_recurring ? "Recurring (monthly)" : `${detailDed.installments} months`}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p>{new Date(detailDed.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Last Updated</p>
                    <p>{new Date(detailDed.updated_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="flex justify-between pt-2">
                  <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(detailDed.id)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { toggleMutation.mutate({ id: detailDed.id, active: !detailDed.is_active }); setDetailDed(null); }}>
                    <Power className="mr-2 h-4 w-4" /> {detailDed.is_active ? "Pause" : "Resume"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Deduction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Deduction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={selectedEmpId} onValueChange={setSelectedEmpId}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees?.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Deduction Type</Label>
              <Select value={form.deduction_type} onValueChange={(v) => setForm({ ...form, deduction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DEDUCTION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Description / Reason</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Uniform advance, Company loan" />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={form.is_recurring} onCheckedChange={(v) => setForm({ ...form, is_recurring: v, with_interest: false, installments: 1 })} />
              <Label>Fixed monthly (recurring, no balance tracking)</Label>
            </div>

            <div>
              <Label>{form.is_recurring ? "Monthly Amount" : "Total Amount"}</Label>
              <Input type="number" step="0.01" value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: parseFloat(e.target.value) || 0 })} />
            </div>

            {!form.is_recurring && (
              <>
                <div>
                  <Label>Number of Installments</Label>
                  <Input type="number" min={1} value={form.installments} onChange={(e) => setForm({ ...form, installments: parseInt(e.target.value) || 1 })} />
                </div>

                <div className="flex items-center gap-3">
                  <Switch checked={form.with_interest} onCheckedChange={(v) => setForm({ ...form, with_interest: v })} />
                  <Label>Apply Interest</Label>
                </div>

                {form.with_interest && (
                  <div>
                    <Label>Annual Interest Rate (%)</Label>
                    <Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: parseFloat(e.target.value) || 0 })} />
                  </div>
                )}
              </>
            )}

            {/* Preview */}
            <div className="rounded-md bg-muted p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Monthly Deduction:</span><span className="font-bold">{fmt(previewMonthly)}</span></div>
              {!form.is_recurring && form.with_interest && (
                <div className="flex justify-between"><span className="text-muted-foreground">Total with Interest:</span><span>{fmt(previewTotal)}</span></div>
              )}
              {!form.is_recurring && (
                <div className="flex justify-between"><span className="text-muted-foreground">Installments:</span><span>{form.installments} months</span></div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !selectedEmpId || form.total_amount <= 0}>
                {addMutation.isPending ? "Saving..." : "Add Deduction"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Deductions;
