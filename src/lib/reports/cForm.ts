import * as XLSX from "xlsx";

interface CFormEntry {
  employee_name: string;
  nic_number: string;
  epf_no: string;
  epf_salary: number;
  epf_employee: number;
  epf_employer: number;
}

export async function generateCFormExcel(
  entries: CFormEntry[],
  monthName: string,
  year: number,
  branchTemplateBuffer?: ArrayBuffer | null
) {
  let arrayBuffer: ArrayBuffer;
  if (branchTemplateBuffer) {
    arrayBuffer = branchTemplateBuffer;
  } else {
    const response = await fetch("/C_FORM_Blank.xlsx");
    arrayBuffer = await response.arrayBuffer();
  }
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const sorted = [...entries].sort((a, b) => Number(a.epf_no) - Number(b.epf_no));

  let totalContribution = 0;
  let totalEmployer = 0;
  let totalEmployee = 0;
  let totalEpfSalary = 0;

  // Fill data rows starting at row 1 (0-indexed) — the template has 24 rows for data
  sorted.forEach((e, i) => {
    if (i >= 24) return; // Max 24 per page in official form
    const row = i + 1; // 1-indexed (row 1 in template is first data row)

    const contribution = e.epf_employee + e.epf_employer;
    totalContribution += contribution;
    totalEmployer += e.epf_employer;
    totalEmployee += e.epf_employee;
    totalEpfSalary += e.epf_salary;

    // Column A = No
    XLSX.utils.sheet_add_aoa(ws, [[i + 1]], { origin: `A${row}` });
    // Column B-F = Employee Name (merged in template)
    XLSX.utils.sheet_add_aoa(ws, [[e.employee_name]], { origin: `B${row}` });
    // Column G = NIC
    XLSX.utils.sheet_add_aoa(ws, [[e.nic_number]], { origin: `G${row}` });
    // Column H = EPF No
    XLSX.utils.sheet_add_aoa(ws, [[e.epf_no]], { origin: `H${row}` });
    // Column I = Total Contribution (Rs)
    XLSX.utils.sheet_add_aoa(ws, [[Math.floor(contribution)]], { origin: `I${row}` });
    // Column J = Total Contribution (Cts)
    XLSX.utils.sheet_add_aoa(ws, [["00"]], { origin: `J${row}` });
    // Column K = Employer 12% (Rs)
    XLSX.utils.sheet_add_aoa(ws, [[Math.floor(e.epf_employer)]], { origin: `K${row}` });
    // Column L = Employer (Cts)
    XLSX.utils.sheet_add_aoa(ws, [["00"]], { origin: `L${row}` });
    // Column M = Employee 8% (Rs)
    XLSX.utils.sheet_add_aoa(ws, [[e.epf_employee]], { origin: `M${row}` });
    // Column N = Employee (Cts)
    XLSX.utils.sheet_add_aoa(ws, [["00"]], { origin: `N${row}` });
    // Column O = EPF Salary
    XLSX.utils.sheet_add_aoa(ws, [[e.epf_salary]], { origin: `O${row}` });
  });

  // Totals row (row 26 in template, after 24 data rows + 1 empty)
  const totRow = 26;
  XLSX.utils.sheet_add_aoa(ws, [["Total"]], { origin: `H${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [[totalContribution]], { origin: `I${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [["00"]], { origin: `J${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [[totalEmployer]], { origin: `K${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [["00"]], { origin: `L${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [[totalEmployee]], { origin: `M${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [["00"]], { origin: `N${totRow}` });
  XLSX.utils.sheet_add_aoa(ws, [[totalEpfSalary]], { origin: `O${totRow}` });

  XLSX.writeFile(wb, `C_Form_${monthName}_${year}.xlsx`);
}
