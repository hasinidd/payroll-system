import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

interface BulkRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  devices: { userId: string; deviceName: string }[];
  employees: EmployeeLite[];
  onSubmit: (assignments: { userId: string; employeeId: string }[]) => Promise<void>;
}

const NONE = "__skip__";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const BulkRegisterDialog = ({ open, onOpenChange, devices, employees, onSubmit }: BulkRegisterDialogProps) => {
  const [map, setMap] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Pre-suggest matches by name or NIC.
    const next: Record<string, string> = {};
    for (const d of devices) {
      const dn = norm(d.deviceName || "");
      const match = employees.find((e) => {
        if (d.userId && e.nic_number && norm(e.nic_number) === norm(d.userId)) return true;
        if (!dn || dn === norm(d.userId)) return false;
        return norm(`${e.first_name}${e.last_name}`).includes(dn) || dn.includes(norm(`${e.first_name}${e.last_name}`));
      });
      next[d.userId] = match ? match.id : NONE;
    }
    setMap(next);
  }, [open, devices, employees]);

  const assignments = Object.entries(map)
    .filter(([, v]) => v && v !== NONE)
    .map(([userId, employeeId]) => ({ userId, employeeId }));

  const handleSave = async () => {
    if (assignments.length === 0) {
      toast.error("Select at least one employee to link");
      return;
    }
    const used = new Set<string>();
    for (const a of assignments) {
      if (used.has(a.employeeId)) {
        toast.error("Each employee can only be linked to one device ID");
        return;
      }
      used.add(a.employeeId);
    }
    setSaving(true);
    try {
      await onSubmit(assignments);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Bulk registration failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk register device IDs</DialogTitle>
          <DialogDescription>
            Link each unmatched device ID to an existing employee. Likely matches are pre-selected — review before saving.
            The device log re-imports automatically afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.userId} className="grid grid-cols-[1fr_1.4fr] items-center gap-3 border-b pb-2">
              <div className="text-sm">
                <div className="font-mono">{d.userId}</div>
                {d.deviceName !== d.userId && <div className="text-xs text-muted-foreground">{d.deviceName}</div>}
              </div>
              <Select value={map[d.userId] ?? NONE} onValueChange={(v) => setMap((p) => ({ ...p, [d.userId]: v }))}>
                <SelectTrigger><SelectValue placeholder="Skip" /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value={NONE}>Skip</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.employee_no} — {e.first_name} {e.last_name}
                      {e.biometric_id ? ` (device ${e.biometric_id})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : `Register ${assignments.length} device(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
