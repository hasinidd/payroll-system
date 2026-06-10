interface DeviceLogEntry {
  userId: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  direction: "in" | "out" | "unknown";
}

export interface ParseError {
  line: number;
  reason: string;
  raw: string;
}

export type DateOrder = "DMY" | "MDY" | "ISO" | "ambiguous";

export interface DateFormatDetection {
  order: DateOrder;
  /** DMY: first token > 12 in some row */
  dmyEvidence: number;
  /** MDY: second token > 12 in some row */
  mdyEvidence: number;
  /** Rows that fit either (both nums ≤ 12) */
  ambiguous: number;
  /** Rows already in YYYY-MM-DD */
  iso: number;
  /** Total candidate date strings scanned */
  total: number;
  /** Human-readable label for the UI */
  label: string;
}

/**
 * Read a File as text with smart encoding detection.
 * Handles UTF-8 BOM, UTF-16 LE/BE BOM, and falls back to UTF-8.
 * Many fingerprint devices export TXT files in UTF-16LE which breaks `file.text()`.
 */
export async function readFileSmart(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // UTF-16 LE BOM
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  // UTF-16 BE BOM
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  // UTF-8 BOM
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  // Heuristic: lots of NUL bytes at even/odd positions → likely UTF-16 without BOM
  if (bytes.length > 32) {
    let zerosEven = 0;
    let zerosOdd = 0;
    const sample = Math.min(bytes.length, 512);
    for (let i = 0; i < sample; i++) {
      if (bytes[i] === 0) {
        if (i % 2 === 0) zerosEven++;
        else zerosOdd++;
      }
    }
    if (zerosOdd > sample * 0.2 && zerosEven < 4) {
      return new TextDecoder("utf-16le").decode(bytes);
    }
    if (zerosEven > sample * 0.2 && zerosOdd < 4) {
      return new TextDecoder("utf-16be").decode(bytes);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * Convert 12-hour time (e.g. "5:01 PM") to 24-hour HH:MM format.
 */
function to24h(timeStr: string): string {
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return timeStr;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m}`;
}

/**
 * Normalize time to HH:MM — handles HH:MM:SS, HH:MM, and 12-hour formats.
 */
function normalizeTime(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  // 12-hour format
  if (/[APap][Mm]/.test(trimmed)) return to24h(trimmed);
  // HH:MM:SS → HH:MM
  const hms = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hms) {
    const h = String(parseInt(hms[1], 10)).padStart(2, "0");
    return `${h}:${hms[2]}`;
  }
  return trimmed;
}

/**
 * Convert DD/MM/YYYY or M/D/YYYY to YYYY-MM-DD.
 */
function toISODate(dateStr: string, order: DateOrder = "DMY"): string | null {
  const trimmed = dateStr.trim();
  // Already ISO?
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${String(parseInt(iso[2], 10)).padStart(2, "0")}-${String(parseInt(iso[3], 10)).padStart(2, "0")}`;
  }
  // Accept / . or - as separators
  const parts = trimmed.split(/[\/\.\-]/);
  if (parts.length !== 3) return null;
  let [a, b, y] = parts;
  // YYYY-first?
  if (y.length !== 4 && a.length === 4) {
    [y, b, a] = [a, b, y];
    // now a=day, b=month — but we don't know order; fall through
  }
  if (y.length !== 4) return null;
  const n1 = parseInt(a, 10);
  const n2 = parseInt(b, 10);
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return null;
  // Structural evidence always wins over the hinted order.
  let day: number, month: number;
  if (n1 > 12) { day = n1; month = n2; }
  else if (n2 > 12) { month = n1; day = n2; }
  else if (order === "MDY") { month = n1; day = n2; }
  else { day = n1; month = n2; } // DMY / ISO / ambiguous → Sri Lankan default DD/MM
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = new Date(Date.UTC(Number(y), month - 1, day));
  if (candidate.getUTCFullYear() !== Number(y) || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const DATE_LIKE = /\b(\d{1,4})[\/\.\-](\d{1,2})[\/\.\-](\d{1,4})\b/g;

/**
 * Scan raw text for date-like tokens and infer DD/MM vs MM/DD.
 * Structural evidence (a number > 12 in one slot) is authoritative.
 * When only ambiguous rows are present we default to Sri Lankan DD/MM.
 */
export function detectDateFormat(content: string): DateFormatDetection {
  let dmy = 0, mdy = 0, amb = 0, iso = 0, total = 0;
  const matches = content.matchAll(DATE_LIKE);
  for (const m of matches) {
    const a = m[1], b = m[2], c = m[3];
    // ISO YYYY-MM-DD (or YYYY/MM/DD)
    if (a.length === 4) { iso++; total++; continue; }
    if (c.length !== 4 && c.length !== 2) continue;
    const n1 = parseInt(a, 10);
    const n2 = parseInt(b, 10);
    if (!Number.isFinite(n1) || !Number.isFinite(n2)) continue;
    total++;
    if (n1 > 12 && n2 <= 12) dmy++;
    else if (n2 > 12 && n1 <= 12) mdy++;
    else if (n1 <= 12 && n2 <= 12) amb++;
  }

  let order: DateOrder;
  let label: string;
  if (dmy > 0 && mdy === 0) { order = "DMY"; label = "DD/MM/YYYY (detected)"; }
  else if (mdy > 0 && dmy === 0) { order = "MDY"; label = "MM/DD/YYYY (detected)"; }
  else if (dmy > 0 && mdy > 0) {
    // Mixed evidence — trust majority, but flag as ambiguous in label.
    if (dmy >= mdy) { order = "DMY"; label = `DD/MM/YYYY (mixed: ${dmy} DMY vs ${mdy} MDY rows)`; }
    else { order = "MDY"; label = `MM/DD/YYYY (mixed: ${mdy} MDY vs ${dmy} DMY rows)`; }
  } else if (iso > 0 && amb === 0) { order = "ISO"; label = "YYYY-MM-DD (ISO)"; }
  else if (amb > 0) { order = "DMY"; label = "DD/MM/YYYY (default — all dates ambiguous)"; }
  else { order = "ambiguous"; label = "unknown"; }

  return { order, dmyEvidence: dmy, mdyEvidence: mdy, ambiguous: amb, iso, total, label };
}

/**
 * Auto-detect and parse device log content.
 * Returns entries, unique device user info for unmatched reporting, and per-line parse errors.
 */
export function parseDeviceLog(content: string): {
  entries: DeviceLogEntry[];
  deviceUsers: Map<string, string>;
  errors: ParseError[];
  dateFormat: DateFormatDetection;
} {
  // Strip BOM, normalize line endings (\r\n, \r → \n), drop blank lines
  const normalized = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n");
  const lines = rawLines.map((l) => l.replace(/\s+$/, ""));
  if (lines.filter((l) => l.trim()).length < 1) {
    return {
      entries: [], deviceUsers: new Map(), errors: [],
      dateFormat: { order: "ambiguous", dmyEvidence: 0, mdyEvidence: 0, ambiguous: 0, iso: 0, total: 0, label: "unknown" },
    };
  }

  const dateFormat = detectDateFormat(normalized);

  // Tab format detection: any non-blank line (after the first) with >=3 tab-separated cells
  const hasTabData = lines.some(
    (l) => l.includes("\t") && l.split("\t").filter((c) => c.trim()).length >= 3
  );

  const errors: ParseError[] = [];
  const entries = hasTabData
    ? parseTabFormat(lines, errors, dateFormat.order)
    : parseFixedWidthFormat(lines, errors, dateFormat.order);

  // Build deviceUsers map: userId → name from device
  const deviceUsers = new Map<string, string>();
  for (const e of entries) {
    if (!deviceUsers.has(e.userId) && e.name && e.name !== e.userId) {
      deviceUsers.set(e.userId, e.name);
    }
  }

  return { entries, deviceUsers, errors, dateFormat };
}

/**
 * Parse tab-separated format (Daily_Log format).
 * Header-driven: detects User-ID, Name, Date, and any number of time columns.
 */
function parseTabFormat(lines: string[], errors: ParseError[], order: DateOrder = "DMY"): DeviceLogEntry[] {
  const entries: DeviceLogEntry[] = [];

  // Try to find a header row to identify column indexes
  let headerIdx = -1;
  let idCol = -1, nameCol = -1, dateCol = -1;
  const timeRegex = /^\s*\d{1,2}:\d{2}(:\d{2})?\s*([APap][Mm])?\s*$/;
  const dateRegex = /^\s*\d{1,4}[\/\.\-]\d{1,2}[\/\.\-]\d{1,4}\s*$/;

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = lines[i].split("\t").map((c) => c.trim().toLowerCase());
    if (cols.length < 3) continue;
    const hasIdHeader = cols.findIndex((c) => /^(no\.?|user[\s_-]?id|emp(loyee)?[\s_-]?(no|id|number)?|enroll(ment)?[\s_-]?(no|id)?|id)$/i.test(c));
    const hasDateHeader = cols.findIndex((c) => /^(date|day)$/i.test(c));
    const hasNameHeader = cols.findIndex((c) => /^name$/i.test(c));
    if (hasIdHeader >= 0 && hasDateHeader >= 0) {
      headerIdx = i;
      idCol = hasIdHeader;
      nameCol = hasNameHeader;
      dateCol = hasDateHeader;
      break;
    }
  }

  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const cols = raw.split("\t").map((c) => c.trim());
    if (cols.length < 3) {
      errors.push({ line: i + 1, reason: "Too few columns", raw });
      continue;
    }

    // Fallback to defaults when no header was detected
    const userId = headerIdx >= 0 ? cols[idCol] : (cols[1] || cols[0]);
    const name = (headerIdx >= 0 && nameCol >= 0 ? cols[nameCol] : cols[2]) || userId;
    const dateRaw = headerIdx >= 0 ? cols[dateCol] : (cols[4] || cols[3]);

    if (!userId || !dateRaw) {
      errors.push({ line: i + 1, reason: "Missing user ID or date", raw });
      continue;
    }
    const isoDate = toISODate(dateRaw, order);
    if (!isoDate) {
      errors.push({ line: i + 1, reason: `Unrecognized date "${dateRaw}"`, raw });
      continue;
    }

    // Collect every cell that looks like a time
    const times: string[] = [];
    for (let j = 0; j < cols.length; j++) {
      if (j === idCol || j === nameCol || j === dateCol) continue;
      const cell = cols[j];
      if (cell && timeRegex.test(cell)) {
        const t = normalizeTime(cell);
        if (t) times.push(t);
      }
    }

    if (times.length === 0) {
      entries.push({ userId, name, date: isoDate, time: "", direction: "unknown" });
      continue;
    }
    // Sort and treat earliest = in, latest = out
    times.sort();
    entries.push({ userId, name, date: isoDate, time: times[0], direction: "in" });
    if (times.length > 1) {
      entries.push({ userId, name, date: isoDate, time: times[times.length - 1], direction: "out" });
    }
  }
  return entries;
}

/**
 * Parse fixed-width / space-separated format with C/In, C/Out status.
 */
function parseFixedWidthFormat(lines: string[], errors: ParseError[], order: DateOrder = "DMY"): DeviceLogEntry[] {
  const entries: DeviceLogEntry[] = [];
  // Tolerant: looser whitespace, accept HH:MM with or without AM/PM and HH:MM:SS,
  // accept C/In, C/Out, In, Out, I, O status tokens (or no status at all).
  // Tolerant: name/userId/date may be separated by any whitespace run (single or multiple
  // spaces, or tabs). Non-greedy name plus required date anchor makes the split unambiguous.
  const regex = /^\s*(\S.*?)\s+(\S+)\s+(\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap][Mm])?)\s*(C\/?In|C\/?Out|In|Out|\bI\b|\bO\b)?/;

  // Start at the first line: genuine header rows naturally fail the anchored
  // data regex, while headerless exports keep their first punch.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const match = line.match(regex);
    if (!match) {
      // Heuristic: lines that clearly look like data (contain a date + time) but didn't match
      if (/\d{1,2}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4}/.test(line) && /\d{1,2}:\d{2}/.test(line)) {
        errors.push({ line: i + 1, reason: "Could not parse row", raw: line });
      }
      continue;
    }

    const name = match[1];
    const userId = match[2];
    const dateRaw = match[3];
    const timeRaw = match[4];
    const status = (match[5] || "").toLowerCase();

    const isoDate = toISODate(dateRaw, order);
    if (!isoDate) {
      errors.push({ line: i + 1, reason: `Unrecognized date "${dateRaw}"`, raw: line });
      continue;
    }
    const time24 = normalizeTime(timeRaw);
    let direction: "in" | "out" | "unknown" = "unknown";
    if (status.includes("in") || status === "i") direction = "in";
    else if (status.includes("out") || status === "o") direction = "out";

    // Heuristic: fingerprint devices often stamp every punch as "C/In" by mistake.
    // A punch at/after noon is almost never a shift-start check-in for Sri Lankan
    // day shifts — treat it as unknown so mergeEntries can assign it as OUT.
    if (direction === "in" && time24) {
      const [hh] = time24.split(":").map(Number);
      if (Number.isFinite(hh) && hh >= 12) direction = "unknown";
    }

    entries.push({ userId, name, date: isoDate, time: time24, direction });
  }
  return entries;
}

