import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface CFormPDFEntry {
  employee_name: string;
  nic_number: string;
  epf_no: string;
  epf_salary: number;
  epf_employee: number;
  epf_employer: number;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtWhole = (n: number) => Math.floor(n).toLocaleString("en-US");
const fmtCents = (n: number) => {
  const cents = Math.round((n - Math.floor(n)) * 100);
  return String(cents).padStart(2, "0");
};

async function loadImage(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function generateCFormPDF(
  entries: CFormPDFEntry[],
  companyName: string,
  monthName: string,
  year: number,
  epfRegNo?: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  // Load header/footer images
  let headerImg: string | null = null;
  let footerImg: string | null = null;
  try {
    headerImg = await loadImage("/cform-header.png");
    footerImg = await loadImage("/cform-footer.png");
  } catch (e) {
    console.warn("Could not load C Form images", e);
  }

  const sorted = [...entries].sort((a, b) => Number(a.epf_no) - Number(b.epf_no));

  // Paginate: 24 employees per page (matching the official form)
  const perPage = 24;
  const totalPages = Math.ceil(sorted.length / perPage);

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();
    const pageEntries = sorted.slice(page * perPage, (page + 1) * perPage);

    let y = 5;

    // Header image
    if (headerImg) {
      doc.addImage(headerImg, "PNG", 5, y, pageW - 10, 32);
      y += 34;
    } else {
      // Fallback text header
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("C FORM", pageW / 2, y + 10, { align: "center" });
      doc.setFontSize(8);
      doc.text("EPF Act No. 15 of 1958", pageW / 2, y + 16, { align: "center" });
      y += 22;
    }

    // EPF Registration & Month info
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    if (epfRegNo) {
      doc.text(`E.P.F. Registration No: ${epfRegNo}`, pageW - 80, y);
    }
    doc.text(`Month and Year of Contribution: ${monthName} ${year}`, pageW - 80, y + 5);
    doc.text(companyName, 10, y);
    y += 12;

    // Table headers
    const colX = [10, 16, 70, 95, 115, 130, 145, 160, 175, 190];
    const headers = ["No", "Employee Name", "NIC No", "EPF No", "Total Contribution", "", "Employer 12%", "", "Employee 8%", "", "EPF Salary"];

    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    doc.text("No", colX[0], y);
    doc.text("Employee Name", colX[1], y);
    doc.text("NIC No", colX[2], y);
    doc.text("EPF No", colX[3], y);
    doc.text("Total", colX[4], y, { align: "center" });
    doc.text("(Emp+Er)", colX[4], y + 3, { align: "center" });
    doc.text("", colX[5], y);
    doc.text("Employer", colX[6], y, { align: "center" });
    doc.text("12%", colX[6], y + 3, { align: "center" });
    doc.text("", colX[7], y);
    doc.text("Employee", colX[8], y, { align: "center" });
    doc.text("8%", colX[8], y + 3, { align: "center" });
    doc.text("", colX[9], y);

    // Cents headers
    doc.setFontSize(5);
    doc.text("Rs.", colX[4] - 3, y + 6);
    doc.text("Cts.", colX[5], y + 6);
    doc.text("Rs.", colX[6] - 3, y + 6);
    doc.text("Cts.", colX[7], y + 6);
    doc.text("Rs.", colX[8] - 3, y + 6);
    doc.text("Cts.", colX[9], y + 6);
    
    doc.setFontSize(6.5);
    doc.text("EPF Salary", pageW - 15, y, { align: "right" });

    y += 9;
    doc.line(10, y, pageW - 10, y);
    y += 4;

    // Data rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);

    let totalContribution = 0, totalEmployer = 0, totalEmployee = 0, totalEpfSalary = 0;

    for (let i = 0; i < 24; i++) {
      const e = pageEntries[i];
      const rowY = y + i * 7;

      // Row number
      doc.text(String(page * perPage + i + 1), colX[0], rowY);

      if (e) {
        const contribution = e.epf_employee + e.epf_employer;
        totalContribution += contribution;
        totalEmployer += e.epf_employer;
        totalEmployee += e.epf_employee;
        totalEpfSalary += e.epf_salary;

        doc.text(e.employee_name, colX[1], rowY);
        doc.text(e.nic_number, colX[2], rowY);
        doc.text(e.epf_no, colX[3], rowY);
        doc.text(fmtWhole(contribution), colX[4] + 5, rowY, { align: "right" });
        doc.text(fmtCents(contribution), colX[5] + 5, rowY, { align: "right" });
        doc.text(fmtWhole(e.epf_employer), colX[6] + 5, rowY, { align: "right" });
        doc.text(fmtCents(e.epf_employer), colX[7] + 5, rowY, { align: "right" });
        doc.text(fmtWhole(e.epf_employee), colX[8] + 5, rowY, { align: "right" });
        doc.text(fmtCents(e.epf_employee), colX[9] + 5, rowY, { align: "right" });
        doc.text(fmt(e.epf_salary), pageW - 15, rowY, { align: "right" });
      }

      // Draw light line
      doc.setDrawColor(200);
      doc.line(10, rowY + 2, pageW - 10, rowY + 2);
      doc.setDrawColor(0);
    }

    // Totals
    const totY = y + 24 * 7 + 2;
    doc.line(10, totY - 2, pageW - 10, totY - 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text("Total", colX[3], totY + 2);
    doc.text(fmtWhole(totalContribution), colX[4] + 5, totY + 2, { align: "right" });
    doc.text(fmtCents(totalContribution), colX[5] + 5, totY + 2, { align: "right" });
    doc.text(fmtWhole(totalEmployer), colX[6] + 5, totY + 2, { align: "right" });
    doc.text(fmtCents(totalEmployer), colX[7] + 5, totY + 2, { align: "right" });
    doc.text(fmtWhole(totalEmployee), colX[8] + 5, totY + 2, { align: "right" });
    doc.text(fmtCents(totalEmployee), colX[9] + 5, totY + 2, { align: "right" });
    doc.text(fmt(totalEpfSalary), pageW - 15, totY + 2, { align: "right" });

    // Contributions / Surcharges / Total Remittance
    const remitY = totY + 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("Contributions", pageW - 70, remitY);
    doc.text(fmt(totalContribution), pageW - 15, remitY, { align: "right" });
    doc.text("Surcharges", pageW - 70, remitY + 5);
    doc.text("", pageW - 15, remitY + 5, { align: "right" });
    doc.line(pageW - 70, remitY + 8, pageW - 10, remitY + 8);
    doc.setFont("helvetica", "bold");
    doc.text("Total Remittance", pageW - 70, remitY + 13);
    doc.text(fmt(totalContribution), pageW - 15, remitY + 13, { align: "right" });

    // Footer image
    if (footerImg) {
      doc.addImage(footerImg, "PNG", 5, 270, pageW - 10, 16);
    } else {
      doc.setFontSize(6);
      doc.setFont("helvetica", "normal");
      doc.text("Signature of Employer", 20, 275);
      doc.text("Telephone No.", 80, 275);
    }
  }

  doc.save(`C_Form_${monthName}_${year}.pdf`);
}
