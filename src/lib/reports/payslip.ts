import jsPDF from "jspdf";
import "jspdf-autotable";

interface PayslipEntry {
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

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Earnings section (top block) — matches template order. */
function buildEarnings(e: PayslipEntry): [string, number][] {
  const otPay = Number(e.ot_pay) || 0;
  const grossWages = Number(e.total_earnings) - Number(e.salary_advance);
  const lines: [string, number][] = [
    ["Basic Salary", e.basic_salary],
    ["ATTENDANCE ALLOWANCE", e.attendance_allowance],
  ];
  if (e.extra_pay > 0) lines.push(["Add.for Work Days", e.extra_pay]);
  lines.push(["Late", e.late_pay_deduction || 0]);
  lines.push(["Nopay", e.no_pay_deduction || 0]);
  if (e.other_allowances > 0) lines.push(["OTHER ALLOWANCES", e.other_allowances]);
  if (e.fuel_allowance > 0) lines.push(["FUEL ALLOWANCE", e.fuel_allowance]);
  if (e.travel_allowance > 0) lines.push(["TRAVEL ALLOWANCE", e.travel_allowance]);
  if (e.bonus > 0) lines.push(["BONUS", e.bonus]);
  if (e.incentives > 0) lines.push(["INCENTIVES", e.incentives]);
  lines.push(["SALARY ADVANCE", e.salary_advance || 0]);
  lines.push(["Total For EPF", e.epf_salary]);
  if (otPay > 0) {
    const mult = Number(e.ot_multiplier) || 1.5;
    const hours = Number(e.ot_hours) || 0;
    lines.push([`OT @${mult.toFixed(2)} x ${hours.toFixed(2)} hrs`, otPay]);
  }
  lines.push(["Total Earnings", e.total_earnings]);
  lines.push(["Gross Wages", grossWages]);
  return lines;
}

/** Deductions section (below Gross Wages) — matches template order. */
function buildDeductions(e: PayslipEntry): [string, number][] {
  const lines: [string, number][] = [];
  lines.push(["EPF Employee (8%)", e.epf_employee]);
  if (e.salary_advance > 0) lines.push(["Salary Advance", e.salary_advance]);
  if (e.welfare > 0) lines.push(["Welfare", e.welfare]);
  if (e.recoveries > 0) lines.push(["Recovery", e.recoveries]);
  if (e.deposits > 0) lines.push(["Deposit", e.deposits]);
  if (e.loan_deduction > 0) lines.push(["Loan", e.loan_deduction]);
  if (e.other_deductions > 0) lines.push(["Other Deductions", e.other_deductions]);
  lines.push(["Total Deduction", e.total_deductions]);
  return lines;
}

export function generatePayslipPDF(
  entries: PayslipEntry[],
  companyName: string,
  companyAddress: string,
  monthName: string,
  year: number
) {
  const title = `Pay Sheet For The Month Of ${monthName} - ${year}`;
  const shortTitle = `Pay Sheet For ${monthName} - ${year}`;

  if (entries.length > 1) {
    // Bulk: A4 landscape, 3 slips side-by-side with full main + stub.
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth(); // 297
    const pageH = doc.internal.pageSize.getHeight(); // 210
    const colW = pageW / 3; // 99
    const padX = 4;
    const slipW = colW - padX * 2;
    for (let i = 0; i < entries.length; i++) {
      const slotIdx = i % 3;
      if (slotIdx === 0 && i > 0) doc.addPage();
      const x = slotIdx * colW + padX;
      drawSlipColumn(doc, x, 6, slipW, pageH - 12, entries[i], companyName, companyAddress, title, shortTitle);
      if (slotIdx < 2) {
        const sepX = (slotIdx + 1) * colW;
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.line(sepX, 4, sepX, pageH - 4);
        doc.setLineDashPattern([], 0);
      }
    }
    doc.save(`PaySlips_${monthName}_${year}.pdf`);
    return;
  }

  // Single: original portrait main + stub.
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const slipW = pageW - 20;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0) doc.addPage();
    const e = entries[i];
    let cy = drawPayslip(doc, 10, 10, slipW, e, companyName, companyAddress, title);
    cy += 8;
    drawPayslipStub(doc, 10, cy, slipW, e, companyName, companyAddress, title);
  }
  doc.save(`PaySlips_${monthName}_${year}.pdf`);
}

