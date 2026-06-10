import { useState, useRef, useMemo, Fragment, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Upload, AlertTriangle, Pencil, Trash2, Check, X, Search, Filter, Download, ChevronDown, ChevronRight, User, UserPlus } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { EmployeeAttendanceDialog } from "@/components/attendance/EmployeeAttendanceDialog";
import { QuickRegisterDialog } from "@/components/attendance/QuickRegisterDialog";
import { BulkRegisterDialog } from "@/components/attendance/BulkRegisterDialog";
import { processDeviceLog, readFileSmart, type ParseError } from "@/lib/deviceLogParser";
import { validateLateMinutes } from "@/lib/payroll";
import { generateAttendanceSummaryPDF, generateAttendanceSummaryExcel, type AttendanceSummaryEntry } from "@/lib/reports/attendanceSummary";

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

type ImportFilter = "all" | "flagged" | "clean";

const Attendance = () => {
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);
  const [unmatchedIds, setUnmatchedIds] = useState<{ userId: string; deviceName: string }[]>([]);
  const [otherBranchHits, setOtherBranchHits] = useState<Record<string, string>>({});
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [detectedDateFormat, setDetectedDateFormat] = useState<{ order: string; label: string; dmyEvidence: number; mdyEvidence: number; ambiguous: number; iso: number; total: number } | null>(null);
  const [editingImportIdx, setEditingImportIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ in_time: "", out_time: "", late_minutes: "", status: "Present", ot_hours: "0", ot_multiplier: "1.5" });
  const [form, setForm] = useState({ employee_id: "", date: "", status: "Present" as any, in_time: "", out_time: "", ot_hours: "0", ot_multiplier: "1.5", late_minutes: "0" });
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [empDialogOpen, setEmpDialogOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState("");
  const [importFilter, setImportFilter] = useState<ImportFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { branchId } = useBranch();
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<null | "selected" | "all">(null);
  const [quickRegisterDevice, setQuickRegisterDevice] = useState<{ userId: string; deviceName: string } | null>(null);
  const [bulkRegisterOpen, setBulkRegisterOpen] = useState(false);
  const lastFileRef = useRef<{ content: string; name: string } | null>(null);

  const { data: employees } = useQuery({
    queryKey: ["employees-list", branchId],
    queryFn: async () => {
      let q = supabase.from("employees").select("id, employee_no, first_name, last_name, nic_number, biometric_id").eq("status", "Active").order("employee_no");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: company } = useQuery({
    queryKey: ["company-settings", branchId],
    queryFn: async () => {
      let q = supabase.from("company_settings").select("*");
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q.limit(1).single();
      return data;
    },
  });

  // Per-employee, per-month component toggles (OT / EPF / ETF).
  // Row absent → treat as all-on (default). Row present → use its flags.
  const { data: monthFlags } = useQuery({
    queryKey: ["month-flags", month, year, branchId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("monthly_ot_adjustments")
        .select("employee_id, include_ot, include_epf, include_etf, ot_hours, ot_multiplier")
        .eq("year", year)
        .eq("month", month);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, { include_ot: boolean; include_epf: boolean; include_etf: boolean; ot_hours: number; ot_multiplier: number }>();
      (data ?? []).forEach((r: any) => map.set(r.employee_id, {
        include_ot: r.include_ot !== false,
        include_epf: r.include_epf !== false,
        include_etf: r.include_etf !== false,
        ot_hours: Number(r.ot_hours) || 0,
        ot_multiplier: Number(r.ot_multiplier) || 1.5,
      }));
      return map;
    },
  });

  const toggleFlagMutation = useMutation({
    mutationFn: async (args: { employeeId: string; field: "include_ot" | "include_epf" | "include_etf"; value: boolean }) => {
      // Fetch full existing row so we don't wipe ot_hours / ot_multiplier / note.
      const { data: existing, error: fetchErr } = await (supabase as any)
        .from("monthly_ot_adjustments")
        .select("*")
        .eq("employee_id", args.employeeId)
        .eq("year", year)
        .eq("month", month)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const payload: any = {
        employee_id: args.employeeId,
        branch_id: existing?.branch_id ?? branchId,
        year,
        month,
        ot_hours: existing?.ot_hours ?? 0,
        ot_multiplier: existing?.ot_multiplier ?? 1.5,
        note: existing?.note ?? null,
        include_ot: existing?.include_ot ?? true,
        include_epf: existing?.include_epf ?? true,
        include_etf: existing?.include_etf ?? true,
      };
      payload[args.field] = args.value;
      const { error } = await (supabase as any)
        .from("monthly_ot_adjustments")
        .upsert(payload, { onConflict: "employee_id,year,month" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["month-flags", month, year, branchId] });
      queryClient.invalidateQueries({ queryKey: ["monthly-ot-adjustment"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update toggle"),
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ["attendance", month, year, branchId],
    queryFn: async () => {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      let q = supabase
        .from("attendance")
        .select("*, employees(employee_no, first_name, last_name)")
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: false });
      if (branchId) q = q.eq("branch_id", branchId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const employeeSummaries = useMemo(() => {
    if (!records || !employees) return [];
    const map = new Map<string, { employee: any; records: any[]; present: number; leave: number; noPay: number; halfDay: number; totalLate: number; totalOT: number; conflicts: number; manualOt: boolean }>();
    for (const emp of employees) {
      map.set(emp.id, { employee: emp, records: [], present: 0, leave: 0, noPay: 0, halfDay: 0, totalLate: 0, totalOT: 0, conflicts: 0, manualOt: false });
    }
    for (const r of records) {
      const entry = map.get(r.employee_id);
      if (!entry) continue;
      entry.records.push(r);
      if (r.status === "Present") entry.present++;
      else if (r.status === "Leave") entry.leave++;
      else if (r.status === "No Pay") entry.noPay++;
      else if (r.status === "Half Day") entry.halfDay++;
      entry.totalLate += r.late_minutes || 0;
      entry.totalOT += Number(r.ot_hours) || 0;
      if (r.is_flagged) entry.conflicts++;
    }
    // Monthly manual OT override replaces the per-day sum (matches payroll behaviour).
    if (monthFlags) {
      for (const [empId, flag] of monthFlags) {
        const entry = map.get(empId);
        if (!entry) continue;
        if (flag.ot_hours > 0) {
          entry.totalOT = flag.ot_hours;
          entry.manualOt = true;
        }
      }
    }
    return Array.from(map.values())
      .filter((e) => e.records.length > 0)
      .sort((a, b) => String(a.employee.employee_no).localeCompare(String(b.employee.employee_no), undefined, { numeric: true, sensitivity: "base" }));
  }, [records, employees, monthFlags]);

  const filteredSummaries = employeeSummaries.filter((s) => {
    if (!empSearch) return true;
    const q = empSearch.toLowerCase();
    return s.employee.employee_no.toLowerCase().includes(q) || s.employee.first_name.toLowerCase().includes(q) || s.employee.last_name.toLowerCase().includes(q);
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const lm = validateLateMinutes(form.late_minutes);
      if (lm.error) throw new Error(lm.error);
      const { error } = await supabase.from("attendance").insert({
        employee_id: form.employee_id, date: form.date, status: form.status,
        in_time: form.in_time || null, out_time: form.out_time || null,
        ot_hours: parseFloat(form.ot_hours), ot_multiplier: parseFloat(form.ot_multiplier),
        late_minutes: lm.value ?? 0,
        branch_id: branchId,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["attendance"] }); toast.success("Attendance recorded"); setDialogOpen(false); },
    onError: (err: any) => toast.error(err.message),
  });

  const importMutation = useMutation({
    mutationFn: async (importRecords: any[]) => {
      if (!branchId) throw new Error("No branch selected. Please select a branch before importing attendance.");
      // 1. Sanitize to real table columns + drop rows without a matched employee
      const clean = importRecords
        .filter((r) => r.employee_id && r.date)
        .map((r) => ({
          employee_id: r.employee_id as string,
          date: r.date as string,
          status: r.status ?? "Present",
          in_time: r.in_time || null,
          out_time: r.out_time || null,
          ot_hours: Number(r.ot_hours) || 0,
          ot_multiplier: Number(r.ot_multiplier) || 1.5,
          late_minutes: Math.max(0, Math.round(Number(r.late_minutes) || 0)),
          is_flagged: !!r.is_flagged,
          branch_id: branchId,
        }));
      const skipped = importRecords.length - clean.length;

      // 2. Dedupe (employee_id + date) — last one wins
      const byKey = new Map<string, typeof clean[number]>();
      for (const r of clean) byKey.set(`${r.employee_id}|${r.date}`, r);
      const rows = Array.from(byKey.values());
      if (rows.length === 0) throw new Error("Nothing to import — no rows matched a registered employee.");

      // 3. Remove existing rows for those employees within the imported date range
      const dates = rows.map((r) => r.date).sort();
      const empIds = Array.from(new Set(rows.map((r) => r.employee_id)));
      for (let i = 0; i < empIds.length; i += 100) {
        const { error: delErr } = await supabase
          .from("attendance")
          .delete()
          .eq("branch_id", branchId)
          .in("employee_id", empIds.slice(i, i + 100))
          .gte("date", dates[0])
          .lte("date", dates[dates.length - 1]);
        if (delErr) throw delErr;
      }

      // 4. Insert in batches
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { data, error } = await supabase.from("attendance").insert(batch).select("id");
        if (error) throw error;
        inserted += data?.length ?? 0;
      }

      // 5. Verify what actually landed in the database
      const { count, error: cErr } = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .gte("date", dates[0])
        .lte("date", dates[dates.length - 1]);
      if (cErr) throw cErr;

      const first = new Date(dates[0] + "T00:00:00");
      return { inserted, skipped, verified: count ?? 0, month: first.getMonth() + 1, year: first.getFullYear() };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["month-flags"] });
      queryClient.invalidateQueries({ queryKey: ["flagged-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-ot-adjustment"] });
      // Jump the view to the month that was imported so the records are visible
      setMonth(res.month);
      setYear(res.year);
      toast.success(
        `Saved ${res.inserted} records${res.skipped ? ` · ${res.skipped} skipped (unmatched)` : ""} — ${res.verified} rows now in the database for this period`
      );
      setImportDialogOpen(false);
      setImportPreview(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (mode: "selected" | "all") => {
      if (!branchId) throw new Error("No branch selected.");
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      let q = supabase.from("attendance").delete()
        .eq("branch_id", branchId)
        .gte("date", startDate)
        .lte("date", endDate);
      if (mode === "selected") {
        const ids = Array.from(selectedEmpIds);
        if (ids.length === 0) throw new Error("No employees selected.");
        q = q.in("employee_id", ids);
      }
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_d, mode) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(mode === "all" ? "Deleted all attendance for the month" : "Deleted attendance for selected employees");
      setSelectedEmpIds(new Set());
      setConfirmDelete(null);
    },
    onError: (err: any) => { toast.error(err.message); setConfirmDelete(null); },
  });

  const toggleSelect = (id: string) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [isParsing, setIsParsing] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"pending" | "processing" | "completed" | "failed" | null>(null);
  const localResultRef = useRef<ReturnType<typeof processDeviceLog> | null>(null);
  const JOB_STORAGE_KEY = "deviceLogActiveJobId";
  const STALE_JOB_MS = 4 * 60 * 1000;

  const failStaleJob = useCallback(async (jobId: string) => {
    await (supabase as any)
      .from("device_log_import_jobs")
      .update({ status: "failed", error: "Timed out — no backend progress" })
      .eq("id", jobId);
    localStorage.removeItem(JOB_STORAGE_KEY);
    setActiveJobId(null);
    setJobStatus("failed");
    setIsParsing(false);
    toast.error("Previous AI parse timed out. Please import the file again.");
  }, []);

  const presentResult = useCallback((
    data: any,
    localResult: ReturnType<typeof processDeviceLog> | null,
    source: "device" | "AI" = "AI"
  ) => {
    const parsed: any[] = Array.isArray(data?.records) ? data.records : [];
    const unmatchedUserIds: any[] = Array.isArray(data?.unmatchedUserIds) ? data.unmatchedUserIds : [];
    const totalParsed: number = data?.totalParsed ?? parsed.length;

    for (const r of parsed) {
      if (r.in_time && r.out_time && r.in_time === r.out_time) {
        r.out_time = null;
        r.is_flagged = true;
      }
    }

    if (parsed.length === 0) {
      toast.error("No records parsed. Check the file format and encoding.");
      setParseErrors(localResult?.parseErrors ?? []);
      setImportPreview([]);
      setUnmatchedIds(localResult?.unmatchedUserIds ?? []);
      setImportFilter("all");
      setImportDialogOpen(true);
      return;
    }

    setImportPreview(parsed);
    setUnmatchedIds(
      unmatchedUserIds.map((id: any) => {
        if (id && typeof id === "object" && "userId" in id) return id;
        const localMatch = localResult?.unmatchedUserIds.find((u) => u.userId === id);
        return { userId: id, deviceName: localMatch?.deviceName ?? id };
      })
    );
    setParseErrors(localResult?.parseErrors ?? []);
    setImportFilter("all");
    setImportDialogOpen(true);
    if (unmatchedUserIds.length > 0) toast.warning(`${unmatchedUserIds.length} device IDs could not be matched`);
    toast.success(`${source === "device" ? "Device log" : "AI"} parsed ${totalParsed} entries → ${parsed.length} records`);
  }, []);

  // Poll the background job until it finishes.
  useEffect(() => {
    if (!activeJobId) return;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      if (cancelled) return;
      attempts++;
      const { data, error } = await supabase
        .from("device_log_import_jobs" as any)
        .select("status, result, error, updated_at")
        .eq("id", activeJobId)
        .maybeSingle();

      if (error) {
        console.warn("Job poll error:", error.message);
        if (attempts < 200) setTimeout(tick, 3000);
        return;
      }
      if (!data) {
        // Job was deleted — clear.
        setActiveJobId(null);
        setJobStatus(null);
        localStorage.removeItem(JOB_STORAGE_KEY);
        return;
      }

      const row = data as any;
      setJobStatus(row.status);

      if ((row.status === "pending" || row.status === "processing") && row.updated_at) {
        const ageMs = Date.now() - new Date(row.updated_at).getTime();
        if (ageMs > STALE_JOB_MS) {
          await failStaleJob(activeJobId);
          return;
        }
      }

      if (row.status === "completed") {
        localStorage.removeItem(JOB_STORAGE_KEY);
        presentResult(row.result ?? {}, localResultRef.current);
        setActiveJobId(null);
        setIsParsing(false);
      } else if (row.status === "failed") {
        localStorage.removeItem(JOB_STORAGE_KEY);
        toast.error(`AI parse failed: ${row.error ?? "unknown error"}`);
        setActiveJobId(null);
        setIsParsing(false);
      } else {
        // Still pending/processing — poll again.
        if (attempts < 200) setTimeout(tick, 3000);
        else {
          toast.warning("AI parse is taking longer than expected. Check back later.");
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
    };
  }, [activeJobId, failStaleJob, presentResult]);

  // On mount, resume any job left running from a previous session.
  useEffect(() => {
    const stored = localStorage.getItem(JOB_STORAGE_KEY);
    if (stored) {
      (async () => {
        const { data } = await supabase
          .from("device_log_import_jobs" as any)
          .select("id, status, updated_at")
          .eq("id", stored)
          .maybeSingle();
        const job = data as any;
        if (!job || job.status === "failed") {
          localStorage.removeItem(JOB_STORAGE_KEY);
          return;
        }
        if ((job.status === "pending" || job.status === "processing") && job.updated_at) {
          const ageMs = Date.now() - new Date(job.updated_at).getTime();
          if (ageMs > STALE_JOB_MS) {
            await failStaleJob(job.id);
            return;
          }
        }
        setActiveJobId(stored);
        setIsParsing(true);
        toast.info("Resuming AI parse in the background...");
      })();
      return;
    }
    // Also look up the most recent pending/processing/completed job for this user
    // that hasn't been consumed yet.
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { data } = await supabase
        .from("device_log_import_jobs" as any)
        .select("id, status, updated_at")
        .eq("user_id", uid)
        .in("status", ["pending", "processing"])
        .order("created_at", { ascending: false })
        .limit(1);
      const job = (data as any[])?.[0];
      if (job) {
        const ageMs = Date.now() - new Date(job.updated_at).getTime();
        // If the job hasn't been touched in > 4 minutes, the edge function
        // isolate died. Don't resume — surface it as failed.
        if (ageMs > STALE_JOB_MS) {
          await failStaleJob(job.id);
          return;
        }
        setActiveJobId(job.id);
        setIsParsing(true);
        toast.info("A background AI parse is still running. Resuming...");
      }
    })();
  }, [failStaleJob]);

  // Unmatched IDs are often not "new" employees — they belong to a different
  // branch than the one currently selected. Look them up across all branches
  // the admin can see so we can warn instead of creating duplicates.
  useEffect(() => {
    if (unmatchedIds.length === 0) { setOtherBranchHits({}); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("employee_no, first_name, last_name, nic_number, biometric_id, branch_id, branches(name)")
        .neq("branch_id", branchId ?? "00000000-0000-0000-0000-000000000000");
      if (cancelled || !data) return;
      const norm = (v: any) => String(v ?? "").trim().replace(/[VvXx]$/, "");
      const hits: Record<string, string> = {};
      for (const u of unmatchedIds) {
        const key = norm(u.userId);
        const hit = (data as any[]).find(
          (e) => norm(e.biometric_id) === key || norm(e.employee_no) === key || norm(e.nic_number) === key
        );
        if (hit) hits[u.userId] = `${(hit.branches as any)?.name ?? "another branch"} — ${hit.employee_no} ${hit.first_name} ${hit.last_name}`;
      }
      setOtherBranchHits(hits);
    })();
    return () => { cancelled = true; };
  }, [unmatchedIds, branchId]);

  const runParse = async (content: string, fileName: string, employeeList: any[]) => {
    const shiftStart = (company as any)?.shift_start_time?.slice(0, 5) ?? "08:00";
    setIsParsing(true);

    try {
      // Prefer the deterministic parser for recognized device formats. Unlike an
      // LLM, it returns the same punches on every run and cannot silently omit rows.
      // AI remains the fallback for formats the deterministic parser cannot read.
      const localResult = processDeviceLog(
        content,
        employeeList.map((emp: any) => ({
          id: emp.id,
          nic_number: (emp.nic_number ?? "").trim(),
          employee_no: (emp.employee_no ?? "").trim(),
          biometric_id: (emp.biometric_id ?? "").trim(),
        })),
        shiftStart
      );
      localResultRef.current = localResult;
      setDetectedDateFormat(localResult.dateFormat ?? null);

      if (localResult.totalParsed > 0) {
        presentResult(localResult, localResult, "device");
        setJobStatus(null);
        setIsParsing(false);
        return;
      }

      toast.info("AI is parsing your device log in the background — you can leave this page.");

      const response = await supabase.functions.invoke("parse-device-log", {
        body: {
          fileContent: content,
          fileName,
          employees: employeeList.map((emp: any) => ({
            id: emp.id,
            nic_number: (emp.nic_number ?? "").trim(),
            employee_no: (emp.employee_no ?? "").trim(),
            biometric_id: (emp.biometric_id ?? "").trim(),
          })),
          shiftStartTime: shiftStart,
        },
      });

      if (response.error) throw new Error(response.error.message || "Failed to start AI parse");
      if (response.data?.error) throw new Error(response.data.error);
      const jobId: string | undefined = response.data?.jobId;
      if (!jobId) throw new Error("AI parser did not create a background job. Please retry.");

      localStorage.setItem(JOB_STORAGE_KEY, jobId);
      setActiveJobId(jobId);
      setJobStatus("pending");
      // isParsing stays true until job resolves
    } catch (err: any) {
      console.error("Parse error:", err);
      toast.error(err.message || "Failed to parse device log");
      setIsParsing(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employees) return;
    if (file.size === 0) {
      toast.error("The selected file is empty.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File is larger than 10MB. Please split it into smaller files.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    let content: string;
    try {
      content = await readFileSmart(file);
    } catch (err: any) {
      toast.error(`Could not read file: ${err?.message ?? "unknown error"}`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (!content.trim()) {
      toast.error("File contains no readable text. Check the file encoding.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    lastFileRef.current = { content, name: file.name };
    if (fileInputRef.current) fileInputRef.current.value = "";
    await runParse(content, file.name, employees);
  };

  // Re-run the import automatically after quick/bulk registration so newly
  // linked device IDs are picked up without re-uploading the file.
  const autoReimport = async () => {
    const last = lastFileRef.current;
    if (!last) {
      toast.info("Registered. Import the device log file again to pull in their attendance.");
      return;
    }
    const { data: fresh } = await queryClient.fetchQuery({
      queryKey: ["employees-list", branchId],
      queryFn: async () => {
        let q = supabase.from("employees").select("id, employee_no, first_name, last_name, nic_number, biometric_id").eq("status", "Active").order("employee_no");
        if (branchId) q = q.eq("branch_id", branchId);
        const { data, error } = await q;
        if (error) throw error;
        return data;
      },
    }).then((d) => ({ data: d as any[] }));
    setImportDialogOpen(false);
    toast.info("Re-importing the device log with the newly registered employees...");
    await runParse(last.content, last.name, fresh ?? []);
  };

  const bulkRegisterAll = async (
    assignments: { userId: string; employeeId: string }[]
  ) => {
    for (const a of assignments) {
      const { error } = await supabase.from("employees").update({ biometric_id: a.userId }).eq("id", a.employeeId);
      if (error) throw error;
    }
    const done = new Set(assignments.map((a) => a.userId));
    setUnmatchedIds((prev) => prev.filter((u) => !done.has(u.userId)));
    queryClient.invalidateQueries({ queryKey: ["employees-list"] });
    toast.success(`${assignments.length} device ID(s) linked`);
    await autoReimport();
  };

  const getEmployeeName = (employeeId: string, deviceName?: string | null) => {
    const emp = employees?.find((e) => e.id === employeeId);
    if (emp) return `${emp.employee_no} — ${emp.first_name} ${emp.last_name}`;
    return deviceName ? `${deviceName} (unmatched device)` : "Unmatched device ID";
  };

  const handleDeleteImportRow = (realIdx: number) => setImportPreview((prev) => prev ? prev.filter((_, i) => i !== realIdx) : null);

  const handleEditImportRow = (realIdx: number) => {
    const r = importPreview?.[realIdx];
    if (!r) return;
    setEditingImportIdx(realIdx);
    setEditForm({ in_time: r.in_time ?? "", out_time: r.out_time ?? "", late_minutes: String(r.late_minutes ?? 0), status: r.status ?? "Present", ot_hours: String(r.ot_hours ?? 0), ot_multiplier: String(r.ot_multiplier ?? 1.5) });
  };

  const handleSaveImportEdit = () => {
    if (editingImportIdx === null || !importPreview) return;
    const lm = validateLateMinutes(editForm.late_minutes);
    if (lm.error) { toast.error(lm.error); return; }
    const updated = [...importPreview];
    const outTime = editForm.out_time || null;
    updated[editingImportIdx] = {
      ...updated[editingImportIdx],
      in_time: editForm.in_time || null, out_time: outTime,
      late_minutes: lm.value ?? 0, status: editForm.status,
      ot_hours: parseFloat(editForm.ot_hours) || 0, ot_multiplier: parseFloat(editForm.ot_multiplier) || 1.5,
      is_flagged: !outTime,
    };
    setImportPreview(updated);
    setEditingImportIdx(null);
  };

  const flaggedCount = importPreview?.filter((r) => r.is_flagged).length ?? 0;
  const cleanCount = (importPreview?.length ?? 0) - flaggedCount;
  const monthName = new Date(year, month - 1).toLocaleString("default", { month: "long" });

  // Filter import preview rows
  const filteredImportPreview = useMemo(() => {
    if (!importPreview) return [];
    return importPreview
      .map((r, idx) => ({ ...r, _realIdx: idx }))
      .filter((r) => {
        if (importFilter === "flagged") return r.is_flagged;
        if (importFilter === "clean") return !r.is_flagged;
        return true;
      });
  }, [importPreview, importFilter]);

  // Group filtered import preview by employee for a structured, per-user view
  const groupedImportPreview = useMemo(() => {
    const map = new Map<string, { employeeId: string; name: string; rows: any[] }>();
    for (const r of filteredImportPreview) {
      const key = r.employee_id;
      if (!map.has(key)) {
        map.set(key, { employeeId: key, name: getEmployeeName(key, r.device_name ?? r.deviceName), rows: [] });
      }
      map.get(key)!.rows.push(r);
    }
    // Sort employees by name, and each employee's rows by date
    const groups = Array.from(map.values());
    groups.sort((a, b) => a.name.localeCompare(b.name));
    for (const g of groups) g.rows.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
    return groups;
  }, [filteredImportPreview, employees]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const buildAttendanceSummaryEntries = (): AttendanceSummaryEntry[] => {
    return employeeSummaries.map((s) => ({
      employee_no: s.employee.employee_no,
      employee_name: `${s.employee.first_name} ${s.employee.last_name}`.toUpperCase(),
      present_days: s.present,
      leave_days: s.leave,
      no_pay_days: s.noPay,
      half_days: s.halfDay,
      total_late_minutes: s.totalLate,
      total_ot_hours: s.totalOT,
    }));
  };

  const handleDownloadPDF = () => {
    const summary = buildAttendanceSummaryEntries();
    if (!summary.length) return toast.error("No attendance records");
    generateAttendanceSummaryPDF(summary, company?.company_name ?? "Company", monthName, year);
    toast.success("Attendance Summary PDF downloaded");
  };

  const handleDownloadExcel = () => {
    const summary = buildAttendanceSummaryEntries();
    if (!summary.length) return toast.error("No attendance records");
    generateAttendanceSummaryExcel(summary, monthName, year);
    toast.success("Attendance Summary Excel downloaded");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Attendance</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} disabled={!employeeSummaries.length}>
            <Download className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownloadExcel} disabled={!employeeSummaries.length}>
            <Download className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete("selected")}
            disabled={selectedEmpIds.size === 0 || bulkDeleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Selected ({selectedEmpIds.size})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmDelete("all")}
            disabled={!employeeSummaries.length || bulkDeleteMutation.isPending}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete Month
          </Button>
          <input ref={fileInputRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFileSelect} />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isParsing}>
            <Upload className="mr-2 h-4 w-4" />
            {activeJobId
              ? `AI parsing (${jobStatus ?? "pending"})...`
              : isParsing
              ? "Parsing..."
              : "Import Device Log"}
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Record
          </Button>
        </div>
      </div>

      {activeJobId && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span>
            AI is parsing your device log in the background. You can leave this page or close the tab — the result will appear here when it's ready.
          </span>
        </div>
      )}

      <div className="flex gap-4 items-center">
        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: 12 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>
                {new Date(2000, i).toLocaleString("default", { month: "long" })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        <div className="relative max-w-xs ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employee..." value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {/* Employee Cards Grid */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : filteredSummaries.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No attendance records for {monthName} {year}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredSummaries.map((s) => (
            <Card
              key={s.employee.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${s.conflicts > 0 ? "border-destructive" : ""} ${selectedEmpIds.has(s.employee.id) ? "ring-2 ring-primary" : ""}`}
              onClick={() => { setSelectedEmployee(s.employee); setEmpDialogOpen(true); }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedEmpIds.has(s.employee.id)}
                        onCheckedChange={() => toggleSelect(s.employee.id)}
                        aria-label="Select employee"
                      />
                    </span>
                    <div>
                      <p className="font-semibold text-sm">{s.employee.first_name} {s.employee.last_name}</p>
                      <p className="text-xs text-muted-foreground">{s.employee.employee_no}</p>
                    </div>
                  </div>
                  {s.conflicts > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      <AlertTriangle className="mr-1 h-3 w-3" /> {s.conflicts}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-1 text-center text-xs">
                  <div className="rounded bg-muted p-1.5">
                    <div className="font-bold text-sm">{s.present}</div>
                    <div className="text-muted-foreground">Present</div>
                  </div>
                  <div className="rounded bg-muted p-1.5">
                    <div className="font-bold text-sm">{s.leave}</div>
                    <div className="text-muted-foreground">Leave</div>
                  </div>
                  <div className="rounded bg-muted p-1.5">
                    <div className="font-bold text-sm">{s.noPay}</div>
                    <div className="text-muted-foreground">No Pay</div>
                  </div>
                  <div className="rounded bg-muted p-1.5">
                    <div className="font-bold text-sm">{s.halfDay}</div>
                    <div className="text-muted-foreground">Half</div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Late: {s.totalLate} min</span>
                  <span>
                    OT: {s.totalOT.toFixed(1)} hrs
                    {s.manualOt && <span className="ml-1 text-[10px] text-primary">(manual)</span>}
                  </span>
                </div>
                {(() => {
                  const f = monthFlags?.get(s.employee.id) ?? { include_ot: true, include_epf: true, include_etf: true };
                  const Item = ({ label, field, checked }: { label: string; field: "include_ot" | "include_epf" | "include_etf"; checked: boolean }) => (
                    <label
                      className="flex items-center gap-1 cursor-pointer select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          toggleFlagMutation.mutate({ employeeId: s.employee.id, field, value: !!v })
                        }
                        aria-label={`Include ${label}`}
                        className="h-3.5 w-3.5"
                      />
                      <span className={checked ? "text-foreground" : "text-muted-foreground line-through"}>{label}</span>
                    </label>
                  );
                  return (
                    <div
                      className="flex items-center justify-between gap-2 border-t pt-2 text-[11px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Item label="OT" field="include_ot" checked={f.include_ot} />
                      <Item label="EPF" field="include_epf" checked={f.include_epf} />
                      <Item label="ETF" field="include_etf" checked={f.include_etf} />
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Employee Detail Dialog */}
      <EmployeeAttendanceDialog
        open={empDialogOpen}
        onOpenChange={setEmpDialogOpen}
        employee={selectedEmployee}
        records={selectedEmployee ? (records?.filter((r: any) => r.employee_id === selectedEmployee.id) ?? []) : []}
        month={month}
        year={year}
      />

      <QuickRegisterDialog
        open={quickRegisterDevice !== null}
        onOpenChange={(o) => { if (!o) setQuickRegisterDevice(null); }}
        device={quickRegisterDevice}
        employees={employees ?? []}
        branchId={branchId ?? null}
        onRegistered={(userId) => {
          setUnmatchedIds((prev) => prev.filter((u) => u.userId !== userId));
          void autoReimport();
        }}
      />

      <BulkRegisterDialog
        open={bulkRegisterOpen}
        onOpenChange={setBulkRegisterOpen}
        devices={unmatchedIds}
        employees={employees ?? []}
        onSubmit={bulkRegisterAll}
      />

      {/* Import Preview Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import Preview — {importPreview?.length ?? 0} records</DialogTitle>
          </DialogHeader>

          {unmatchedIds.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-emerald-800 dark:text-emerald-200">Unmatched Device IDs ({unmatchedIds.length}):</strong>
                <Button size="sm" variant="outline" onClick={() => setBulkRegisterOpen(true)}>
                  <UserPlus className="mr-2 h-3.5 w-3.5" /> Bulk register
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {unmatchedIds.map((u) => (
                  <button
                    key={u.userId}
                    type="button"
                    onClick={() => setQuickRegisterDevice(u)}
                    title={otherBranchHits[u.userId] ? `Already exists in ${otherBranchHits[u.userId]}` : undefined}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                      otherBranchHits[u.userId]
                        ? "border-amber-400 bg-amber-100/70 dark:bg-amber-900/40 text-amber-900 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900"
                        : "border-emerald-400 bg-emerald-100/70 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-200 dark:hover:bg-emerald-900"
                    }`}
                  >
                    {u.deviceName !== u.userId ? `${u.deviceName} (${u.userId})` : u.userId}
                    <UserPlus className="h-3 w-3" />
                  </button>
                ))}
              </div>
              {Object.keys(otherBranchHits).length > 0 && (
                <p className="mt-2 rounded border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200">
                  <strong>{Object.keys(otherBranchHits).length}</strong> of these IDs already exist in a different branch
                  ({Array.from(new Set(Object.values(otherBranchHits).map((v) => v.split(" — ")[0]))).join(", ")}).
                  This log likely belongs to that branch — switch the branch selector and import again instead of registering
                  them here, otherwise you will create duplicate employees.
                </p>
              )}
              <p className="text-emerald-700 dark:text-emerald-400 mt-1.5 text-xs">
                These device User IDs don't match any employee. Click one to quick register, or use Bulk register to link several at once — the device log re-imports automatically afterwards.
              </p>
            </div>
          )}

          {parseErrors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded p-3 text-sm">
              <strong className="text-destructive">Skipped rows ({parseErrors.length}):</strong>
              <div className="mt-1 max-h-32 overflow-y-auto font-mono text-xs space-y-0.5">
                {parseErrors.slice(0, 50).map((e) => (
                  <div key={e.line} className="text-destructive/90">
                    Line {e.line}: {e.reason} — <span className="opacity-70">{e.raw.slice(0, 120)}</span>
                  </div>
                ))}
                {parseErrors.length > 50 && (
                  <div className="text-muted-foreground italic">…and {parseErrors.length - 50} more</div>
                )}
              </div>
              <p className="text-destructive/80 mt-1.5 text-xs">These rows could not be read but the rest of the file was imported normally.</p>
            </div>
          )}

          {/* Filter and stats bar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1">
                <Button
                  size="sm" variant={importFilter === "all" ? "default" : "outline"}
                  onClick={() => setImportFilter("all")} className="h-7 text-xs"
                >
                  All ({importPreview?.length ?? 0})
                </Button>
                <Button
                  size="sm" variant={importFilter === "flagged" ? "destructive" : "outline"}
                  onClick={() => setImportFilter("flagged")} className="h-7 text-xs"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" /> Flagged ({flaggedCount})
                </Button>
                <Button
                  size="sm" variant={importFilter === "clean" ? "default" : "outline"}
                  onClick={() => setImportFilter("clean")} className="h-7 text-xs"
                >
                  Clean ({cleanCount})
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Showing {filteredImportPreview.length} of {importPreview?.length ?? 0}
            </p>
          </div>

          {detectedDateFormat && detectedDateFormat.total > 0 && (
            <div
              className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${
                detectedDateFormat.dmyEvidence > 0 && detectedDateFormat.mdyEvidence > 0
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
                  : "border-border bg-muted/40 text-muted-foreground"
              }`}
            >
              <span className="font-medium text-foreground">Date format:</span>
              <span>{detectedDateFormat.label}</span>
              <span className="text-muted-foreground">
                · scanned {detectedDateFormat.total} dates
                {detectedDateFormat.dmyEvidence > 0 && ` · ${detectedDateFormat.dmyEvidence} DMY-only`}
                {detectedDateFormat.mdyEvidence > 0 && ` · ${detectedDateFormat.mdyEvidence} MDY-only`}
                {detectedDateFormat.ambiguous > 0 && ` · ${detectedDateFormat.ambiguous} ambiguous`}
                {detectedDateFormat.iso > 0 && ` · ${detectedDateFormat.iso} ISO`}
              </span>
              {detectedDateFormat.dmyEvidence > 0 && detectedDateFormat.mdyEvidence > 0 && (
                <span className="w-full text-[11px]">
                  ⚠ Mixed evidence detected — verify a few dates below before importing.
                </span>
              )}
            </div>
          )}

          <div className="rounded-md border max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[220px]">Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedImportPreview.map((group) => {
                  const isCollapsed = collapsedGroups.has(group.employeeId);
                  const flagged = group.rows.filter((r) => r.is_flagged).length;
                  const daysWorked = group.rows.length;
                  return (
                    <Fragment key={group.employeeId}>
                      <TableRow
                        className="bg-muted/60 hover:bg-muted cursor-pointer border-t-2"
                        onClick={() => toggleGroup(group.employeeId)}
                      >
                        <TableCell colSpan={7} className="py-2">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{group.name}</span>
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              {daysWorked} {daysWorked === 1 ? "day" : "days"}
                            </Badge>
                            {flagged > 0 && (
                              <Badge variant="destructive" className="text-[10px]">
                                {flagged} flagged
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {!isCollapsed && group.rows.map((r) => (
                        <TableRow key={r._realIdx} className={r.is_flagged ? "bg-destructive/10" : ""}>
                          <TableCell className="pl-8 text-xs">{r.date}</TableCell>
                    {editingImportIdx === r._realIdx ? (
                      <>
                        <TableCell><Input type="time" value={editForm.in_time} onChange={(e) => setEditForm({ ...editForm, in_time: e.target.value })} className="h-8 w-28" /></TableCell>
                        <TableCell><Input type="time" value={editForm.out_time} onChange={(e) => setEditForm({ ...editForm, out_time: e.target.value })} className="h-8 w-28" /></TableCell>
                        <TableCell><Input type="number" min={0} step={1} value={editForm.late_minutes} onChange={(e) => setEditForm({ ...editForm, late_minutes: e.target.value })} className="h-8 w-16" /></TableCell>
                        <TableCell>
                          <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                            <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Present">Present</SelectItem>
                              <SelectItem value="Half Day">Half Day</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleSaveImportEdit}><Check className="h-4 w-4 text-green-600" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingImportIdx(null)}><X className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{r.in_time ?? "—"}</TableCell>
                        <TableCell className={r.is_flagged ? "text-destructive font-semibold" : ""}>{r.out_time ?? "⚠ Missing"}</TableCell>
                        <TableCell>{r.late_minutes} min</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
                        <TableCell>{r.is_flagged && <Badge variant="destructive" className="text-xs">Review</Badge>}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditImportRow(r._realIdx)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDeleteImportRow(r._realIdx)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      </>
                    )}
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
                {filteredImportPreview.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-4">No {importFilter !== "all" ? importFilter : ""} records</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setImportDialogOpen(false); setImportPreview(null); }}>Cancel</Button>
            <Button onClick={() => importPreview && importMutation.mutate(importPreview)} disabled={importMutation.isPending || !importPreview?.length}>
              {importMutation.isPending ? "Importing..." : `Import ${importPreview?.length ?? 0} Records`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manual Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Attendance</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.employee_no} — {e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Present">Present</SelectItem>
                  <SelectItem value="Leave">Leave</SelectItem>
                  <SelectItem value="No Pay">No Pay</SelectItem>
                  <SelectItem value="Half Day">Half Day</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>In Time</Label><Input type="time" value={form.in_time} onChange={(e) => setForm({ ...form, in_time: e.target.value })} /></div>
              <div><Label>Out Time</Label><Input type="time" value={form.out_time} onChange={(e) => setForm({ ...form, out_time: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>OT Hours</Label><Input type="number" step="0.5" value={form.ot_hours} onChange={(e) => setForm({ ...form, ot_hours: e.target.value })} /></div>
              <div>
                <Label>OT Multiplier</Label>
                <Select value={form.ot_multiplier} onValueChange={(v) => setForm({ ...form, ot_multiplier: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.5">1.5x (Normal)</SelectItem>
                    <SelectItem value="2.0">2.0x (Holiday)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Late Minutes</Label><Input type="number" min={0} step={1} value={form.late_minutes} onChange={(e) => setForm({ ...form, late_minutes: e.target.value })} /></div>
            </div>
            <Button onClick={() => addMutation.mutate()} disabled={addMutation.isPending} className="w-full">
              {addMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete === "all" ? "Delete all attendance for this month?" : "Delete attendance for selected employees?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete === "all"
                ? `This will permanently remove every attendance record in ${monthName} ${year} for the current branch.`
                : `This will permanently remove ${monthName} ${year} attendance for ${selectedEmpIds.size} selected employee(s) in the current branch.`}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (confirmDelete) bulkDeleteMutation.mutate(confirmDelete); }}
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Attendance;
