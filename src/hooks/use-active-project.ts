import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const STORAGE_KEY = "sprintzen.activeProject";

export type Project = {
  id: string;
  name: string;
  description: string;
  owner_id: string;
  sprint_length_days: number;
  created_at: string;
};

export function useProjects() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["projects", user?.id],
    enabled: !!user,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, description, owner_id, sprint_length_days, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });
}

export function useActiveProject() {
  const { data: projects, isLoading } = useProjects();
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setActiveId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  useEffect(() => {
    if (!projects?.length) return;
    const valid = activeId && projects.some((p) => p.id === activeId);
    if (!valid) {
      const next = projects[0]!.id;
      setActiveId(next);
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, [projects, activeId]);

  const select = (id: string) => {
    setActiveId(id);
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  };

  const project = projects?.find((p) => p.id === activeId) ?? null;

  return { projects: projects ?? [], project, projectId: project?.id ?? null, isLoading, select };
}
