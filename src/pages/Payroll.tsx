import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Unlock, Calculator, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { calculatePayroll, validateLateMinutes } from "@/lib/payroll";
import { useAuth } from "@/hooks/useAuth";

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();
const fmt = (n: number) => Number(n).toLocaleString("en-LK", { minimumFractionDigits: 2 });

const round2 = (n: number) => Math.round(n * 100) / 100;

const Payroll = () => {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [requiredDays, setRequiredDays] = useState(26);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { branchId } = useBranch();

  const daysInMonth = new Date(year, month, 0).getDate();

  // Component toggles (EPF/ETF/OT/Late) per branch
  const { data: companySettings } = useQuery({
    queryKey: ["company-settings-components", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("epf_enabled, etf_enabled, ot_enabled, late_deduction_enabled, ot_hours_divisor")
        .eq("branch_id", branchId)
        .maybeSingle();
      return data as any;
    },
  });
  const components = {
    epf_enabled: companySettings?.epf_enabled ?? true,
    etf_enabled: companySettings?.etf_enabled ?? true,
    ot_enabled: companySettings?.ot_enabled ?? true,
    late_deduction_enabled: companySettings?.late_deduction_enabled ?? true,
    ot_hours_divisor: Number(companySettings?.ot_hours_divisor ?? 240) || 240,
  };

  const { data: period } = useQuery({
    queryKey: ["payroll-period", month, year, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase.from("payroll_periods").select("*").eq("month", month).eq("year", year).eq("branch_id", branchId).maybeSingle();
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["payroll-entries", period?.id],
    enabled: !!period?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("payroll_entries").select("*, employees(employee_no, first_name, last_name, nic_number, biometric_id, epf_no, join_date)").eq("payroll_period_id", period!.id).order("employees(employee_no)");
      if (error) throw error;
      return data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected. Please select a branch before generating payroll.");
      let periodId = period?.id;
      if (!periodId) {
        const { data, error } = await supabase.from("payroll_periods").insert({
          month, year, days_in_month: daysInMonth, required_days: requiredDays, branch_id: branchId,
        }).select().single();
        if (error) throw error;
        periodId = data.id;
      }

      const { data: employees, error: empErr } = await supabase.from("employees").select("*").eq("status", "Active").eq("branch_id", branchId);
      if (empErr) throw empErr;

      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;
      const { data: attendance, error: attErr } = await supabase.from("attendance").select("*").gte("date", startDate).lte("date", endDate).eq("branch_id", branchId);
      if (attErr) throw attErr;

      const { data: loans } = await supabase.from("loans").select("*").eq("is_active", true).eq("branch_id", branchId);
      const { data: empDeductions } = await supabase.from("employee_deductions").select("*").eq("is_active", true).eq("branch_id", branchId);

      // Fetch holidays for this month to override OT multipliers
      const { data: holidays } = await supabase.from("holidays").select("*").gte("date", startDate).lte("date", endDate).eq("branch_id", branchId);
      const holidayMap = new Map<string, number>();
      holidays?.forEach((h: any) => holidayMap.set(h.date, Number(h.ot_multiplier)));

      // Fetch manual monthly OT overrides for this month
      const { data: otOverrides } = await (supabase as any)
        .from("monthly_ot_adjustments")
        .select("*")
        .eq("year", year)
        .eq("month", month);
      const otOverrideMap = new Map<string, { ot_hours: number; ot_multiplier: number }>();
      (otOverrides ?? []).forEach((o: any) =>
        otOverrideMap.set(o.employee_id, {
          ot_hours: Number(o.ot_hours) || 0,
          ot_multiplier: Number(o.ot_multiplier) || 1.5,
        })
      );

      // Per-employee, per-month component toggles.
      const flagMap = new Map<string, { include_ot: boolean; include_epf: boolean; include_etf: boolean }>();
      (otOverrides ?? []).forEach((o: any) =>
        flagMap.set(o.employee_id, {
          include_ot: o.include_ot !== false,
          include_epf: o.include_epf !== false,
          include_etf: o.include_etf !== false,
        })
      );

      const payrollEntries = employees!.map((emp) => {
        const empAttendance = attendance?.filter((a) => a.employee_id === emp.id) ?? [];

        // Skip employees with no attendance for this period — no payslip is generated for them.
        if (empAttendance.length === 0) return null;

        // Override OT multiplier for attendance on holidays
        let adjustedAttendance = empAttendance.map((a) => {
          const holidayMult = holidayMap.get(a.date);
          if (holidayMult && Number(a.ot_hours) > 0) {
            return { ...a, ot_multiplier: holidayMult };
          }
          return a;
        });

        // Manual monthly OT override: replace all attendance OT with a single
        // synthetic entry so calculatePayroll sums to exactly the entered total.
        const manualOt = otOverrideMap.get(emp.id);
        if (manualOt) {
          adjustedAttendance = adjustedAttendance.map((a) => ({ ...a, ot_hours: 0 }));
          const anyDate = adjustedAttendance[0]?.date ?? `${year}-${String(month).padStart(2, "0")}-01`;
          adjustedAttendance.push({
            id: `manual-ot-${emp.id}`,
            employee_id: emp.id,
            date: anyDate,
            status: "Present",
            in_time: null,
            out_time: null,
            late_minutes: 0,
            ot_hours: manualOt.ot_hours,
            ot_multiplier: manualOt.ot_multiplier,
            is_flagged: false,
            branch_id: branchId,
          } as any);
        }

        const empLoans = loans?.filter((l) => l.employee_id === emp.id) ?? [];
        const empDeds = empDeductions?.filter((d: any) => d.employee_id === emp.id) ?? [];

        const joinDate = new Date(emp.join_date);
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0);
        let effectiveDays = daysInMonth;
        if (joinDate > periodStart && joinDate <= periodEnd) {
          effectiveDays = periodEnd.getDate() - joinDate.getDate() + 1;
        }

        const entry = calculatePayroll(
          emp,
          adjustedAttendance,
          empLoans,
          empDeds as any,
          daysInMonth,
          requiredDays,
          periodId!,
          components,
        );

        if (effectiveDays < daysInMonth) {
          const ratio = effectiveDays / daysInMonth;
          entry.basic_salary = round2(entry.basic_salary * ratio);
          entry.attendance_allowance = round2(entry.attendance_allowance * ratio);
          entry.gross_salary = round2(entry.basic_salary + entry.attendance_allowance);
          entry.total_earnings = round2(entry.gross_salary + entry.ot_pay + entry.extra_pay + entry.fuel_allowance + entry.travel_allowance);
          entry.epf_salary = round2(Math.max(0, entry.basic_salary - (entry.no_pay_deduction + entry.late_pay_deduction)));
          entry.epf_employee = components.epf_enabled ? round2(entry.epf_salary * 0.08) : 0;
          entry.epf_employer = components.epf_enabled ? round2(entry.epf_salary * 0.12) : 0;
          entry.etf_employer = components.etf_enabled ? round2(entry.epf_salary * 0.03) : 0;
          entry.total_deductions = round2(entry.epf_employee + entry.welfare + entry.salary_advance + entry.loan_deduction + entry.recoveries + entry.deposits + entry.other_deductions);
          entry.net_salary = round2(Math.max(0, entry.total_earnings - entry.total_deductions));
        }

        // Apply per-employee monthly component toggles (OT / EPF / ETF).
        const flags = flagMap.get(emp.id);
        if (flags) {
          if (!flags.include_ot) entry.ot_pay = 0;
          if (!flags.include_epf) { entry.epf_employee = 0; entry.epf_employer = 0; }
          if (!flags.include_etf) entry.etf_employer = 0;
          if (!flags.include_ot || !flags.include_epf || !flags.include_etf) {
            entry.total_earnings = round2(entry.gross_salary + entry.ot_pay + entry.extra_pay + entry.fuel_allowance + entry.travel_allowance);
            entry.total_deductions = round2(entry.epf_employee + entry.welfare + entry.salary_advance + entry.loan_deduction + entry.recoveries + entry.deposits + entry.other_deductions);
            entry.net_salary = round2(Math.max(0, entry.total_earnings - entry.total_deductions));
          }
        }

        return entry;
      }).filter(Boolean) as any[];

      await supabase.from("payroll_entries").delete().eq("payroll_period_id", periodId!).eq("branch_id", branchId);
      const entriesWithBranch = payrollEntries.map((e: any) => ({ ...e, branch_id: branchId }));
      const { error } = await supabase.from("payroll_entries").insert(entriesWithBranch);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      toast.success("Payroll generated successfully");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const lockMutation = useMutation({
    mutationFn: async () => {
      if (!period) return;
      const locking = !period.is_locked;
      const { error } = await supabase.from("payroll_periods").update({
        is_locked: locking,
        locked_by: locking ? user?.id : null,
        lock_reason: locking ? "Payroll finalized" : null,
      }).eq("id", period.id);
      if (error) throw error;

      if (locking && entries) {
        for (const entry of entries) {
          if (Number(entry.loan_deduction) > 0) {
            const { data: loans } = await supabase.from("loans").select("*").eq("employee_id", entry.employee_id).eq("is_active", true).eq("branch_id", branchId);
            if (loans) {
              for (const loan of loans) {
                const newBalance = Math.max(0, Number(loan.remaining_balance) - Number(loan.monthly_deduction));
                await supabase.from("loans").update({ remaining_balance: newBalance, is_active: newBalance > 0 }).eq("id", loan.id).eq("branch_id", branchId);
              }
            }
          }
          const { data: deds } = await supabase.from("employee_deductions").select("*").eq("employee_id", entry.employee_id).eq("is_active", true).eq("is_recurring", false).eq("branch_id", branchId);
          if (deds) {
            for (const ded of deds) {
              const newBalance = Math.max(0, Number(ded.remaining_balance) - Number(ded.monthly_deduction));
              await supabase.from("employee_deductions").update({ remaining_balance: newBalance, is_active: newBalance > 0 } as any).eq("id", ded.id).eq("branch_id", branchId);
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-period"] });
      queryClient.invalidateQueries({ queryKey: ["active-loans"] });
      toast.success(period?.is_locked ? "Payroll unlocked" : "Payroll locked & balances updated");
    },
  });

  // Full edit - all earnings & deductions
  const editFields = [
    { key: "basic_salary", label: "Basic Salary", group: "earnings" },
    { key: "attendance_allowance", label: "Att. Allowance", group: "earnings" },
    { key: "fuel_allowance", label: "Fuel Allowance", group: "earnings" },
    { key: "travel_allowance", label: "Travel Allowance", group: "earnings" },
    { key: "extra_pay", label: "Extra Pay", group: "earnings" },
    { key: "ot_pay", label: "OT Pay", group: "earnings" },
    { key: "bonus", label: "Bonus", group: "earnings" },
    { key: "incentives", label: "Incentives", group: "earnings" },
    { key: "other_allowances", label: "Other Allowances", group: "earnings" },
    { key: "welfare", label: "Welfare", group: "deductions" },
    { key: "salary_advance", label: "Salary Advance", group: "deductions" },
    { key: "loan_deduction", label: "Loan Deduction", group: "deductions" },
    { key: "deposits", label: "Deposits", group: "deductions" },
    { key: "recoveries", label: "Recoveries", group: "deductions" },
    { key: "other_deductions", label: "Other Deductions", group: "deductions" },
  ];

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    const form: Record<string, string> = {};
    editFields.forEach((f) => { form[f.key] = String(entry[f.key] ?? 0); });
    form.other_deduction_reason = entry.other_deduction_reason ?? "";
    form.attendance_days = String(entry.attendance_days ?? 0);
    form.no_pay_days = String(entry.no_pay_days ?? 0);
    form.late_minutes = String(entry.late_minutes ?? 0);
    setEditForm(form);
  };

  const saveEditMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      const vals: Record<string, number> = {};
      editFields.forEach((f) => { vals[f.key] = parseFloat(editForm[f.key]) || 0; });

      const basicSalary = vals.basic_salary;
      const attAllowance = vals.attendance_allowance;
      const grossSalary = round2(basicSalary + attAllowance);

      const noPayDays = parseFloat(editForm.no_pay_days) || 0;
      const lm = validateLateMinutes(editForm.late_minutes);
      if (lm.error) throw new Error(lm.error);
      const lateMinutes = lm.value ?? 0;
      const noPayDeduction = round2((grossSalary / daysInMonth) * noPayDays);
      // Late deduction uses Gross / (30 × 9 × 60) × late minutes, gated by toggle.
      const grossForLate = basicSalary + attAllowance + (vals.fuel_allowance || 0) + (vals.travel_allowance || 0);
      const latePayDeduction = components.late_deduction_enabled
        ? round2((grossForLate / (30 * 9 * 60)) * lateMinutes)
        : 0;

      const otPay = components.ot_enabled ? vals.ot_pay : 0;
      const totalEarnings = round2(grossSalary + otPay + vals.extra_pay + vals.fuel_allowance + vals.travel_allowance + vals.bonus + vals.incentives + vals.other_allowances);
      const epfSalary = round2(Math.max(0, basicSalary - (noPayDeduction + latePayDeduction)));
      const epfEmployee = components.epf_enabled ? round2(epfSalary * 0.08) : 0;
      const epfEmployer = components.epf_enabled ? round2(epfSalary * 0.12) : 0;
      const etfEmployer = components.etf_enabled ? round2(epfSalary * 0.03) : 0;
      const totalDeductions = round2(epfEmployee + vals.welfare + vals.salary_advance + vals.loan_deduction + vals.recoveries + vals.deposits + vals.other_deductions);
      const netSalary = round2(Math.max(0, totalEarnings - totalDeductions));

      const { error } = await supabase.from("payroll_entries").update({
        ...vals,
        ot_pay: otPay,
        gross_salary: grossSalary,
        no_pay_deduction: noPayDeduction,
        late_pay_deduction: latePayDeduction,
        no_pay_days: noPayDays,
        late_minutes: lateMinutes,
        attendance_days: parseFloat(editForm.attendance_days) || 0,
        total_earnings: totalEarnings,
        epf_salary: epfSalary,
        epf_employee: epfEmployee,
        epf_employer: epfEmployer,
        etf_employer: etfEmployer,
        total_deductions: totalDeductions,
        net_salary: netSalary,
        other_deduction_reason: editForm.other_deduction_reason || null,
      }).eq("id", editingId).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payroll-entries"] });
      queryClient.invalidateQueries({ queryKey: ["report-entries"] });
      setEditingId(null);
      toast.success("Payroll entry updated — changes reflect in reports immediately");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filteredEntries = entries?.filter((e: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const emp = e.employees ?? {};
    return (
      `${emp.first_name ?? ""} ${emp.last_name ?? ""}`.toLowerCase().includes(q) ||
      (emp.employee_no ?? "").toLowerCase().includes(q) ||
      (emp.nic_number ?? "").toLowerCase().includes(q) ||
      (emp.biometric_id ?? "").toLowerCase().includes(q) ||
      (emp.epf_no ?? "").toLowerCase().includes(q)
    );
  });
  const totalNet = filteredEntries?.reduce((sum, e) => sum + Number(e.net_salary), 0) ?? 0;
  const totalEPFer = filteredEntries?.reduce((sum, e) => sum + Number(e.epf_employer), 0) ?? 0;
  const totalETF = filteredEntries?.reduce((sum, e) => sum + Number(e.etf_employer), 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Payroll</h1>
        <div className="flex gap-2">
          {period && (
            <Button variant="outline" onClick={() => lockMutation.mutate()}>
              {period.is_locked ? <><Unlock className="mr-2 h-4 w-4" /> Unlock</> : <><Lock className="mr-2 h-4 w-4" /> Lock</>}
            </Button>
          )}
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || period?.is_locked}>
            <Calculator className="mr-2 h-4 w-4" />
            {generateMutation.isPending ? "Generating..." : "Generate Payroll"}
          </Button>
        </div>
      </div>

      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium">Month</label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {new Date(2000, i).toLocaleString("default", { month: "long" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Year</label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </div>
        <div>
          <label className="text-sm font-medium">Required Days</label>
          <Input type="number" value={requiredDays} onChange={(e) => setRequiredDays(Number(e.target.value))} className="w-28" />
        </div>
        {period && (
          <Badge variant={period.is_locked ? "destructive" : "secondary"} className="h-10 px-4">
            {period.is_locked ? "Locked" : "Open"}
          </Badge>
        )}
      </div>

      {entries && entries.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, emp no, NIC, biometric ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Net Salary</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">LKR {fmt(totalNet)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total EPF (Employer 12%)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">LKR {fmt(totalEPFer)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total ETF (3%)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">LKR {fmt(totalETF)}</div></CardContent>
        </Card>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Basic</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">OT</TableHead>
              <TableHead className="text-right">Earnings</TableHead>
              <TableHead className="text-right">EPF(E)</TableHead>
              <TableHead className="text-right">Deductions</TableHead>
              <TableHead className="text-right">Net Salary</TableHead>
              <TableHead>Edit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries?.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">No matches</TableCell></TableRow>
            ) : filteredEntries?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap">{e.employees?.employee_no} — {e.employees?.first_name} {e.employees?.last_name}</TableCell>
                <TableCell className="text-right">{fmt(e.basic_salary)}</TableCell>
                <TableCell className="text-right">{fmt(e.gross_salary)}</TableCell>
                <TableCell className="text-right">{fmt(e.ot_pay)}</TableCell>
                <TableCell className="text-right">{fmt(e.total_earnings)}</TableCell>
                <TableCell className="text-right">{fmt(e.epf_employee)}</TableCell>
                <TableCell className="text-right">{fmt(e.total_deductions)}</TableCell>
                <TableCell className="text-right font-bold">{fmt(e.net_salary)}</TableCell>
                <TableCell>
                  {!period?.is_locked && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(e)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Full Edit Dialog */}
      <Dialog open={!!editingId} onOpenChange={(open) => { if (!open) setEditingId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Payroll Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Att. Days</Label><Input type="number" step="0.5" value={editForm.attendance_days} onChange={(e) => setEditForm({ ...editForm, attendance_days: e.target.value })} /></div>
              <div><Label>No Pay Days</Label><Input type="number" step="0.5" value={editForm.no_pay_days} onChange={(e) => setEditForm({ ...editForm, no_pay_days: e.target.value })} /></div>
              <div><Label>Late Minutes</Label><Input type="number" min={0} step={1} value={editForm.late_minutes} onChange={(e) => setEditForm({ ...editForm, late_minutes: e.target.value })} /></div>
            </div>

            <h4 className="text-sm font-semibold text-muted-foreground border-b pb-1">Earnings</h4>
            <div className="grid grid-cols-3 gap-3">
              {editFields.filter((f) => f.group === "earnings").map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input type="number" step="0.01" value={editForm[f.key] ?? "0"} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })} />
                </div>
              ))}
            </div>

            <h4 className="text-sm font-semibold text-muted-foreground border-b pb-1">Deductions</h4>
            <div className="grid grid-cols-3 gap-3">
              {editFields.filter((f) => f.group === "deductions").map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input type="number" step="0.01" value={editForm[f.key] ?? "0"} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })} />
                </div>
              ))}
            </div>

            {parseFloat(editForm.other_deductions) > 0 && (
              <div>
                <Label>Other Deduction Reason</Label>
                <Textarea value={editForm.other_deduction_reason} onChange={(e) => setEditForm({ ...editForm, other_deduction_reason: e.target.value })} />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
              <Button onClick={() => saveEditMutation.mutate()} disabled={saveEditMutation.isPending}>
                {saveEditMutation.isPending ? "Saving..." : "Save & Recalculate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Payroll;
