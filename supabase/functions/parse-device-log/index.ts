import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Chunk configuration — keeps each AI call small enough to finish well
// under the edge-function/gateway timeout window.
// Each punch costs ~55 output tokens; the model caps output around 4k tokens,
// so anything above ~30 lines per chunk risks a truncated tool-call payload.
const CHUNK_LINES = 25;
const MAX_PARALLEL = 3;
const PER_CALL_TIMEOUT_MS = 75_000;
const MAX_ATTEMPTS = 3;

type RawPunch = {
  device_id: string;
  device_name: string;
  date: string;
  time: string;
};

type ParsedRecord = {
  employee_id: string;
  date: string;
  in_time: string | null;
  out_time: string | null;
  status: "Present";
  late_minutes: number;
  is_flagged: boolean;
  ot_hours: number;
  ot_multiplier: number;
};

function detectDateOrder(content: string): "DMY" | "MDY" | "ISO" {
  let dmy = 0;
  let mdy = 0;
  let iso = 0;
  for (const match of content.matchAll(/\b(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})\b/g)) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (match[1].length === 4) iso++;
    else if (first > 12 && second <= 12) dmy++;
    else if (second > 12 && first <= 12) mdy++;
  }
  if (iso > dmy && iso > mdy) return "ISO";
  return mdy > dmy ? "MDY" : "DMY";
}

function buildSystemPrompt(dateOrder: "DMY" | "MDY" | "ISO") {
  return `You are a biometric attendance device log parser. Extract raw punches from device exports whose columns, separators, and labels may vary.

RULES:
1. Parse each data line into device_id, device_name, date, and time. Copy device_id exactly from the file; never invent or transform it.
2. The format may vary — it could be tab-separated, fixed-width, CSV, or other formats. Adapt accordingly.
3. Return every punch separately. Do not match employees, merge days, calculate attendance, or return database IDs.
4. Ignore C/In and C/Out direction labels; they are often wrong and are not needed.
5. Convert valid times to 24-hour HH:MM.
6. The full file was deterministically detected as ${dateOrder}. Apply that same order to every row, including ambiguous dates, and convert dates to YYYY-MM-DD.
7. Skip headers and non-data lines. Preserve the device name when present, otherwise use an empty string.`;
}

const schema = {
  name: "parse_attendance",
  description: "Extract raw biometric punches without matching employees",
  parameters: {
    type: "object",
    properties: {
      punches: {
        type: "array",
        items: {
          type: "object",
          properties: {
            device_id: { type: "string" },
            device_name: { type: "string" },
            date: { type: "string" },
            time: { type: "string" },
          },
          required: ["device_id", "device_name", "date", "time"],
          additionalProperties: false,
        },
      },
    },
    required: ["punches"],
    additionalProperties: false,
  },
};

