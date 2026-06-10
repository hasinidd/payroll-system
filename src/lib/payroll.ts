import type { Database } from "@/integrations/supabase/types";

type Employee = Database["public"]["Tables"]["employees"]["Row"];
type Attendance = Database["public"]["Tables"]["attendance"]["Row"];
type Loan = Database["public"]["Tables"]["loans"]["Row"];

interface EmployeeDeduction {
  id: string;
  deduction_type: string;
  monthly_deduction: number;
  remaining_balance: number;
  is_active: boolean;
  is_recurring: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Per-company payroll component toggles. Defaults to all-enabled to preserve
 * legacy behaviour when callers don't pass settings.
 */
export interface PayrollComponentSettings {
  epf_enabled?: boolean;
  etf_enabled?: boolean;
  ot_enabled?: boolean;
  late_deduction_enabled?: boolean;
  /** Divisor applied to basic salary to derive the hourly rate (e.g. 240, 200). */
  ot_hours_divisor?: number;
}

const DEFAULT_COMPONENTS: Required<PayrollComponentSettings> = {
  epf_enabled: true,
  etf_enabled: true,
  ot_enabled: true,
  late_deduction_enabled: true,
  ot_hours_divisor: 240,
};

/**
 * Validate a user-entered late-minutes value.
 * - Strings, numbers, and empty input are accepted as inputs.
 * - Empty / null / undefined → treated as 0 (no error).
 * - Letters / symbols / NaN → error.
 * - Negative numbers → error.
 * - Decimals are floored to whole minutes.
 * Returns { value, error } — when error is set, value is null and the caller
 * should block submission and surface the message.
 */
export function validateLateMinutes(
  raw: unknown
): { value: number | null; error: string | null } {
  if (raw === null || raw === undefined) return { value: 0, error: null };
  const str = String(raw).trim();
  if (str === "") return { value: 0, error: null };
  // Reject anything that isn't a plain integer or decimal number
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    return { value: null, error: "Late minutes must be a whole number (digits only)." };
  }
  const num = Number(str);
  if (!Number.isFinite(num)) {
    return { value: null, error: "Late minutes must be a valid number." };
  }
  if (num < 0) {
    return { value: null, error: "Late minutes cannot be negative." };
  }
  return { value: Math.floor(num), error: null };
}

/**
 * Validate the OT hours divisor entered in Settings.
 * - Empty / null / undefined → error (required field).
 * - Letters, symbols, mixed input, NaN → error.
 * - Zero or negative → error.
 * - Positive finite numbers (integer or decimal) → accepted.
 */
export function validateOtDivisor(
  raw: unknown
): { value: number | null; error: string | null } {
  if (raw === null || raw === undefined) {
    return { value: null, error: "OT hours divisor is required." };
  }
  const str = String(raw).trim();
  if (str === "") {
    return { value: null, error: "OT hours divisor is required." };
  }
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    return { value: null, error: "OT hours divisor must be a number (digits only)." };
  }
  const num = Number(str);
  if (!Number.isFinite(num)) {
    return { value: null, error: "OT hours divisor must be a valid number." };
  }
  if (num <= 0) {
    return { value: null, error: "OT hours divisor must be greater than zero." };
  }
  return { value: num, error: null };
}

