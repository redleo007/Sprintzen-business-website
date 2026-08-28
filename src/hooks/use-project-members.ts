import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/hooks/use-auth";

export type ProjectMember = {
  user_id: string;
  name: string;
  email: string;
  avatar_color: string;
  role: AppRole;
};

export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data: rows, error } = await supabase
    .from("project_members")
    .select("user_id")
    .eq("project_id", projectId);
  if (error) throw error;

  const ids = (rows ?? []).map((r) => r.user_id);
  if (!ids.length) return [];

  const [{ data: profiles, error: profilesError }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, name, email, avatar_color").in("id", ids),
    supabase.from("user_roles").select("user_id, role").in("user_id", ids),
  ]);
  if (profilesError) throw profilesError;

  return ids.map((id) => {
    const profile = (profiles ?? []).find((p) => p.id === id);
    const role = (roles ?? []).find((r) => r.user_id === id)?.role as AppRole | undefined;
    return {
      user_id: id,
      name: profile?.name ?? "Teammate",
      email: profile?.email ?? "",
      avatar_color: profile?.avatar_color ?? "#7c5cff",
      role: role ?? "TeamMember",
    };
  });
}

export function useProjectMembers(projectId: string | undefined) {
  return useQuery({
    queryKey: ["members", projectId],
    enabled: !!projectId,
    queryFn: () => fetchProjectMembers(projectId!),
  });
}
