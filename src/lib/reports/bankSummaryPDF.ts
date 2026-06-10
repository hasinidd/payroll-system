import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface BankPDFEntry {
  employee_no: string;
  employee_name: string;
  bank_name: string;
  bank_account_no: string;
  net_salary: number;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generateBankSummaryPDF(
  entries: BankPDFEntry[],
  companyName: string,
  monthName: string,
  year: number
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, 14, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Bank Summary — ${monthName} ${year}`, 14, 22);

  const bankGroups = new Map<string, BankPDFEntry[]>();
  for (const e of entries) {
    const bank = e.bank_name || "No Bank";
    if (!bankGroups.has(bank)) bankGroups.set(bank, []);
    bankGroups.get(bank)!.push(e);
  }

  const body: any[][] = [];
  let grandTotal = 0;

  for (const [bankName, emps] of bankGroups) {
    let bankTotal = 0;
    for (const e of emps) {
      body.push([e.employee_no, e.employee_name, e.bank_name, e.bank_account_no, fmt(e.net_salary)]);
      bankTotal += e.net_salary;
    }
    body.push([{ content: `${bankName} Total`, colSpan: 4, styles: { fontStyle: "bold", halign: "right" } }, fmt(bankTotal)]);
    grandTotal += bankTotal;
  }

  body.push([{ content: "Grand Total", colSpan: 4, styles: { fontStyle: "bold", halign: "right" } }, fmt(grandTotal)]);

  autoTable(doc, {
    startY: 28,
    head: [["Emp No", "Employee Name", "Bank Name", "Account No", "Net Salary"]],
    body,
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
    columnStyles: { 4: { halign: "right" } },
  });

  doc.save(`Bank_Summary_${monthName}_${year}.pdf`);
}
