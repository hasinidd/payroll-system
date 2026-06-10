import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type EmployeeLite = {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  nic_number?: string | null;
  biometric_id?: string | null;
};

interface QuickRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device: { userId: string; deviceName: string } | null;
  employees: EmployeeLite[];
  branchId: string | null;
  onRegistered: (userId: string) => void;
}

export const QuickRegisterDialog = ({ open, onOpenChange, device, employees, branchId, onRegistered }: QuickRegisterDialogProps) => {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"link" | "create">("link");
  const [linkEmployeeId, setLinkEmployeeId] = useState("");
  const [form, setForm] = useState({ employee_no: "", first_name: "", last_name: "", nic_number: "", designation: "", join_date: "" });

  useEffect(() => {
    if (!open || !device) return;
    const isNumericId = /^\d+$/.test(device.userId);
    const nameParts = device.deviceName && device.deviceName !== device.userId
      ? device.deviceName.replace(/[._]+/g, " ").trim().split(/\s+/)
      : [];
    setMode("link");
    setLinkEmployeeId("");
    setForm({
      employee_no: "",
      first_name: nameParts[0] ?? "",
      last_name: nameParts.slice(1).join(" "),
      nic_number: isNumericId ? device.userId : "",
      designation: "",
      join_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" }),
    });
  }, [open, device]);

  const register = useMutation({
    mutationFn: async () => {
      if (!device) throw new Error("No device selected");

      if (mode === "link") {
        if (!linkEmployeeId) throw new Error("Select an employee to link");
        const { error } = await supabase
          .from("employees")
          .update({ biometric_id: device.userId })
          .eq("id", linkEmployeeId);
        if (error) throw error;
        return;
      }

      if (!branchId) throw new Error("Select a branch first");
      if (!form.employee_no.trim()) throw new Error("Employee number is required");
      if (!form.first_name.trim()) throw new Error("First name is required");
      if (!form.nic_number.trim()) throw new Error("NIC is required");

      const { error } = await supabase.from("employees").insert({
        branch_id: branchId,
        employee_no: form.employee_no.trim(),
        epf_no: "",
        nic_number: form.nic_number.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        designation: form.designation.trim(),
        join_date: form.join_date,
        biometric_id: device.userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees-list"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(
        mode === "link"
          ? `Device ${device?.userId} linked to the employee`
          : `Employee created and linked to device ${device?.userId}`
      );
      if (device) onRegistered(device.userId);
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message ?? "Registration failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Quick register device ID</DialogTitle>
          <DialogDescription>
            Device <span className="font-mono">{device?.userId}</span>
            {device && device.deviceName !== device.userId ? ` — "${device.deviceName}"` : ""} is not linked to any employee.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Button size="sm" variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}>
            Link existing employee
          </Button>
          <Button size="sm" variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
            Create new employee
          </Button>
        </div>

        {mode === "link" ? (
          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={linkEmployeeId} onValueChange={setLinkEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.employee_no} — {e.first_name} {e.last_name}
                    {e.biometric_id ? ` (device ${e.biometric_id})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The selected employee's biometric ID will be set to {device?.userId}.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Employee No *</Label>
              <Input value={form.employee_no} onChange={(e) => setForm({ ...form, employee_no: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>NIC *</Label>
              <Input value={form.nic_number} onChange={(e) => setForm({ ...form, nic_number: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>First name *</Label>
              <Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Last name</Label>
              <Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Designation</Label>
              <Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Join date</Label>
              <Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} />
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              Salary and allowances default to 0 — edit them later on the Employees page.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => register.mutate()} disabled={register.isPending}>
            {register.isPending ? "Saving…" : "Register"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};