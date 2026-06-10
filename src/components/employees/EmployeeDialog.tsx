import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Employee = Database["public"]["Tables"]["employees"]["Row"];

const schema = z.object({
  employee_no: z.string().min(1, "Required"),
  first_name: z.string().min(1, "Required"),
  last_name: z.string().min(1, "Required"),
  epf_no: z.string().min(1, "Required"),
  nic_number: z.string().min(1, "Required"),
  biometric_id: z
    .string()
    .optional()
    .refine((v) => !v || /^\d+$/.test(v.trim()), {
      message: "Biometric ID must contain digits only (no letters or symbols)",
    }),
  contact_no: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  designation: z.string().optional(),
  department_id: z.string().optional(),
  category: z.enum(["Management", "Office"]),
  join_date: z.string().min(1, "Required"),
  basic_salary: z.coerce.number().min(0),
  attendance_allowance: z.coerce.number().min(0),
  fuel_allowance: z.coerce.number().min(0),
  travel_allowance: z.coerce.number().min(0),
  bank_name: z.string().optional(),
  bank_code: z.string().optional(),
  bank_branch: z.string().optional(),
  branch_code: z.string().optional(),
  bank_account_no: z.string().optional(),
  status: z.enum(["Active", "Terminated", "Promoted"]),
  status_remark: z.string().optional(),
  // Deductions
  welfare: z.coerce.number().min(0),
  salary_advance: z.coerce.number().min(0),
  recoveries: z.coerce.number().min(0),
  deposits: z.coerce.number().min(0),
  other_deductions: z.coerce.number().min(0),
  other_deduction_reason: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
}

export function EmployeeDialog({ open, onOpenChange, employee }: Props) {
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const { data: departments } = useQuery({
    queryKey: ["departments", branchId],
    queryFn: async () => {
      let q = supabase.from("departments").select("*").order("name");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const defaults: FormValues = {
    employee_no: "", first_name: "", last_name: "", epf_no: "", nic_number: "", biometric_id: "",
    contact_no: "", email: "", address: "", designation: "", department_id: "",
    category: "Office", join_date: "", basic_salary: 0, attendance_allowance: 0,
    fuel_allowance: 0, travel_allowance: 0, bank_name: "", bank_code: "",
    bank_branch: "", branch_code: "", bank_account_no: "",
    status: "Active", status_remark: "",
    welfare: 0, salary_advance: 0, recoveries: 0, deposits: 0,
    other_deductions: 0, other_deduction_reason: "",
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (employee) {
      form.reset({
        employee_no: employee.employee_no,
        first_name: employee.first_name,
        last_name: employee.last_name,
        epf_no: employee.epf_no,
        nic_number: employee.nic_number,
        biometric_id: (employee as any).biometric_id ?? "",
        contact_no: employee.contact_no ?? "",
        email: employee.email ?? "",
        address: employee.address ?? "",
        designation: employee.designation ?? "",
        department_id: employee.department_id ?? "",
        category: employee.category,
        join_date: employee.join_date,
        basic_salary: Number(employee.basic_salary),
        attendance_allowance: Number(employee.attendance_allowance),
        fuel_allowance: Number(employee.fuel_allowance),
        travel_allowance: Number(employee.travel_allowance),
        bank_name: employee.bank_name ?? "",
        bank_code: employee.bank_code ?? "",
        bank_branch: employee.bank_branch ?? "",
        branch_code: employee.branch_code ?? "",
        bank_account_no: employee.bank_account_no ?? "",
        status: employee.status,
        status_remark: employee.status_remark ?? "",
        welfare: Number((employee as any).welfare ?? 0),
        salary_advance: Number((employee as any).salary_advance ?? 0),
        recoveries: Number((employee as any).recoveries ?? 0),
        deposits: Number((employee as any).deposits ?? 0),
        other_deductions: Number((employee as any).other_deductions ?? 0),
        other_deduction_reason: (employee as any).other_deduction_reason ?? "",
      });
    } else {
      form.reset(defaults);
    }
  }, [employee, open]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        employee_no: values.employee_no,
        first_name: values.first_name,
        last_name: values.last_name,
        epf_no: values.epf_no,
        nic_number: values.nic_number,
        biometric_id: values.biometric_id?.trim() ? values.biometric_id.trim() : null,
        contact_no: values.contact_no || null,
        email: values.email || null,
        address: values.address || null,
        designation: values.designation || "",
        department_id: values.department_id || null,
        category: values.category,
        join_date: values.join_date,
        basic_salary: values.basic_salary,
        attendance_allowance: values.attendance_allowance,
        fuel_allowance: values.fuel_allowance,
        travel_allowance: values.travel_allowance,
        bank_name: values.bank_name || null,
        bank_code: values.bank_code || null,
        bank_branch: values.bank_branch || null,
        branch_code: values.branch_code || null,
        bank_account_no: values.bank_account_no || null,
        status: values.status,
        status_remark: values.status_remark || null,
        welfare: values.welfare,
        salary_advance: values.salary_advance,
        recoveries: values.recoveries,
        deposits: values.deposits,
        other_deductions: values.other_deductions,
        other_deduction_reason: values.other_deduction_reason || "",
      };
      if (employee) {
        const { error } = await supabase.from("employees").update(payload as any).eq("id", employee.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("employees").insert([{ ...payload, branch_id: branchId }] as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(employee ? "Employee updated" : "Employee added");
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const basicSalary = form.watch("basic_salary");
  const epf8 = (basicSalary * 0.08).toFixed(2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{employee ? "Edit Employee" : "Add Employee"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="deductions">Deductions</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-6 mt-4">
                {/* Personal Information */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Personal Information</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="employee_no" render={({ field }) => (
                      <FormItem><FormLabel>Ref No</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="first_name" render={({ field }) => (
                      <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="last_name" render={({ field }) => (
                      <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="epf_no" render={({ field }) => (
                      <FormItem><FormLabel>EPF No</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="nic_number" render={({ field }) => (
                      <FormItem><FormLabel>NIC No</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="biometric_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Biometric ID</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="Fingerprint device ID (digits only)"
                            onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">Digits only. Leave blank to fall back to Ref No / NIC.</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contact_no" render={({ field }) => (
                      <FormItem><FormLabel>Contact No</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem className="col-span-2"><FormLabel>Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <Separator />

                {/* Employment Details */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Employment Details</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="designation" render={({ field }) => (
                      <FormItem><FormLabel>Designation</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="department_id" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Staff Category</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="Management">Management</SelectItem>
                            <SelectItem value="Office">Office</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="join_date" render={({ field }) => (
                      <FormItem><FormLabel>Date Joined</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Terminated">Terminated</SelectItem>
                            <SelectItem value="Promoted">Promoted</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status_remark" render={({ field }) => (
                      <FormItem><FormLabel>Status Remark</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <Separator />

                {/* Salary & Allowances */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Salary & Allowances</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="basic_salary" render={({ field }) => (
                      <FormItem><FormLabel>Basic Salary</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="attendance_allowance" render={({ field }) => (
                      <FormItem><FormLabel>Attendance Allowance</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="fuel_allowance" render={({ field }) => (
                      <FormItem><FormLabel>Fuel Allowance</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="travel_allowance" render={({ field }) => (
                      <FormItem><FormLabel>Travel Allowance</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>

                <Separator />

                {/* Bank Details */}
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Bank Details</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="bank_name" render={({ field }) => (
                      <FormItem><FormLabel>Bank Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="bank_code" render={({ field }) => (
                      <FormItem><FormLabel>Bank Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="bank_branch" render={({ field }) => (
                      <FormItem><FormLabel>Bank Branch</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="branch_code" render={({ field }) => (
                      <FormItem><FormLabel>Branch Code</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="bank_account_no" render={({ field }) => (
                      <FormItem className="col-span-2"><FormLabel>Account Number</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="deductions" className="space-y-6 mt-4">
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Statutory Deductions</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormItem>
                      <FormLabel>EPF 8% (Employee)</FormLabel>
                      <Input value={epf8} disabled className="bg-muted" />
                      <p className="text-xs text-muted-foreground">Auto-calculated from basic salary</p>
                    </FormItem>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">Other Deductions (Monthly Defaults)</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="welfare" render={({ field }) => (
                      <FormItem><FormLabel>Welfare Fund</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="salary_advance" render={({ field }) => (
                      <FormItem><FormLabel>Salary Advance</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="recoveries" render={({ field }) => (
                      <FormItem><FormLabel>Recoveries</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="deposits" render={({ field }) => (
                      <FormItem><FormLabel>Deposits</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="other_deductions" render={({ field }) => (
                      <FormItem><FormLabel>Other Deductions</FormLabel><FormControl><Input type="number" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="other_deduction_reason" render={({ field }) => (
                      <FormItem><FormLabel>Reason</FormLabel><FormControl><Input placeholder="e.g. Uniform" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">These values auto-populate during payroll processing. Loans are managed separately.</p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