/** Draw one complete slip (main + stub) inside a narrow column for A4-landscape 3-up layout. */
function drawSlipColumn(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  _h: number,
  e: PayslipEntry,
  companyName: string,
  companyAddress: string,
  title: string,
  shortTitle: string
) {
  const cx = x + w / 2;
  let cy = y;
  const LH = 3.8;

  // Header
  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.text(companyName, cx, cy, { align: "center" });
  cy += 3.6;
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text(companyAddress, cx, cy, { align: "center", maxWidth: w });
  cy += 3;
  doc.line(x, cy, x + w, cy);
  cy += 3.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text(title, cx, cy, { align: "center" });
  cy += 3.8;

  // Employee info
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.text(`Epf No : ${e.epf_no}`, x, cy);
  doc.text(`WDays ${e.attendance_days}`, x + w, cy, { align: "right" });
  cy += LH;
  const infoLines = [
    `Name : ${e.employee_name}`,
    `Location : HEAD OFFICE`,
    `Designation : ${e.designation}`,
    `Bank A/C : ${e.bank_account_no || "N/A"}`,
  ];
  for (const line of infoLines) {
    const wrapped = doc.splitTextToSize(line, w);
    for (const wl of wrapped) {
      doc.text(wl, x, cy);
      cy += LH;
    }
  }
  doc.line(x, cy, x + w, cy);
  cy += 3;

  // Earnings + deductions
  const earnings = buildEarnings(e);
  const deductions = buildDeductions(e);
  doc.setFontSize(7.5);
  for (const [label, val] of earnings) {
    const isBold = label === "Total Earnings" || label === "Gross Wages";
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, x, cy);
    doc.text(fmt(val), x + w, cy, { align: "right" });
    cy += LH;
  }
  for (const [label, val] of deductions) {
    const isBold = label.startsWith("Total");
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, x, cy);
    doc.text(fmt(val), x + w, cy, { align: "right" });
    cy += LH;
  }

  // Dashed divider
  cy += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += 3.5;

  // Employer + Net
  const bottomLines: [string, number, boolean][] = [
    ["EPF Employer (12%)", e.epf_employer, false],
    ["ETF Employer (3%)", e.etf_employer, false],
    ["Net Amount Payable", e.net_salary, true],
  ];
  for (const [label, val, isBold] of bottomLines) {
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, x, cy);
    doc.text(fmt(val), x + w, cy, { align: "right" });
    cy += LH;
  }

  // Loan Balance
  cy += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += 3.5;
  doc.setFont("courier", "normal");
  doc.text("Loan Balance :", x, cy);
  cy += 3.5;

  // Double dashed = tear-off
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, cy, x + w, cy);
  cy += 1.5;
  doc.line(x, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += 3.5;

  // Stub header
  doc.setFont("courier", "bold");
  doc.setFontSize(8.5);
  doc.text(companyName, cx, cy, { align: "center" });
  cy += 3.5;
  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  doc.text(companyAddress, cx, cy, { align: "center", maxWidth: w });
  cy += 3.5;
  doc.setFont("courier", "bold");
  doc.setFontSize(7.5);
  doc.text(shortTitle, cx, cy, { align: "center" });
  cy += 3.8;

  // Stub body
  doc.setFont("courier", "normal");
  doc.setFontSize(7.5);
  doc.text(`Epf No : ${e.epf_no}`, x, cy);
  cy += LH;
  const stubName = doc.splitTextToSize(`Name : ${e.employee_name}`, w);
  for (const l of stubName) { doc.text(l, x, cy); cy += LH; }
  doc.setFont("courier", "bold");
  doc.text("Net Amount Payable", x, cy);
  doc.text(fmt(e.net_salary), x + w, cy, { align: "right" });
  cy += LH + 1.5;

  doc.setFont("courier", "normal");
  doc.setFontSize(6.5);
  const note = doc.splitTextToSize("Amount payable is correct and Receipt acknowledged.", w);
  for (const l of note) { doc.text(l, x, cy); cy += 3.2; }
  cy += 6;

  // Signature lines
  const sigW = (w - 4) / 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, cy, x + sigW, cy);
  doc.line(x + sigW + 4, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += 3.2;
  doc.setFontSize(6.5);
  doc.text("Date", x + sigW / 2, cy, { align: "center" });
  doc.text("Signature", x + sigW + 4 + sigW / 2, cy, { align: "center" });
}

