import { describe, it, expect, vi, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import jsPDFDefault from "jspdf";
import { aggregateOtByEmployee } from "./otAggregation";
import { generatePayslipExcel } from "./payslipExcel";
import { generatePayslipPDF } from "./payslip";

// jsdom's URL.createObjectURL is missing; XLSX.writeFile and jsPDF.save both go
// through it. Stub the save/write side effects so the generators can run headless.
vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof XLSX>("xlsx");
  return { ...actual, writeFile: vi.fn() };
});

// Wrap jsPDF so we can capture every text() call across all documents the
// generator creates. jsPDF attaches methods to each instance (not its prototype),
// so we intercept at construction time via a mocked default export.
vi.mock("jspdf", async () => {
  const actual = await vi.importActual<any>("jspdf");
  const Real = actual.default;
  const created: { text: string[] }[] = [];
  function Wrapped(this: any, ...args: any[]) {
    const inst = new Real(...args);
    const captured: string[] = [];
    const origText = inst.text.bind(inst);
    inst.text = (t: any, ...r: any[]) => {
      captured.push(String(t));
      return origText(t, ...r);
    };
    inst.save = () => {};
    created.push({ text: captured });
    return inst;
  }
  (Wrapped as any).__created = created;
  return { ...actual, default: Wrapped };
});

function lastPdfText(): string[] {
  const created = (jsPDFDefault as any).__created as { text: string[] }[];
  return created[created.length - 1].text;
}

beforeEach(() => {
  const created = (jsPDFDefault as any).__created as { text: string[] }[];
  if (created) created.length = 0;
});

function baseEntry(overrides: Partial<any> = {}) {
  return {
    employee_no: "001",
    employee_name: "JOHN DOE",
    designation: "Cashier",
    bank_account_no: "1234567890",
    epf_no: "EPF001",
    attendance_days: 26,
    basic_salary: 50000,
    attendance_allowance: 5000,
    late_pay_deduction: 0,
    no_pay_deduction: 0,
    other_allowances: 0,
    salary_advance: 0,
    epf_salary: 55000,
    ot_pay: 3750,
    ot_hours: 20,
    ot_multiplier: 1.5,
    total_earnings: 58750,
    gross_salary: 58750,
    epf_employee: 4400,
    epf_employer: 6600,
    etf_employer: 1650,
    total_deductions: 4400,
    net_salary: 54350,
    loan_deduction: 0,
    extra_pay: 0,
    fuel_allowance: 0,
    travel_allowance: 0,
    bonus: 0,
    incentives: 0,
    welfare: 0,
    deposits: 0,
    recoveries: 0,
    other_deductions: 0,
    ...overrides,
  };
}

describe("aggregateOtByEmployee", () => {
  it("returns an empty map for null / empty input", () => {
    expect(aggregateOtByEmployee(null).size).toBe(0);
    expect(aggregateOtByEmployee(undefined).size).toBe(0);
    expect(aggregateOtByEmployee([]).size).toBe(0);
  });

  it("sums OT hours across multiple attendance rows for the same employee", () => {
    const rows = [
      { employee_id: "e1", ot_hours: 4, ot_multiplier: 1.5 },
      { employee_id: "e1", ot_hours: 6, ot_multiplier: 1.5 },
      { employee_id: "e1", ot_hours: 2, ot_multiplier: 1.5 },
    ];
    const agg = aggregateOtByEmployee(rows);
    expect(agg.get("e1")?.hours).toBe(12);
    expect(agg.get("e1")?.multiplier).toBeCloseTo(1.5, 6);
  });

  it("keeps employees separate", () => {
    const rows = [
      { employee_id: "e1", ot_hours: 5, ot_multiplier: 1.5 },
      { employee_id: "e2", ot_hours: 8, ot_multiplier: 2 },
    ];
    const agg = aggregateOtByEmployee(rows);
    expect(agg.get("e1")).toEqual({ hours: 5, multiplier: 1.5 });
    expect(agg.get("e2")).toEqual({ hours: 8, multiplier: 2 });
  });

  it("returns an hours-weighted average multiplier when rows differ", () => {
    // 10h @ 1.5 + 10h @ 2.0 → 20h total, weighted mult = (15+20)/20 = 1.75
    const rows = [
      { employee_id: "e1", ot_hours: 10, ot_multiplier: 1.5 },
      { employee_id: "e1", ot_hours: 10, ot_multiplier: 2 },
    ];
    const agg = aggregateOtByEmployee(rows);
    expect(agg.get("e1")?.hours).toBe(20);
    expect(agg.get("e1")?.multiplier).toBeCloseTo(1.75, 6);
  });

  it("preserves total OT pay (hours × multiplier)", () => {
    const rows = [
      { employee_id: "e1", ot_hours: 4, ot_multiplier: 1.5 }, // 6
      { employee_id: "e1", ot_hours: 6, ot_multiplier: 2 },   // 12
    ];
    const agg = aggregateOtByEmployee(rows)!.get("e1")!;
    expect(agg.hours * agg.multiplier).toBeCloseTo(18, 6);
  });

  it("skips rows with zero or negative hours", () => {
    const rows = [
      { employee_id: "e1", ot_hours: 0, ot_multiplier: 1.5 },
      { employee_id: "e1", ot_hours: -3, ot_multiplier: 2 },
      { employee_id: "e1", ot_hours: 5, ot_multiplier: 1.5 },
    ];
    const agg = aggregateOtByEmployee(rows);
    expect(agg.get("e1")?.hours).toBe(5);
  });

  it("omits employees with no positive OT rows", () => {
    const rows = [{ employee_id: "e1", ot_hours: 0, ot_multiplier: 1.5 }];
    expect(aggregateOtByEmployee(rows).has("e1")).toBe(false);
  });

  it("coerces string values from Postgres numeric columns", () => {
    const rows = [
      { employee_id: "e1", ot_hours: "4.5" as any, ot_multiplier: "2" as any },
    ];
    const agg = aggregateOtByEmployee(rows);
    expect(agg.get("e1")?.hours).toBe(4.5);
    expect(agg.get("e1")?.multiplier).toBe(2);
  });

  it("defaults missing multiplier to 1.5", () => {
    const rows = [{ employee_id: "e1", ot_hours: 4 }];
    expect(aggregateOtByEmployee(rows).get("e1")?.multiplier).toBe(1.5);
  });
});

