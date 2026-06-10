import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export interface PayslipPreviewEntry {
  employee_no: string;
  employee_name: string;
  designation: string;
  bank_account_no: string;
  epf_no: string;
  attendance_days: number;
  basic_salary: number;
  attendance_allowance: number;
  late_pay_deduction: number;
  no_pay_deduction: number;
  other_allowances: number;
  salary_advance: number;
  epf_salary: number;
  ot_pay: number;
  ot_hours?: number;
  ot_multiplier?: number;
  total_earnings: number;
  gross_salary: number;
  epf_employee: number;
  epf_employer: number;
  etf_employer: number;
  total_deductions: number;
  net_salary: number;
  loan_deduction: number;
  extra_pay: number;
  fuel_allowance: number;
  travel_allowance: number;
  bonus: number;
  incentives: number;
  welfare: number;
  deposits: number;
  recoveries: number;
  other_deductions: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PayslipPreviewEntry | null;
  companyName: string;
  companyAddress: string;
  monthName: string;
  year: number;
  onDownload: () => void;
}

const fmt = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Line = { label: string; value: number; bold?: boolean };

function buildEarnings(e: PayslipPreviewEntry): Line[] {
  const otPay = Number(e.ot_pay) || 0;
  const grossWages = Number(e.total_earnings) - Number(e.salary_advance);
  const lines: Line[] = [
    { label: "Basic Salary", value: e.basic_salary },
    { label: "ATTENDANCE ALLOWANCE", value: e.attendance_allowance },
  ];
  if (e.extra_pay > 0) lines.push({ label: "Add.for Work Days", value: e.extra_pay });
  lines.push({ label: "Late", value: e.late_pay_deduction || 0 });
  lines.push({ label: "Nopay", value: e.no_pay_deduction || 0 });
  if (e.other_allowances > 0) lines.push({ label: "OTHER ALLOWANCES", value: e.other_allowances });
  if (e.fuel_allowance > 0) lines.push({ label: "FUEL ALLOWANCE", value: e.fuel_allowance });
  if (e.travel_allowance > 0) lines.push({ label: "TRAVEL ALLOWANCE", value: e.travel_allowance });
  if (e.bonus > 0) lines.push({ label: "BONUS", value: e.bonus });
  if (e.incentives > 0) lines.push({ label: "INCENTIVES", value: e.incentives });
  lines.push({ label: "SALARY ADVANCE", value: e.salary_advance || 0 });
  if (e.epf_employee > 0) lines.push({ label: "Total For EPF", value: e.epf_salary });
  if (otPay > 0) {
    const mult = Number(e.ot_multiplier) || 1.5;
    const hours = Number(e.ot_hours) || 0;
    lines.push({ label: `OT @${mult.toFixed(2)} x ${hours.toFixed(2)} hrs`, value: otPay });
  }
  lines.push({ label: "Total Earnings", value: e.total_earnings, bold: true });
  lines.push({ label: "Gross Wages", value: grossWages, bold: true });
  return lines;
}

function buildDeductions(e: PayslipPreviewEntry): Line[] {
  const lines: Line[] = [];
  if (e.epf_employee > 0) lines.push({ label: "EPF Employee (8%)", value: e.epf_employee });
  if (e.salary_advance > 0) lines.push({ label: "Salary Advance", value: e.salary_advance });
  if (e.welfare > 0) lines.push({ label: "Welfare", value: e.welfare });
  if (e.recoveries > 0) lines.push({ label: "Recovery", value: e.recoveries });
  if (e.deposits > 0) lines.push({ label: "Deposit", value: e.deposits });
  if (e.loan_deduction > 0) lines.push({ label: "Loan", value: e.loan_deduction });
  if (e.other_deductions > 0) lines.push({ label: "Other Deductions", value: e.other_deductions });
  lines.push({ label: "Total Deduction", value: e.total_deductions, bold: true });
  return lines;
}

