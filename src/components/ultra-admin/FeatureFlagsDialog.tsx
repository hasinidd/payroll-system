import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Users, Clock, CalendarDays, DollarSign, MinusCircle, CalendarHeart, FileText, Settings,
} from "lucide-react";

const FEATURES = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "employees", label: "Employees", icon: Users },
  { key: "attendance", label: "Attendance", icon: Clock },
  { key: "leave", label: "Leave Management", icon: CalendarDays },
  { key: "payroll", label: "Payroll", icon: DollarSign },
  { key: "deductions", label: "Deductions", icon: MinusCircle },
  { key: "holidays", label: "Holidays", icon: CalendarHeart },
  { key: "reports", label: "Reports", icon: FileText },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

type FeatureFlags = Record<string, boolean>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: { id: string; display_name: string; email: string; feature_flags: FeatureFlags } | null;
  onSave: (accountId: string, flags: FeatureFlags) => void;
  isPending: boolean;
}

export function FeatureFlagsDialog({ open, onOpenChange, account, onSave, isPending }: Props) {
  const [flags, setFlags] = useState<FeatureFlags>({});

  useEffect(() => {
    if (account?.feature_flags) {
      setFlags({ ...account.feature_flags });
    } else {
      const defaults: FeatureFlags = {};
      FEATURES.forEach((f) => (defaults[f.key] = true));
      setFlags(defaults);
    }
  }, [account]);

  const toggle = (key: string) => setFlags((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Feature Access — {account?.display_name || account?.email}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {FEATURES.map((f) => (
            <div key={f.key} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <f.icon className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor={f.key} className="cursor-pointer">{f.label}</Label>
              </div>
              <Switch id={f.key} checked={flags[f.key] ?? true} onCheckedChange={() => toggle(f.key)} />
            </div>
          ))}
        </div>
        <Button className="w-full mt-2" onClick={() => account && onSave(account.id, flags)} disabled={isPending}>
          {isPending ? "Saving..." : "Save Feature Settings"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
