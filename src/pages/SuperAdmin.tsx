import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Users, Activity, Plus, LogIn, Trash2, Shield, Pencil, ToggleLeft, ToggleRight, Settings } from "lucide-react";
import BranchConfigTab from "@/components/superadmin/BranchConfigTab";
import { toast } from "sonner";
import { format } from "date-fns";

const SuperAdmin = () => {
  const { switchBranch, isUltraAdmin } = useBranch();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Dialog states
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [editBranchOpen, setEditBranchOpen] = useState(false);
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [editAdminOpen, setEditAdminOpen] = useState(false);

  // Form states
  const [newBranchName, setNewBranchName] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editBranchName, setEditBranchName] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [newAdminBranch, setNewAdminBranch] = useState("");
  const [editAdminId, setEditAdminId] = useState("");
  const [editAdminBranch, setEditAdminBranch] = useState("");

  // Queries
  const { data: allBranches } = useQuery({
    queryKey: ["super-admin-branches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branches").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: currentAdminAccount } = useQuery({
    queryKey: ["current-admin-account", user?.id],
    enabled: !!user && !isUltraAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_accounts")
        .select("max_branches, is_active")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const maxBranches = isUltraAdmin ? Infinity : currentAdminAccount?.max_branches ?? 3;

  const invokeAdminAction = async (action: string, payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("manage-superadmin", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const { data: branchAdmins } = useQuery({
    queryKey: ["branch-admins"],
    queryFn: async () => {
      const { data, error } = await supabase.from("branch_admins").select("*, branches(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: activityLogs } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*, branches(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: branchStats } = useQuery({
    queryKey: ["branch-stats"],
    queryFn: async () => {
      const stats: Record<string, { employees: number }> = {};
      if (!allBranches) return stats;
      for (const branch of allBranches) {
        const { count } = await supabase
          .from("employees")
          .select("*", { count: "exact", head: true })
          .eq("branch_id", branch.id)
          .eq("status", "Active");
        stats[branch.id] = { employees: count ?? 0 };
      }
      return stats;
    },
    enabled: !!allBranches,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["super-admin-branches"] });
    queryClient.invalidateQueries({ queryKey: ["branch-admins"] });
    queryClient.invalidateQueries({ queryKey: ["activity-logs"] });
    queryClient.invalidateQueries({ queryKey: ["branch-stats"] });
  };

  // Branch mutations
  const addBranchMutation = useMutation({
    mutationFn: async (name: string) => {
      if ((allBranches?.length ?? 0) >= maxBranches) throw new Error(`Maximum ${maxBranches} branches allowed`);
      const { error } = await supabase.from("branches").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setAddBranchOpen(false);
      setNewBranchName("");
      toast.success("Branch added");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const editBranchMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("branches").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      setEditBranchOpen(false);
      toast.success("Branch updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleBranchMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("branches").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Branch status updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteBranchMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("branches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Branch deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Admin mutations
  const addAdminMutation = useMutation({
    mutationFn: async ({ email, password, branchId }: { email: string; password: string; branchId: string }) => {
      await invokeAdminAction("create_branch_admin", { email, password, branch_id: branchId });
    },
    onSuccess: () => {
      invalidateAll();
      setAddAdminOpen(false);
      setNewAdminEmail("");
      setNewAdminPassword("");
      setNewAdminBranch("");
      toast.success("Branch admin created");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const editAdminMutation = useMutation({
    mutationFn: async ({ id, branchId }: { id: string; branchId: string }) => {
      await invokeAdminAction("update_branch_admin", { assignment_id: id, branch_id: branchId });
    },
    onSuccess: () => {
      invalidateAll();
      setEditAdminOpen(false);
      toast.success("Admin branch updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      await invokeAdminAction("delete_branch_admin", { assignment_id: id });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Admin removed");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleSwitchToBranch = (branchId: string) => {
    switchBranch(branchId);
    navigate("/");
  };

  const openEditBranch = (branch: any) => {
    setEditBranchId(branch.id);
    setEditBranchName(branch.name);
    setEditBranchOpen(true);
  };

  const openEditAdmin = (admin: any) => {
    setEditAdminId(admin.id);
    setEditAdminBranch(admin.branch_id);
    setEditAdminOpen(true);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">Super Admin Dashboard</h1>
        </div>
        <Button variant="outline" onClick={signOut}>Sign Out</Button>
      </header>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Branch Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {allBranches?.map((branch) => (
            <Card key={branch.id} className={!branch.is_active ? "opacity-60" : ""}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  {branch.name}
                </CardTitle>
                <Badge variant={branch.is_active ? "default" : "secondary"}>
                  {branch.is_active ? "Active" : "Inactive"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-2xl font-bold">
                  {branchStats?.[branch.id]?.employees ?? 0} employees
                </div>
                <Button size="sm" className="w-full" onClick={() => handleSwitchToBranch(branch.id)}>
                  <LogIn className="mr-2 h-4 w-4" /> Switch to Branch
                </Button>
              </CardContent>
            </Card>
          ))}
          {(allBranches?.length ?? 0) < maxBranches && (
            <Card className="border-dashed flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setAddBranchOpen(true)}>
              <CardContent className="flex flex-col items-center gap-2 py-8">
                <Plus className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Add Branch</span>
              </CardContent>
            </Card>
          )}
        </div>

        <Tabs defaultValue="admins">
          <TabsList>
            <TabsTrigger value="admins"><Users className="mr-2 h-4 w-4" />Branch Admins</TabsTrigger>
            <TabsTrigger value="logs"><Activity className="mr-2 h-4 w-4" />Activity Logs</TabsTrigger>
            <TabsTrigger value="branches"><Building2 className="mr-2 h-4 w-4" />Manage Branches</TabsTrigger>
            <TabsTrigger value="config"><Settings className="mr-2 h-4 w-4" />Branch Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="admins" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setAddAdminOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add Branch Admin
              </Button>
            </div>
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchAdmins?.map((admin: any) => (
                    <TableRow key={admin.id}>
                      <TableCell className="font-mono text-xs">{admin.user_id.slice(0, 8)}...</TableCell>
                      <TableCell>{admin.branches?.name}</TableCell>
                      <TableCell>{format(new Date(admin.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditAdmin(admin)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => {
                          if (confirm("Remove this admin?")) deleteAdminMutation.mutate(admin.id);
                        }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!branchAdmins?.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No branch admins yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLogs?.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{format(new Date(log.created_at), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell><Badge variant="outline">{log.branches?.name}</Badge></TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.entity_type}</TableCell>
                    </TableRow>
                  ))}
                  {!activityLogs?.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No activity logs yet</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="branches" className="space-y-4">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Branch Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allBranches?.map((branch) => (
                    <TableRow key={branch.id}>
                      <TableCell className="font-medium">{branch.name}</TableCell>
                      <TableCell>
                        <Badge variant={branch.is_active ? "default" : "secondary"}>
                          {branch.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>{format(new Date(branch.created_at), "dd MMM yyyy")}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={branch.is_active ? "Deactivate" : "Activate"}
                          onClick={() => toggleBranchMutation.mutate({ id: branch.id, is_active: !branch.is_active })}
                        >
                          {branch.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditBranch(branch)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this branch? This will remove all associated data.")) {
                              deleteBranchMutation.mutate(branch.id);
                            }
                          }}
                          disabled={branch.id === "00000000-0000-0000-0000-000000000001"}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            {allBranches && <BranchConfigTab branches={allBranches} />}
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Branch Dialog */}
      <Dialog open={addBranchOpen} onOpenChange={setAddBranchOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Branch</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="e.g. Colombo Branch" />
            </div>
            <Button className="w-full" onClick={() => addBranchMutation.mutate(newBranchName)} disabled={!newBranchName.trim()}>
              Add Branch
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Branch Dialog */}
      <Dialog open={editBranchOpen} onOpenChange={setEditBranchOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Branch</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Branch Name</Label>
              <Input value={editBranchName} onChange={(e) => setEditBranchName(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => editBranchMutation.mutate({ id: editBranchId, name: editBranchName })} disabled={!editBranchName.trim()}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Admin Dialog */}
      <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Branch Admin</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Assign to Branch</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={newAdminBranch}
                onChange={(e) => setNewAdminBranch(e.target.value)}
              >
                <option value="">Select branch...</option>
                {allBranches?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <Button
              className="w-full"
              onClick={() => addAdminMutation.mutate({ email: newAdminEmail, password: newAdminPassword, branchId: newAdminBranch })}
              disabled={!newAdminEmail || !newAdminPassword || !newAdminBranch}
            >
              Create Admin Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Admin Dialog */}
      <Dialog open={editAdminOpen} onOpenChange={setEditAdminOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Admin Branch</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assign to Branch</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editAdminBranch}
                onChange={(e) => setEditAdminBranch(e.target.value)}
              >
                {allBranches?.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <Button
              className="w-full"
              onClick={() => editAdminMutation.mutate({ id: editAdminId, branchId: editAdminBranch })}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdmin;
