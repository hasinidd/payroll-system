import { describe, it, expect } from "vitest";
import { calculatePayroll, validateLateMinutes, validateOtDivisor } from "./payroll";

const round2 = (n: number) => Math.round(n * 100) / 100;

function makeEmp(overrides: Partial<any> = {}) {
  return {
    id: "emp-1",
    basic_salary: 50000,
    attendance_allowance: 5000,
    fuel_allowance: 3000,
    travel_allowance: 2000,
    ...overrides,
  } as any;
}

function makeAttendance(lateMinutes: number, status: "Present" | "Half Day" | "Leave" | "No Pay" = "Present") {
  return [
    {
      status,
      late_minutes: lateMinutes,
      ot_hours: 0,
      ot_multiplier: 1.5,
    } as any,
  ];
}

/**
 * Formula under test:
 *   late_rate_per_minute = (basic + attendance + fuel + travel) / (30 * 9 * 60)
 *   late_pay_deduction   = round2(rate * late_minutes)
 */
describe("calculatePayroll — late deduction formula", () => {
  it("uses (Basic + all allowances) / (30 × 9 × 60) × late minutes", () => {
    const emp = makeEmp(); // gross-for-late = 60,000
    const result = calculatePayroll(emp, makeAttendance(30), [], [], 30, 26, "p1");
    const expectedRate = 60000 / (30 * 9 * 60); // ≈ 3.7037
    expect(result.late_pay_deduction).toBe(round2(expectedRate * 30));
  });

  it("returns 0 when late minutes is 0", () => {
    const result = calculatePayroll(makeEmp(), makeAttendance(0), [], [], 30, 26, "p1");
    expect(result.late_pay_deduction).toBe(0);
  });

  it("ignores allowances that are zero (basic-only gross)", () => {
    const emp = makeEmp({ attendance_allowance: 0, fuel_allowance: 0, travel_allowance: 0 });
    const result = calculatePayroll(emp, makeAttendance(60), [], [], 30, 26, "p1");
    const expected = round2((50000 / (30 * 9 * 60)) * 60);
    expect(result.late_pay_deduction).toBe(expected);
  });

  it("returns 0 when all salary components are 0", () => {
    const emp = makeEmp({ basic_salary: 0, attendance_allowance: 0, fuel_allowance: 0, travel_allowance: 0 });
    const result = calculatePayroll(emp, makeAttendance(45), [], [], 30, 26, "p1");
    expect(result.late_pay_deduction).toBe(0);
  });

  it("clamps negative late minutes to 0 (never produces a credit)", () => {
    // Negative late minutes shouldn't pay the employee extra. The formula multiplies
    // through, but per spec late deduction must be >= 0.
    const result = calculatePayroll(makeEmp(), makeAttendance(-15), [], [], 30, 26, "p1");
    expect(result.late_pay_deduction).toBeGreaterThanOrEqual(0);
  });

  it("sums late minutes across multiple attendance rows", () => {
    const emp = makeEmp();
    const attendance = [
      { status: "Present", late_minutes: 10, ot_hours: 0, ot_multiplier: 1.5 },
      { status: "Present", late_minutes: 20, ot_hours: 0, ot_multiplier: 1.5 },
      { status: "Present", late_minutes: 5, ot_hours: 0, ot_multiplier: 1.5 },
    ] as any;
    const result = calculatePayroll(emp, attendance, [], [], 30, 26, "p1");
    const expected = round2((60000 / (30 * 9 * 60)) * 35);
    expect(result.late_pay_deduction).toBe(expected);
    expect(result.late_minutes).toBe(35);
  });

  it("scales linearly: doubling late minutes doubles deduction (within rounding)", () => {
    const emp = makeEmp();
    const a = calculatePayroll(emp, makeAttendance(30), [], [], 30, 26, "p1").late_pay_deduction;
    const b = calculatePayroll(emp, makeAttendance(60), [], [], 30, 26, "p1").late_pay_deduction;
    expect(Math.abs(b - a * 2)).toBeLessThan(0.02);
  });

  it("rounds to 2 decimal places", () => {
    const result = calculatePayroll(makeEmp(), makeAttendance(7), [], [], 30, 26, "p1");
    const str = result.late_pay_deduction.toString();
    const decimals = str.includes(".") ? str.split(".")[1].length : 0;
    expect(decimals).toBeLessThanOrEqual(2);
  });

  it("handles very large late minutes without overflow", () => {
    const result = calculatePayroll(makeEmp(), makeAttendance(100000), [], [], 30, 26, "p1");
    expect(Number.isFinite(result.late_pay_deduction)).toBe(true);
    expect(result.late_pay_deduction).toBeGreaterThan(0);
  });
});

