import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Save, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { validateOtDivisor } from "@/lib/payroll";

const Settings = () => {
  const [deptName, setDeptName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [phone, setPhone] = useState("");
  const [shiftStartTime, setShiftStartTime] = useState("08:00");
  const [epfEnabled, setEpfEnabled] = useState(true);
  const [etfEnabled, setEtfEnabled] = useState(true);
  const [otEnabled, setOtEnabled] = useState(true);
  const [lateDeductionEnabled, setLateDeductionEnabled] = useState(true);
  const [otHoursDivisor, setOtHoursDivisor] = useState<string>("240");
  const [otDefaultMultiplier, setOtDefaultMultiplier] = useState<string>("1.5");
  const [holidayMultiplier, setHolidayMultiplier] = useState<string>("2");
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  // Role-based gate: only Ultra/Super Admin, HR, or Accountant can edit toggles.
  const { data: canManageComponents = false } = useQuery({
    queryKey: ["can-manage-payroll-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_manage_payroll_settings" as any);
      if (error) return false;
      return Boolean(data);
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").eq("branch_id", branchId).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: company } = useQuery({
    queryKey: ["company-settings", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").eq("branch_id", branchId).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (company) {
      setCompanyName(company.company_name);
      setAddressLine1(company.address_line1);
      setAddressLine2(company.address_line2);
      setPhone(company.phone);
      setShiftStartTime((company as any).shift_start_time?.slice(0, 5) ?? "08:00");
      setEpfEnabled((company as any).epf_enabled ?? true);
      setEtfEnabled((company as any).etf_enabled ?? true);
      setOtEnabled((company as any).ot_enabled ?? true);
      setLateDeductionEnabled((company as any).late_deduction_enabled ?? true);
      setOtHoursDivisor(String((company as any).ot_hours_divisor ?? 240));
      setOtDefaultMultiplier(String((company as any).ot_default_multiplier ?? 1.5));
      setHolidayMultiplier(String((company as any).holiday_multiplier ?? 2));
    }
  }, [company]);

  const otDivisorValidation = validateOtDivisor(otHoursDivisor);

  const saveCompany = useMutation({
    mutationFn: async () => {
      if (!company) return;
      const { error } = await supabase.from("company_settings").update({
        company_name: companyName, address_line1: addressLine1, address_line2: addressLine2, phone,
        shift_start_time: shiftStartTime + ":00",
      }).eq("id", company.id).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Company settings saved");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const saveComponents = useMutation({
    mutationFn: async () => {
      if (!company) return;
      const check = validateOtDivisor(otHoursDivisor);
      if (check.error || check.value === null) {
        throw new Error(check.error ?? "OT hours divisor is invalid.");
      }
      const divisor = check.value;
      const otMult = parseFloat(otDefaultMultiplier);
      if (!Number.isFinite(otMult) || otMult <= 0) throw new Error("OT default multiplier must be greater than zero.");
      const holMult = parseFloat(holidayMultiplier);
      if (!Number.isFinite(holMult) || holMult <= 0) throw new Error("Holiday multiplier must be greater than zero.");
      const { error } = await supabase.from("company_settings").update({
        epf_enabled: epfEnabled,
        etf_enabled: etfEnabled,
        ot_enabled: otEnabled,
        late_deduction_enabled: lateDeductionEnabled,
        ot_hours_divisor: divisor,
        ot_default_multiplier: otMult,
        holiday_multiplier: holMult,
      } as any).eq("id", company.id).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["company-settings-components"] });
      toast.success("Payroll components updated");
    },
    onError: (err: any) => {
      if (/row-level security|permission/i.test(err.message)) {
        toast.error("Only Super Admin, HR, or Accountant can change these settings.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const addDept = useMutation({
    mutationFn: async () => {
      if (!branchId) throw new Error("No branch selected");
      const { error } = await supabase.from("departments").insert({ name: deptName.trim(), branch_id: branchId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      setDeptName("");
      toast.success("Department added");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteDept = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Department deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card className="max-w-lg">
        <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium">Company Name</label>
            <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Address Line 1</label>
            <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Address Line 2</label>
            <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">Shift Start Time (for late calculation)</label>
            <Input type="time" value={shiftStartTime} onChange={(e) => setShiftStartTime(e.target.value)} />
          </div>
          <Button onClick={() => saveCompany.mutate()} disabled={saveCompany.isPending}>
            <Save className="mr-2 h-4 w-4" /> Save
          </Button>
        </CardContent>
      </Card>

      <div className="max-w-lg space-y-4">
        <h2 className="text-xl font-semibold">Departments</h2>
        <div className="flex gap-2">
          <Input placeholder="Department name" value={deptName} onChange={(e) => setDeptName(e.target.value)} />
          <Button onClick={() => addDept.mutate()} disabled={!deptName.trim()}>
            <Plus className="mr-2 h-4 w-4" /> Add
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-16">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => deleteDept.mutate(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Payroll Components
            {!canManageComponents && <Lock className="h-4 w-4 text-muted-foreground" />}
          </CardTitle>
          {!canManageComponents && (
            <p className="text-xs text-muted-foreground">
              Read-only — only Super Admin, HR, or Accountant can change these.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="EPF (Employee 8% / Employer 12%)"
            description="When off, EPF is skipped in payroll."
            checked={epfEnabled}
            onChange={setEpfEnabled}
            disabled={!canManageComponents}
          />
          <ToggleRow
            label="ETF (Employer 3%)"
            description="When off, ETF is skipped in payroll."
            checked={etfEnabled}
            onChange={setEtfEnabled}
            disabled={!canManageComponents}
          />
          <ToggleRow
            label="OT (Overtime pay)"
            description="When off, OT hours are ignored when totalling earnings."
            checked={otEnabled}
            onChange={setOtEnabled}
            disabled={!canManageComponents}
          />
          <ToggleRow
            label="Late deduction"
            description="When off, late minutes are still recorded but no deduction is applied."
            checked={lateDeductionEnabled}
            onChange={setLateDeductionEnabled}
            disabled={!canManageComponents}
          />
          <div className="space-y-1 pt-2 border-t">
            <label className="text-sm font-medium">OT hours divisor</label>
            <Input
              type="number"
              min="0.0001"
              step="any"
              value={otHoursDivisor}
              onChange={(e) => setOtHoursDivisor(e.target.value)}
              disabled={!canManageComponents}
              aria-invalid={!!otDivisorValidation.error}
            />
            {otDivisorValidation.error && (
              <p className="text-xs text-destructive">{otDivisorValidation.error}</p>
            )}
            <p className="text-xs text-muted-foreground">
              OT rate = (Basic Salary / divisor) × multiplier × hours. Common values: 240 (Supermarket, 30d×8h) or 200 (Auto Spa, 25d×8h). The multiplier is set per attendance record.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="space-y-1">
              <label className="text-sm font-medium">OT default multiplier</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={otDefaultMultiplier}
                onChange={(e) => setOtDefaultMultiplier(e.target.value)}
                disabled={!canManageComponents}
              />
              <p className="text-xs text-muted-foreground">Default e.g. 1.5×.</p>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Holiday multiplier</label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={holidayMultiplier}
                onChange={(e) => setHolidayMultiplier(e.target.value)}
                disabled={!canManageComponents}
              />
              <p className="text-xs text-muted-foreground">Default e.g. 2×.</p>
            </div>
          </div>
          <Button
            onClick={() => saveComponents.mutate()}
            disabled={!canManageComponents || saveComponents.isPending || !!otDivisorValidation.error}
          >
            <Save className="mr-2 h-4 w-4" /> Save Components
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export default Settings;
