import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2, Check, X, AlertTriangle, Save, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { validateLateMinutes } from "@/lib/payroll";

type FilterMode = "all" | "conflicts" | "clean";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: { id: string; employee_no: string; first_name: string; last_name: string } | null;
  records: any[];
  month: number;
  year: number;
}

export const EmployeeAttendanceDialog = ({ open, onOpenChange, employee, records, month, year }: Props) => {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ in_time: "", out_time: "", late_minutes: "", status: "Present", ot_hours: "0", ot_multiplier: "1.5" });
  const [otOverride, setOtOverride] = useState({ ot_hours: "", ot_multiplier: "1.5", note: "" });
  const [overrideId, setOverrideId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOt, setBulkOt] = useState({ ot_hours: "", ot_multiplier: "1.5" });
  const queryClient = useQueryClient();

  const { data: monthlyOverride } = useQuery({
    queryKey: ["monthly-ot-adjustment", employee?.id, year, month],
    enabled: !!employee?.id && open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monthly_ot_adjustments")
        .select("*")
        .eq("employee_id", employee!.id)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (monthlyOverride) {
      setOverrideId(monthlyOverride.id);
      setOtOverride({
        ot_hours: String(monthlyOverride.ot_hours ?? ""),
        ot_multiplier: String(monthlyOverride.ot_multiplier ?? "1.5"),
        note: monthlyOverride.note ?? "",
      });
    } else {
      setOverrideId(null);
      setOtOverride({ ot_hours: "", ot_multiplier: "1.5", note: "" });
    }
  }, [monthlyOverride, employee?.id, month, year]);

  const saveOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!employee) return;
      const hours = parseFloat(otOverride.ot_hours);
      if (!Number.isFinite(hours) || hours < 0) throw new Error("OT hours must be a non-negative number");
      const mult = parseFloat(otOverride.ot_multiplier);
      if (!Number.isFinite(mult) || mult <= 0) throw new Error("OT multiplier must be greater than zero");
      // Fetch employee's branch_id — required by RLS on monthly_ot_adjustments.
      const { data: emp, error: empErr } = await (supabase as any)
        .from("employees")
        .select("branch_id")
        .eq("id", employee.id)
        .single();
      if (empErr) throw empErr;
      // Preserve existing include_* flags when upserting the OT amount.
      const payload: any = {
        employee_id: employee.id,
        branch_id: emp.branch_id,
        year,
        month,
        ot_hours: hours,
        ot_multiplier: mult,
        note: otOverride.note || null,
        include_ot: monthlyOverride?.include_ot ?? true,
        include_epf: monthlyOverride?.include_epf ?? true,
        include_etf: monthlyOverride?.include_etf ?? true,
      };
      const { error } = await (supabase as any)
        .from("monthly_ot_adjustments")
        .upsert(payload, { onConflict: "employee_id,year,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-ot-adjustment"] });
      queryClient.invalidateQueries({ queryKey: ["month-flags"] });
      toast.success("Monthly OT saved");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const clearOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!overrideId) return;
      const { error } = await (supabase as any).from("monthly_ot_adjustments").delete().eq("id", overrideId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monthly-ot-adjustment"] });
      toast.success("Monthly OT override cleared");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase.from("attendance").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Record updated");
      setEditingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("attendance").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Record deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkOtMutation = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) throw new Error("Select at least one row");
      const updates: any = {};
      const hasHours = bulkOt.ot_hours.trim() !== "";
      if (hasHours) {
        const h = parseFloat(bulkOt.ot_hours);
        if (!Number.isFinite(h) || h < 0) throw new Error("OT hours must be a non-negative number");
        updates.ot_hours = h;
      }
      const m = parseFloat(bulkOt.ot_multiplier);
      if (!Number.isFinite(m) || m <= 0) throw new Error("OT multiplier must be greater than zero");
      updates.ot_multiplier = m;
      if (Object.keys(updates).length === 0) throw new Error("Nothing to apply");
      const { error } = await supabase.from("attendance").update(updates).in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(`Updated OT on ${count} record${count === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
      setBulkOt({ ot_hours: "", ot_multiplier: "1.5" });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditForm({
      in_time: r.in_time ?? "",
      out_time: r.out_time ?? "",
      late_minutes: String(r.late_minutes ?? 0),
      status: r.status ?? "Present",
      ot_hours: String(r.ot_hours ?? 0),
      ot_multiplier: String(r.ot_multiplier ?? 1.5),
    });
  };

  const saveEdit = () => {
    if (!editingId) return;
    const lm = validateLateMinutes(editForm.late_minutes);
    if (lm.error) { toast.error(lm.error); return; }
    const outTime = editForm.out_time || null;
    updateMutation.mutate({
      id: editingId,
      updates: {
        in_time: editForm.in_time || null,
        out_time: outTime,
        late_minutes: lm.value ?? 0,
        status: editForm.status,
        ot_hours: parseFloat(editForm.ot_hours) || 0,
        ot_multiplier: parseFloat(editForm.ot_multiplier) || 1.5,
        is_flagged: !outTime,
      },
    });
  };

  const filtered = records.filter((r) => {
    if (filter === "conflicts") return r.is_flagged;
    if (filter === "clean") return !r.is_flagged;
    return true;
  }).sort((a: any, b: any) => a.date.localeCompare(b.date));

  const allVisibleSelected = filtered.length > 0 && filtered.every((r: any) => selectedIds.has(r.id));
  const someVisibleSelected = filtered.some((r: any) => selectedIds.has(r.id));
  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((r: any) => next.delete(r.id));
      else filtered.forEach((r: any) => next.add(r.id));
      return next;
    });
  };

  const summary = {
    present: records.filter((r) => r.status === "Present").length,
    leave: records.filter((r) => r.status === "Leave").length,
    noPay: records.filter((r) => r.status === "No Pay").length,
    halfDay: records.filter((r) => r.status === "Half Day").length,
    totalLate: records.reduce((s: number, r: any) => s + (r.late_minutes || 0), 0),
    totalOT: records.reduce((s: number, r: any) => s + (Number(r.ot_hours) || 0), 0),
    conflicts: records.filter((r) => r.is_flagged).length,
  };

  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long" });

  if (!employee) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {employee.employee_no} — {employee.first_name} {employee.last_name} · {monthName} {year}
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center text-sm">
          <div className="rounded-md border p-2">
            <div className="font-semibold text-lg">{summary.present}</div>
            <div className="text-muted-foreground text-xs">Present</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-semibold text-lg">{summary.leave}</div>
            <div className="text-muted-foreground text-xs">Leave</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-semibold text-lg">{summary.noPay}</div>
            <div className="text-muted-foreground text-xs">No Pay</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-semibold text-lg">{summary.halfDay}</div>
            <div className="text-muted-foreground text-xs">Half Day</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-semibold text-lg">{summary.totalLate}</div>
            <div className="text-muted-foreground text-xs">Late Min</div>
          </div>
          <div className="rounded-md border p-2">
            <div className="font-semibold text-lg">{summary.totalOT.toFixed(1)}</div>
            <div className="text-muted-foreground text-xs">OT Hrs</div>
          </div>
          <div className={`rounded-md border p-2 ${summary.conflicts > 0 ? "border-destructive bg-destructive/10" : ""}`}>
            <div className={`font-semibold text-lg ${summary.conflicts > 0 ? "text-destructive" : ""}`}>{summary.conflicts}</div>
            <div className="text-muted-foreground text-xs">Conflicts</div>
          </div>
        </div>

        {/* Monthly OT Override */}
        <div className="rounded-md border p-3 bg-muted/30 space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Monthly OT Override</div>
              <div className="text-xs text-muted-foreground">
                Enter total monthly OT hours manually. When set, this replaces the OT summed from daily attendance for payroll.
                {" "}Attendance OT total: <span className="font-medium">{summary.totalOT.toFixed(2)} hrs</span>.
                {overrideId && <span className="ml-2 text-primary font-medium">Override active</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
            <div>
              <Label className="text-xs">OT Hours</Label>
              <Input type="number" min={0} step="0.25" value={otOverride.ot_hours}
                onChange={(e) => setOtOverride({ ...otOverride, ot_hours: e.target.value })}
                placeholder="e.g. 24" className="h-9" />
            </div>
            <div>
              <Label className="text-xs">OT Multiplier</Label>
              <Select value={otOverride.ot_multiplier} onValueChange={(v) => setOtOverride({ ...otOverride, ot_multiplier: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.5">1.5x (Normal)</SelectItem>
                  <SelectItem value="2.0">2.0x (Holiday)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Note (optional)</Label>
              <Input value={otOverride.note} onChange={(e) => setOtOverride({ ...otOverride, note: e.target.value })}
                placeholder="Reason for manual entry" className="h-9" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {overrideId && (
              <Button size="sm" variant="outline" onClick={() => clearOverrideMutation.mutate()} disabled={clearOverrideMutation.isPending}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
            <Button size="sm" onClick={() => saveOverrideMutation.mutate()} disabled={saveOverrideMutation.isPending}>
              <Save className="mr-1 h-3.5 w-3.5" /> {overrideId ? "Update" : "Save"} Monthly OT
            </Button>
          </div>
        </div>

        {/* Filter (records) */}
        <div className="flex gap-2">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All ({records.length})</Button>
          <Button size="sm" variant={filter === "conflicts" ? "destructive" : "outline"} onClick={() => setFilter("conflicts")}>
            <AlertTriangle className="mr-1 h-3 w-3" /> Conflicts ({summary.conflicts})
          </Button>
          <Button size="sm" variant={filter === "clean" ? "default" : "outline"} onClick={() => setFilter("clean")}>Clean ({records.length - summary.conflicts})</Button>
        </div>

        {/* Bulk OT editor */}
        {selectedIds.size > 0 && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Wand2 className="h-4 w-4" />
                Bulk OT editor — {selectedIds.size} row{selectedIds.size === 1 ? "" : "s"} selected
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
              <div>
                <Label className="text-xs">OT Hours (per day)</Label>
                <Input type="number" min={0} step="0.25" value={bulkOt.ot_hours}
                  onChange={(e) => setBulkOt({ ...bulkOt, ot_hours: e.target.value })}
                  placeholder="Leave blank to keep existing" className="h-9" />
              </div>
              <div>
                <Label className="text-xs">OT Multiplier</Label>
                <Select value={bulkOt.ot_multiplier} onValueChange={(v) => setBulkOt({ ...bulkOt, ot_multiplier: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.5">1.5x (Normal)</SelectItem>
                    <SelectItem value="2.0">2.0x (Holiday)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button size="sm" onClick={() => bulkOtMutation.mutate()} disabled={bulkOtMutation.isPending}>
                  <Save className="mr-1 h-3.5 w-3.5" /> Apply to {selectedIds.size} row{selectedIds.size === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Leave OT Hours blank to only change the multiplier. Applies to all selected daily records.
            </p>
          </div>
        )}

        {/* Records Table */}
        <div className="rounded-md border max-h-96 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={toggleAllVisible}
                    aria-label="Select all visible rows"
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>OT</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No records</TableCell></TableRow>
              ) : (
                filtered.map((r: any) => (
                  <TableRow key={r.id} className={r.is_flagged ? "bg-destructive/10" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(r.id)}
                        onCheckedChange={() => toggleRow(r.id)}
                        aria-label={`Select ${r.date}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{r.date}</TableCell>
                    {editingId === r.id ? (
                      <>
                        <TableCell>
                          <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Present">Present</SelectItem>
                              <SelectItem value="Leave">Leave</SelectItem>
                              <SelectItem value="No Pay">No Pay</SelectItem>
                              <SelectItem value="Half Day">Half Day</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input type="time" value={editForm.in_time} onChange={(e) => setEditForm({ ...editForm, in_time: e.target.value })} className="h-8 w-28" /></TableCell>
                        <TableCell><Input type="time" value={editForm.out_time} onChange={(e) => setEditForm({ ...editForm, out_time: e.target.value })} className="h-8 w-28" /></TableCell>
                        <TableCell><Input type="number" step="0.5" value={editForm.ot_hours} onChange={(e) => setEditForm({ ...editForm, ot_hours: e.target.value })} className="h-8 w-16" /></TableCell>
                        <TableCell><Input type="number" min={0} step={1} value={editForm.late_minutes} onChange={(e) => setEditForm({ ...editForm, late_minutes: e.target.value })} className="h-8 w-16" /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}><Check className="h-4 w-4 text-green-600" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>
                          <Badge variant={r.status === "Present" ? "default" : r.status === "No Pay" ? "destructive" : "secondary"}>{r.status}</Badge>
                        </TableCell>
                        <TableCell>{r.in_time ?? "—"}</TableCell>
                        <TableCell className={!r.out_time && r.is_flagged ? "text-destructive font-semibold" : ""}>
                          {r.out_time ?? (r.is_flagged ? "⚠ Missing" : "—")}
                        </TableCell>
                        <TableCell>{r.ot_hours} ({r.ot_multiplier}x)</TableCell>
                        <TableCell>{r.late_minutes}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            {r.is_flagged && <AlertTriangle className="h-3.5 w-3.5 text-destructive mr-1" />}
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(r.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
};