describe("validateLateMinutes", () => {
  it("accepts a positive integer string", () => {
    expect(validateLateMinutes("15")).toEqual({ value: 15, error: null });
  });

  it("accepts a positive integer number", () => {
    expect(validateLateMinutes(42)).toEqual({ value: 42, error: null });
  });

  it("treats empty string as 0", () => {
    expect(validateLateMinutes("")).toEqual({ value: 0, error: null });
  });

  it("treats null and undefined as 0", () => {
    expect(validateLateMinutes(null)).toEqual({ value: 0, error: null });
    expect(validateLateMinutes(undefined)).toEqual({ value: 0, error: null });
  });

  it("rejects letters with a clear error", () => {
    const r = validateLateMinutes("abc");
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/digits only/i);
  });

  it("rejects mixed letters and digits", () => {
    const r = validateLateMinutes("15a");
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/digits only/i);
  });

  it("rejects negative numbers with a clear error", () => {
    const r = validateLateMinutes("-5");
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/cannot be negative/i);
  });

  it("rejects negative numeric input", () => {
    const r = validateLateMinutes(-1);
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/negative/i);
  });

  it("rejects NaN and Infinity", () => {
    expect(validateLateMinutes(NaN).error).toBeTruthy();
    expect(validateLateMinutes(Infinity).error).toBeTruthy();
  });

  it("rejects whitespace-only strings as 0 (trim → empty)", () => {
    expect(validateLateMinutes("   ")).toEqual({ value: 0, error: null });
  });

  it("rejects symbols and special characters", () => {
    expect(validateLateMinutes("$5").error).toBeTruthy();
    expect(validateLateMinutes("5,000").error).toBeTruthy();
  });

  it("floors decimal values to whole minutes", () => {
    expect(validateLateMinutes("12.7")).toEqual({ value: 12, error: null });
  });

  it("accepts 0", () => {
    expect(validateLateMinutes("0")).toEqual({ value: 0, error: null });
    expect(validateLateMinutes(0)).toEqual({ value: 0, error: null });
  });
});

describe("validateOtDivisor", () => {
  it("accepts positive integers and decimals", () => {
    expect(validateOtDivisor("240")).toEqual({ value: 240, error: null });
    expect(validateOtDivisor("200")).toEqual({ value: 200, error: null });
    expect(validateOtDivisor("208.5")).toEqual({ value: 208.5, error: null });
    expect(validateOtDivisor(240)).toEqual({ value: 240, error: null });
  });

  it("rejects zero", () => {
    expect(validateOtDivisor("0").error).toMatch(/greater than zero/i);
    expect(validateOtDivisor(0).error).toMatch(/greater than zero/i);
  });

  it("rejects negative numbers", () => {
    expect(validateOtDivisor("-10").error).toMatch(/greater than zero/i);
    expect(validateOtDivisor(-1).error).toMatch(/greater than zero/i);
  });

  it("rejects letters, symbols, and mixed input", () => {
    expect(validateOtDivisor("abc").error).toBeTruthy();
    expect(validateOtDivisor("240h").error).toBeTruthy();
    expect(validateOtDivisor("$240").error).toBeTruthy();
    expect(validateOtDivisor("2,40").error).toBeTruthy();
  });

  it("rejects empty, null, and undefined", () => {
    expect(validateOtDivisor("").error).toMatch(/required/i);
    expect(validateOtDivisor("   ").error).toMatch(/required/i);
    expect(validateOtDivisor(null).error).toMatch(/required/i);
    expect(validateOtDivisor(undefined).error).toMatch(/required/i);
  });

  it("rejects NaN and Infinity", () => {
    expect(validateOtDivisor(NaN).error).toBeTruthy();
    expect(validateOtDivisor(Infinity).error).toBeTruthy();
  });
});