/**
 * Merge entries: per userId+date, take earliest in, latest out.
 */
export function mergeEntries(
  entries: DeviceLogEntry[]
): Map<string, Map<string, { inTime: string | null; outTime: string | null }>> {
  const grouped = new Map<string, Map<string, { firstIn: string | null; firstOut: string | null; allTimes: string[] }>>();

  for (const e of entries) {
    if (!grouped.has(e.userId)) grouped.set(e.userId, new Map());
    const userMap = grouped.get(e.userId)!;
    if (!userMap.has(e.date)) userMap.set(e.date, { firstIn: null, firstOut: null, allTimes: [] });
    const day = userMap.get(e.date)!;

    if (!e.time) continue;
    day.allTimes.push(e.time);

    if (e.direction === "in") {
      if (!day.firstIn || e.time < day.firstIn) day.firstIn = e.time;
    } else if (e.direction === "out") {
      if (!day.firstOut || e.time > day.firstOut) day.firstOut = e.time;
    } else {
      if (!day.firstIn || e.time < day.firstIn) day.firstIn = e.time;
      if (!day.firstOut || e.time > day.firstOut) day.firstOut = e.time;
    }
  }

  const result = new Map<string, Map<string, { inTime: string | null; outTime: string | null }>>();
  for (const [userId, dateMap] of grouped) {
    result.set(userId, new Map());
    for (const [date, { firstIn, firstOut, allTimes }] of dateMap) {
      let inTime = firstIn;
      let outTime = firstOut && firstOut !== firstIn ? firstOut : null;
      // Fallback: device logged multiple punches but all under the same direction
      // (e.g. both stamped "C/In"). Treat earliest as in and latest as out when
      // they are far enough apart to be plausibly a workday span (> 30 min).
      if (!outTime && allTimes.length >= 2) {
        const sorted = [...allTimes].sort();
        const earliest = sorted[0];
        const latest = sorted[sorted.length - 1];
        if (earliest !== latest) {
          const [eh, em] = earliest.split(":").map(Number);
          const [lh, lm] = latest.split(":").map(Number);
          const diffMin = (lh * 60 + lm) - (eh * 60 + em);
          if (diffMin >= 30) {
            inTime = earliest;
            outTime = latest;
          }
        }
      }
      result.get(userId)!.set(date, { inTime, outTime });
    }
  }

  return result;
}

