import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Plus, Trash2, ToggleLeft, ToggleRight, Pencil, Crown, SlidersHorizontal } from "lucide-react";
import { FeatureFlagsDialog } from "@/components/ultra-admin/FeatureFlagsDialog";
import { toast } from "sonner";
import { format } from "date-fns";

const UltraAdmin = () => {
  const { signOut, user } = useAuth();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [maxBranches, setMaxBranches] = useState(3);
  const [editAccountId, setEditAccountId] = useState("");
  const [editMaxBranches, setEditMaxBranches] = useState(3);
  const [featureFlagsOpen, setFeatureFlagsOpen] = useState(false);
  const [featureFlagsAccount, setFeatureFlagsAccount] = useState<any>(null);
  const { data: accounts, isLoading } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invokeAction = async (action: string, payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("manage-superadmin", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const createMutation = useMutation({
    mutationFn: () => invokeAction("create_superadmin", { email, password, display_name: displayName, max_branches: maxBranches }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      setCreateOpen(false);
      setEmail(""); setPassword(""); setDisplayName(""); setMaxBranches(3);
      toast.success("Super Admin account created");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ account_id, is_active }: { account_id: string; is_active: boolean }) =>
      invokeAction("toggle_superadmin", { account_id, is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      toast.success("Account status updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateLimitsMutation = useMutation({
    mutationFn: (vars: { account_id: string; max_branches?: number; feature_flags?: Record<string, boolean> }) =>
      invokeAction("update_limits", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      setEditOpen(false);
      setFeatureFlagsOpen(false);
      toast.success("Settings updated");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (account_id: string) => invokeAction("delete_superadmin", { account_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      toast.success("Super Admin account deleted");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const openEdit = (account: any) => {
    setEditAccountId(account.id);
    setEditMaxBranches(account.max_branches);
    setEditOpen(true);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Crown className="h-6 w-6 text-amber-500" />
          <h1 className="text-xl font-bold">Ultra Admin Dashboard</h1>
        </div>
        <Button variant="outline" onClick={signOut}>Sign Out</Button>
      </header>

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Super Admins</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold">{accounts?.length ?? 0}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Active</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-green-600">{accounts?.filter(a => a.is_active).length ?? 0}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Inactive</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold text-muted-foreground">{accounts?.filter(a => !a.is_active).length ?? 0}</div></CardContent>
          </Card>
        </div>

        {/* Accounts Table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" /> Super Admin Accounts</CardTitle>
            <Button onClick={() => setCreateOpen(true)}><Plus className="mr-2 h-4 w-4" /> Create Super Admin</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Max Branches</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts?.map((account: any) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.email}</TableCell>
                    <TableCell>{account.display_name || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{account.max_branches}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={account.is_active ? "default" : "secondary"}>
                        {account.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{format(new Date(account.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() =>
                        toggleMutation.mutate({ account_id: account.id, is_active: !account.is_active })
                      } title={account.is_active ? "Deactivate" : "Activate"}>
                        {account.is_active ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(account)} title="Edit Limits">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setFeatureFlagsAccount(account); setFeatureFlagsOpen(true); }} title="Feature Access">
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => {
                        if (confirm("Delete this Super Admin account permanently?")) deleteMutation.mutate(account.id);
                      }} title="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!accounts?.length && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No super admin accounts created yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Super Admin Account</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" />
            </div>
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Max Branches Allowed</Label>
              <Input type="number" min={1} max={10} value={maxBranches} onChange={e => setMaxBranches(Number(e.target.value))} />
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!email || !password || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Super Admin"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Limits Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Account Limits</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Max Branches Allowed</Label>
              <Input type="number" min={1} max={10} value={editMaxBranches} onChange={e => setEditMaxBranches(Number(e.target.value))} />
            </div>
            <Button className="w-full" onClick={() => updateLimitsMutation.mutate({ account_id: editAccountId, max_branches: editMaxBranches })} disabled={updateLimitsMutation.isPending}>
              {updateLimitsMutation.isPending ? "Updating..." : "Update Limits"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FeatureFlagsDialog
        open={featureFlagsOpen}
        onOpenChange={setFeatureFlagsOpen}
        account={featureFlagsAccount}
        onSave={(accountId, flags) => updateLimitsMutation.mutate({ account_id: accountId, feature_flags: flags })}
        isPending={updateLimitsMutation.isPending}
      />
    </div>
  );
};

export default UltraAdmin;
