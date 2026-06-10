import { useState } from "react";
import { useBranch } from "@/hooks/useBranch";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Building, PenTool, FileSpreadsheet, Download, ClipboardList, Search, User, Eye } from "lucide-react";
import { toast } from "sonner";
import { generatePayslipPDF } from "@/lib/reports/payslip";
import { PayslipPreviewDialog, type PayslipPreviewEntry } from "@/components/reports/PayslipPreviewDialog";
import { generatePayslipExcel } from "@/lib/reports/payslipExcel";
import { generateSignatureListPDF } from "@/lib/reports/signatureList";
import { generateSignatureListExcel } from "@/lib/reports/signatureListExcel";
import { generateCFormExcel } from "@/lib/reports/cForm";
import { generateCFormPDF } from "@/lib/reports/cFormPDF";
import { generateBankSummaryExcel } from "@/lib/reports/bankSummary";
import { aggregateOtByEmployee } from "@/lib/reports/otAggregation";
import { generateBankSummaryPDF } from "@/lib/reports/bankSummaryPDF";
import { generateAttendanceSummaryPDF, generateAttendanceSummaryExcel, type AttendanceSummaryEntry } from "@/lib/reports/attendanceSummary";
import { fetchBranchTemplate } from "@/lib/reports/templateHelper";

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();
const monthNames = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i).toLocaleString("default", { month: "long" })
);

