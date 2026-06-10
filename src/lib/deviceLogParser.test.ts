import { describe, expect, it } from "vitest";
import { processDeviceLog } from "./deviceLogParser";

const employees = [
  { id: "employee-a", employee_no: "09", nic_number: "901234567V", biometric_id: "101" },
];

describe("device log parser reliability", () => {
  it("returns identical records and unmatched IDs on repeated imports", () => {
    const content = [
      "Name User ID Date Time Status",
      "Vijayakumar Aravindan 101 06/01/2026 08:02 C/In",
      "Vijayakumar Aravindan 101 06/01/2026 17:05 C/In",
      "Unknown Employee 999 06/01/2026 08:00 C/In",
      "Unknown Employee 999 06/01/2026 17:00 C/Out",
    ].join("\n");

    const first = processDeviceLog(content, employees, "08:00");
    const second = processDeviceLog(content, employees, "08:00");

    expect(second).toEqual(first);
    expect(first.totalParsed).toBe(4);
    expect(first.records).toEqual([
      expect.objectContaining({ employee_id: "employee-a", date: "2026-01-06", in_time: "08:02", out_time: "17:05" }),
    ]);
    expect(first.unmatchedUserIds).toEqual([{ userId: "999", deviceName: "Unknown Employee" }]);
  });

  it("matches old NIC suffixes and classifies a lone evening punch as OUT", () => {
    const content = [
      "Name User ID Date Time Status",
      "Employee One 901234567 06/02/2026 17:00 C/In",
    ].join("\n");

    const result = processDeviceLog(content, employees, "08:00");

    expect(result.unmatchedUserIds).toEqual([]);
    expect(result.records[0]).toEqual(expect.objectContaining({ in_time: null, out_time: "17:00", is_flagged: true, late_minutes: 0 }));
  });

  it("keeps the first punch in a headerless file and normalizes numeric IDs", () => {
    const content = [
      "Employee One 101.0 13/06/2026 08:00 C/In",
      "Employee One 101.0 13/06/2026 17:00 C/Out",
    ].join("\n");

    const result = processDeviceLog(content, employees, "08:00");

    expect(result.totalParsed).toBe(2);
    expect(result.records[0]).toEqual(expect.objectContaining({ date: "2026-06-13", in_time: "08:00", out_time: "17:00" }));
  });

  it("rejects impossible calendar dates", () => {
    const content = "Employee One 101 31/02/2026 08:00 C/In";
    const result = processDeviceLog(content, employees, "08:00");

    expect(result.totalParsed).toBe(0);
    expect(result.records).toEqual([]);
    expect(result.parseErrors[0]?.reason).toContain("Unrecognized date");
  });
});