function drawCompactPayslip(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  _h: number,
  e: PayslipEntry,
  companyName: string,
  companyAddress: string,
  title: string
) {
  const cx = x + w / 2;
  let cy = y;
  const LH = 3.6;

  doc.setFontSize(9);
  doc.setFont("courier", "bold");
  doc.text(companyName, cx, cy, { align: "center" });
  cy += 3.6;
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text(companyAddress, cx, cy, { align: "center" });
  cy += 3.5;
  doc.setFontSize(7.5);
  doc.setFont("courier", "bold");
  doc.line(x, cy, x + w, cy);
  cy += 3.2;
  doc.text(title, x + 2, cy);
  cy += 3.5;

  // Compact employee info: two columns, 2 rows
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text(`EPF No: ${e.epf_no}   Name: ${e.employee_name}`, x + 2, cy);
  doc.text(`WDays: ${e.attendance_days}`, x + w - 2, cy, { align: "right" });
  cy += 3.2;
  doc.text(`Designation: ${e.designation}   Bank A/C: ${e.bank_account_no || "N/A"}`, x + 2, cy);
  cy += 2.5;
  doc.line(x, cy, x + w, cy);
  cy += 3;

  // Two-column layout: earnings on left, deductions + totals on right
  const earnings = buildEarnings(e);
  const deductions = buildDeductions(e);
  const colW = w / 2;
  const leftX = x + 2;
  const rightX = x + colW + 2;
  const rightEnd = x + w - 2;
  const leftEnd = x + colW - 2;

  let ly = cy;
  doc.setFontSize(7);
  for (const [label, val] of earnings) {
    const isBold = label.startsWith("Total") || label === "Gross Wages";
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, leftX, ly);
    doc.text(fmt(val), leftEnd, ly, { align: "right" });
    ly += LH;
  }

  let ry = cy;
  const rightLines: [string, number, boolean][] = [];
  for (const [label, val] of deductions) {
    rightLines.push([label, val, label.startsWith("Total")]);
  }
  rightLines.push(["EPF Employer (12%)", e.epf_employer, false]);
  rightLines.push(["ETF Employer (3%)", e.etf_employer, false]);
  rightLines.push(["Net Amount Payable", e.net_salary, true]);
  for (const [label, val, isBold] of rightLines) {
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, rightX, ry);
    doc.text(fmt(val), rightEnd, ry, { align: "right" });
    ry += LH;
  }
}

