import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, Building2 } from "lucide-react";
import { toast } from "sonner";
import BranchTemplatesSection from "./BranchTemplatesSection";

interface Branch {
  id: string;
  name: string;
}

interface BranchConfigTabProps {
  branches: Branch[];
}

interface BranchSettings {
  id: string;
  branch_id: string;
  company_name: string;
  address_line1: string;
  address_line2: string;
  phone: string;
  shift_start_time: string;
  epf_reg_no: string;
  report_footer: string;
}

const BranchConfigTab = ({ branches }: BranchConfigTabProps) => {
  const queryClient = useQueryClient();
  const [activeBranch, setActiveBranch] = useState(branches[0]?.id ?? "");

  const { data: allSettings } = useQuery({
    queryKey: ["all-branch-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_settings").select("*");
      if (error) throw error;
      return data as BranchSettings[];
    },
  });

  const currentSettings = allSettings?.find((s) => s.branch_id === activeBranch);

  const [form, setForm] = useState({
    company_name: "",
    address_line1: "",
    address_line2: "",
    phone: "",
    shift_start_time: "08:00",
    epf_reg_no: "",
    report_footer: "",
  });

  useEffect(() => {
    if (currentSettings) {
      setForm({
        company_name: currentSettings.company_name,
        address_line1: currentSettings.address_line1,
        address_line2: currentSettings.address_line2,
        phone: currentSettings.phone,
        shift_start_time: currentSettings.shift_start_time?.slice(0, 5) ?? "08:00",
        epf_reg_no: (currentSettings as any).epf_reg_no ?? "",
        report_footer: (currentSettings as any).report_footer ?? "",
      });
    }
  }, [currentSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentSettings) {
        // Insert new settings for this branch
        const { error } = await supabase.from("company_settings").insert({
          branch_id: activeBranch,
          company_name: form.company_name,
          address_line1: form.address_line1,
          address_line2: form.address_line2,
          phone: form.phone,
          shift_start_time: form.shift_start_time + ":00",
          epf_reg_no: form.epf_reg_no,
          report_footer: form.report_footer,
        } as any);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_settings")
          .update({
            company_name: form.company_name,
            address_line1: form.address_line1,
            address_line2: form.address_line2,
            phone: form.phone,
            shift_start_time: form.shift_start_time + ":00",
            epf_reg_no: form.epf_reg_no,
            report_footer: form.report_footer,
          } as any)
          .eq("id", currentSettings.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-branch-settings"] });
      toast.success("Branch configuration saved");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <Tabs value={activeBranch} onValueChange={setActiveBranch}>
        <TabsList>
          {branches.map((b) => (
            <TabsTrigger key={b.id} value={b.id}>
              <Building2 className="mr-2 h-4 w-4" />
              {b.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {branches.map((b) => (
          <TabsContent key={b.id} value={b.id}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Report & Company Settings — {b.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Company Name</Label>
                    <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>EPF Registration No</Label>
                    <Input value={form.epf_reg_no} onChange={(e) => setForm({ ...form, epf_reg_no: e.target.value })} placeholder="e.g. EPF/12345" />
                  </div>
                  <div className="space-y-2">
                    <Label>Address Line 1</Label>
                    <Input value={form.address_line1} onChange={(e) => setForm({ ...form, address_line1: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Address Line 2</Label>
                    <Input value={form.address_line2} onChange={(e) => setForm({ ...form, address_line2: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Shift Start Time</Label>
                    <Input type="time" value={form.shift_start_time} onChange={(e) => setForm({ ...form, shift_start_time: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Report Footer Text</Label>
                  <Textarea
                    value={form.report_footer}
                    onChange={(e) => setForm({ ...form, report_footer: e.target.value })}
                    placeholder="Custom footer text that appears on all reports for this branch"
                    rows={3}
                  />
                </div>

                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  Save Configuration
                </Button>

                <div className="border-t pt-6">
                  <BranchTemplatesSection branchId={b.id} branchName={b.name} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};

export default BranchConfigTab;
