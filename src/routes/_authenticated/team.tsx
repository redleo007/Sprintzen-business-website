import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useActiveProject } from "@/hooks/use-active-project";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team Workspace — Sprintzen" },
      {
        name: "description",
        content:
          "Manage who collaborates on your Sprintzen project: add teammates, review roles and remove access.",
      },
      { property: "og:title", content: "Team Workspace — Sprintzen" },
      { property: "og:description", content: "Roles and membership for your project." },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { canLead, user } = useAuth();
  const { project, projectId, isLoading } = useActiveProject();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);

  const membersQuery = useQuery({
    queryKey: ["members", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_members")
        .select("user_id, role, profiles:profiles!inner(id, name, email, avatar_color)")
        .eq("project_id", projectId!);
      if (error) throw error;
      return (data ?? []) as {
        user_id: string;
        role: string;
        profiles: { id: string; name: string; email: string; avatar_color: string };
      }[];
    },
  });

  const addMember = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Select a project first");
      const value = email.trim().toLowerCase();
      if (!value) throw new Error("Enter a teammate's email");
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("email", value)
        .maybeSingle();
      if (error) throw error;
      if (!profile) throw new Error("No Sprintzen account uses that email yet");

      const { error: insertError } = await supabase
        .from("project_members")
        .insert({ project_id: projectId, user_id: profile.id });
      if (insertError) {
        throw new Error(
          insertError.code === "23505" || insertError.code === "23514"
            ? "That teammate is already on the project"
            : insertError.message,
        );
      }

      await supabase.from("notifications").insert({
        user_id: profile.id,
        message: `You were added to project "${project?.name ?? "a project"}"`,
        type: "project",
      });
    },
    onSuccess: () => {
      toast.success("Teammate added");
      setEmail("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add teammate"),
  });

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from("project_members")
        .delete()
        .eq("project_id", projectId!)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teammate removed");
      void queryClient.invalidateQueries({ queryKey: ["members", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove teammate"),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading team…</p>;

  if (!project) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="font-display text-xl font-semibold">No project selected</h1>
        <Button asChild className="mt-5">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    );
  }

  const members = membersQuery.data ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} people on {project.name}
          </p>
        </div>
        {canLead && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="size-4" /> Add teammate
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add teammate</DialogTitle>
                <DialogDescription>
                  They need a Sprintzen account first — then add them by email.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="m-email">Email</Label>
                <Input
                  id="m-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@company.com"
                />
              </div>
              <DialogFooter>
                <Button onClick={() => addMember.mutate()} disabled={addMember.isPending}>
                  {addMember.isPending && <Loader2 className="size-4 animate-spin" />}
                  Add to project
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="panel divide-y divide-border">
        {members.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No teammates yet.
          </p>
        )}
        {members.map((m) => (
          <div key={m.user_id} className="flex items-center gap-4 px-5 py-4">
            <span
              className="flex size-10 items-center justify-center rounded-full text-xs font-bold text-primary-foreground"
              style={{ backgroundColor: m.profiles.avatar_color }}
            >
              {(m.profiles.name || "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{m.profiles.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {m.profiles.email}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <Badge variant="secondary">{m.role}</Badge>
              {canLead && m.user_id !== user?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeMember.mutate(m.user_id)}
                >
                  <UserMinus className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
