import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Eye, Loader2, Lock, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { FIBONACCI, nearestFibonacci } from "@/lib/sprint-analytics";
import { useProjectMembers } from "@/hooks/use-project-members";

export const Route = createFileRoute("/_authenticated/board/$sessionId")({
  head: () => ({
    meta: [
      { title: "Planning Poker Session — Sprintzen" },
      {
        name: "description",
        content:
          "Vote on story points with hidden ballots, reveal as a team and capture decisions in shared notes.",
      },
      { property: "og:title", content: "Planning Poker Session — Sprintzen" },
      { property: "og:description", content: "Estimate stories together in real time." },
    ],
  }),
  component: SessionPage,
});

type Story = {
  id: string;
  title: string;
  description: string;
  risk: "low" | "medium" | "high";
  complexity: number;
  revealed: boolean;
  final_points: number | null;
  position: number;
};

type Vote = { id: string; story_id: string; user_id: string; value: number };

function SessionPage() {
  const { sessionId } = Route.useParams();
  const { user, canLead } = useAuth();
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [risk, setRisk] = useState<Story["risk"]>("low");
  const [complexity, setComplexity] = useState(3);

  const sessionQuery = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poker_sessions")
        .select("id, title, notes, status, project_id, created_by, created_at")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const storiesQuery = useQuery({
    queryKey: ["stories", sessionId],
    queryFn: async (): Promise<Story[]> => {
      const { data, error } = await supabase
        .from("stories")
        .select(
          "id, title, description, risk, complexity, revealed, final_points, position",
        )
        .eq("session_id", sessionId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Story[];
    },
  });

  const storyIds = (storiesQuery.data ?? []).map((s) => s.id);

  const votesQuery = useQuery({
    queryKey: ["votes", sessionId, storyIds.join(",")],
    enabled: storyIds.length > 0,
    queryFn: async (): Promise<Vote[]> => {
      const { data, error } = await supabase
        .from("votes")
        .select("id, story_id, user_id, value")
        .in("story_id", storyIds);
      if (error) throw error;
      return (data ?? []) as Vote[];
    },
  });

  const membersQuery = useProjectMembers(sessionQuery.data?.project_id);

  useEffect(() => {
    if (sessionQuery.data && !notesDirty) setNotes(sessionQuery.data.notes ?? "");
  }, [sessionQuery.data, notesDirty]);

  useEffect(() => {
    const channel = supabase
      .channel(`session-${sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["stories", sessionId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["votes", sessionId] });
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "poker_sessions" },
        () => queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [sessionId, queryClient]);

  const addStory = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Story needs a title");
      const { error } = await supabase.from("stories").insert({
        session_id: sessionId,
        title: title.trim(),
        description: description.trim(),
        risk,
        complexity,
        position: (storiesQuery.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Story added");
      setOpen(false);
      setTitle("");
      setDescription("");
      setRisk("low");
      setComplexity(3);
      void queryClient.invalidateQueries({ queryKey: ["stories", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add story"),
  });

  const castVote = useMutation({
    mutationFn: async ({ storyId, value }: { storyId: string; value: number }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("votes")
        .upsert({ story_id: storyId, user_id: user.id, value }, { onConflict: "story_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["votes", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save vote"),
  });

  const reveal = useMutation({
    mutationFn: async (story: Story) => {
      const storyVotes = (votesQuery.data ?? []).filter((v) => v.story_id === story.id);
      if (!storyVotes.length) throw new Error("No votes to reveal yet");
      const avg = storyVotes.reduce((s, v) => s + v.value, 0) / storyVotes.length;
      const { error } = await supabase
        .from("stories")
        .update({ revealed: true, final_points: nearestFibonacci(avg) })
        .eq("id", story.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Votes revealed");
      void queryClient.invalidateQueries({ queryKey: ["stories", sessionId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not reveal"),
  });

  const resetStory = useMutation({
    mutationFn: async (story: Story) => {
      const { error } = await supabase
        .from("stories")
        .update({ revealed: false, final_points: null })
        .eq("id", story.id);
      if (error) throw error;
      await supabase.from("votes").delete().eq("story_id", story.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stories", sessionId] });
      void queryClient.invalidateQueries({ queryKey: ["votes", sessionId] });
    },
  });

  const deleteStory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("stories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stories", sessionId] }),
  });

  const saveNotes = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("poker_sessions")
        .update({ notes })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      setNotesDirty(false);
      toast.success("Notes saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save notes"),
  });

  const toggleStatus = useMutation({
    mutationFn: async () => {
      const next = sessionQuery.data?.status === "open" ? "closed" : "open";
      const { error } = await supabase
        .from("poker_sessions")
        .update({ status: next })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session", sessionId] }),
  });

  if (sessionQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading session…</p>;
  }

  if (!sessionQuery.data) {
    return (
      <div className="panel p-10 text-center">
        <h1 className="font-display text-xl font-semibold">Session not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or you're not a member of its project.
        </p>
        <Button asChild className="mt-5">
          <Link to="/board">Back to board</Link>
        </Button>
      </div>
    );
  }

  const session = sessionQuery.data;
  const stories = storiesQuery.data ?? [];
  const votes = votesQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const closed = session.status === "closed";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link to="/board">
              <ArrowLeft className="size-4" /> Board
            </Link>
          </Button>
          <h1 className="font-display text-3xl font-bold">{session.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stories.length} stories ·{" "}
            {stories.reduce((s, x) => s + (x.final_points ?? 0), 0)} points estimated
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={closed ? "secondary" : "default"}>{session.status}</Badge>
          {canLead && (
            <Button variant="outline" onClick={() => toggleStatus.mutate()}>
              <Lock className="size-4" /> {closed ? "Reopen" : "Close session"}
            </Button>
          )}
          {!closed && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="size-4" /> Add story
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New story</DialogTitle>
                  <DialogDescription>
                    Give the team enough context to estimate confidently.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="st-title">Title</Label>
                    <Input
                      id="st-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Migrate auth to passkeys"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="st-desc">Description</Label>
                    <Textarea
                      id="st-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="st-risk">Risk</Label>
                      <Select value={risk} onValueChange={(v) => setRisk(v as Story["risk"])}>
                        <SelectTrigger id="st-risk">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="st-cx">Complexity (1–10)</Label>
                      <Input
                        id="st-cx"
                        type="number"
                        min={1}
                        max={10}
                        value={complexity}
                        onChange={(e) =>
                          setComplexity(Math.min(10, Math.max(1, Number(e.target.value) || 1)))
                        }
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => addStory.mutate()} disabled={addStory.isPending}>
                    {addStory.isPending && <Loader2 className="size-4 animate-spin" />}
                    Add story
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {stories.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              No stories yet. Add the first one to start voting.
            </div>
          ) : (
            stories.map((story) => {
              const storyVotes = votes.filter((v) => v.story_id === story.id);
              const myVote = storyVotes.find((v) => v.user_id === user?.id)?.value;
              const avg = storyVotes.length
                ? storyVotes.reduce((s, v) => s + v.value, 0) / storyVotes.length
                : 0;

              return (
                <article key={story.id} className="panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-semibold">{story.title}</h2>
                      {story.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {story.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          story.risk === "high"
                            ? "destructive"
                            : story.risk === "medium"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {story.risk} risk
                      </Badge>
                      <Badge variant="secondary">cx {story.complexity}</Badge>
                      {canLead && (
                        <button
                          aria-label={`Delete ${story.title}`}
                          onClick={() => deleteStory.mutate(story.id)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {FIBONACCI.map((value) => (
                      <button
                        key={value}
                        disabled={closed || story.revealed}
                        onClick={() => castVote.mutate({ storyId: story.id, value })}
                        className={cn(
                          "flex h-16 w-12 items-center justify-center rounded-xl border text-lg font-bold transition-all",
                          myVote === value
                            ? "-translate-y-1 border-primary bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                            : "border-border bg-secondary/60 text-foreground hover:-translate-y-0.5 hover:border-primary/60",
                          (closed || story.revealed) && "cursor-not-allowed opacity-60",
                        )}
                      >
                        {value}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {storyVotes.length} of {Math.max(members.length, 1)} voted
                    </span>
                    {story.revealed ? (
                      <>
                        <Badge>Consensus: {story.final_points} pts</Badge>
                        <span className="text-xs text-muted-foreground">
                          avg {avg.toFixed(1)}
                        </span>
                        {canLead && !closed && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resetStory.mutate(story)}
                          >
                            Re-vote
                          </Button>
                        )}
                      </>
                    ) : (
                      canLead &&
                      !closed && (
                        <Button size="sm" onClick={() => reveal.mutate(story)}>
                          <Eye className="size-4" /> Reveal votes
                        </Button>
                      )
                    )}
                  </div>

                  {story.revealed && storyVotes.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {storyVotes.map((v) => {
                        const member = members.find((m) => m.user_id === v.user_id);
                        return (
                          <span
                            key={v.id}
                            className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs"
                          >
                            <span
                              className="size-2 rounded-full"
                              style={{
                                backgroundColor: member?.avatar_color ?? undefined,
                              }}
                            />
                            {member?.name ?? "Teammate"}: <b>{v.value}</b>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="font-display text-base font-semibold">Participants</h2>
            <div className="mt-3 space-y-2">
              {members.length === 0 && (
                <p className="text-xs text-muted-foreground">No members added yet.</p>
              )}
              {members.map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 text-sm">
                  <span
                    className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold text-primary-foreground"
                    style={{ backgroundColor: m.avatar_color }}
                  >
                    {(m.name || "?").slice(0, 2).toUpperCase()}
                  </span>
                  {m.name}
                </div>
              ))}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-base font-semibold">Shared notes</h2>
            <Textarea
              className="mt-3 min-h-40"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesDirty(true);
              }}
              placeholder="Decisions, blockers, follow-ups…"
            />
            <Button
              className="mt-3 w-full"
              variant="outline"
              disabled={!notesDirty || saveNotes.isPending}
              onClick={() => saveNotes.mutate()}
            >
              {saveNotes.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save notes
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