/**
 * Match device User IDs to employee NIC/employee numbers (exact match only).
 */
export function matchEmployees(
  deviceUserIds: string[],
  employees: { id: string; nic_number: string; employee_no: string; biometric_id?: string | null }[]
): Map<string, string> {
  const mapping = new Map<string, string>();
  const normId = (s: string) => (s ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\.0+$/, "");
  // Normalize NIC: strip trailing V/X (old Sri Lankan NIC suffix) so a purely
  // numeric device ID like "732591559" matches an employee NIC "732591559V".
  const normNic = (s: string) => normId(s).replace(/[VvXx]$/, "");
  for (const userId of deviceUserIds) {
    const trimmedUserId = normId(userId);
    if (!trimmedUserId) continue;
    const normUser = normNic(trimmedUserId);
    // Priority: biometric_id → employee_no → nic_number (with V/X stripped both sides)
    const match =
      employees.find((e) => normId(e.biometric_id ?? "") === trimmedUserId) ??
      employees.find((e) => normId(e.employee_no ?? "") === trimmedUserId) ??
      employees.find((e) => normNic(e.nic_number) === normUser);
    if (match) mapping.set(userId, match.id);
  }
  return mapping;
}

/**
 * Calculate late minutes based on shift start time.
 */
export function calculateLateMinutes(
  inTime: string | null,
  shiftStart: string
): number {
  if (!inTime) return 0;
  const [sh, sm] = shiftStart.split(":").map(Number);
  const timeParts = inTime.split(":").map(Number);
  const ih = timeParts[0], im = timeParts[1];
  const shiftMinutes = sh * 60 + sm;
  const inMinutes = ih * 60 + im;
  const late = Math.max(0, inMinutes - shiftMinutes);
  // More than 5 hours "late" means the punch pair is wrong (an OUT punch read as IN),
  // not real lateness — report 0 and let the row stay flagged for review.
  return late > 300 ? 0 : late;
}

