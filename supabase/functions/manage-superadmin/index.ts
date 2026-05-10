import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Verify caller is ultra_admin
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const callerId = userData.user.id;

    // Check ultra_admin role using service role client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);

    const isUltraAdmin = callerRoles?.some((r) => r.role === "ultra_admin") ?? false;
    const isSuperAdmin = callerRoles?.some((r) => r.role === "super_admin") ?? false;

    const { data: callerAccount } = await supabaseAdmin
      .from("admin_accounts")
      .select("is_active")
      .eq("user_id", callerId)
      .maybeSingle();

    const isActiveSuperAdmin = isSuperAdmin && (callerAccount?.is_active ?? true);

    const { action, ...payload } = await req.json();

    const requireUltraAdmin = () => {
      if (!isUltraAdmin) throw new Error("Only ultra admins can perform this action");
    };

    const canManageBranch = async (branchId: string) => {
      if (isUltraAdmin) return true;
      if (!isActiveSuperAdmin) return false;
      const { data: branch } = await supabaseAdmin
        .from("branches")
        .select("id")
        .eq("id", branchId)
        .eq("created_by", callerId)
        .maybeSingle();
      return !!branch;
    };

    if (action === "create_superadmin") {
      requireUltraAdmin();
      const { email, password, display_name, max_branches } = payload;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email and password required" }), { status: 400, headers: corsHeaders });
      }

      // Create user via admin API
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) {
        return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });
      }

      // Assign super_admin role
      const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({
        user_id: newUser.user.id,
        role: "super_admin",
      });
      if (roleErr) {
        return new Response(JSON.stringify({ error: roleErr.message }), { status: 400, headers: corsHeaders });
      }

      // Track in admin_accounts
      const { error: trackErr } = await supabaseAdmin.from("admin_accounts").insert({
        user_id: newUser.user.id,
        email,
        display_name: display_name || "",
        max_branches: max_branches || 3,
        created_by: callerId,
      });
      if (trackErr) {
        return new Response(JSON.stringify({ error: trackErr.message }), { status: 400, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "toggle_superadmin") {
      requireUltraAdmin();
      const { account_id, is_active } = payload;
      const { error } = await supabaseAdmin.from("admin_accounts").update({ is_active }).eq("id", account_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "update_limits") {
      requireUltraAdmin();
      const { account_id, max_branches, feature_flags } = payload;
      const updateData: Record<string, any> = {};
      if (max_branches !== undefined) updateData.max_branches = max_branches;
      if (feature_flags !== undefined) updateData.feature_flags = feature_flags;
      const { error } = await supabaseAdmin.from("admin_accounts").update(updateData).eq("id", account_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete_superadmin") {
      requireUltraAdmin();
      const { account_id } = payload;
      // Get user_id first
      const { data: account } = await supabaseAdmin.from("admin_accounts").select("user_id").eq("id", account_id).single();
      if (!account) {
        return new Response(JSON.stringify({ error: "Account not found" }), { status: 404, headers: corsHeaders });
      }
      // Remove role, admin_accounts entry, and delete auth user
      await supabaseAdmin.from("user_roles").delete().eq("user_id", account.user_id).eq("role", "super_admin");
      await supabaseAdmin.from("admin_accounts").delete().eq("id", account_id);
      await supabaseAdmin.auth.admin.deleteUser(account.user_id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create_branch_admin") {
      const { email, password, branch_id } = payload;
      if (!email || !password || !branch_id) {
        return jsonResponse({ error: "Email, password, and branch are required" }, 400);
      }
      if (!(await canManageBranch(branch_id))) {
        return jsonResponse({ error: "You can only manage admins for your own branches" }, 403);
      }

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) return jsonResponse({ error: createErr.message }, 400);

      const { error: roleErr } = await supabaseAdmin.from("user_roles").upsert(
        { user_id: newUser.user.id, role: "admin" },
        { onConflict: "user_id,role" }
      );
      if (roleErr) return jsonResponse({ error: roleErr.message }, 400);

      const { error: branchErr } = await supabaseAdmin.from("branch_admins").upsert(
        { user_id: newUser.user.id, branch_id },
        { onConflict: "user_id,branch_id" }
      );
      if (branchErr) return jsonResponse({ error: branchErr.message }, 400);

      await supabaseAdmin.from("activity_logs").insert({
        branch_id,
        user_id: callerId,
        action: "Created branch admin",
        entity_type: "user",
        entity_id: newUser.user.id,
        details: { email },
      });

      return jsonResponse({ success: true, user_id: newUser.user.id });
    }

    if (action === "update_branch_admin") {
      const { assignment_id, branch_id } = payload;
      if (!assignment_id || !branch_id) return jsonResponse({ error: "Assignment and branch are required" }, 400);
      const { data: assignment } = await supabaseAdmin.from("branch_admins").select("branch_id").eq("id", assignment_id).maybeSingle();
      if (!assignment) return jsonResponse({ error: "Admin assignment not found" }, 404);
      if (!(await canManageBranch(assignment.branch_id)) || !(await canManageBranch(branch_id))) {
        return jsonResponse({ error: "You can only manage admins for your own branches" }, 403);
      }
      const { error } = await supabaseAdmin.from("branch_admins").update({ branch_id }).eq("id", assignment_id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    if (action === "delete_branch_admin") {
      const { assignment_id } = payload;
      if (!assignment_id) return jsonResponse({ error: "Assignment is required" }, 400);
      const { data: assignment } = await supabaseAdmin.from("branch_admins").select("branch_id").eq("id", assignment_id).maybeSingle();
      if (!assignment) return jsonResponse({ error: "Admin assignment not found" }, 404);
      if (!(await canManageBranch(assignment.branch_id))) {
        return jsonResponse({ error: "You can only manage admins for your own branches" }, 403);
      }
      const { error } = await supabaseAdmin.from("branch_admins").delete().eq("id", assignment_id);
      if (error) return jsonResponse({ error: error.message }, 400);
      return jsonResponse({ success: true });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
