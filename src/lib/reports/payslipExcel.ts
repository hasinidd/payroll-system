import * as XLSX from "xlsx";

interface PayslipExcelEntry {
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

export function generatePayslipExcel(
  entries: PayslipExcelEntry[],
  companyName: string,
  monthName: string,
  year: number
) {
  const sorted = [...entries].sort((a, b) => Number(a.employee_no) - Number(b.employee_no));

  const headers = [
    "Emp No", "Employee Name", "Designation", "EPF No", "Bank A/C", "W.Days",
    "Basic Salary", "Att. Allowance", "Fuel Allow.", "Travel Allow.",
    "Extra Pay", "Bonus", "Incentives", "Other Allow.",
    "OT Hours", "OT Mult.", "OT Pay",
    "Total Earnings", "EPF Salary", "Gross Salary",
    "Late Deduction", "No Pay Deduction", "Salary Advance", "Loan Deduction",
    "EPF 8%", "Welfare", "Deposits", "Recoveries", "Other Deductions",
    "Total Deductions", "Net Salary", "EPF Employer 12%", "ETF 3%",
  ];

  const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));

  const data: any[][] = [
    [`${companyName} — Pay Sheet ${monthName} ${year}`],
    [],
    headers,
    ...sorted.map((e) => [
      e.employee_no, e.employee_name, e.designation, e.epf_no, e.bank_account_no, num(e.attendance_days),
      num(e.basic_salary), num(e.attendance_allowance), num(e.fuel_allowance), num(e.travel_allowance),
      num(e.extra_pay), num(e.bonus), num(e.incentives), num(e.other_allowances),
      num(e.ot_hours), num(e.ot_multiplier) || (num(e.ot_pay) > 0 ? 1.5 : 0), num(e.ot_pay),
      num(e.total_earnings), num(e.epf_salary), num(e.gross_salary),
      num(e.late_pay_deduction), num(e.no_pay_deduction), num(e.salary_advance), num(e.loan_deduction),
      num(e.epf_employee), num(e.welfare), num(e.deposits), num(e.recoveries), num(e.other_deductions),
      num(e.total_deductions), num(e.net_salary), num(e.epf_employer), num(e.etf_employer),
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pay Slips");
  XLSX.writeFile(wb, `PaySlips_${monthName}_${year}.xlsx`);
}