export function calculatePayroll(
  emp: Employee,
  attendance: Attendance[],
  loans: Loan[],
  deductions: EmployeeDeduction[],
  daysInMonth: number,
  requiredDays: number,
  payrollPeriodId: string,
  componentSettings: PayrollComponentSettings = {}
) {
  const components = { ...DEFAULT_COMPONENTS, ...componentSettings };
  const basic = Number(emp.basic_salary);
  const attAllowance = Number(emp.attendance_allowance);
  const fuelAllowanceEarly = Number(emp.fuel_allowance);
  const travelAllowanceEarly = Number(emp.travel_allowance);
  const gross = basic + attAllowance;
  // Gross used for late-deduction rate = Basic + ALL allowances
  const grossForLate = basic + attAllowance + fuelAllowanceEarly + travelAllowanceEarly;

  // Calculate attendance days (Present=1, Half Day=0.5, Leave=1 if approved)
  let attendanceDays = 0;
  let noPayDays = 0;
  let totalOtPay = 0;
  let totalLateMinutes = 0;

  for (const a of attendance) {
    if (a.status === "Present") attendanceDays += 1;
    else if (a.status === "Half Day") attendanceDays += 0.5;
    else if (a.status === "Leave") attendanceDays += 1;
    else if (a.status === "No Pay") noPayDays += 1;

    const divisor = components.ot_hours_divisor > 0 ? components.ot_hours_divisor : 240;
    const hourlyRate = basic / divisor;
    const otPay = hourlyRate * Number(a.ot_multiplier) * Number(a.ot_hours);
    totalOtPay += otPay;
    totalLateMinutes += a.late_minutes;
  }
  if (!components.ot_enabled) totalOtPay = 0;

  // No Pay Deduction = (Gross / Days in Month) × No Pay Days
  const noPayDeduction = round2((gross / daysInMonth) * noPayDays);

  // Late Pay Deduction = (Gross / (30 × 9 × 60)) × Late Minutes
  //   - 30 working days, 9 hours per day, 60 minutes per hour
  //   - Clamp late minutes at 0 so bad data never produces a credit.
  const latePerMinute = grossForLate / (30 * 9 * 60);
  const lateMinutesClamped = Math.max(0, totalLateMinutes);
  const latePayDeduction = components.late_deduction_enabled
    ? round2(latePerMinute * lateMinutesClamped)
    : 0;

  // Extra Pay: only if Attendance Days > Required Days
  const extraDays = Math.max(0, attendanceDays - requiredDays);
  const extraPay = round2((gross / daysInMonth) * extraDays);

  totalOtPay = round2(totalOtPay);

  const fuelAllowance = fuelAllowanceEarly;
  const travelAllowance = travelAllowanceEarly;

  const totalEarnings = round2(
    gross + totalOtPay + extraPay + fuelAllowance + travelAllowance
  );

  // EPF Salary = Basic - (No Pay + Late Pay), floor at 0
  const epfSalary = round2(Math.max(0, basic - (noPayDeduction + latePayDeduction)));
  const epfEmployee = components.epf_enabled ? round2(epfSalary * 0.08) : 0;
  const epfEmployer = components.epf_enabled ? round2(epfSalary * 0.12) : 0;
  const etfEmployer = components.etf_enabled ? round2(epfSalary * 0.03) : 0;

  // Loan deductions (from loans table)
  let loanDeduction = 0;
  for (const loan of loans) {
    loanDeduction += Number(loan.monthly_deduction);
  }
  loanDeduction = round2(loanDeduction);

  // Deductions from employee_deductions table (by type)
  let welfare = 0;
  let salaryAdvance = 0;
  let recoveries = 0;
  let deposits = 0;
  let otherDeductions = 0;

  for (const d of deductions) {
    if (!d.is_active) continue;
    // Skip installment-based deductions with zero remaining balance
    if (!d.is_recurring && d.remaining_balance <= 0) continue;

    const amount = Number(d.monthly_deduction);
    switch (d.deduction_type) {
      case "Welfare": welfare += amount; break;
      case "Salary Advance": salaryAdvance += amount; break;
      case "Recovery": recoveries += amount; break;
      case "Deposit": deposits += amount; break;
      case "Loan": loanDeduction += amount; break;
      case "Other": otherDeductions += amount; break;
    }
  }

  welfare = round2(welfare);
  salaryAdvance = round2(salaryAdvance);
  recoveries = round2(recoveries);
  deposits = round2(deposits);
  otherDeductions = round2(otherDeductions);

  // Total Deductions = EPF 8% + Welfare + Salary Advance + Loans + Recoveries + Deposits + Other
  const totalDeductions = round2(
    epfEmployee + welfare + salaryAdvance + loanDeduction + recoveries + deposits + otherDeductions
  );
  const netSalary = round2(Math.max(0, totalEarnings - totalDeductions));

  return {
    payroll_period_id: payrollPeriodId,
    employee_id: emp.id,
    basic_salary: basic,
    attendance_allowance: attAllowance,
    attendance_days: attendanceDays,
    no_pay_days: noPayDays,
    late_minutes: totalLateMinutes,
    gross_salary: gross,
    no_pay_deduction: noPayDeduction,
    late_pay_deduction: latePayDeduction,
    extra_pay: extraPay,
    ot_pay: totalOtPay,
    fuel_allowance: fuelAllowance,
    travel_allowance: travelAllowance,
    other_allowances: 0,
    bonus: 0,
    incentives: 0,
    total_earnings: totalEarnings,
    epf_salary: epfSalary,
    epf_employee: epfEmployee,
    epf_employer: epfEmployer,
    etf_employer: etfEmployer,
    welfare,
    salary_advance: salaryAdvance,
    deposits,
    recoveries,
    loan_deduction: loanDeduction,
    other_deductions: otherDeductions,
    other_deduction_reason: null,
    total_deductions: totalDeductions,
    net_salary: netSalary,
  };
}