const fmt = (n: number) => Number(n).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Reports = () => {
  const { branchId, currentBranch } = useBranch();
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [searchTerm, setSearchTerm] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [previewEntry, setPreviewEntry] = useState<PayslipPreviewEntry | null>(null);

  const { data: company } = useQuery({
    queryKey: ["company-settings", branchId],
    queryFn: async () => {
      // Prefer branch-specific settings; fall back to any available row so
      // the payslip header (company name/address) is never blank.
      if (branchId) {
        const { data } = await supabase
          .from("company_settings")
          .select("*")
          .eq("branch_id", branchId)
          .maybeSingle();
        if (data) return data;
      }
      const { data: fallback } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      return fallback;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ["departments", branchId],
    queryFn: async () => {
      let q = supabase.from("departments").select("*").order("name");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: period } = useQuery({
    queryKey: ["payroll-period", month, year, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data } = await supabase.from("payroll_periods").select("*").eq("month", month).eq("year", year).eq("branch_id", branchId).maybeSingle();
      return data;
    },
  });

  const { data: entries } = useQuery({
    queryKey: ["report-entries", period?.id],
    enabled: !!period?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_entries")
        .select("*, employees(employee_no, first_name, last_name, epf_no, nic_number, biometric_id, designation, bank_name, bank_account_no, department_id)")
        .eq("payroll_period_id", period!.id);
      if (error) throw error;
      return data;
    },
  });

  const daysInMonth = new Date(year, month, 0).getDate();

  const { data: attendanceRecords } = useQuery({
    queryKey: ["attendance-report", month, year, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(month).padStart(2, "0")}-${daysInMonth}`;
      const { data, error } = await supabase.from("attendance")
        .select("*, employees(employee_no, first_name, last_name)")
        .gte("date", startDate).lte("date", endDate).eq("branch_id", branchId);
      if (error) throw error;
      return data;
    },
  });

  // Monthly manual OT overrides (per employee) — replaces attendance OT on the payslip.
  const { data: otOverrides } = useQuery({
    queryKey: ["ot-overrides", month, year, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("monthly_ot_adjustments")
        .select("employee_id, ot_hours, ot_multiplier")
        .eq("year", year).eq("month", month).eq("branch_id", branchId);
      if (error) throw error;
      const map = new Map<string, { hours: number; multiplier: number }>();
      (data ?? []).forEach((r: any) => {
        const h = Number(r.ot_hours) || 0;
        if (h > 0) map.set(r.employee_id, { hours: h, multiplier: Number(r.ot_multiplier) || 1.5 });
      });
      return map;
    },
  });

  const companyName = company?.company_name ?? currentBranch?.name ?? "Company";
  const companyAddr = [company?.address_line1, company?.address_line2].filter(Boolean).join(", ");
  const epfRegNo = (company as any)?.epf_reg_no ?? "";
  const mName = monthNames[month - 1];

  // Aggregate OT hours + effective multiplier per employee from attendance records
  // so payslip exports show the real OT figures (payroll_entries only stores ot_pay).
  const otByEmployee = aggregateOtByEmployee(attendanceRecords as any[] | undefined);

  // Filter entries by search and department
  const filteredEntries = entries?.filter((e: any) => {
    const emp = e.employees;
    if (!emp) return false;
    const search = searchTerm.toLowerCase();
    const matchesSearch = !search ||
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(search) ||
      emp.employee_no?.toLowerCase().includes(search) ||
      emp.epf_no?.toLowerCase().includes(search) ||
      emp.nic_number?.toLowerCase().includes(search) ||
      emp.biometric_id?.toLowerCase().includes(search);
    const matchesDept = deptFilter === "all" || emp.department_id === deptFilter;
    return matchesSearch && matchesDept;
  });

  const mapEntry = (e: any) => ({
    employee_no: e.employees?.employee_no ?? "",
    employee_name: `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.toUpperCase(),
    designation: e.employees?.designation ?? "",
    bank_account_no: e.employees?.bank_account_no ?? "",
    epf_no: e.employees?.epf_no ?? "",
    attendance_days: e.attendance_days, basic_salary: e.basic_salary,
    attendance_allowance: e.attendance_allowance, late_pay_deduction: e.late_pay_deduction,
    no_pay_deduction: e.no_pay_deduction, other_allowances: e.other_allowances,
    salary_advance: e.salary_advance, epf_salary: e.epf_salary,
    ot_pay: e.ot_pay,
    ot_hours: otOverrides?.get(e.employee_id)?.hours ?? otByEmployee.get(e.employee_id)?.hours ?? 0,
    ot_multiplier: otOverrides?.get(e.employee_id)?.multiplier ?? otByEmployee.get(e.employee_id)?.multiplier ?? 1.5,
    total_earnings: e.total_earnings, gross_salary: e.gross_salary,
    epf_employee: e.epf_employee, epf_employer: e.epf_employer, etf_employer: e.etf_employer,
    total_deductions: e.total_deductions, net_salary: e.net_salary,
    loan_deduction: e.loan_deduction, extra_pay: e.extra_pay,
    fuel_allowance: e.fuel_allowance, travel_allowance: e.travel_allowance,
    bonus: e.bonus, incentives: e.incentives, welfare: e.welfare,
    deposits: e.deposits, recoveries: e.recoveries, other_deductions: e.other_deductions,
  });

  // Individual payslip download
  const handleIndividualPDF = (entry: any) => {
    generatePayslipPDF([mapEntry(entry)], companyName, companyAddr, mName, year);
    toast.success("Individual payslip PDF generated");
  };
  const handlePreview = (entry: any) => {
    setPreviewEntry(mapEntry(entry));
  };
  const handleDownloadFromPreview = () => {
    if (!previewEntry) return;
    generatePayslipPDF([previewEntry], companyName, companyAddr, mName, year);
    toast.success("Payslip PDF generated");
    setPreviewEntry(null);
  };
  const handleIndividualExcel = (entry: any) => {
    generatePayslipExcel([mapEntry(entry)], companyName, mName, year);
    toast.success("Individual payslip Excel generated");
  };

  // Company-wide (filtered) downloads
  const handleAllPDF = () => {
    if (!filteredEntries?.length) return toast.error("No payroll entries");
    generatePayslipPDF(filteredEntries.map(mapEntry), companyName, companyAddr, mName, year);
    toast.success("Company payslips PDF generated");
  };
  const handleAllExcel = () => {
    if (!filteredEntries?.length) return toast.error("No payroll entries");
    generatePayslipExcel(filteredEntries.map(mapEntry), companyName, mName, year);
    toast.success("Company payslips Excel generated");
  };

  // Other reports
  const buildAttendanceSummary = (): AttendanceSummaryEntry[] => {
    if (!attendanceRecords) return [];
    const map = new Map<string, AttendanceSummaryEntry>();
    for (const r of attendanceRecords as any[]) {
      const empId = r.employee_id;
      if (!map.has(empId)) {
        map.set(empId, {
          employee_no: r.employees?.employee_no ?? "",
          employee_name: `${r.employees?.first_name ?? ""} ${r.employees?.last_name ?? ""}`.toUpperCase(),
          present_days: 0, leave_days: 0, no_pay_days: 0, half_days: 0,
          total_late_minutes: 0, total_ot_hours: 0,
        });
      }
      const entry = map.get(empId)!;
      if (r.status === "Present") entry.present_days += 1;
      else if (r.status === "Leave") entry.leave_days += 1;
      else if (r.status === "No Pay") entry.no_pay_days += 1;
      else if (r.status === "Half Day") entry.half_days += 1;
      entry.total_late_minutes += r.late_minutes;
      entry.total_ot_hours += Number(r.ot_hours);
    }
    return Array.from(map.values());
  };

  const otherReports = [
    {
      title: "Signature List", description: "Salary confirmation with EPF & NIC", icon: PenTool,
      onPDF: () => {
        if (!entries?.length) return toast.error("No entries");
        const mapped = entries.map((e: any) => ({ employee_no: e.employees?.employee_no ?? "", employee_name: `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.toUpperCase(), epf_no: e.employees?.epf_no ?? "", nic_number: e.employees?.nic_number ?? "", net_salary: e.net_salary }));
        generateSignatureListPDF(mapped, companyName, companyAddr, mName, year);
        toast.success("Signature List PDF generated");
      },
      onExcel: () => {
        if (!entries?.length) return toast.error("No entries");
        const mapped = entries.map((e: any) => ({ employee_no: e.employees?.employee_no ?? "", employee_name: `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.toUpperCase(), epf_no: e.employees?.epf_no ?? "", nic_number: e.employees?.nic_number ?? "", net_salary: e.net_salary }));
        generateSignatureListExcel(mapped, mName, year);
        toast.success("Signature List Excel generated");
      },
    },
    {
      title: "C Form (EPF)", description: "Statutory EPF contribution report", icon: FileSpreadsheet,
      onPDF: async () => {
        if (!entries?.length) return toast.error("No entries");
        const mapped = entries.map((e: any) => ({ employee_name: `${e.employees?.last_name ?? ""} ${e.employees?.first_name ?? ""}`.toUpperCase(), nic_number: e.employees?.nic_number ?? "", epf_no: e.employees?.epf_no ?? "", epf_salary: e.epf_salary, epf_employee: e.epf_employee, epf_employer: e.epf_employer }));
        await generateCFormPDF(mapped, companyName, mName, year, epfRegNo);
        toast.success("C Form PDF generated");
      },
      onExcel: async () => {
        if (!entries?.length) return toast.error("No entries");
        const mapped = entries.map((e: any) => ({ employee_name: `${e.employees?.last_name ?? ""} ${e.employees?.first_name ?? ""}`.toUpperCase(), nic_number: e.employees?.nic_number ?? "", epf_no: e.employees?.epf_no ?? "", epf_salary: e.epf_salary, epf_employee: e.epf_employee, epf_employer: e.epf_employer }));
        let templateBuf: ArrayBuffer | null = null;
        if (branchId) {
          const t = await fetchBranchTemplate(branchId, "c_form");
          if (t?.fileType === "xlsx") templateBuf = t.arrayBuffer;
        }
        await generateCFormExcel(mapped, mName, year, templateBuf);
        toast.success("C Form Excel generated");
      },
    },
    {
      title: "Bank Summary", description: "Multi-bank salary transfer report", icon: Building,
      onPDF: () => {
        if (!entries?.length) return toast.error("No entries");
        const mapped = entries.map((e: any) => ({ employee_no: e.employees?.employee_no ?? "", employee_name: `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.toUpperCase(), bank_name: e.employees?.bank_name ?? "", bank_account_no: e.employees?.bank_account_no ?? "", net_salary: e.net_salary }));
        generateBankSummaryPDF(mapped, companyName, mName, year);
        toast.success("Bank Summary PDF generated");
      },
      onExcel: () => {
        if (!entries?.length) return toast.error("No entries");
        const mapped = entries.map((e: any) => ({ employee_no: e.employees?.employee_no ?? "", employee_name: `${e.employees?.first_name ?? ""} ${e.employees?.last_name ?? ""}`.toUpperCase(), bank_name: e.employees?.bank_name ?? "", bank_account_no: e.employees?.bank_account_no ?? "", net_salary: e.net_salary }));
        generateBankSummaryExcel(mapped, mName, year);
        toast.success("Bank Summary Excel generated");
      },
    },
    {
      title: "Attendance Summary", description: "Monthly attendance breakdown", icon: ClipboardList,
      onPDF: () => { const s = buildAttendanceSummary(); if (!s.length) return toast.error("No records"); generateAttendanceSummaryPDF(s, companyName, mName, year); toast.success("Attendance PDF generated"); },
      onExcel: () => { const s = buildAttendanceSummary(); if (!s.length) return toast.error("No records"); generateAttendanceSummaryExcel(s, mName, year); toast.success("Attendance Excel generated"); },
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Reports</h1>

      <div className="flex gap-4 items-end flex-wrap">
        <div>
          <label className="text-sm font-medium">Month</label>
          <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthNames.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">Year</label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </div>
        {!period && <p className="text-sm text-muted-foreground pb-2">No payroll generated for this period yet.</p>}
      </div>

      <Tabs defaultValue="payslips">
        <TabsList>
          <TabsTrigger value="payslips">Payslips</TabsTrigger>
          <TabsTrigger value="others">Other Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="payslips" className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[250px]">
              <label className="text-sm font-medium">Search (Name, Emp No, NIC, EPF, Biometric ID)</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Name, emp no, NIC, EPF, biometric ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Department</label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments?.map((d: any) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleAllPDF} disabled={!filteredEntries?.length}>
                <Download className="mr-2 h-4 w-4" /> All PDF
              </Button>
              <Button variant="outline" onClick={handleAllExcel} disabled={!filteredEntries?.length}>
                <Download className="mr-2 h-4 w-4" /> All Excel
              </Button>
            </div>
          </div>

          {filteredEntries?.length ? (
            <div className="rounded-md border overflow-auto max-h-[55vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Emp No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>EPF No</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead className="text-right">Basic</TableHead>
                    <TableHead className="text-right">Net Salary</TableHead>
                    <TableHead className="text-center">Download</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.employees?.employee_no}</TableCell>
                      <TableCell className="font-medium">{e.employees?.first_name} {e.employees?.last_name}</TableCell>
                      <TableCell>{e.employees?.epf_no}</TableCell>
                      <TableCell>{e.employees?.designation}</TableCell>
                      <TableCell className="text-right">{fmt(e.basic_salary)}</TableCell>
                      <TableCell className="text-right font-bold">{fmt(e.net_salary)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-center">
                          <Button size="sm" variant="ghost" onClick={() => handlePreview(e)} title="Preview">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleIndividualPDF(e)} title="Download PDF">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleIndividualExcel(e)} title="Download Excel">
                            <FileSpreadsheet className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              {!period
                ? "Generate payroll first to view payslips"
                : searchTerm.trim()
                  ? `No attendance record found for "${searchTerm}" this month`
                  : "No matching employees found"}
            </CardContent></Card>
          )}

          {filteredEntries && filteredEntries.length > 0 && (
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Showing {filteredEntries.length} of {entries?.length ?? 0} employees</span>
              <span>Total Net: <strong className="text-foreground">LKR {fmt(filteredEntries.reduce((s: number, e: any) => s + Number(e.net_salary), 0))}</strong></span>
            </div>
          )}
        </TabsContent>

        <TabsContent value="others" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {otherReports.map((report) => (
              <Card key={report.title} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center gap-4">
                  <report.icon className="h-8 w-8 text-primary" />
                  <div>
                    <CardTitle className="text-lg">{report.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{report.description}</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={report.onPDF} disabled={report.title === "Attendance Summary" ? false : !period}>
                      <Download className="mr-2 h-4 w-4" /> PDF
                    </Button>
                    <Button variant="outline" size="sm" onClick={report.onExcel} disabled={report.title === "Attendance Summary" ? false : !period}>
                      <Download className="mr-2 h-4 w-4" /> Excel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <PayslipPreviewDialog
        open={!!previewEntry}
        onOpenChange={(o) => { if (!o) setPreviewEntry(null); }}
        entry={previewEntry}
        companyName={companyName}
        companyAddress={companyAddr}
        monthName={mName}
        year={year}
        onDownload={handleDownloadFromPreview}
      />
    </div>
  );
};

export default Reports;
