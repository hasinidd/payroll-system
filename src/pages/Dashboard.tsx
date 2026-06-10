import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, CalendarDays, DollarSign, Clock, ArrowRight, AlertTriangle, Calculator, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useBranch } from "@/hooks/useBranch";

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();
const monthName = new Date().toLocaleString("default", { month: "long" });

const Dashboard = () => {
  const navigate = useNavigate();
  const { branchId } = useBranch();

  const { data: employeeCount } = useQuery({
    queryKey: ["employee-count", branchId],
    queryFn: async () => {
      let q = supabase.from("employees").select("*", { count: "exact", head: true }).eq("status", "Active");
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const { data: pendingLeaves } = useQuery({
    queryKey: ["pending-leaves", branchId],
    queryFn: async () => {
      let q = supabase.from("leave_requests").select("*", { count: "exact", head: true }).eq("status", "Pending");
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const { data: activeLoans } = useQuery({
    queryKey: ["active-loans", branchId],
    queryFn: async () => {
      let q = supabase.from("loans").select("*", { count: "exact", head: true }).eq("is_active", true);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const { data: flaggedAttendance } = useQuery({
    queryKey: ["flagged-attendance", branchId],
    queryFn: async () => {
      let q = supabase.from("attendance").select("*", { count: "exact", head: true }).eq("is_flagged", true);
      if (branchId) q = q.eq("branch_id", branchId);
      const { count } = await q;
      return count ?? 0;
    },
  });

  const { data: payrollStatus } = useQuery({
    queryKey: ["payroll-status-dashboard", branchId],
    queryFn: async () => {
      let q = supabase.from("payroll_periods").select("*").eq("month", currentMonth).eq("year", currentYear);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data: period } = await q.maybeSingle();
      if (!period) return { status: "Not Generated", totalNet: 0, totalEPF: 0 };
      const { data: entries } = await supabase.from("payroll_entries").select("net_salary, epf_employer, etf_employer").eq("payroll_period_id", period.id);
      const totalNet = entries?.reduce((s, e) => s + Number(e.net_salary), 0) ?? 0;
      const totalEPF = entries?.reduce((s, e) => s + Number(e.epf_employer) + Number(e.etf_employer), 0) ?? 0;
      return { status: period.is_locked ? "Locked" : "Draft", totalNet, totalEPF };
    },
  });

  const { data: recentLeaves } = useQuery({
    queryKey: ["recent-leaves-dashboard", branchId],
    queryFn: async () => {
      let q = supabase.from("leave_requests").select("*, employees(employee_no, first_name, last_name)").order("created_at", { ascending: false }).limit(5);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const stats = [
    { title: "Active Employees", value: employeeCount ?? 0, icon: Users, color: "text-blue-600" },
    { title: "Pending Leaves", value: pendingLeaves ?? 0, icon: CalendarDays, color: "text-orange-600" },
    { title: "Active Loans", value: activeLoans ?? 0, icon: DollarSign, color: "text-green-600" },
    { title: "Flagged Attendance", value: flaggedAttendance ?? 0, icon: AlertTriangle, color: "text-destructive" },
  ];

  const fmt = (n: number) => Number(n).toLocaleString("en-LK", { minimumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Payroll Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              Payroll — {monthName} {currentYear}
              <Badge variant={payrollStatus?.status === "Locked" ? "destructive" : payrollStatus?.status === "Draft" ? "secondary" : "outline"}>
                {payrollStatus?.status ?? "..."}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Net Salary</span>
              <span className="font-semibold">LKR {fmt(payrollStatus?.totalNet ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">EPF + ETF (Employer)</span>
              <span className="font-semibold">LKR {fmt(payrollStatus?.totalEPF ?? 0)}</span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/payroll")}>
              <Calculator className="mr-2 h-4 w-4" /> Go to Payroll <ArrowRight className="ml-auto h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate("/attendance")}>
              <Upload className="mr-2 h-4 w-4" /> Import Attendance Log
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate("/leave")}>
              <CalendarDays className="mr-2 h-4 w-4" /> Manage Leave Requests
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate("/reports")}>
              <DollarSign className="mr-2 h-4 w-4" /> Generate Reports
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate("/employees")}>
              <Users className="mr-2 h-4 w-4" /> Manage Employees
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Leave Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            Recent Leave Requests
            <Button variant="ghost" size="sm" onClick={() => navigate("/leave")}>View All <ArrowRight className="ml-1 h-4 w-4" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentLeaves?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent requests</p>
          ) : (
            <div className="space-y-2">
              {recentLeaves?.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <span className="font-medium">{r.employees?.first_name} {r.employees?.last_name}</span>
                    <span className="text-muted-foreground ml-2">{r.leave_type} · {r.days} day(s)</span>
                  </div>
                  <Badge variant={r.status === "Approved" ? "default" : r.status === "Rejected" ? "destructive" : "secondary"} className="text-xs">
                    {r.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