describe("generatePayslipExcel — OT columns", () => {
  it("includes OT Hours and OT Mult. headers", () => {
    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    generatePayslipExcel([baseEntry()], "Acme", "January", 2026);
    expect(writeFile).toHaveBeenCalledTimes(1);
    const wb = writeFile.mock.calls[0][0];
    const ws = wb.Sheets["Pay Slips"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const headerRow = rows[2];
    expect(headerRow).toContain("OT Hours");
    expect(headerRow).toContain("OT Mult.");
    expect(headerRow).toContain("OT Pay");
  });

  it("writes the aggregated OT hours and multiplier into the data row", () => {
    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    generatePayslipExcel(
      [baseEntry({ ot_hours: 12.5, ot_multiplier: 1.75, ot_pay: 4000 })],
      "Acme",
      "January",
      2026
    );
    const wb = writeFile.mock.calls[0][0];
    const ws = wb.Sheets["Pay Slips"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = rows[2];
    const data = rows[3];
    const hoursIdx = header.indexOf("OT Hours");
    const multIdx = header.indexOf("OT Mult.");
    const payIdx = header.indexOf("OT Pay");
    expect(data[hoursIdx]).toBe(12.5);
    expect(data[multIdx]).toBe(1.75);
    expect(data[payIdx]).toBe(4000);
  });

  it("falls back to multiplier 1.5 when OT pay > 0 but multiplier missing", () => {
    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    const entry = baseEntry({ ot_pay: 1000 });
    delete (entry as any).ot_multiplier;
    generatePayslipExcel([entry], "Acme", "January", 2026);
    const wb = writeFile.mock.calls[0][0];
    const ws = wb.Sheets["Pay Slips"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = rows[2];
    const data = rows[3];
    expect(data[header.indexOf("OT Mult.")]).toBe(1.5);
  });

  it("writes 0 OT hours/pay when the employee has no OT", () => {
    const writeFile = vi.mocked(XLSX.writeFile);
    writeFile.mockClear();
    generatePayslipExcel(
      [baseEntry({ ot_hours: 0, ot_pay: 0, ot_multiplier: 1.5 })],
      "Acme",
      "January",
      2026
    );
    const wb = writeFile.mock.calls[0][0];
    const ws = wb.Sheets["Pay Slips"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = rows[2];
    const data = rows[3];
    expect(data[header.indexOf("OT Hours")]).toBe(0);
    expect(data[header.indexOf("OT Pay")]).toBe(0);
  });
});

describe("generatePayslipPDF — OT line", () => {
  it("prints an OT line with the aggregated hours and multiplier", () => {
    generatePayslipPDF(
      [baseEntry({ ot_hours: 12, ot_multiplier: 2, ot_pay: 5000 })],
      "Acme",
      "Colombo",
      "January",
      2026
    );
    const otLine = lastPdfText().find((s) => s.startsWith("OT @"));
    expect(otLine).toBeDefined();
    expect(otLine).toContain("2.00");
    expect(otLine).toContain("12.00 hrs");
  });

  it("omits the OT line entirely when ot_pay is 0", () => {
    generatePayslipPDF(
      [baseEntry({ ot_hours: 0, ot_multiplier: 1.5, ot_pay: 0 })],
      "Acme",
      "Colombo",
      "January",
      2026
    );
    expect(lastPdfText().find((s) => s.startsWith("OT @"))).toBeUndefined();
  });

  it("defaults the multiplier label to 1.50 when missing but OT pay > 0", () => {
    const entry = baseEntry({ ot_pay: 2000, ot_hours: 10 });
    delete (entry as any).ot_multiplier;
    generatePayslipPDF([entry], "Acme", "Colombo", "January", 2026);
    const otLine = lastPdfText().find((s) => s.startsWith("OT @"));
    expect(otLine).toBeDefined();
    expect(otLine).toContain("1.50");
    expect(otLine).toContain("10.00 hrs");
  });
});