function drawPayslip(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  e: PayslipEntry,
  companyName: string,
  companyAddress: string,
  title: string,
  scale: number = 1
): number {
  const cx = x + w / 2;
  let cy = y;
  const s = scale;
  const fs = (n: number) => Math.max(5, n * s);
  const lh = (n: number) => n * s;

  // Header
  doc.setFontSize(fs(11));
  doc.setFont("courier", "bold");
  doc.text(companyName, cx, cy, { align: "center" });
  cy += lh(5);
  doc.setFont("courier", "normal");
  doc.setFontSize(fs(8));
  doc.text(companyAddress, cx, cy, { align: "center" });
  cy += lh(6);

  // Title
  doc.setFontSize(fs(9));
  doc.setFont("courier", "bold");
  doc.line(x, cy, x + w, cy);
  cy += lh(5);
  doc.text(title, x + 2, cy);
  cy += lh(5);

  // Employee info
  doc.setFontSize(fs(8));
  doc.setFont("courier", "normal");
  const info = [
    [`Employee Epf No : ${e.epf_no}`, `WDays ${e.attendance_days}`],
    [`Employee Name : ${e.employee_name}`, ``],
    [`Location : HEAD OFFICE`, ``],
    [`Designation : ${e.designation}`, ``],
    [`Bank A/C Number : ${e.bank_account_no || "N/A"}`, ``],
  ];
  for (const [left, right] of info) {
    doc.text(left, x + 2, cy);
    if (right) doc.text(right, x + w - 2, cy, { align: "right" });
    cy += lh(5);
  }

  doc.line(x, cy, x + w, cy);
  cy += lh(5);

  // Earnings block
  const earnings = buildEarnings(e);
  doc.setFontSize(fs(8));
  for (const [label, val] of earnings) {
    const isBold = label.startsWith("Total") || label === "Gross Wages";
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, x + 2, cy);
    doc.text(fmt(val), x + w - 2, cy, { align: "right" });
    cy += lh(4.5);
  }

  // Deductions block
  for (const [label, val] of buildDeductions(e)) {
    const isBold = label.startsWith("Total");
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.text(label, x + 2, cy);
    doc.text(fmt(val), x + w - 2, cy, { align: "right" });
    cy += lh(4.5);
  }

  // Separator
  cy += lh(3);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += lh(5);

  // EPF/ETF/Net
  const bottomLines: [string, number][] = [
    ["EPF Employer (12%)", e.epf_employer],
    ["ETF Employer (3%)", e.etf_employer],
    ["Net Amount Payable", e.net_salary],
  ];
  for (const [label, val] of bottomLines) {
    const isBold = label.startsWith("Net");
    doc.setFont("courier", isBold ? "bold" : "normal");
    doc.setFontSize(fs(isBold ? 9 : 8));
    doc.text(label, x + 2, cy);
    doc.text(fmt(val), x + w - 2, cy, { align: "right" });
    cy += lh(5);
  }

  // Loan Balance line
  cy += lh(2);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += lh(4);
  doc.setFontSize(fs(8));
  doc.setFont("courier", "normal");
  doc.text("Loan Balance :", x + 2, cy);

  return cy + lh(4);
}

function drawPayslipStub(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  e: PayslipEntry,
  companyName: string,
  companyAddress: string,
  title: string
) {
  const cx = x + w / 2;
  let cy = y;

  // Cut line
  doc.setLineDashPattern([2, 2], 0);
  doc.line(x, cy, x + w, cy);
  doc.setLineDashPattern([], 0);
  cy += 6;

  doc.setFontSize(9);
  doc.setFont("courier", "bold");
  doc.text(companyName, cx, cy, { align: "center" });
  cy += 4;
  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text(companyAddress, cx, cy, { align: "center" });
  cy += 4;
  doc.setFont("courier", "bold");
  doc.text(title, x + 2, cy);
  cy += 5;

  doc.setFontSize(8);
  doc.text(`Employee EPF No  : ${e.epf_no}`, x + 2, cy);
  cy += 4;
  doc.text(`Employee Name    : ${e.employee_name}`, x + 2, cy);
  cy += 5;
  doc.setFont("courier", "bold");
  doc.text("Net Amount Payable", x + 2, cy);
  doc.text(fmt(e.net_salary), x + w - 2, cy, { align: "right" });
  cy += 7;

  doc.setFont("courier", "normal");
  doc.setFontSize(7);
  doc.text("Amount payable is correct and Receipt acknowledged.", x + 2, cy);
  cy += 8;

  // Date / Signature
  doc.setLineDashPattern([1, 1], 0);
  doc.line(x + 5, cy, x + 50, cy);
  doc.line(x + w - 60, cy, x + w - 5, cy);
  doc.setLineDashPattern([], 0);
  cy += 4;
  doc.setFontSize(7);
  doc.text("Date", x + 22, cy);
  doc.text("Signature", x + w - 35, cy);
}
