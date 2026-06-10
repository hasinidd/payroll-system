/**
 * End-to-end test that renders <Reports /> with a mocked Cloud backend
 * (attendance + payroll entries + company settings) and triggers the "All PDF"
 * and "All Excel" downloads. Both generators are intercepted so we can verify
 * the aggregated OT hours + effective OT multiplier that reach the exports.
 *
 * OT scenario per employee:
 *   emp-1: 6h @ 1.5 + 4h @ 2.0  → 10h, weighted mult = (9 + 8) / 10 = 1.7
 *   emp-2: 8h @ 1.5              → 8h, mult = 1.5
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDFDefault from "jspdf";

// --- Mocks (must be registered before importing Reports) ---

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/hooks/useBranch", () => ({
  useBranch: () => ({ branchId: "branch-1" }),
}));

// Chainable fake Supabase query builder. All filter methods return `this`;
// awaiting or calling .single()/.maybeSingle() resolves with { data, error }.
function makeBuilder(rows: any[]) {
  const b: any = {
    _rows: rows,
    select() { return this; },
    eq() { return this; },
    gte() { return this; },
    lte() { return this; },
    order() { return this; },
    limit() { return this; },
    single() {
      return Promise.resolve({ data: this._rows[0] ?? null, error: null });
    },
    maybeSingle() {
      return Promise.resolve({ data: this._rows[0] ?? null, error: null });
    },
    then(resolve: any, reject: any) {
      return Promise.resolve({ data: this._rows, error: null }).then(resolve, reject);
    },
  };
  return b;
}

const EMP1 = "emp-1";
const EMP2 = "emp-2";

const attendanceRows = [
  { employee_id: EMP1, status: "Present", late_minutes: 0, ot_hours: 6, ot_multiplier: 1.5,
    employees: { employee_no: "001", first_name: "Alice", last_name: "Perera" } },
  { employee_id: EMP1, status: "Present", late_minutes: 0, ot_hours: 4, ot_multiplier: 2,
    employees: { employee_no: "001", first_name: "Alice", last_name: "Perera" } },
  { employee_id: EMP2, status: "Present", late_minutes: 0, ot_hours: 8, ot_multiplier: 1.5,
    employees: { employee_no: "002", first_name: "Bimal", last_name: "Silva" } },
];

function payrollEntry(id: string, empId: string, empNo: string, first: string, last: string, otPay: number) {
  return {
    id, employee_id: empId, attendance_days: 26, basic_salary: 50000,
    attendance_allowance: 5000, late_pay_deduction: 0, no_pay_deduction: 0,
    other_allowances: 0, salary_advance: 0, epf_salary: 55000, ot_pay: otPay,
    total_earnings: 55000 + otPay, gross_salary: 55000 + otPay,
    epf_employee: 4400, epf_employer: 6600, etf_employer: 1650,
    total_deductions: 4400, net_salary: 50600 + otPay,
    loan_deduction: 0, extra_pay: 0, fuel_allowance: 0, travel_allowance: 0,
    bonus: 0, incentives: 0, welfare: 0, deposits: 0, recoveries: 0, other_deductions: 0,
    employees: {
      employee_no: empNo, first_name: first, last_name: last,
      epf_no: `EPF-${empNo}`, nic_number: `NIC-${empNo}`, designation: "Cashier",
      bank_name: "BOC", bank_account_no: `ACC-${empNo}`, department_id: null,
    },
  };
}

const entriesRows = [
  payrollEntry("pe-1", EMP1, "001", "Alice", "Perera", 3400), // 6*1.5*x + 4*2*x = 17x
  payrollEntry("pe-2", EMP2, "002", "Bimal", "Silva", 2400),
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      switch (table) {
        case "company_settings":
          return makeBuilder([{ company_name: "Acme Ltd", address_line1: "Colombo", address_line2: "" }]);
        case "departments":
          return makeBuilder([]);
        case "payroll_periods":
          return makeBuilder([{ id: "period-1", month: 6, year: 2026, branch_id: "branch-1" }]);
        case "payroll_entries":
          return makeBuilder(entriesRows);
        case "attendance":
          return makeBuilder(attendanceRows);
        default:
          return makeBuilder([]);
      }
    },
  },
}));

// Capture Excel workbooks written to disk.
vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof XLSX>("xlsx");
  return { ...actual, writeFile: vi.fn() };
});

// Wrap jsPDF so text() calls on every generated doc are captured.
vi.mock("jspdf", async () => {
  const actual = await vi.importActual<any>("jspdf");
  const Real = actual.default;
  const created: { text: string[] }[] = [];
  function Wrapped(this: any, ...args: any[]) {
    const inst = new Real(...args);
    const captured: string[] = [];
    const origText = inst.text.bind(inst);
    inst.text = (t: any, ...r: any[]) => { captured.push(String(t)); return origText(t, ...r); };
    inst.save = () => {};
    created.push({ text: captured });
    return inst;
  }
  (Wrapped as any).__created = created;
  return { ...actual, default: Wrapped };
});

// --- Now import the component (after mocks) ---
import Reports from "./Reports";

function renderReports() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <Reports />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(XLSX.writeFile).mockClear();
  const created = (jsPDFDefault as any).__created as { text: string[] }[];
  if (created) created.length = 0;
});

describe("Reports.tsx — end-to-end OT aggregation", () => {
  it("passes aggregated OT hours + weighted multiplier into the PDF payslip", async () => {
    renderReports();

    // Wait for the payroll table to render (i.e. payroll_entries + attendance loaded).
    await waitFor(() => expect(screen.getByText("Alice Perera")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /All PDF/i }));

    const created = (jsPDFDefault as any).__created as { text: string[] }[];
    await waitFor(() => expect(created.length).toBeGreaterThan(0));

    const allText = created.flatMap((c) => c.text);
    const otLines = allText.filter((s) => s.startsWith("OT @"));
    // One OT line per employee that has OT pay (both do).
    expect(otLines).toHaveLength(2);

    // emp-1: 10 hours, weighted multiplier = (6*1.5 + 4*2) / 10 = 1.70
    const line1 = otLines.find((s) => s.includes("10.00 hrs"));
    expect(line1).toBeDefined();
    expect(line1).toContain("1.70");

    // emp-2: 8 hours, multiplier = 1.50
    const line2 = otLines.find((s) => s.includes("8.00 hrs"));
    expect(line2).toBeDefined();
    expect(line2).toContain("1.50");
  });

  it("passes aggregated OT hours + weighted multiplier into the Excel payslip", async () => {
    renderReports();

    await waitFor(() => expect(screen.getByText("Alice Perera")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /All Excel/i }));

    const writeFile = vi.mocked(XLSX.writeFile);
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));

    const wb = writeFile.mock.calls[0][0];
    const ws = wb.Sheets["Pay Slips"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Layout: row 0 = title, row 1 = blank, row 2 = headers, rows 3+ = data.
    const header = rows[2];
    const empNoIdx = header.indexOf("Emp No");
    const otHoursIdx = header.indexOf("OT Hours");
    const otMultIdx = header.indexOf("OT Mult.");

    expect(otHoursIdx).toBeGreaterThan(-1);
    expect(otMultIdx).toBeGreaterThan(-1);

    const dataByEmp = new Map<string, any[]>();
    for (const r of rows.slice(3)) if (r && r[empNoIdx]) dataByEmp.set(String(r[empNoIdx]), r);

    const alice = dataByEmp.get("001")!;
    expect(alice[otHoursIdx]).toBe(10);
    expect(alice[otMultIdx]).toBeCloseTo(1.7, 6);

    const bimal = dataByEmp.get("002")!;
    expect(bimal[otHoursIdx]).toBe(8);
    expect(bimal[otMultIdx]).toBe(1.5);
  });
});