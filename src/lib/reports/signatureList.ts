import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SignatureEntry {
  employee_no: string;
  employee_name: string;
  epf_no: string;
  nic_number: string;
  net_salary: number;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function generateSignatureListPDF(
  entries: SignatureEntry[],
  companyName: string,
  companyAddress: string,
  monthName: string,
  year: number
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();

  doc.setFontSize(11);
  doc.setFont("helvetica", "bolditalic");
  doc.text(companyName, 14, 15);

  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.text(companyAddress, 14, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Print Date     ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }).replace(/ /g, "/")}`, pageW - 60, 15);
  doc.text(`Print Time     ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`, pageW - 60, 19);

  doc.setLineWidth(0.5);
  doc.line(14, 24, pageW - 14, 24);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bolditalic");
  doc.text("Signature List", 14, 33);

  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.text(`Month Of ${monthName} - ${year}`, 14, 39);

  const sorted = [...entries].sort((a, b) => Number(a.employee_no) - Number(b.employee_no));
  const grandTotal = sorted.reduce((s, e) => s + e.net_salary, 0);

  const tableData = sorted.map((e) => [
    e.employee_no,
    e.employee_name,
    e.epf_no,
    e.nic_number,
    fmt(e.net_salary),
    "",
  ]);

  tableData.push(["Grand Total", "", "", "", fmt(grandTotal), ""]);

  autoTable(doc, {
    startY: 45,
    head: [["Emp No", "Employee Name", "EPF No", "NIC No", "Net Salary", "Signature"]],
    body: tableData,
    margin: { left: 14, right: 14 },
    styles: {
      fontSize: 7,
      cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      font: "helvetica",
      fontStyle: "italic",
      lineWidth: 0,
    },
    headStyles: {
      fontStyle: "bolditalic",
      textColor: [0, 0, 0],
      fillColor: false,
      lineWidth: 0,
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 15, halign: "left" },
      1: { cellWidth: 50, halign: "left" },
      2: { cellWidth: 20, halign: "left" },
      3: { cellWidth: 25, halign: "left" },
      4: { cellWidth: 25, halign: "right" },
      5: { cellWidth: 45, halign: "left" },
    },
    didDrawCell: (data: any) => {
      if (data.column.index === 5 && data.section === "body") {
        const lastRowIdx = tableData.length - 1;
        if (data.row.index !== lastRowIdx) {
          doc.setLineDashPattern([0.5, 0.5], 0);
          doc.setLineWidth(0.2);
          const lineY = data.cell.y + data.cell.height - 1;
          doc.line(data.cell.x + 2, lineY, data.cell.x + data.cell.width - 2, lineY);
          doc.setLineDashPattern([], 0);
        }
      }
    },
    didDrawPage: (data: any) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      const currentPage = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`Page ${currentPage} of ${pageCount}`, pageW - 30, 43);
    },
  });

  doc.save(`Signature_List_${monthName}_${year}.pdf`);
}
