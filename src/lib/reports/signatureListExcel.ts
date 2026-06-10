import * as XLSX from "xlsx";

interface SignatureExcelEntry {
  employee_no: string;
  employee_name: string;
  epf_no: string;
  nic_number: string;
  net_salary: number;
}

export function generateSignatureListExcel(
  entries: SignatureExcelEntry[],
  monthName: string,
  year: number
) {
  const sorted = [...entries].sort((a, b) => Number(a.employee_no) - Number(b.employee_no));
  const grandTotal = sorted.reduce((s, e) => s + e.net_salary, 0);

  const data: any[][] = [
    [`Signature List — ${monthName} ${year}`],
    [],
    ["Emp No", "Employee Name", "EPF No", "NIC No", "Net Salary", "Signature"],
    ...sorted.map((e) => [e.employee_no, e.employee_name, e.epf_no, e.nic_number, e.net_salary, ""]),
    [],
    ["", "", "", "Grand Total", grandTotal, ""],
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Signature List");
  XLSX.writeFile(wb, `Signature_List_${monthName}_${year}.xlsx`);
}
