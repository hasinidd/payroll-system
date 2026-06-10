/**
 * Aggregate OT hours and effective OT multiplier per employee from a set of
 * attendance records. Payroll entries only persist `ot_pay`, so payslip exports
 * rely on this aggregation to display real OT hours and the effective multiplier.
 *
 * - Rows with `ot_hours <= 0` are ignored (they contribute nothing).
 * - The effective multiplier is an hours-weighted average of each row's multiplier,
 *   which preserves total OT pay when hours are multiplied by the returned multiplier.
 * - If an employee has no positive-hour rows, they will not appear in the map.
 */
export interface OtAttendanceRow {
  employee_id: string;
  ot_hours?: number | string | null;
  ot_multiplier?: number | string | null;
}

export interface OtAggregate {
  hours: number;
  multiplier: number;
}

export function aggregateOtByEmployee(
  rows: OtAttendanceRow[] | null | undefined
): Map<string, OtAggregate> {
  const map = new Map<string, OtAggregate>();
  if (!rows || rows.length === 0) return map;

  const totals = new Map<string, { hours: number; weighted: number }>();
  for (const r of rows) {
    const h = Number(r.ot_hours) || 0;
    if (h <= 0) continue;
    const m = Number(r.ot_multiplier) || 1.5;
    const cur = totals.get(r.employee_id) ?? { hours: 0, weighted: 0 };
    cur.hours += h;
    cur.weighted += h * m;
    totals.set(r.employee_id, cur);
  }
  for (const [empId, t] of totals) {
    map.set(empId, {
      hours: t.hours,
      multiplier: t.hours > 0 ? t.weighted / t.hours : 1.5,
    });
  }
  return map;
}