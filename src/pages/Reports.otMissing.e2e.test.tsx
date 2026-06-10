/**
 * Regression E2E: an employee whose attendance rows are missing OT fields
 * (no `ot_hours` / no `ot_multiplier`) must not corrupt payslip exports.
 *
 * Expected behaviour:
 *   - PDF payslip: OT line is OMITTED entirely when `ot_pay` is 0.
 *   - Excel payslip: `OT Hours` = 0, `OT Pay` = 0. The multiplier column
 *     falls back to the default 1.5 (Reports.tsx supplies 1.5 when the
 *     employee has no aggregated OT rows), which is harmless because
 *     hours × pay are both 0.
 *
 * We also include a second employee WITH valid OT so we can confirm the
 * missing-OT employee is the only one skipped in the PDF and that the
 * valid employee still round-trips correctly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import jsPDFDefault from "jspdf";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useBranch", () => ({ useBranch: () => ({ branchId: "branch-1" }) }));

function makeBuilder(rows: any[]) {
  const b: any = {
    _rows: rows,
    select() { return this; },
    eq() { return this; },
    gte() { return this; },
    lte() { return this; },
    order() { return this; },
    limit() { return this; },
    single() { return Promise.resolve({ data: this._rows[0] ?? null, error: null }); },
    maybeSingle() { return Promise.resolve({ data: this._rows[0] ?? null, error: null }); },
    then(resolve: any, reject: any) {
      return Promise.resolve({ data: this._rows, error: null }).then(resolve, reject);
    },
  };
  return b;
}

const EMP_MISSING = "emp-missing";
const EMP_OK = "emp-ok";

// emp-missing: attendance rows have NO ot_hours / ot_multiplier fields at all.
// emp-ok: normal 5h @ 1.5 OT so we can confirm the exporter still handles the good case.
const attendanceRows = [
  { employee_id: EMP_MISSING, status: "Present", late_minutes: 0,
    employees: { employee_no: "010", first_name: "Nadeeka", last_name: "Fernando" } },
  { employee_id: EMP_MISSING, status: "Present", late_minutes: 0,
    employees: { employee_no: "010", first_name: "Nadeeka", last_name: "Fernando" } },
  { employee_id: EMP_OK, status: "Present", late_minutes: 0, ot_hours: 5, ot_multiplier: 1.5,
    employees: { employee_no: "011", first_name: "Ruwan", last_name: "Jaya" } },
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
  payrollEntry("pe-10", EMP_MISSING, "010", "Nadeeka", "Fernando", 0), // no OT pay
  payrollEntry("pe-11", EMP_OK, "011", "Ruwan", "Jaya", 1500),         // 5h * 1.5 * 200 = 1500
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from(table: string) {
      switch (table) {
        case "company_settings":
          return makeBuilder([{ company_name: "Acme Ltd", address_line1: "Colombo", address_line2: "" }]);
        case "departments": return makeBuilder([]);
        case "payroll_periods":
          return makeBuilder([{ id: "period-1", month: 6, year: 2026, branch_id: "branch-1" }]);
        case "payroll_entries": return makeBuilder(entriesRows);
        case "attendance": return makeBuilder(attendanceRows);
        default: return makeBuilder([]);
      }
    },
  },
}));

vi.mock("xlsx", async () => {
  const actual = await vi.importActual<typeof XLSX>("xlsx");
  return { ...actual, writeFile: vi.fn() };
});

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

describe("Reports.tsx — regression: attendance rows missing OT fields", () => {
  it("omits the OT line in the PDF for the employee without OT pay, keeps it for the other", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByText("Nadeeka Fernando")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /All PDF/i }));

    const created = (jsPDFDefault as any).__created as { text: string[] }[];
    await waitFor(() => expect(created.length).toBeGreaterThan(0));

    const allText = created.flatMap((c) => c.text);
    const otLines = allText.filter((s) => s.startsWith("OT @"));

    // Exactly one OT line — for emp-ok. emp-missing must be omitted (ot_pay = 0).
    expect(otLines).toHaveLength(1);
    expect(otLines[0]).toContain("5.00 hrs");
    expect(otLines[0]).toContain("1.50");
  });

  it("writes 0 OT hours / 0 OT pay for the missing-OT employee in Excel", async () => {
    renderReports();
    await waitFor(() => expect(screen.getByText("Nadeeka Fernando")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /All Excel/i }));

    const writeFile = vi.mocked(XLSX.writeFile);
    await waitFor(() => expect(writeFile).toHaveBeenCalledTimes(1));

    const wb = writeFile.mock.calls[0][0];
    const ws = wb.Sheets["Pay Slips"];
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    const header = rows[2];
    const empNoIdx = header.indexOf("Emp No");
    const otHoursIdx = header.indexOf("OT Hours");
    const otMultIdx = header.indexOf("OT Mult.");
    const otPayIdx = header.indexOf("OT Pay");

    const dataByEmp = new Map<string, any[]>();
    for (const r of rows.slice(3)) if (r && r[empNoIdx]) dataByEmp.set(String(r[empNoIdx]), r);

    // Missing-OT employee: hours + pay must be 0 (no NaN, no crash from missing fields).
    const missing = dataByEmp.get("010")!;
    expect(missing[otHoursIdx]).toBe(0);
    expect(missing[otPayIdx]).toBe(0);
    // Multiplier defaults to 1.5 when no OT rows exist; 0 hours × anything = 0 pay.
    expect(missing[otMultIdx]).toBe(1.5);

    // Valid OT employee still round-trips correctly.
    const ok = dataByEmp.get("011")!;
    expect(ok[otHoursIdx]).toBe(5);
    expect(ok[otMultIdx]).toBe(1.5);
    expect(ok[otPayIdx]).toBe(1500);
  });
});