export function PayslipPreviewDialog({
  open,
  onOpenChange,
  entry,
  companyName,
  companyAddress,
  monthName,
  year,
  onDownload,
}: Props) {
  if (!entry) return null;
  const title = `Pay Sheet For The Month Of ${monthName} - ${year}`;
  const earnings = buildEarnings(entry);
  const deductions = buildDeductions(entry);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Payslip Preview</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center bg-muted/30 py-4">
          <div
            className="bg-white text-black shadow"
            style={{
              fontFamily: '"Courier New", Courier, monospace',
              fontSize: 13,
              lineHeight: 1.5,
              width: 480,
              padding: "25px 30px",
            }}
          >
            <div style={{ textAlign: "center", fontWeight: "bold" }}>{companyName}</div>
            <div style={{ textAlign: "center" }}>{companyAddress}</div>
            <hr style={{ border: "none", borderTop: "1px solid #000", margin: "8px 0" }} />
            <div style={{ fontWeight: "bold", margin: "6px 0" }}>{title}</div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td>Employee Epf No : {entry.epf_no}</td>
                  <td style={{ textAlign: "right" }}>WDays {entry.attendance_days}</td>
                </tr>
                <tr><td colSpan={2}>Employee Name : {entry.employee_name}</td></tr>
                <tr><td colSpan={2}>Location : HEAD OFFICE</td></tr>
                <tr><td colSpan={2}>Designation : {entry.designation}</td></tr>
                <tr><td colSpan={2}>Bank A/C Number : {entry.bank_account_no || "N/A"}</td></tr>
              </tbody>
            </table>

            <hr style={{ border: "none", borderTop: "1px solid #000", margin: "8px 0" }} />

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {earnings.map((l, i) => (
                  <tr key={`e${i}`} style={{ fontWeight: l.bold ? "bold" : "normal" }}>
                    <td>{l.label}</td>
                    <td style={{ textAlign: "right" }}>{fmt(l.value)}</td>
                  </tr>
                ))}
                {deductions.map((l, i) => (
                  <tr key={`d${i}`} style={{ fontWeight: l.bold ? "bold" : "normal" }}>
                    <td>{l.label}</td>
                    <td style={{ textAlign: "right" }}>{fmt(l.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr style={{ border: "none", borderTop: "1px dashed #000", margin: "12px 0" }} />

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {entry.epf_employer > 0 && (
                  <tr><td>EPF Employer (12%)</td><td style={{ textAlign: "right" }}>{fmt(entry.epf_employer)}</td></tr>
                )}
                {entry.etf_employer > 0 && (
                  <tr><td>ETF Employer (3%)</td><td style={{ textAlign: "right" }}>{fmt(entry.etf_employer)}</td></tr>
                )}
                <tr style={{ fontWeight: "bold" }}>
                  <td>Net Amount Payable</td>
                  <td style={{ textAlign: "right" }}>{fmt(entry.net_salary)}</td>
                </tr>
              </tbody>
            </table>

            <hr style={{ border: "none", borderTop: "1px dashed #000", margin: "12px 0" }} />
            <div>Loan Balance :</div>

            {/* Stub */}
            <hr style={{ border: "none", borderTop: "1px dashed #000", margin: "18px 0" }} />
            <div style={{ textAlign: "center", fontWeight: "bold" }}>{companyName}</div>
            <div style={{ textAlign: "center", fontSize: 11 }}>{companyAddress}</div>
            <div style={{ fontWeight: "bold", margin: "6px 0" }}>{title}</div>
            <div>Employee Epf No : {entry.epf_no}</div>
            <div>Employee Name : {entry.employee_name}</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 4 }}>
              <tbody>
                <tr style={{ fontWeight: "bold" }}>
                  <td>Net Amount Payable</td>
                  <td style={{ textAlign: "right" }}>{fmt(entry.net_salary)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 10, fontSize: 11 }}>
              Amount payable is correct and Receipt acknowledged.
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 25 }}>
              <div style={{ width: "45%", borderTop: "1px dashed #000", textAlign: "center", paddingTop: 4 }}>Date</div>
              <div style={{ width: "45%", borderTop: "1px dashed #000", textAlign: "center", paddingTop: 4 }}>Signature</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={onDownload}>
            <Download className="mr-2 h-4 w-4" /> Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}