/**
 * Process the full import: parse, merge, match, calculate.
 * Returns records, unmatched IDs with device names, and total parsed count.
 */
export function processDeviceLog(
  content: string,
  employees: { id: string; nic_number: string; employee_no: string; biometric_id?: string | null }[],
  shiftStartTime: string
): {
  records: {
    employee_id: string;
    date: string;
    in_time: string | null;
    out_time: string | null;
    status: "Present" | "Half Day";
    late_minutes: number;
    is_flagged: boolean;
    ot_hours: number;
    ot_multiplier: number;
  }[];
  unmatchedUserIds: { userId: string; deviceName: string }[];
  totalParsed: number;
  parseErrors: ParseError[];
  dateFormat: DateFormatDetection;
} {
  const { entries, deviceUsers, errors, dateFormat } = parseDeviceLog(content);
  const merged = mergeEntries(entries);
  const userIds = Array.from(merged.keys());
  const employeeMap = matchEmployees(userIds, employees);
  const unmatchedUserIds = userIds
    .filter((id) => !employeeMap.has(id))
    .map((id) => ({ userId: id, deviceName: deviceUsers.get(id) || id }));

  const records: any[] = [];

  for (const [userId, dateMap] of merged) {
    const employeeId = employeeMap.get(userId);
    if (!employeeId) continue;

    for (const [date, punch] of dateMap) {
      let { inTime, outTime } = punch;
      // A single punch made well after shift start is an OUT punch, not a late arrival.
      if (inTime && !outTime) {
        const [sh, sm] = shiftStartTime.split(":").map(Number);
        const [ih, im] = inTime.split(":").map(Number);
        if (ih * 60 + im >= sh * 60 + sm + 300) {
          outTime = inTime;
          inTime = null;
        }
      }
      const existing = records.find(
        (r) => r.employee_id === employeeId && r.date === date
      );

      if (existing) {
        if (inTime && (!existing.in_time || inTime < existing.in_time)) existing.in_time = inTime;
        if (outTime && (!existing.out_time || outTime > existing.out_time)) existing.out_time = outTime;
        existing.is_flagged = !existing.in_time || !existing.out_time;
        existing.late_minutes = calculateLateMinutes(existing.in_time, shiftStartTime);
        continue;
      }

      records.push({
        employee_id: employeeId,
        date,
        in_time: inTime,
        out_time: outTime,
        status: "Present" as const,
        late_minutes: calculateLateMinutes(inTime, shiftStartTime),
        is_flagged: !inTime || !outTime,
        ot_hours: 0,
        ot_multiplier: 1.5,
      });
    }
  }

  return { records, unmatchedUserIds, totalParsed: entries.length, parseErrors: errors, dateFormat };
}
