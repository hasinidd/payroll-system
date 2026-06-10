import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export interface AttendanceSummaryEntry {
  employee_no: string;
  employee_name: string;
  present_days: number;
  leave_days: number;
  no_pay_days: number;
  half_days: number;
  total_late_minutes: number;
  total_ot_hours: number;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function generateAttendanceSummaryPDF(
  entries: AttendanceSummaryEntry[],
  companyName: string,
  monthName: string,
  year: number
) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(companyName, 14, 15);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Attendance Summary — ${monthName} ${year}`, 14, 22);

  const sorted = [...entries].sort((a, b) => Number(a.employee_no) - Number(b.employee_no));

  autoTable(doc, {
    startY: 28,
    head: [["Emp No", "Employee Name", "Present", "Leave", "No Pay", "Half Day", "Late (min)", "OT (hrs)"]],
    body: sorted.map((e) => [
      e.employee_no, e.employee_name,
      fmt(e.present_days), fmt(e.leave_days), fmt(e.no_pay_days), fmt(e.half_days),
      String(e.total_late_minutes), fmt(e.total_ot_hours),
    ]),
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
  });

  doc.save(`Attendance_Summary_${monthName}_${year}.pdf`);
}

export function generateAttendanceSummaryExcel(
  entries: AttendanceSummaryEntry[],
  monthName: string,
  year: number
) {
  const sorted = [...entries].sort((a, b) => Number(a.employee_no) - Number(b.employee_no));
  const data: any[][] = [
    [`Attendance Summary — ${monthName} ${year}`],
    [],
    ["Emp No", "Employee Name", "Present", "Leave", "No Pay", "Half Day", "Late (min)", "OT (hrs)"],
    ...sorted.map((e) => [
      e.employee_no, e.employee_name,
      e.present_days, e.leave_days, e.no_pay_days, e.half_days,
      e.total_late_minutes, e.total_ot_hours,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance Summary");
  XLSX.writeFile(wb, `Attendance_Summary_${monthName}_${year}.xlsx`);
}
