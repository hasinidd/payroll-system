import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBranch } from "@/hooks/useBranch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, CalendarHeart } from "lucide-react";
import { toast } from "sonner";

const currentYear = new Date().getFullYear();

const Holidays = () => {
  const [year, setYear] = useState(currentYear);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", ot_multiplier: "1.5" });
  const queryClient = useQueryClient();
  const { branchId } = useBranch();

  const { data: holidays } = useQuery({
    queryKey: ["holidays", year, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .eq("branch_id", branchId)
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`)
        .order("date");
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name || !form.date) throw new Error("Name and date are required");
      if (!branchId) throw new Error("No branch selected");
      const payload = {
        name: form.name,
        date: form.date,
        ot_multiplier: parseFloat(form.ot_multiplier),
      };
      if (editingId) {
        const { error } = await supabase.from("holidays").update(payload).eq("id", editingId).eq("branch_id", branchId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("holidays").insert({ ...payload, branch_id: branchId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      setDialogOpen(false);
      setEditingId(null);
      setForm({ name: "", date: "", ot_multiplier: "1.5" });
      toast.success(editingId ? "Holiday updated" : "Holiday added");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id).eq("branch_id", branchId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday deleted");
    },
  });

  const handleEdit = (h: any) => {
    setEditingId(h.id);
    setForm({ name: h.name, date: h.date, ot_multiplier: String(h.ot_multiplier) });
    setDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingId(null);
    setForm({ name: "", date: "", ot_multiplier: "1.5" });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Holidays</h1>
        <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" /> Add Holiday</Button>
      </div>

      <div className="flex gap-4 items-end">
        <div>
          <Label>Year</Label>
          <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28" />
        </div>
        <Card className="flex-1">
          <CardContent className="flex items-center gap-3 py-3">
            <CalendarHeart className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{holidays?.length ?? 0} holidays in {year}</span>
            <Badge variant="outline">{holidays?.filter((h: any) => Number(h.ot_multiplier) === 2).length ?? 0} × Double Rate</Badge>
            <Badge variant="outline">{holidays?.filter((h: any) => Number(h.ot_multiplier) === 1.5).length ?? 0} × 1.5 Rate</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Holiday Name</TableHead>
              <TableHead>OT Multiplier</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holidays?.map((h: any) => (
              <TableRow key={h.id}>
                <TableCell>{new Date(h.date).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</TableCell>
                <TableCell className="font-medium">{h.name}</TableCell>
                <TableCell>
                  <Badge variant={Number(h.ot_multiplier) === 2 ? "destructive" : "secondary"}>
                    {h.ot_multiplier}× Rate
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(h)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(h.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!holidays?.length && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No holidays added for {year}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit Holiday" : "Add Holiday"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Holiday Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Poya Day" /></div>
            <div><Label>Date</Label><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div>
              <Label>OT Multiplier (Hourly Rate)</Label>
              <Select value={form.ot_multiplier} onValueChange={(v) => setForm({ ...form, ot_multiplier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.5">1.5× (Standard Holiday)</SelectItem>
                  <SelectItem value="2">2× (Special Holiday)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Holidays;
