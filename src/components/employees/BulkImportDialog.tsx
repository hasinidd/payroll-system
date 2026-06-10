import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useBranch } from "@/hooks/useBranch";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedEmployee {
  employee_no: string;
  first_name: string;
  last_name: string;
  epf_no: string;
  nic_number: string;
  biometric_id: string;
  designation: string;
  category: "Management" | "Office";
  join_date: string;
  basic_salary: number;
  travel_allowance: number;
  attendance_allowance: number;
  fuel_allowance: number;
  contact_no: string;
  email: string;
  address: string;
  bank_name: string;
  bank_code: string;
  bank_branch: string;
  branch_code: string;
  bank_account_no: string;
  status: "Active" | "Terminated" | "Promoted";
}

type ImportField = keyof ParsedEmployee | "full_name";

const normalizeHeader = (value: string) =>
  value.toLowerCase().trim().replace(/[._-]+/g, " ").replace(/\s+/g, " ");

const toNumber = (value: any) => Number(String(value ?? "").replace(/,/g, "").trim()) || 0;

const normalizeNic = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return value.toFixed(0);
  }
  return String(value).replace(/^'+/, "").replace(/\s+/g, "").trim().toUpperCase();
};

const columnMap: Record<string, ImportField> = {
  "ref no": "employee_no",
  "ref number": "employee_no",
  "ref": "employee_no",
  "emp no": "employee_no",
  "employee no": "employee_no",
  "employee number": "employee_no",
  "full name": "full_name",
  "name": "full_name",
  "first name": "first_name",
  "last name": "last_name",
  "surname": "last_name",
  "epf no": "epf_no",
  "epf": "epf_no",
  "nic": "nic_number",
  "nic no": "nic_number",
  "nic number": "nic_number",
  "nic #": "nic_number",
  "nic id": "nic_number",
  "n i c": "nic_number",
  "n i c no": "nic_number",
  "n i c number": "nic_number",
  "nic id no": "nic_number",
  "id no": "nic_number",
  "id number": "nic_number",
  "national id": "nic_number",
  "national id no": "nic_number",
  "identity no": "nic_number",
  "identity number": "nic_number",
  "identification no": "nic_number",
  "identification number": "nic_number",
  "nic passport": "nic_number",
  "nic passport no": "nic_number",
  "biometric id": "biometric_id",
  "biometric": "biometric_id",
  "bio id": "biometric_id",
  "fingerprint id": "biometric_id",
  "device id": "biometric_id",
  "device no": "biometric_id",
  "attendance id": "biometric_id",
  "attendance no": "biometric_id",
  "designation": "designation",
  "category": "category",
  "staff category": "category",
  "employee type": "category",
  "join date": "join_date",
  "date join": "join_date",
  "joined date": "join_date",
  "date of join": "join_date",
  "basic salary": "basic_salary",
  "basic": "basic_salary",
  "travel allowance": "travel_allowance",
  "travel": "travel_allowance",
  "attendance allowance": "attendance_allowance",
  "attendance": "attendance_allowance",
  "att allowance": "attendance_allowance",
  "att days 1": "attendance_allowance",
  "fuel allowance": "fuel_allowance",
  "fuel": "fuel_allowance",
  "contact no": "contact_no",
  "contact": "contact_no",
  "phone": "contact_no",
  "mobile": "contact_no",
  "email": "email",
  "e mail": "email",
  "e-mail": "email",
  "address": "address",
  "bank name": "bank_name",
  "bank": "bank_name",
  "bank code": "bank_code",
  "bank branch": "bank_branch",
  "bank brach": "bank_branch",
  "branch": "bank_branch",
  "branch code": "branch_code",
  "account no": "bank_account_no",
  "bank account no": "bank_account_no",
  "account number": "bank_account_no",
  "account": "bank_account_no",
  "status": "status",
};

function todayInColombo(): string {
  // Format YYYY-MM-DD in Asia/Colombo (Sri Lanka, UTC+5:30)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA already returns YYYY-MM-DD
}

