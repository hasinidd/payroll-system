import {
  LayoutDashboard, Users, Clock, CalendarDays, DollarSign, FileText, Settings, LogOut, MinusCircle, CalendarHeart, Shield, Building2, Crown,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBranch } from "@/hooks/useBranch";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, key: "dashboard" },
  { title: "Employees", url: "/employees", icon: Users, key: "employees" },
  { title: "Attendance", url: "/attendance", icon: Clock, key: "attendance" },
  { title: "Leave", url: "/leave", icon: CalendarDays, key: "leave" },
  { title: "Payroll", url: "/payroll", icon: DollarSign, key: "payroll" },
  { title: "Deductions", url: "/deductions", icon: MinusCircle, key: "deductions" },
  { title: "Holidays", url: "/holidays", icon: CalendarHeart, key: "holidays" },
  { title: "Reports", url: "/reports", icon: FileText, key: "reports" },
  { title: "Settings", url: "/settings", icon: Settings, key: "settings" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { branches, currentBranch, switchBranch, isSuperAdmin, isUltraAdmin, featureFlags } = useBranch();

  const visibleNavItems = navItems.filter((item) => {
    if (isUltraAdmin) return true; // ultra admin sees everything
    if (!featureFlags) return true; // no flags = all enabled (branch admins)
    return featureFlags[item.key] !== false;
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {!collapsed && "Payroll System"}
          </SidebarGroupLabel>

          {/* Branch Switcher */}
          {!collapsed && branches.length > 0 && (
            <div className="px-2 py-2">
              <Select value={currentBranch?.id ?? ""} onValueChange={switchBranch}>
                <SelectTrigger className="h-8 text-xs">
                  <Building2 className="mr-1 h-3 w-3" />
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-muted/50"
                      activeClassName="bg-muted text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {isUltraAdmin && (
          <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/ultra-admin")}>
            <Crown className="mr-2 h-4 w-4 text-amber-500" />
            {!collapsed && "Ultra Admin"}
          </Button>
        )}
        {isSuperAdmin && (
          <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/super-admin")}>
            <Shield className="mr-2 h-4 w-4" />
            {!collapsed && "Super Admin"}
          </Button>
        )}
        <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