async function parseChunk(
  systemPrompt: string,
  chunkText: string,
  apiKey: string
): Promise<RawPunch[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);
  try {
    const gatewayUrl = Deno.env.get("AI_GATEWAY_URL") ?? "https://api.openai.com/v1/chat/completions";
    const response = await fetch(gatewayUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extract every raw punch from this device log chunk:\n\n${chunkText}` },
        ],
        tools: [{ type: "function", function: schema }],
        tool_choice: { type: "function", function: { name: "parse_attendance" } },
        max_tokens: 8000,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        response.status === 429
          ? "AI rate limit exceeded. Please try again in a moment."
          : response.status === 402
          ? "AI credits exhausted. Please add funds in Settings → Workspace → Usage."
          : `AI gateway error ${response.status}: ${errText.slice(0, 300)}`
      );
    }
    const aiResult = await response.json();
    const finishReason = aiResult.choices?.[0]?.finish_reason;
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) throw new Error("AI did not return structured output");
    if (finishReason === "length") {
      // Output hit the token cap: the JSON payload is truncated and punches
      // would be silently lost. Force the caller to split and retry.
      throw new Error("TRUNCATED_OUTPUT");
    }
    let parsed: { punches?: RawPunch[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      throw new Error("TRUNCATED_OUTPUT");
    }
    return Array.isArray(parsed.punches) ? parsed.punches : [];
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("AI chunk timed out after 75 seconds");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Parses a chunk, splitting it in half and retrying whenever the model
// truncates its output or the call times out. Guarantees no chunk is dropped
// unless every retry level fails.
async function parseChunkResilient(
  systemPrompt: string,
  chunkText: string,
  apiKey: string,
  depth = 0
): Promise<RawPunch[]> {
  try {
    return await parseChunk(systemPrompt, chunkText, apiKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const retryable = msg === "TRUNCATED_OUTPUT" || msg.includes("timed out");
    const lines = chunkText.split("\n").filter((l) => l.trim());
    if (!retryable || depth >= MAX_ATTEMPTS || lines.length < 2) throw e;
    const mid = Math.ceil(lines.length / 2);
    const halves = [lines.slice(0, mid).join("\n"), lines.slice(mid).join("\n")];
    console.log(`Splitting chunk (${lines.length} lines) after "${msg}" at depth ${depth}`);
    const out: RawPunch[] = [];
    for (const half of halves) {
      out.push(...(await parseChunkResilient(systemPrompt, half, apiKey, depth + 1)));
    }
    return out;
  }
}

function normalizeIdentifier(value: unknown): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\.0+$/, "");
}

// Device IDs sometimes arrive with junk glued on ("738550587,device_name:",
// "842581338?device_name=OUR COMPANY", "883233948 drug"). Keep only the first
// identifier token so matching works.
function sanitizeDeviceId(value: unknown): string {
  const raw = normalizeIdentifier(value);
  if (!raw) return "";
  const token = raw.split(/[\s,;:?=|/\\]+/)[0] ?? "";
  const cleaned = token.replace(/[^A-Za-z0-9]+$/, "").replace(/^[^A-Za-z0-9]+/, "");
  return cleaned || raw;
}

function normalizeNic(value: unknown): string {
  return normalizeIdentifier(value).replace(/[VvXx]$/, "");
}

function validDate(value: unknown): string | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? text : null;
}

function validTime(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;
}

function buildEmployeeMap(employees: any[]): Map<string, string> {
  const map = new Map<string, string>();
  const add = (prefix: string, value: unknown, id: unknown, nic = false) => {
    const key = nic ? normalizeNic(value) : normalizeIdentifier(value);
    if (key && typeof id === "string" && !map.has(`${prefix}:${key}`)) map.set(`${prefix}:${key}`, id);
  };
  for (const employee of employees) add("bio", employee.biometric_id, employee.id);
  for (const employee of employees) add("emp", employee.employee_no, employee.id);
  for (const employee of employees) add("nic", employee.nic_number, employee.id, true);
  return map;
}

function matchEmployee(deviceId: string, employeeMap: Map<string, string>): string | null {
  const exact = sanitizeDeviceId(deviceId);
  if (!exact) return null;
  const nic = normalizeNic(exact);
  const direct = employeeMap.get(`bio:${exact}`) ?? employeeMap.get(`emp:${exact}`) ?? employeeMap.get(`nic:${nic}`);
  if (direct) return direct;
  // Last resort: the leading digit run (handles ids fused with trailing words).
  const digits = exact.match(/^\d+/)?.[0] ?? "";
  if (digits && digits !== exact) {
    return employeeMap.get(`bio:${digits}`) ?? employeeMap.get(`emp:${digits}`) ?? employeeMap.get(`nic:${digits}`) ?? null;
  }
  return null;
}

function processPunches(all: RawPunch[], employees: any[], shiftStart: string) {
  const [sh, sm] = shiftStart.split(":").map((n) => parseInt(n, 10));
  const shiftMinutes = (sh || 0) * 60 + (sm || 0);
  const employeeMap = buildEmployeeMap(employees);
  const grouped = new Map<string, { employeeId: string; date: string; times: Set<string> }>();
  const unmatched = new Map<string, string>();
  let invalidPunches = 0;

  for (const punch of all) {
    const deviceId = sanitizeDeviceId(punch?.device_id);
    const date = validDate(punch?.date);
    const time = validTime(punch?.time);
    if (!deviceId || !date || !time) { invalidPunches++; continue; }
    const employeeId = matchEmployee(deviceId, employeeMap);
    if (!employeeId) {
      if (!unmatched.has(deviceId)) unmatched.set(deviceId, String(punch?.device_name ?? "").trim() || deviceId);
      continue;
    }
    const key = `${employeeId}|${date}`;
    const group = grouped.get(key) ?? { employeeId, date, times: new Set<string>() };
    group.times.add(time);
    grouped.set(key, group);
  }

  const result: ParsedRecord[] = [];
  for (const group of grouped.values()) {
    const times = Array.from(group.times).sort();
    const toMinutes = (t: string) => {
      const [hh, mm] = t.split(":").map(Number);
      return hh * 60 + mm;
    };
    let inTime: string | null = times[0] ?? null;
    let outTime: string | null = times.length > 1 ? times[times.length - 1] : null;

    // A lone punch late in the day is an OUT punch, not a very late arrival.
    // Without this, 17:00 was read as in_time and produced ~540 "late minutes".
    if (inTime && !outTime && toMinutes(inTime) >= shiftMinutes + 300) {
      outTime = inTime;
      inTime = null;
    }

    const lateMinutes = inTime ? Math.max(0, toMinutes(inTime) - shiftMinutes) : 0;
    result.push({
      employee_id: group.employeeId,
      date: group.date,
      in_time: inTime,
      out_time: outTime,
      status: "Present",
      // Anything beyond a half day of lateness is a bad punch pair, not real lateness.
      late_minutes: lateMinutes > 300 ? 0 : lateMinutes,
      is_flagged: !inTime || !outTime,
      ot_hours: 0,
      ot_multiplier: 1.5,
    });
  }
  return {
    records: result,
    unmatchedUserIds: Array.from(unmatched, ([userId, deviceName]) => ({ userId, deviceName })),
    invalidPunches,
  };
}

// ---------------------------------------------------------------------------
// Layout-descriptor parsing.
// The AI looks at a small sample ONCE and returns HOW the file is laid out
// (delimiter, column order, date order, header lines). Code then extracts all
// rows deterministically. The model never touches the bulk rows, so IDs can't
// be garbled, punches can't be dropped by truncation, and re-imports of the
// same file always produce identical results.
// ---------------------------------------------------------------------------

type LayoutDescriptor = {
  skip_lines: number;
  delimiter: "tab" | "comma" | "semicolon" | "pipe" | "whitespace";
  device_id_index: number;
  device_name_index: number;
  date_index: number;
  time_index: number;
  datetime_index: number;
  date_order: "DMY" | "MDY" | "ISO";
};

const layoutSchema = {
  name: "describe_layout",
  description: "Describe the column layout of a biometric device log file",
  parameters: {
    type: "object",
    properties: {
      skip_lines: { type: "integer", description: "Number of leading header/banner lines" },
      delimiter: { type: "string", enum: ["tab", "comma", "semicolon", "pipe", "whitespace"] },
      device_id_index: { type: "integer", description: "0-based column holding the device/user id" },
      device_name_index: { type: "integer", description: "0-based column holding the person name, -1 if absent" },
      date_index: { type: "integer", description: "0-based column holding the date, -1 if combined with time" },
      time_index: { type: "integer", description: "0-based column holding the time, -1 if combined with date" },
      datetime_index: { type: "integer", description: "0-based column holding a combined date+time value, -1 if separate" },
      date_order: { type: "string", enum: ["DMY", "MDY", "ISO"] },
    },
    required: [
      "skip_lines", "delimiter", "device_id_index", "device_name_index",
      "date_index", "time_index", "datetime_index", "date_order",
    ],
    additionalProperties: false,
  },
};

async function detectLayout(sample: string, apiKey: string): Promise<LayoutDescriptor | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const gatewayUrl = Deno.env.get("AI_GATEWAY_URL") ?? "https://api.openai.com/v1/chat/completions";
    const response = await fetch(gatewayUrl, {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You analyse biometric attendance device log files. Given a sample of the first lines, describe the file LAYOUT only. Never extract data. Column indexes are 0-based after splitting a data line on the delimiter you report. Use -1 for columns that do not exist.",
          },
          { role: "user", content: `Describe the layout of this device log:\n\n${sample}` },
        ],
        tools: [{ type: "function", function: layoutSchema }],
        tool_choice: { type: "function", function: { name: "describe_layout" } },
        max_tokens: 500,
      }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args) as LayoutDescriptor;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const DELIMITER_RE: Record<LayoutDescriptor["delimiter"], RegExp> = {
  tab: /\t+/,
  comma: /\s*,\s*/,
  semicolon: /\s*;\s*/,
  pipe: /\s*\|\s*/,
  whitespace: /\t+|\s{2,}/,
};

const DATE_RE = /\b(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})\b/;
const TIME_RE = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?/;

function toIsoDate(text: string, order: "DMY" | "MDY" | "ISO"): string | null {
  const m = text.match(DATE_RE);
  if (!m) return null;
  let y: number, mo: number, d: number;
  if (m[1].length === 4 || order === "ISO") {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
  } else if (order === "MDY") {
    mo = Number(m[1]); d = Number(m[2]); y = Number(m[3]);
  } else {
    d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
  }
  if (y < 100) y += 2000;
  // Self-correct impossible month/day pairs rather than dropping the row.
  if (mo > 12 && d <= 12) { const t = mo; mo = d; d = t; }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return validDate(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
}

function toIsoTime(text: string): string | null {
  const m = text.match(TIME_RE);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return validTime(`${hour}:${String(minute).padStart(2, "0")}`);
}

function pick(cols: string[], index: number): string {
  return index >= 0 && index < cols.length ? cols[index] : "";
}

// Applies the descriptor to every line. Falls back, per line, to a positional
// scan (first token = id, first date-looking token = date, first time-looking
// token = time) so a slightly-off descriptor still parses the row.
function extractWithLayout(content: string, layout: LayoutDescriptor) {
  const lines = content.split(/\r?\n/);
  const dataLines = lines.slice(Math.max(0, layout.skip_lines || 0));
  const splitter = DELIMITER_RE[layout.delimiter] ?? DELIMITER_RE.whitespace;
  const punches: RawPunch[] = [];
  let considered = 0;
  let failed = 0;

  for (const rawLine of dataLines) {
    const line = rawLine.trim();
    if (!line) continue;
    // Only lines that carry both a date and a time can be punches.
    if (!DATE_RE.test(line) || !TIME_RE.test(line)) continue;
    considered++;

    const cols = line.split(splitter).map((c) => c.trim()).filter((c) => c !== "");
    const dateSource = layout.datetime_index >= 0
      ? pick(cols, layout.datetime_index)
      : pick(cols, layout.date_index);
    const timeSource = layout.datetime_index >= 0
      ? pick(cols, layout.datetime_index)
      : pick(cols, layout.time_index);

    const date = toIsoDate(dateSource, layout.date_order) ?? toIsoDate(line, layout.date_order);
    // Collect every clock value on the line (some exports put IN and OUT in
    // separate columns on one row). A time token always contains a colon, so
    // numeric id/card columns can never be mistaken for one.
    const withoutDate = line.replace(DATE_RE, " ");
    const times = new Set<string>();
    const primary = toIsoTime(timeSource);
    if (primary) times.add(primary);
    for (const m of withoutDate.matchAll(new RegExp(TIME_RE.source, "g"))) {
      const t = toIsoTime(m[0]);
      if (t) times.add(t);
    }
    const idCol = pick(cols, layout.device_id_index);
    const deviceId = sanitizeDeviceId(idCol) || sanitizeDeviceId(cols[0] ?? "");
    const deviceName = pick(cols, layout.device_name_index);

    if (!date || times.size === 0 || !deviceId) { failed++; continue; }
    for (const time of times) {
      punches.push({ device_id: deviceId, device_name: deviceName, date, time });
    }
  }

  return { punches, considered, failed };
}

// Runs the AI parse and writes result to the jobs table. Designed to be
// invoked via EdgeRuntime.waitUntil so it survives the client disconnecting.
async function runParseJob(params: {
  jobId: string;
  fileContent: string;
  employees: any[];
  shiftStartTime: string;
  adminClient: ReturnType<typeof createClient>;
}) {
  const { jobId, fileContent, employees, shiftStartTime, adminClient } = params;
  const AI_API_KEY = Deno.env.get("AI_API_KEY");
  try {
    await adminClient
      .from("device_log_import_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", jobId);

    if (!AI_API_KEY) throw new Error("AI_API_KEY is not configured");

    const detectedOrder = detectDateOrder(fileContent);

    // --- Pass 1: one small AI call detects the layout, code extracts rows. ---
    const sample = fileContent.split(/\r?\n/).slice(0, 25).join("\n");
    const layout = await detectLayout(sample, AI_API_KEY);
    if (layout) {
      // The whole-file date-order detection is deterministic; trust it over
      // the model's guess from a 25-line sample.
      layout.date_order = detectedOrder;
      const extracted = extractWithLayout(fileContent, layout);
      const failRate = extracted.considered > 0 ? extracted.failed / extracted.considered : 1;
      console.log(
        `Layout parse: ${extracted.punches.length}/${extracted.considered} rows (fail rate ${(failRate * 100).toFixed(1)}%)`,
        JSON.stringify(layout)
      );
      if (extracted.punches.length > 0 && failRate <= 0.1) {
        const processedFast = processPunches(extracted.punches, employees, shiftStartTime);
        await adminClient
          .from("device_log_import_jobs")
          .update({
            status: "completed",
            result: {
              records: processedFast.records,
              unmatchedUserIds: processedFast.unmatchedUserIds,
              totalParsed: extracted.punches.length,
              invalidPunches: processedFast.invalidPunches,
              chunkErrors: [],
              parseMode: "layout",
            },
            error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId);
        return;
      }
      console.log("Layout parse rejected — falling back to row-level AI parsing");
    }

    // --- Pass 2 (fallback): chunked row-level AI parsing. ---
    const systemPrompt = buildSystemPrompt(detectedOrder);

    // Split file into line-based chunks so each AI call finishes quickly.
    const lines = fileContent.split(/\r?\n/);
    const chunks: string[] = [];
    for (let i = 0; i < lines.length; i += CHUNK_LINES) {
      const slice = lines.slice(i, i + CHUNK_LINES).join("\n").trim();
      if (slice) chunks.push(slice);
    }
    if (chunks.length === 0) throw new Error("Empty file — nothing to parse");

    console.log(`Parsing ${lines.length} lines in ${chunks.length} chunks`);

    const allPunches: RawPunch[] = [];
    const errors: string[] = [];

    // Process in bounded-parallel batches so we don't burst the gateway.
    for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
      const batch = chunks.slice(i, i + MAX_PARALLEL);
      const results = await Promise.allSettled(
        batch.map((c) => parseChunkResilient(systemPrompt, c, AI_API_KEY))
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          allPunches.push(...r.value);
        } else {
          errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }
      // Progress ping — keep updated_at fresh so the client can tell it's alive.
      await adminClient
        .from("device_log_import_jobs")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", jobId);
    }

    // Never publish a partial import. Previously a single failed chunk still
    // produced a "completed" job, which made missing IDs/days vary by run.
    if (errors.length > 0) {
      throw new Error(`AI parse was incomplete (${errors.length} chunk failure${errors.length === 1 ? "" : "s"}). First error: ${errors[0]}`);
    }

    const processed = processPunches(allPunches, employees, shiftStartTime);
    const result = {
      records: processed.records,
      unmatchedUserIds: processed.unmatchedUserIds,
      totalParsed: allPunches.length,
      invalidPunches: processed.invalidPunches,
      chunkErrors: errors,
      parseMode: "ai-rows",
    };

    await adminClient
      .from("device_log_import_jobs")
      .update({ status: "completed", result, error: null, updated_at: new Date().toISOString() })
      .eq("id", jobId);
  } catch (e) {
    console.error("parse-device-log background error:", e);
    await adminClient
      .from("device_log_import_jobs")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("Backend configuration is incomplete");

    const supabase = createClient(
      supabaseUrl,
      anonKey,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { fileContent, employees, shiftStartTime, fileName } = body ?? {};

    if (typeof fileContent !== "string" || !fileContent.trim() || !Array.isArray(employees) ||
        typeof shiftStartTime !== "string" || !/^\d{2}:\d{2}/.test(shiftStartTime)) {
      return new Response(
        JSON.stringify({ error: "Invalid file content, employee list, or shift start time" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (fileContent.length > 10 * 1024 * 1024 || employees.length > 10_000) {
      return new Response(
        JSON.stringify({ error: "Import exceeds the supported size" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the service role client to write job status regardless of caller session
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: jobRow, error: jobErr } = await adminClient
      .from("device_log_import_jobs")
      .insert({
        user_id: userData.user.id,
        status: "pending",
        file_name: fileName ?? null,
        shift_start_time: shiftStartTime,
      })
      .select("id")
      .single();

    if (jobErr || !jobRow) {
      throw new Error(`Failed to create job: ${jobErr?.message ?? "unknown"}`);
    }

    const jobId = jobRow.id as string;

    // Kick off background processing. EdgeRuntime.waitUntil keeps the isolate
    // alive after the response is sent, so the parse continues even if the
    // browser tab is closed.
    const bgTask = runParseJob({
      jobId,
      fileContent,
      employees,
      shiftStartTime,
      adminClient,
    });
    // @ts-ignore EdgeRuntime is provided by Supabase Deno runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(bgTask);
    } else {
      // Best-effort in local dev
      bgTask.catch((e) => console.error("bg task error:", e));
    }

    return new Response(JSON.stringify({ jobId }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-device-log error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