function parseExcelDate(val: any): string {
  if (!val) return todayInColombo();
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const text = String(val).trim();
  const dotted = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (dotted) return `${dotted[1]}-${dotted[2].padStart(2, "0")}-${dotted[3].padStart(2, "0")}`;
  // Handle DD/MM/YYYY (Sri Lanka default) explicitly to avoid TZ shifts
  const dmy = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    let dayNum = Number(dmy[1]);
    let monNum = Number(dmy[2]);
    // If "month" > 12 but "day" <= 12, the file is MM/DD/YYYY — swap.
    if (monNum > 12 && dayNum <= 12) {
      [dayNum, monNum] = [monNum, dayNum];
    }
    // If both are invalid, fall back to today.
    if (monNum < 1 || monNum > 12 || dayNum < 1 || dayNum > 31) return todayInColombo();
    const day = String(dayNum).padStart(2, "0");
    const mon = String(monNum).padStart(2, "0");
    let yr = dmy[3];
    if (yr.length === 2) yr = String(2000 + Number(yr));
    return `${yr}-${mon}-${day}`;
  }
  const d = new Date(val);
  if (isNaN(d.getTime())) return todayInColombo();
  // Format using Colombo TZ to avoid off-by-one
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function BulkImportDialog({ open, onOpenChange }: Props) {
  const [parsed, setParsed] = useState<ParsedEmployee[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: "", raw: false });

        if (rows.length === 0) { toast.error("No data found"); return; }

        // Map columns
        const headerMap: Record<string, ImportField> = {};
        for (const key of Object.keys(rows[0])) {
          const normalized = normalizeHeader(key);
          if (columnMap[normalized]) headerMap[key] = columnMap[normalized];
        }

        const employees: ParsedEmployee[] = rows
          .filter((r) => {
            const empNo = r[Object.keys(headerMap).find((k) => headerMap[k] === "employee_no") || ""];
            const epfNo = r[Object.keys(headerMap).find((k) => headerMap[k] === "epf_no") || ""];
            const nicNo = r[Object.keys(headerMap).find((k) => headerMap[k] === "nic_number") || ""];
            const fullName = r[Object.keys(headerMap).find((k) => headerMap[k] === "full_name") || ""];
            return [empNo, epfNo, nicNo, fullName].some((v) => String(v ?? "").trim());
          })
          .map((r) => {
            const emp: any = {};
            for (const [excelCol, field] of Object.entries(headerMap)) {
              if (field === "attendance_allowance" && emp[field]) continue;
              emp[field] = r[excelCol];
            }
            const fullName = String(emp.full_name || "").trim().replace(/\s+/g, " ");
            const [firstName, ...lastNameParts] = fullName.split(" ");
            const employeeNo = String(emp.employee_no || emp.epf_no || emp.nic_number || "").trim();
            const category = String(emp.category || "").trim().toLowerCase();
            return {
              employee_no: employeeNo,
              first_name: String(emp.first_name || firstName || "Employee").trim(),
              last_name: String(emp.last_name || lastNameParts.join(" ") || "-").trim(),
              epf_no: String(emp.epf_no || employeeNo).trim(),
              nic_number: normalizeNic(emp.nic_number),
              biometric_id: String(emp.biometric_id || "").trim().replace(/\D/g, ""),
              designation: String(emp.designation || "Employee").trim(),
              category: (category === "management" ? "Management" : "Office") as "Management" | "Office",
              join_date: parseExcelDate(emp.join_date),
              basic_salary: toNumber(emp.basic_salary),
              travel_allowance: toNumber(emp.travel_allowance),
              attendance_allowance: toNumber(emp.attendance_allowance),
              fuel_allowance: toNumber(emp.fuel_allowance),
              contact_no: String(emp.contact_no || "").trim(),
              email: String(emp.email || "").trim(),
              address: String(emp.address || "").trim(),
              bank_name: String(emp.bank_name || "").trim(),
              bank_code: String(emp.bank_code || "").trim(),
              bank_branch: String(emp.bank_branch || "").trim(),
              branch_code: String(emp.branch_code || "").trim(),
              bank_account_no: String(emp.bank_account_no || "").trim(),
              status: "Active" as const,
            };
          });

        setParsed(employees);
        toast.success(`Parsed ${employees.length} employees from Excel`);
      } catch (err: any) {
        toast.error("Failed to parse file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (parsed.length === 0) return;
    if (!branchId) {
      toast.error("No branch selected. Please select a branch before importing.");
      return;
    }
    setImporting(true);
    try {
      const { error } = await supabase.from("employees").upsert(
        parsed.map((e) => ({
          ...e,
          branch_id: branchId,
          biometric_id: e.biometric_id || null,
          contact_no: e.contact_no || null,
          email: e.email || null,
          address: e.address || null,
          bank_name: e.bank_name || null,
          bank_code: e.bank_code || null,
          bank_branch: e.bank_branch || null,
          branch_code: e.branch_code || null,
          bank_account_no: e.bank_account_no || null,
        })),
        { onConflict: "branch_id,employee_no" }
      );
      if (error && /row-level security/i.test(error.message)) {
        throw new Error("Your account is not allowed to add employees to the selected branch. Switch to a branch owned by this Super Admin, or ask the Ultra Admin to reactivate this account.");
      }
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success(`Imported ${parsed.length} employees successfully`);
      setParsed([]);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Import failed: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Import Employees</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Select Excel File
            </Button>
            <span className="text-sm text-muted-foreground">
              Upload .xlsx/.xls matching the employee template format
            </span>
          </div>

          {parsed.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-medium">{parsed.length} employees ready to import</span>
                </div>
                <Button onClick={handleImport} disabled={importing}>
                  <Upload className="mr-2 h-4 w-4" />
                  {importing ? "Importing..." : `Import ${parsed.length} Employees`}
                </Button>
              </div>

              <div className="rounded-md border max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Emp No</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>NIC</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Basic Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((emp, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{emp.employee_no}</TableCell>
                        <TableCell>{emp.first_name} {emp.last_name}</TableCell>
                        <TableCell>{emp.nic_number}</TableCell>
                        <TableCell><Badge variant="secondary">{emp.category}</Badge></TableCell>
                        <TableCell>{emp.basic_salary.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          {parsed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-sm">No file selected. Upload an Excel file to preview employees before importing.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
