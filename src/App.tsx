import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { BranchProvider, useBranch } from "@/hooks/useBranch";
import { AppLayout } from "@/components/AppLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Leave from "./pages/Leave";
import Payroll from "./pages/Payroll";
import Reports from "./pages/Reports";
import Deductions from "./pages/Deductions";
import Holidays from "./pages/Holidays";
import Settings from "./pages/Settings";
import SuperAdmin from "./pages/SuperAdmin";
import UltraAdmin from "./pages/UltraAdmin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { session, loading, signOut } = useAuth();
  const { isLoading: branchLoading, isAuthorized } = useBranch();
  if (loading || branchLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isAuthorized) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground">You do not have permission to access this system. Contact your administrator.</p>
      <button onClick={signOut} className="text-primary underline">Sign Out</button>
    </div>
  );
  return <AppLayout />;
}

function SuperAdminRoute() {
  const { session, loading } = useAuth();
  const { isSuperAdmin, isLoading } = useBranch();
  if (loading || isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <SuperAdmin />;
}

function UltraAdminRoute() {
  const { session, loading } = useAuth();
  const { isUltraAdmin, isLoading } = useBranch();
  if (loading || isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!isUltraAdmin) return <Navigate to="/" replace />;
  return <UltraAdmin />;
}

function LoginRoute() {
  const { session, loading } = useAuth();
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (session) return <Navigate to="/" replace />;
  return <Login />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BranchProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/super-admin" element={<SuperAdminRoute />} />
              <Route path="/ultra-admin" element={<UltraAdminRoute />} />
              <Route element={<ProtectedRoutes />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/employees" element={<Employees />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/leave" element={<Leave />} />
                <Route path="/payroll" element={<Payroll />} />
                <Route path="/deductions" element={<Deductions />} />
                <Route path="/holidays" element={<Holidays />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </BranchProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
