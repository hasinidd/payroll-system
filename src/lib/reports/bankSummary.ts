import * as XLSX from "xlsx";

interface BankEntry {
  employee_no: string;
  employee_name: string;
  bank_name: string;
  bank_account_no: string;
  net_salary: number;
}

export function generateBankSummaryExcel(
  entries: BankEntry[],
  monthName: string,
  year: number
) {
  // Group by bank
  const bankGroups = new Map<string, BankEntry[]>();
  for (const e of entries) {
    const bank = e.bank_name || "No Bank";
    if (!bankGroups.has(bank)) bankGroups.set(bank, []);
    bankGroups.get(bank)!.push(e);
  }

  const data: any[][] = [];
  data.push([`Bank Summary - ${monthName} ${year}`]);
  data.push([]);
  data.push(["Emp No", "Employee Name", "Bank Name", "Account No", "Net Salary"]);

  let grandTotal = 0;

  for (const [bankName, emps] of bankGroups) {
    let bankTotal = 0;
    for (const e of emps) {
      data.push([e.employee_no, e.employee_name, e.bank_name, e.bank_account_no, e.net_salary]);
      bankTotal += e.net_salary;
    }
    data.push(["", "", bankName + " Total", "", bankTotal]);
    data.push([]);
    grandTotal += bankTotal;
  }

  data.push(["", "", "Grand Total", "", grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 10 },
    { wch: 30 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bank Summary");
  XLSX.writeFile(wb, `Bank_Summary_${monthName}_${year}.xlsx`);
}
