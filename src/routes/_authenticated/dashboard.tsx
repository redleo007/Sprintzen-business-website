import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Spade, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useProjects } from "@/hooks/use-active-project";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Sprintzen" },
      {
        name: "description",
        content: "All your agile projects, sessions and sprint health in one view.",
      },
      { property: "og:title", content: "Dashboard — Sprintzen" },
      { property: "og:description", content: "Your agile projects at a glance." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, canLead, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: projects, isLoading } = useProjects();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sprintLength, setSprintLength] = useState(14);

  const { data: sessions } = useQuery({
    queryKey: ["all-sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poker_sessions")
        .select("id, title, status, project_id, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const createProject = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      if (name.trim().length < 2) throw new Error("Project name is too short");
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: name.trim(),
          description: description.trim(),
          owner_id: user.id,
          sprint_length_days: sprintLength,
        })
        .select("id")
        .single();
      if (error) throw error;
      await supabase.from("project_members").insert({
        project_id: data.id,
        user_id: user.id,
      });
      return data;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      setName("");
      setDescription("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create project"),
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Project deleted");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Hey {profile?.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here's what's moving across your projects.
          </p>
        </div>

        {canLead && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a project</DialogTitle>
                <DialogDescription>
                  Projects hold your Kanban board, poker sessions and analytics.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Name</Label>
                  <Input
                    id="p-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Checkout revamp"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-desc">Description</Label>
                  <Textarea
                    id="p-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this project about?"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p-len">Sprint length (days)</Label>
                  <Input
                    id="p-len"
                    type="number"
                    min={1}
                    max={60}
                    value={sprintLength}
                    onChange={(e) => setSprintLength(Number(e.target.value) || 14)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createProject.mutate()}
                  disabled={createProject.isPending}
                >
                  {createProject.isPending && <Loader2 className="size-4 animate-spin" />}
                  Create project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Projects</h2>
        {isLoading ? (
          <div className="panel p-8 text-center text-sm text-muted-foreground">
            Loading projects…
          </div>
        ) : !projects?.length ? (
          <div className="panel p-10 text-center">
            <p className="text-sm text-muted-foreground">
              {canLead
                ? "No projects yet. Create your first one to get started."
                : "You're not part of a project yet — ask your team leader to add you."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <article key={p.id} className="panel flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                  {p.owner_id === user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${p.name}`}
                      onClick={() => deleteProject.mutate(p.id)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                  {p.description || "No description yet."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="secondary">{p.sprint_length_days}-day sprints</Badge>
                  {p.owner_id === user?.id && <Badge>Owner</Badge>}
                </div>
                <div className="mt-5 flex gap-2">
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/board">
                      <Spade className="size-4" /> Board
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/team">
                      <Users className="size-4" /> Team
                    </Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Recent poker sessions</h2>
        {!sessions?.length ? (
          <div className="panel p-8 text-center text-sm text-muted-foreground">
            No sessions yet. Start one from the Scrum Board.
          </div>
        ) : (
          <div className="panel divide-y divide-border">
            {sessions.map((s) => (
              <Link
                key={s.id}
                to="/board/$sessionId"
                params={{ sessionId: s.id }}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-secondary/50"
              >
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant={s.status === "open" ? "default" : "secondary"}>
                  {s.status}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
