import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type FeatureFlags = Record<string, boolean>;

interface Branch {
  id: string;
  name: string;
  is_active: boolean;
}

interface BranchContextType {
  currentBranch: Branch | null;
  branches: Branch[];
  isSuperAdmin: boolean;
  isUltraAdmin: boolean;
  isAuthorized: boolean;
  isLoading: boolean;
  featureFlags: FeatureFlags | null;
  switchBranch: (branchId: string) => void;
  branchId: string | null;
}

const BranchContext = createContext<BranchContextType>({} as BranchContextType);

// Persist the selected branch per user so a page refresh keeps the branch
// the admin was working in instead of snapping back to the first one.
const branchStorageKey = (userId: string) => `selected_branch:${userId}`;
const readStoredBranch = (userId?: string | null) => {
  if (!userId) return null;
  return localStorage.getItem(branchStorageKey(userId)) ?? localStorage.getItem("superadmin_branch");
};

export const BranchProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranch, setCurrentBranch] = useState<Branch | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isUltraAdmin, setIsUltraAdmin] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setBranches([]);
      setCurrentBranch(null);
      setIsSuperAdmin(false);
      setIsUltraAdmin(false);
      setIsAuthorized(false);
      setFeatureFlags(null);
      setIsLoading(false);
      return;
    }

    const load = async () => {
      setIsLoading(true);
      // Check if super admin
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const ua = roles?.some((r) => (r.role as string) === "ultra_admin") ?? false;
      const sa = roles?.some((r) => r.role === "super_admin") ?? false;
      setIsUltraAdmin(ua);
      setIsSuperAdmin(sa || ua);

      if (sa || ua) {
        // Load feature flags for this super admin
        const { data: adminAccount } = await supabase
          .from("admin_accounts")
          .select("feature_flags, is_active")
          .eq("user_id", user.id)
          .maybeSingle();
        if (sa && !ua && adminAccount && !adminAccount.is_active) {
          setBranches([]);
          setCurrentBranch(null);
          setIsAuthorized(false);
          setIsLoading(false);
          return;
        }
        if (adminAccount?.feature_flags) {
          setFeatureFlags(adminAccount.feature_flags as FeatureFlags);
        } else {
          setFeatureFlags(null);
        }
        const { data } = await supabase.from("branches").select("*").eq("is_active", true).order("created_at");
        setBranches(data ?? []);
        const stored = readStoredBranch(user.id);
        const found = data?.find((b) => b.id === stored);
        setCurrentBranch(found ?? data?.[0] ?? null);
        setIsAuthorized((data?.length ?? 0) > 0 || ua);
      } else {
        // Check branch admin assignment
        const { data: assignments } = await supabase
          .from("branch_admins")
          .select("branch_id, branches(id, name, is_active)")
          .eq("user_id", user.id);

        const userBranches = assignments
          ?.map((a: any) => a.branches)
          .filter(Boolean) as Branch[];

        setBranches(userBranches ?? []);
        const storedId = readStoredBranch(user.id);
        setCurrentBranch(userBranches?.find((b) => b.id === storedId) ?? userBranches?.[0] ?? null);
        // Only authorized if they have at least one branch assignment
        setIsAuthorized((userBranches?.length ?? 0) > 0);
      }
      setIsLoading(false);
    };

    load();
  }, [user]);

  const switchBranch = (branchId: string) => {
    const branch = branches.find((b) => b.id === branchId);
    if (branch) {
      setCurrentBranch(branch);
      if (user) localStorage.setItem(branchStorageKey(user.id), branchId);
      localStorage.setItem("superadmin_branch", branchId);
    }
  };

  return (
    <BranchContext.Provider
      value={{
        currentBranch,
        branches,
        isSuperAdmin,
        isUltraAdmin,
        isAuthorized,
        isLoading,
        featureFlags,
        switchBranch,
        branchId: currentBranch?.id ?? null,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = () => useContext(BranchContext);
